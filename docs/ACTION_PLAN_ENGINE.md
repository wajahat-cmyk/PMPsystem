# PMP SYSTEMS — ACTION PLAN ENGINE
## Part 1: Architecture | Part 2: Daily Workflow

---

# PART 1 — ACTION PLAN ENGINE ARCHITECTURE

## 1.1 Engine Overview

The Action Plan Engine is the central decision-making processor of PMP Systems. It runs once daily after the ETL pipeline completes and produces a structured, prioritized action plan for every active product across all three brands (DECOLURE, SLEEPHORIA, SLEEP SANCTUARY).

The engine does NOT execute actions. It produces a ranked list of recommended actions with full evidence chains. The operator reviews and executes.

### Pipeline Architecture

```
DATA SYNC COMPLETE (trigger: ETL job emits event)
    │
    ├─ STAGE 1: Gate Evaluation
    │   Inputs:  inventory_snapshot, product_cogs, current_price, fee_schedule
    │   Output:  gate_status per product {CLEAR | INVENTORY_FAIL | PROFITABILITY_FAIL | BOTH_FAIL}
    │
    ├─ STAGE 2: Product Stage Classification
    │   Inputs:  product.launch_date, product.organic_share_pct, product.cm3_status
    │   Output:  stage per product {LAUNCH | GROWTH | MAINTENANCE}
    │
    ├─ STAGE 3: Four-Quadrant Diagnostic
    │   Inputs:  syntax_metrics_7d[], market_benchmarks[], gate_status, stage
    │   Output:  quadrant per syntax {STRONG | VISIBILITY | CONVERSION | BOTH_FAILING}
    │
    ├─ STAGE 4: Root Cause Analysis
    │   Inputs:  non-STRONG syntax results, placement_data, sqp_data, rank_data, impression_share
    │   Output:  root_cause per non-STRONG syntax {PLACEMENT | RELEVANCY | INDEXING | UNDER_INVESTMENT}
    │
    ├─ STAGE 5: Action Generation
    │   Inputs:  quadrant, root_cause, stage, gate_status, current_bids, current_budgets
    │   Output:  action[] per syntax with type, target_value, evidence, owner
    │
    ├─ STAGE 6: Product Segmentation
    │   Inputs:  all syntax diagnostics per product, gate_status, action severity
    │   Output:  segment per product {CRITICAL | OPTIMIZATION | SCALE}
    │
    ├─ STAGE 7: Yesterday Comparison
    │   Inputs:  today_actions[], yesterday_actions[], activity_log
    │   Output:  delta[] {NEW | RECURRING | RESOLVED | ESCALATED | REGRESSED}
    │
    └─ STAGE 8: Daily Execution Checklist
        Inputs:  segmented actions, deltas, operator capacity (13 products)
        Output:  ordered checklist grouped by segment, sorted by priority
```

---

## 1.2 Stage Definitions

### STAGE 1: Gate Evaluation

**Purpose:** Determine what the engine is ALLOWED to recommend before any diagnostic runs.

**Inputs:**

| Field | Source | Type |
|-------|--------|------|
| `current_stock_units` | Inventory module (FBA snapshot) | Integer |
| `avg_daily_units_sold_30d` | Sales data (rolling 30d) | Float |
| `days_of_stock` | Calculated: `current_stock / avg_daily_units_sold_30d` | Float |
| `product_price` | Catalog data | Currency |
| `cogs` | Settings module (manual entry) | Currency |
| `referral_fee_pct` | Fee schedule (category-based) | Percentage |
| `fba_fee` | Fee schedule (size-tier-based) | Currency |
| `current_acos_7d` | PPC metrics (7-day) | Percentage |

**Processing Logic:**

```
INVENTORY GATE:
  dos = current_stock_units / avg_daily_units_sold_30d

  IF dos < 14:
    inventory_gate = CRITICAL_FAIL    // DO NOT SCALE. Reduce spend.
  ELSE IF dos < 30:
    inventory_gate = MAINTENANCE_ONLY // No scaling. Maintenance bids only.
  ELSE:
    inventory_gate = CLEAR

PROFITABILITY GATE:
  total_fees = (product_price * referral_fee_pct) + fba_fee
  contribution_margin = product_price - cogs - total_fees
  break_even_acos = contribution_margin / product_price

  IF current_acos_7d > break_even_acos:
    profitability_gate = FAIL        // No scaling. Efficiency actions only.
  ELSE:
    profitability_gate = CLEAR

COMBINED GATE STATUS:
  IF inventory_gate == CRITICAL_FAIL AND profitability_gate == FAIL:
    gate_status = BOTH_FAIL          // Emergency mode
  ELSE IF inventory_gate == CRITICAL_FAIL:
    gate_status = INVENTORY_FAIL
  ELSE IF inventory_gate == MAINTENANCE_ONLY:
    gate_status = INVENTORY_CAUTION
  ELSE IF profitability_gate == FAIL:
    gate_status = PROFITABILITY_FAIL
  ELSE:
    gate_status = CLEAR
```

**Output Schema:**

```json
{
  "product_id": "B08KQKPKWC",
  "gate_status": "CLEAR | INVENTORY_FAIL | INVENTORY_CAUTION | PROFITABILITY_FAIL | BOTH_FAIL",
  "inventory_gate": {
    "status": "CLEAR | MAINTENANCE_ONLY | CRITICAL_FAIL",
    "dos": 42.5,
    "stock_units": 850,
    "daily_velocity": 20.0
  },
  "profitability_gate": {
    "status": "CLEAR | FAIL",
    "break_even_acos": 0.32,
    "current_acos": 0.28,
    "headroom_pct": 0.04
  },
  "allowed_action_classes": ["SCALE", "EFFICIENCY", "REDUCE", "FLAG", "PAUSE"],
  "blocked_action_classes": []
}
```

---

### STAGE 2: Product Stage Classification

**Purpose:** Classify each product into its lifecycle stage. Stage determines which actions are strategically appropriate.

**Inputs:**

| Field | Source |
|-------|--------|
| `launch_date` | Product settings (manual entry) |
| `months_since_launch` | Calculated: `(today - launch_date) / 30` |
| `organic_share_pct` | Syntax Engine: organic orders / total orders |
| `cm3_positive` | Profitability calc: CM3 > 0 for trailing 4 weeks |

**Processing Logic:**

```
IF months_since_launch <= 3:
  stage = LAUNCH
ELSE IF months_since_launch <= 9:
  IF organic_share_pct >= 0.35 AND cm3_positive:
    stage = MAINTENANCE   // Graduated early
  ELSE:
    stage = GROWTH
ELSE:  // 9+ months
  stage = MAINTENANCE
```

**Stage Graduation Triggers:**

| Transition | Condition |
|------------|-----------|
| LAUNCH -> GROWTH | `months_since_launch > 3` (automatic) |
| GROWTH -> MAINTENANCE | `months_since_launch > 9` OR (`organic_share_pct >= 0.35` AND `cm3_positive` for 4 consecutive weeks) |
| MAINTENANCE -> GROWTH (regression) | `organic_share_pct < 0.25` for 3 consecutive weeks (rank loss event) |

**Output Schema:**

```json
{
  "product_id": "B08KQKPKWC",
  "stage": "GROWTH",
  "months_since_launch": 6.2,
  "organic_share_pct": 0.22,
  "cm3_positive": true,
  "graduation_progress": {
    "target_organic_share": 0.35,
    "current_organic_share": 0.22,
    "weeks_cm3_positive": 3,
    "weeks_needed": 4
  }
}
```

---

### STAGE 3: Four-Quadrant Diagnostic

**Purpose:** Classify every syntax group for every product into one of four performance quadrants.

**Scope:** Runs per syntax per product. For a product with 8 active syntax groups, this produces 8 quadrant assignments.

**Inputs (per syntax):**

| Field | Source |
|-------|--------|
| `syntax_ctr_7d` | PPC metrics aggregated to syntax level |
| `syntax_cvr_7d` | PPC metrics aggregated to syntax level |
| `market_ctr` | SQP data or category benchmark |
| `market_cvr` | SQP data or category benchmark |

**Processing Logic:**

```
ctr_target = market_ctr * 1.10      // Must beat market by 10%
cvr_target = market_cvr * 3.00      // Must convert at 3x market rate

ctr_passing = (syntax_ctr_7d >= ctr_target)
cvr_passing = (syntax_cvr_7d >= cvr_target)

IF ctr_passing AND cvr_passing:
  quadrant = STRONG
  action_class = SCALE
ELSE IF NOT ctr_passing AND cvr_passing:
  quadrant = VISIBILITY
  action_class = BOOST
ELSE IF ctr_passing AND NOT cvr_passing:
  quadrant = CONVERSION
  action_class = REDUCE
ELSE:
  quadrant = BOTH_FAILING
  action_class = PAUSE
```

**Gate Override at Stage 3:**

```
IF gate_status == BOTH_FAIL:
  // Override: Force all quadrants to REDUCE or PAUSE
  IF quadrant == STRONG:   quadrant_effective = STRONG  // Keep but do NOT scale
  IF quadrant == VISIBILITY: quadrant_effective = PAUSE
  IF quadrant == CONVERSION: quadrant_effective = PAUSE
  IF quadrant == BOTH_FAILING: quadrant_effective = PAUSE

IF gate_status == INVENTORY_FAIL:
  // Override: Block SCALE actions, allow maintenance
  IF quadrant == STRONG:   action_class = MAINTAIN  // Not SCALE
  IF quadrant == VISIBILITY: action_class = PAUSE   // Cannot invest more

IF gate_status == PROFITABILITY_FAIL:
  // Override: Block SCALE and BOOST, allow efficiency
  IF quadrant == STRONG:   action_class = EFFICIENCY_ONLY
  IF quadrant == VISIBILITY: action_class = EFFICIENCY_ONLY
```

**Output Schema:**

```json
{
  "product_id": "B08KQKPKWC",
  "syntax": "Bamboo|Queen",
  "quadrant": "VISIBILITY",
  "quadrant_effective": "VISIBILITY",
  "action_class": "BOOST",
  "metrics": {
    "syntax_ctr": 0.0032,
    "ctr_target": 0.0044,
    "ctr_gap_pct": -27.3,
    "syntax_cvr": 0.092,
    "cvr_target": 0.030,
    "cvr_surplus_pct": 206.7
  },
  "gate_override_applied": false
}
```

---

### STAGE 4: Root Cause Analysis

**Purpose:** For every non-STRONG syntax, identify the single most likely root cause. The framework mandates fixing ONE root cause at a time — no stacking.

**Trigger:** Runs only when `quadrant != STRONG`.

**Root Cause Priority Order (evaluated top to bottom, first match wins):**

```
PRIORITY 1: CONVERSION & PLACEMENT
  Condition: CVR dropped WoW AND spend_share_pdp > 0.40
  Evidence:  PDP placement eating budget, TOS underserved
  Fix:       Increase TOS modifier +50-200%, reduce PDP exposure
  Owner:     PPC

PRIORITY 2: RELEVANCY
  Condition: Top 3 clicked products for this keyword are NOT similar to ours
             (requires SQP top-clicked-product data)
  Evidence:  Our product does not match shopper intent for this keyword
  Fix:       Reduce investment (lower bid, remove from ranking campaigns)
  Owner:     PPC (reduce) + FLAG to Brand Mgmt (coverage gap)

PRIORITY 3: INDEXING
  Condition: avg_organic_rank > 20 DESPITE active spend on keyword
  Evidence:  Amazon is not associating this product with this keyword organically
  Fix:       PUT ROOT KEYWORD IN TITLE OR BULLET (listing change)
  Owner:     FLAG to Launch/Brand Mgmt (listing update required)

PRIORITY 4: UNDER-INVESTMENT
  Condition: CVR above target AND impression_share < 0.15 AND impression_rank > 4
  Evidence:  Product converts well but is not being shown enough
  Fix:       Increase budget, increase bid, increase TOS
  Owner:     PPC
```

**Inputs (per non-STRONG syntax):**

| Field | Source |
|-------|--------|
| `cvr_7d` | PPC metrics |
| `cvr_7d_prior` | PPC metrics (previous 7d) |
| `spend_share_tos` | Placement report: TOS spend / total spend |
| `spend_share_pdp` | Placement report: PDP spend / total spend |
| `top_clicked_products[]` | SQP data: top 3 ASINs clicked for this search term |
| `our_asin` | Product catalog |
| `product_similarity_score` | Calculated or manual: 0-1 similarity to top clicked |
| `avg_organic_rank` | Rank tracker / DataDive |
| `impression_share` | Amazon targeting report |
| `impression_rank` | Amazon targeting report |

**Processing Logic:**

```python
def diagnose_root_cause(syntax_data):

    # Priority 1: Conversion & Placement
    cvr_dropped = syntax_data.cvr_7d < syntax_data.cvr_7d_prior * 0.90
    pdp_heavy = syntax_data.spend_share_pdp > 0.40
    if cvr_dropped and pdp_heavy:
        return RootCause(
            type="PLACEMENT",
            priority=1,
            evidence=f"CVR dropped {pct_change}% WoW. PDP spend share at {spend_share_pdp}%.",
            fix="Increase TOS modifier. Current: {tos_mod}%. Recommended: {tos_mod + 50}%-{tos_mod + 200}%.",
            owner="PPC"
        )

    # Priority 2: Relevancy
    similar = any(is_similar(p, syntax_data.our_asin) for p in syntax_data.top_clicked_products)
    if not similar:
        return RootCause(
            type="RELEVANCY",
            priority=2,
            evidence=f"Top clicked ASINs ({top_3}) are not similar to {our_asin}.",
            fix="Reduce bid to minimum or pause. Keyword does not match product intent.",
            owner="PPC + FLAG_BRAND_MGMT"
        )

    # Priority 3: Indexing
    if syntax_data.avg_organic_rank > 20:
        return RootCause(
            type="INDEXING",
            priority=3,
            evidence=f"Organic rank is {rank} despite active spend. Product not indexed.",
            fix="Add root keyword '{root_kw}' to listing title or bullet points.",
            owner="FLAG_LAUNCH"
        )

    # Priority 4: Under-Investment
    cvr_strong = syntax_data.cvr_7d >= syntax_data.cvr_target
    low_visibility = syntax_data.impression_share < 0.15
    poor_rank = syntax_data.impression_rank > 4
    if cvr_strong and low_visibility and poor_rank:
        return RootCause(
            type="UNDER_INVESTMENT",
            priority=4,
            evidence=f"CVR {cvr}% is strong but IS% is only {is_pct}%. Impression rank: {rank}.",
            fix="Increase daily budget by 30-50%. Increase base bid by 15-25%.",
            owner="PPC"
        )

    # No clear root cause — flag for manual review
    return RootCause(
        type="UNCLEAR",
        priority=5,
        evidence="No single root cause identified. Multiple factors possible.",
        fix="Manual review required.",
        owner="PPC"
    )
```

**Output Schema:**

```json
{
  "product_id": "B08KQKPKWC",
  "syntax": "Bamboo|Queen",
  "quadrant": "VISIBILITY",
  "root_cause": {
    "type": "UNDER_INVESTMENT",
    "priority": 4,
    "evidence": "CVR 9.2% is strong but IS% is only 8.3%. Impression rank: 6.",
    "fix": "Increase daily budget by 30-50%. Increase base bid by 15-25%.",
    "owner": "PPC",
    "data_confidence": "HIGH"
  }
}
```

---

### STAGE 5: Action Generation

**Purpose:** Translate diagnosis into specific, executable actions with target values.

**Action Types:**

| Action Code | Description | Owner | Reversible |
|-------------|-------------|-------|------------|
| `BID_INCREASE` | Raise keyword/target bid | PPC | Yes |
| `BID_DECREASE` | Lower keyword/target bid | PPC | Yes |
| `BUDGET_INCREASE` | Raise campaign daily budget | PPC | Yes |
| `BUDGET_DECREASE` | Lower campaign daily budget | PPC | Yes |
| `TOS_MODIFIER_INCREASE` | Increase Top of Search placement % | PPC | Yes |
| `TOS_MODIFIER_DECREASE` | Decrease Top of Search placement % | PPC | Yes |
| `MATCH_TYPE_EXPAND` | Add phrase/broad match for keyword | PPC | Yes |
| `KEYWORD_PAUSE` | Pause keyword targeting | PPC | Yes |
| `CAMPAIGN_PAUSE` | Pause entire campaign | PPC | Yes |
| `SPEND_REDUCE` | Cut spend 30-50% across syntax | PPC | Yes |
| `FLAG_LISTING_INDEXING` | Flag: Add keyword to listing copy | Launch Team | N/A |
| `FLAG_LISTING_CVR` | Flag: Listing not converting, review needed | Launch Team | N/A |
| `FLAG_PRICING` | Flag: Price may be non-competitive | Brand Mgmt | N/A |
| `FLAG_INVENTORY` | Flag: Stock critically low | Brand Mgmt | N/A |
| `FLAG_CPC_ESCALATION` | Flag: CPC rising beyond sustainable levels | Brand Mgmt | N/A |
| `FLAG_COMPETITOR_WAR` | Flag: Competitor bidding war detected | Brand Mgmt | N/A |

**Generation Logic by Quadrant + Root Cause:**

```
STRONG quadrant (no root cause):
  IF gate_status == CLEAR AND stage != LAUNCH:
    → BID_INCREASE (5-15% of current bid)
    → BUDGET_INCREASE (1.5-3x current budget)
    → MATCH_TYPE_EXPAND (if only Exact, add Phrase)
    → TOS_MODIFIER_INCREASE (protect position)
  IF gate_status == CLEAR AND stage == LAUNCH:
    → BUDGET_INCREASE (aggressive: 2-3x)
    → TOS_MODIFIER_INCREASE (aggressive: +100-200%)
  IF gate_status == PROFITABILITY_FAIL:
    → No spend increases. BID_DECREASE (5-10%) to improve ACOS.
  IF gate_status == INVENTORY_FAIL:
    → No spend increases. Maintain current bids.

VISIBILITY quadrant:
  Root Cause PLACEMENT:
    → TOS_MODIFIER_INCREASE (+50 to +200% of current)
    → BID_DECREASE on base bid (shift spend to TOS via modifier)
  Root Cause UNDER_INVESTMENT:
    → BUDGET_INCREASE (30-50%)
    → BID_INCREASE (15-25%)
    → TOS_MODIFIER_INCREASE (+50%)
  Root Cause INDEXING:
    → FLAG_LISTING_INDEXING (listing change needed)
    → Maintain current PPC spend (do not increase until indexed)
  Root Cause RELEVANCY:
    → SPEND_REDUCE (30-50%)
    → FLAG to Brand Mgmt (coverage gap)

CONVERSION quadrant:
  CRITICAL RULE: PPC does NOT fix listing/pricing problems.
  Root Cause PLACEMENT:
    → TOS_MODIFIER_INCREASE (move spend away from PDP)
    → SPEND_REDUCE (30% while diagnosing)
  Root Cause RELEVANCY:
    → KEYWORD_PAUSE or SPEND_REDUCE (50%)
  Root Cause INDEXING:
    → FLAG_LISTING_INDEXING
    → SPEND_REDUCE (30%)
  Default (no clear PPC cause):
    → SPEND_REDUCE (30-50%)
    → FLAG_LISTING_CVR (evidence: CTR good but CVR failing)
    → FLAG_PRICING (if competitor price data shows we are >15% higher)

BOTH_FAILING quadrant:
  → CAMPAIGN_PAUSE or KEYWORD_PAUSE
  → FLAG_LISTING_CVR (urgent)
  → FLAG to Brand Mgmt (urgent: keyword is broken)
  → Reallocate budget to STRONG syntaxes for same product
```

**Stage Constraints on Actions:**

```
LAUNCH stage ALLOWS:
  ✓ Aggressive BID_INCREASE (up to 30%)
  ✓ Aggressive BUDGET_INCREASE (up to 3x)
  ✓ Aggressive TOS_MODIFIER_INCREASE (up to +300%)
  ✓ MATCH_TYPE_EXPAND
  ✗ Does NOT optimize for efficiency (investment ACOS expected)
  ✗ Does NOT FLAG_PRICING unless price is >30% above competition

GROWTH stage ALLOWS:
  ✓ Moderate BID_INCREASE (5-15%)
  ✓ Moderate BUDGET_INCREASE (1.5-2x)
  ✓ TOS_MODIFIER_INCREASE (up to +150%)
  ✓ MATCH_TYPE_EXPAND
  ✓ SPEND_REDUCE where unprofitable
  ✓ Efficiency optimization begins

MAINTENANCE stage ALLOWS:
  ✓ Conservative BID adjustments (5-10%)
  ✓ BUDGET maintenance (no aggressive scaling)
  ✓ TOS defense (maintain, not aggressively grow)
  ✓ Aggressive SPEND_REDUCE on failing keywords
  ✓ Full efficiency optimization
  ✗ Does NOT do aggressive ranking pushes
  ✗ Does NOT expand match types unless defending share
```

**Output Schema:**

```json
{
  "product_id": "B08KQKPKWC",
  "syntax": "Bamboo|Queen",
  "actions": [
    {
      "action_id": "act_20260319_001",
      "action_code": "BUDGET_INCREASE",
      "priority": "HIGH",
      "campaign_id": "123456789",
      "current_value": 25.00,
      "recommended_value": 37.50,
      "change_pct": 50.0,
      "evidence": "CVR 9.2% is strong (target: 3.0%). IS% only 8.3%. Under-invested.",
      "root_cause": "UNDER_INVESTMENT",
      "quadrant": "VISIBILITY",
      "stage": "GROWTH",
      "gate_status": "CLEAR",
      "owner": "PPC",
      "reversible": true,
      "generated_at": "2026-03-19T06:30:00Z"
    }
  ]
}
```

---

### STAGE 6: Product Segmentation

**Purpose:** Aggregate all syntax-level diagnostics into a single product-level classification to determine operator workflow priority.

**Segmentation Rules:**

```
CRITICAL — Work on FIRST. Problems that lose money or rank.
  Condition (any one):
    - gate_status == BOTH_FAIL
    - gate_status == INVENTORY_FAIL AND any syntax in BOTH_FAILING
    - >= 50% of syntax groups in CONVERSION or BOTH_FAILING
    - Any FLAG_LISTING_CVR or FLAG_INVENTORY generated
    - WoW revenue decline > 30% for the product

OPTIMIZATION — Work on SECOND. Fixable issues with clear actions.
  Condition (any one):
    - gate_status == PROFITABILITY_FAIL (but inventory is fine)
    - >= 30% of syntax groups in VISIBILITY (opportunity to grow)
    - Root cause identified with PPC-owned fix available
    - ACOS > break-even but < break-even * 1.30 (recoverable)

SCALE — Work on THIRD. Things going well that can grow.
  Condition:
    - gate_status == CLEAR
    - >= 60% of syntax groups in STRONG
    - No CRITICAL flags
    - ACOS < break-even * 0.80 (healthy margin)
```

**Output Schema:**

```json
{
  "product_id": "B08KQKPKWC",
  "product_name": "Bamboo Sheets",
  "segment": "OPTIMIZATION",
  "segment_reasons": [
    "3 of 8 syntax groups in VISIBILITY quadrant",
    "Root cause: UNDER_INVESTMENT identified for Bamboo|Queen, Bamboo|King",
    "ACOS 28% vs break-even 32% — recoverable headroom"
  ],
  "syntax_summary": {
    "STRONG": 4,
    "VISIBILITY": 3,
    "CONVERSION": 1,
    "BOTH_FAILING": 0
  },
  "total_actions": 7,
  "ppc_owned_actions": 5,
  "flags_generated": 2
}
```

---

### STAGE 7: Yesterday Comparison

**Purpose:** Compare today's action plan against yesterday's to surface what changed, what was completed, and what escalated.

**Delta Classification:**

| Delta Type | Meaning |
|------------|---------|
| `NEW` | Action exists today that did not exist yesterday |
| `RECURRING` | Same action recommended again (not yet executed) |
| `RESOLVED` | Yesterday's action no longer needed (metrics improved) |
| `ESCALATED` | Same problem but worse — priority increased |
| `REGRESSED` | A previously RESOLVED issue has returned |

**Processing Logic:**

```
For each action in today_plan:
  Match against yesterday_plan by (product_id, syntax, action_code):
    IF no match found:
      delta = NEW
    IF match found AND yesterday action was NOT executed:
      IF today_priority > yesterday_priority:
        delta = ESCALATED
      ELSE:
        delta = RECURRING
    IF match found AND yesterday action WAS executed:
      delta = REGRESSED  // Was fixed but came back

For each action in yesterday_plan NOT in today_plan:
  delta = RESOLVED
```

**Output Schema:**

```json
{
  "date": "2026-03-19",
  "deltas": [
    {
      "action_id": "act_20260319_001",
      "product_id": "B08KQKPKWC",
      "syntax": "Bamboo|Queen",
      "action_code": "BUDGET_INCREASE",
      "delta_type": "RECURRING",
      "days_recurring": 3,
      "yesterday_action_id": "act_20260318_004",
      "yesterday_status": "PENDING"
    }
  ],
  "summary": {
    "new_actions": 4,
    "recurring_actions": 8,
    "resolved_actions": 2,
    "escalated_actions": 1,
    "regressed_actions": 0
  }
}
```

---

### STAGE 8: Daily Execution Checklist

**Purpose:** Produce the final operator-facing checklist. Ordered by segment, then by priority within segment.

**Checklist Structure:**

```
═══════════════════════════════════════════════════
 DAILY ACTION PLAN — 2026-03-19 (Wednesday)
 Generated: 06:30 AM | Products: 13 | Actions: 34
═══════════════════════════════════════════════════

── CRITICAL (2 products, 9 actions) ─────────────
  Work on these FIRST. Problems losing money or rank.

  1. Satin Fitted Sheet [B0DZ17NCJ4]
     Gate: INVENTORY_FAIL (DOS: 11 days)
     Stage: LAUNCH
     ┌─────────────────────────────────────────┐
     │ ⚠ DO NOT SCALE — Stock critically low   │
     └─────────────────────────────────────────┘
     □ REDUCE spend 50% on all campaigns         [PPC] [RECURRING 3d]
     □ FLAG: Restock urgently — 11 days DOS       [BRAND MGMT] [NEW]
     □ PAUSE Discovery campaigns                  [PPC] [ESCALATED]

  2. Cooling Comforter [B0FTG1NNKG]
     ...

── OPTIMIZATION (5 products, 15 actions) ────────
  Work on these SECOND. Clear fixes available.

  3. Bamboo Sheets [B08KQKPKWC]
     Gate: CLEAR | Stage: GROWTH
     Syntax: 4 STRONG, 3 VISIBILITY, 1 CONVERSION
     □ INCREASE budget Bamboo|Queen campaigns     [PPC] [RECURRING 2d]
       Current: $25/day → Recommended: $37.50/day
       Evidence: CVR 9.2%, IS% 8.3%, Under-invested
     □ INCREASE TOS modifier Bamboo|King          [PPC] [NEW]
       Current: 50% → Recommended: 100%
     □ FLAG: Review listing for "bamboo bed sheets" [LAUNCH] [RECURRING 5d]
       Evidence: Organic rank 24 despite $180/wk spend

  ...

── SCALE (6 products, 10 actions) ───────────────
  Work on these THIRD. Grow what is working.

  ...

═══════════════════════════════════════════════════
 FLAGS SUMMARY (requires non-PPC action)
═══════════════════════════════════════════════════
  → LAUNCH TEAM: 3 flags (2 indexing, 1 CVR diagnosis)
  → BRAND MGMT: 2 flags (1 inventory, 1 CPC escalation)
═══════════════════════════════════════════════════
```

**Output Schema:**

```json
{
  "date": "2026-03-19",
  "generated_at": "2026-03-19T06:30:00Z",
  "total_products": 13,
  "total_actions": 34,
  "segments": {
    "CRITICAL": {
      "product_count": 2,
      "action_count": 9,
      "products": ["...product action objects..."]
    },
    "OPTIMIZATION": {
      "product_count": 5,
      "action_count": 15,
      "products": ["..."]
    },
    "SCALE": {
      "product_count": 6,
      "action_count": 10,
      "products": ["..."]
    }
  },
  "flags_summary": {
    "launch_team": [
      {"flag_code": "FLAG_LISTING_INDEXING", "count": 2, "products": ["B08KQKPKWC", "B0D952H31F"]},
      {"flag_code": "FLAG_LISTING_CVR", "count": 1, "products": ["B0FTG1NNKG"]}
    ],
    "brand_mgmt": [
      {"flag_code": "FLAG_INVENTORY", "count": 1, "products": ["B0DZ17NCJ4"]},
      {"flag_code": "FLAG_CPC_ESCALATION", "count": 1, "products": ["B0CRVZ1TTS"]}
    ]
  }
}
```

---

## 1.3 Gate Override Logic — Complete Cascade

Gates are evaluated FIRST and cascade through every downstream stage. This table defines exactly what is blocked and what is allowed.

### Inventory Gate Cascades

| Gate Status | SCALE actions | BOOST actions | EFFICIENCY actions | REDUCE actions | FLAG actions | PAUSE actions |
|------------|---------------|---------------|-------------------|---------------|-------------|--------------|
| CLEAR | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |
| MAINTENANCE_ONLY | **BLOCKED** | **BLOCKED** | Allowed | Allowed | Allowed | Allowed |
| CRITICAL_FAIL | **BLOCKED** | **BLOCKED** | **BLOCKED** | **FORCED** | **FORCED** | Allowed |

### Profitability Gate Cascades

| Gate Status | SCALE actions | BOOST actions | EFFICIENCY actions | REDUCE actions | FLAG actions |
|------------|---------------|---------------|-------------------|---------------|-------------|
| CLEAR | Allowed | Allowed | Allowed | Allowed | Allowed |
| FAIL | **BLOCKED** | **BLOCKED** | **FORCED** | Allowed | Allowed |

### Combined Override Matrix

| Inventory | Profitability | Engine Mode | Allowed Actions |
|-----------|--------------|-------------|-----------------|
| CLEAR | CLEAR | **FULL** | All actions available |
| CLEAR | FAIL | **EFFICIENCY** | BID_DECREASE, SPEND_REDUCE, FLAGs only. No budget/bid increases. |
| MAINTENANCE_ONLY | CLEAR | **MAINTENANCE** | Maintain current bids. No scaling. FLAGs allowed. |
| MAINTENANCE_ONLY | FAIL | **DEFENSIVE** | SPEND_REDUCE + FLAGs only. Reduce where possible. |
| CRITICAL_FAIL | CLEAR | **EMERGENCY_INVENTORY** | SPEND_REDUCE (50%+), PAUSE non-essential, FLAG_INVENTORY urgently. |
| CRITICAL_FAIL | FAIL | **EMERGENCY_BOTH** | PAUSE everything except top 1-2 STRONG syntaxes. FLAG urgently to Brand Mgmt. |

---

## 1.4 Stage-Action Alignment

### LAUNCH Stage (0-3 months)

**Strategic Objective:** Build rank. Investment ACOS is expected and acceptable.

| Allowed | Not Allowed |
|---------|-------------|
| Aggressive TOS bidding (+200-300%) | Efficiency optimization (cutting profitable spend) |
| High budgets for ranking keywords | Pausing campaigns for ACOS reasons alone |
| Discovery campaign expansion | Defensive campaigns (nothing to defend yet) |
| Broad/phrase match testing | Maintenance-level conservative bidding |
| Accept ACOS up to 2x break-even | Organic share targets (too early to measure) |

**Launch-specific action modifiers:**
- `BID_INCREASE` ceiling: 30% per adjustment (vs 15% for Growth)
- `BUDGET_INCREASE` ceiling: 3x current (vs 2x for Growth)
- `TOS_MODIFIER_INCREASE` ceiling: +300% (vs +150% for Growth)
- Profitability gate threshold relaxed: ACOS can be up to 2x break-even before FAIL

### GROWTH Stage (3-9 months)

**Strategic Objective:** Prove profitability while expanding. Organic share should be climbing.

| Allowed | Not Allowed |
|---------|-------------|
| Moderate bid increases (5-15%) | Aggressive ranking pushes (Launch-level spend) |
| Match type expansion | Ignoring ACOS (must trend toward break-even) |
| Budget scaling for STRONG syntaxes (1.5-2x) | Maintenance-level defense-only posture |
| SPEND_REDUCE on failing syntaxes | Discovery campaigns beyond 10% of budget |
| Begin conquesting campaigns | |

**Growth-specific thresholds:**
- Organic share target: 15% at month 3, growing to 35% by month 9
- ACOS should be within 1.3x break-even by month 6
- If organic share stagnates below 15% for 4 weeks: FLAG_LAUNCH (rank stall)

### MAINTENANCE Stage (9+ months)

**Strategic Objective:** Defend rank. Maximize margin. CM3 positive.

| Allowed | Not Allowed |
|---------|-------------|
| Conservative bid adjustments (5-10%) | Aggressive bid increases (>15%) |
| Defensive TOS maintenance | Budget scaling beyond 1.3x |
| Aggressive spend reduction on waste | New match type expansion (unless defending) |
| Full efficiency optimization | Discovery beyond 5% of budget |
| Organic share must be >45% | Investment-level ACOS tolerance |

**Maintenance-specific rules:**
- Any syntax with ACOS > break-even for 2 consecutive weeks: auto-generate SPEND_REDUCE
- CM3 must be positive. If negative for 3 weeks: escalate to CRITICAL segment
- Organic share dropping below 35%: trigger rank defense protocol (increase TOS, add exact match)

---

## 1.5 PPC Owns vs Flags — Boundary Definition

### PPC Owns (Engine generates executable actions)

| Domain | Actions | Engine Can Recommend |
|--------|---------|---------------------|
| Bids | Increase, decrease, pause | Yes — with specific values |
| Budgets | Increase, decrease, reallocate | Yes — with specific values |
| Placements | TOS/ROS/PDP modifier adjustments | Yes — with specific percentages |
| Campaign structure | Create, pause, archive campaigns | Yes — with campaign IDs |
| Keywords | Add, pause, negate keywords | Yes — with keyword text + match type |
| CPC management | Bid reduction strategies | Yes — with target CPC values |

### Flags to Launch Team (Engine generates evidence + recommendation)

| Trigger | Evidence Required | Flag Code |
|---------|-------------------|-----------|
| Organic rank >20 despite spend | Rank data, spend data, keyword | `FLAG_LISTING_INDEXING` |
| CVR failing but CTR good | CTR/CVR data, quadrant = CONVERSION | `FLAG_LISTING_CVR` |
| DSTR velocity below target | DSTR data, weeks behind target | `FLAG_DSTR_VELOCITY` |
| Batch readiness issue | Missing variations, incomplete listings | `FLAG_BATCH_READINESS` |

### Flags to Brand Management (Engine generates evidence + recommendation)

| Trigger | Evidence Required | Flag Code |
|---------|-------------------|-----------|
| CPC rising >20% WoW for 2+ weeks | CPC trend data, competitor data | `FLAG_CPC_ESCALATION` |
| Competitor bidding on our brand terms | Search term report, brand keywords | `FLAG_COMPETITOR_WAR` |
| Placement drift (TOS share declining despite spend) | Placement data, TOS IS% trend | `FLAG_PLACEMENT_DRIFT` |
| Coverage gap (market keyword we don't target) | SQP data, keyword gap analysis | `FLAG_COVERAGE_GAP` |
| Inventory <14 days | DOS calculation, restock timeline | `FLAG_INVENTORY` |
| Price >15% above top 3 competitors | Competitor price data | `FLAG_PRICING` |

### Critical Rule: Engine Must NOT Cross Boundaries

```
WHEN quadrant == CONVERSION AND root_cause != PLACEMENT:
  Engine MUST NOT recommend:
    ✗ "Improve listing images"
    ✗ "Update A+ content"
    ✗ "Lower price"
    ✗ "Add video to listing"

  Engine MUST recommend:
    ✓ SPEND_REDUCE (30-50%) — protect budget while issue is diagnosed
    ✓ FLAG_LISTING_CVR with evidence — hand off to Launch team
    ✓ FLAG_PRICING with evidence (if price data supports it) — hand off to Brand Mgmt

WHEN root_cause == INDEXING:
  Engine MUST NOT recommend:
    ✗ "Increase bid" (more spend won't fix indexing)
    ✗ "Increase budget" (wasted if not indexed)

  Engine MUST recommend:
    ✓ FLAG_LISTING_INDEXING with keyword + current rank
    ✓ Maintain current spend (don't cut, don't increase)
    ✓ Re-evaluate in 14 days after listing update
```

---

# PART 2 — DAILY WORKFLOW

## 2.1 Morning Trigger Sequence

```
┌──────────────────────────────────────────────────────────────────┐
│ DAILY TIMELINE                                                    │
├──────────┬───────────────────────────────────────────────────────┤
│ 02:00 AM │ Amazon Advertising API data sync begins               │
│          │ - SP campaigns, keywords, targets, placements         │
│          │ - Search term report (7d + 30d lookback)              │
│          │ - Budget usage report                                 │
│          │ - SQP data pull (Brand Analytics API)                 │
│          │ - Inventory snapshot (FBA API)                        │
│          │                                                       │
│ 04:00 AM │ External data sync                                    │
│          │ - Rank data (DataDive/DataRover)                      │
│          │ - Competitor pricing (if available)                   │
│          │ - Search volume updates                               │
│          │                                                       │
│ 06:00 AM │ ETL Pipeline runs                                     │
│          │ - Clean raw data (nulls, type coercion, dedup)        │
│          │ - Classify syntax for new keywords                    │
│          │ - Aggregate to syntax-level metrics                   │
│          │ - Aggregate to root-level metrics                     │
│          │ - Calculate WoW deltas                                │
│          │ - Calculate market benchmarks (SQP-derived)           │
│          │ - Update inventory DOS calculations                   │
│          │ - Update profitability calculations (price/COGS/fees) │
│          │                                                       │
│ 06:30 AM │ ACTION PLAN ENGINE RUNS (this document)               │
│          │ - Stage 1-8 execute sequentially                      │
│          │ - ~13 products × ~8 syntaxes avg = ~104 evaluations   │
│          │ - Target execution time: <60 seconds                  │
│          │                                                       │
│ 07:00 AM │ Action Plan available in PMP Systems UI               │
│          │ - Dashboard updated with today's plan                 │
│          │ - Segment counts visible on Executive Control          │
│          │                                                       │
│ 07:05 AM │ Daily email digest sent                               │
│          │ - CRITICAL products listed with top actions            │
│          │ - Flag summary for Launch and Brand Mgmt teams        │
│          │ - Link to full action plan in PMP Systems             │
│          │                                                       │
│ 07:10 AM │ Slack notification (optional)                         │
│          │ - "Today: 2 CRITICAL, 5 OPTIMIZATION, 6 SCALE"       │
│          │ - Links to CRITICAL products                          │
└──────────┴───────────────────────────────────────────────────────┘
```

**Failure Handling:**

| Failure Point | Recovery |
|---------------|----------|
| API sync fails (02:00) | Retry 3x at 15-min intervals. If still fails, use yesterday's data + flag "STALE DATA" on all actions. |
| ETL fails (06:00) | Alert operator. Engine does not run. Yesterday's plan carries forward with "STALE" badge. |
| Engine fails (06:30) | Alert operator. Log error with stack trace. Yesterday's plan carries forward. |
| Email fails (07:05) | Retry 2x. Plan is still in UI regardless. |

---

## 2.2 Engine Execution Sequence — Detailed Per-Product Walk

For each of the 13 active products, the engine executes the following steps in order.

### Step 1: Load Current Product Data

```
LOAD FROM DATABASE:
  product_record = {
    product_id:        "B08KQKPKWC",
    product_name:      "Bamboo Sheets",
    brand:             "DECOLURE",
    price:             75.99,
    cogs:              22.50,
    fba_fee:           6.87,
    referral_fee_pct:  0.15,
    launch_date:       "2025-09-15",
    current_stock:     850,
    avg_daily_velocity: 20.0
  }

  syntax_groups = [
    "Bamboo|Queen", "Bamboo|King", "Bamboo|Full", "Bamboo|Twin",
    "Bamboo|California King", "Bamboo", "Generic", "Branded Keyword"
  ]

  FOR EACH syntax in syntax_groups:
    syntax_metrics_7d = {
      impressions, clicks, spend, sales, orders, units,
      ctr, cvr, acos, cpc, roas
    }
    syntax_metrics_7d_prior = { ...same fields, prior 7d... }
    placement_data = { tos_spend_share, pdp_spend_share, ros_spend_share }
    sqp_data = { market_ctr, market_cvr, top_clicked_asins[] }
    rank_data = { organic_rank, sponsored_rank, impression_share, impression_rank }

  yesterday_actions = LOAD from action_plans WHERE date = today - 1 AND product_id = this
  activity_log = LOAD from activity_log WHERE date = today - 1 AND product_id = this
```

### Step 2: Evaluate Gates

```
EXECUTE Stage 1 logic:
  dos = 850 / 20.0 = 42.5 days
  inventory_gate = CLEAR (42.5 > 30)

  contribution_margin = 75.99 - 22.50 - (75.99 * 0.15) - 6.87 = 35.22
  break_even_acos = 35.22 / 75.99 = 0.4634 (46.3%)
  current_acos = 0.28 (28%)
  profitability_gate = CLEAR (28% < 46.3%)

  gate_status = CLEAR
  allowed_actions = ALL
```

### Step 3: Confirm/Update Product Stage

```
EXECUTE Stage 2 logic:
  months_since_launch = (2026-03-19 - 2025-09-15) / 30 = 6.1 months
  organic_share_pct = 0.22 (22%)
  cm3_positive = true (3 consecutive weeks)

  stage = GROWTH (6.1 months, organic < 35%)

  CHECK regression triggers: N/A (not in MAINTENANCE)
  CHECK early graduation: organic 22% < 35% → not eligible
```

### Step 4: Four-Quadrant Diagnostic + Root Cause (Per Syntax)

```
FOR EACH syntax in product.syntax_groups:

  EXAMPLE: syntax = "Bamboo|Queen"

  4a. CALCULATE QUADRANT:
    syntax_ctr = 0.0032 (0.32%)
    market_ctr = 0.0040 (0.40%)
    ctr_target = 0.0040 * 1.10 = 0.0044 (0.44%)
    ctr_passing = 0.0032 >= 0.0044 → FALSE

    syntax_cvr = 0.092 (9.2%)
    market_cvr = 0.010 (1.0%)
    cvr_target = 0.010 * 3.00 = 0.030 (3.0%)
    cvr_passing = 0.092 >= 0.030 → TRUE

    RESULT: CTR below, CVR above → VISIBILITY quadrant
    action_class = BOOST

  4b. GATE OVERRIDE CHECK:
    gate_status = CLEAR → no override applied
    quadrant_effective = VISIBILITY

  4c. ROOT CAUSE ANALYSIS (non-STRONG):
    Priority 1 — Placement:
      cvr_dropped = 0.092 < (0.098 * 0.90 = 0.088) → FALSE (CVR actually improved)
      → SKIP

    Priority 2 — Relevancy:
      top_clicked = [B07ABC..., B08DEF..., B09GHI...]
      is_similar(our_asin, top_clicked) → TRUE (same category bamboo sheets)
      → SKIP

    Priority 3 — Indexing:
      avg_organic_rank = 8
      8 > 20 → FALSE
      → SKIP

    Priority 4 — Under-Investment:
      cvr_strong = TRUE (9.2% > 3.0%)
      impression_share = 0.083 (8.3%)
      0.083 < 0.15 → TRUE
      impression_rank = 6
      6 > 4 → TRUE
      → MATCH: UNDER_INVESTMENT

    ROOT CAUSE = UNDER_INVESTMENT

  REPEAT for all 8 syntax groups...
```

### Step 5: Aggregate Syntax Diagnostics into Product Assessment

```
Product: Bamboo Sheets [B08KQKPKWC]

Syntax Results:
  Bamboo|Queen          → VISIBILITY  (UNDER_INVESTMENT)
  Bamboo|King           → VISIBILITY  (UNDER_INVESTMENT)
  Bamboo|Full           → STRONG
  Bamboo|Twin           → STRONG
  Bamboo|California King → VISIBILITY  (PLACEMENT)
  Bamboo                → STRONG
  Generic               → STRONG
  Branded Keyword       → CONVERSION  (no clear PPC cause → FLAG)

Summary: 4 STRONG, 3 VISIBILITY, 1 CONVERSION
Dominant issue: Under-investment in size variants
```

### Step 6: Generate Recommended Actions

```
FROM VISIBILITY + UNDER_INVESTMENT (Bamboo|Queen, Bamboo|King):
  → BUDGET_INCREASE: $25 → $37.50 (50% increase)
  → BID_INCREASE: $1.20 → $1.44 (20% increase)
  → TOS_MODIFIER_INCREASE: 50% → 100%

FROM VISIBILITY + PLACEMENT (Bamboo|California King):
  → TOS_MODIFIER_INCREASE: 30% → 80%
  → BID_DECREASE on base: $1.10 → $0.95 (shift spend to TOS)

FROM CONVERSION + UNCLEAR (Branded Keyword):
  → SPEND_REDUCE: 30% cut
  → FLAG_LISTING_CVR: "Branded keyword CTR 1.2% but CVR 0.8%. Listing may need review."

FROM STRONG (Bamboo|Full, Bamboo|Twin, Bamboo, Generic):
  → BUDGET_INCREASE: scale by 1.5x (GROWTH stage allows)
  → TOS_MODIFIER_INCREASE: +25% (defensive growth)

TOTAL: 7 PPC actions, 1 FLAG
```

### Step 7: Classify Product Segment

```
CHECK CRITICAL conditions:
  gate_status = CLEAR → no gate-based critical
  BOTH_FAILING count = 0 → no
  CONVERSION >= 50%? 1/8 = 12.5% → no
  FLAG_INVENTORY? → no
  Revenue decline > 30%? → no
  RESULT: NOT CRITICAL

CHECK OPTIMIZATION conditions:
  VISIBILITY >= 30%? 3/8 = 37.5% → YES
  Root cause with PPC fix? → YES (UNDER_INVESTMENT)
  RESULT: OPTIMIZATION

SEGMENT = OPTIMIZATION
```

### Step 8: Compare with Yesterday and Generate Checklist

```
YESTERDAY'S ACTIONS for Bamboo Sheets:
  act_20260318_004: BUDGET_INCREASE Bamboo|Queen ($25 → $35) — status: PENDING
  act_20260318_005: TOS_MODIFIER_INCREASE Bamboo|King (50% → 75%) — status: COMPLETED
  act_20260318_012: FLAG_LISTING_CVR Branded Keyword — status: PENDING

TODAY'S COMPARISON:
  BUDGET_INCREASE Bamboo|Queen: still needed (RECURRING, day 2)
    → yesterday recommended $35, today recommends $37.50 (metrics still support)
  TOS_MODIFIER_INCREASE Bamboo|King: was completed but still in VISIBILITY
    → new action: BID_INCREASE recommended (NEW)
  FLAG_LISTING_CVR Branded Keyword: still pending (RECURRING, day 3)

CHECKLIST ENTRY:
  Bamboo Sheets [B08KQKPKWC] — OPTIMIZATION
  Gate: CLEAR | Stage: GROWTH | Syntax: 4S/3V/1C
  □ BUDGET_INCREASE Bamboo|Queen $25→$37.50      [PPC] [RECURRING 2d]
  □ BID_INCREASE Bamboo|King $1.20→$1.44         [PPC] [NEW]
  □ TOS_MODIFIER_INCREASE Bamboo|CalKing 30→80%  [PPC] [NEW]
  □ BID_DECREASE Bamboo|CalKing base $1.10→$0.95 [PPC] [NEW]
  □ BUDGET_INCREASE (STRONG syntaxes) 1.5x       [PPC] [NEW]
  □ SPEND_REDUCE Branded KW 30%                  [PPC] [RECURRING 3d]
  □ FLAG: Branded KW CVR issue → Launch team      [LAUNCH] [RECURRING 3d]
```

---

## 2.3 End of Day Close

### Execution Status Capture

At 6:00 PM (configurable), the system captures execution status from the Activity Log.

```
FOR EACH action in today's plan:

  CHECK activity_log for matching execution:
    Match by: (product_id, action_code, campaign_id, date)

  ASSIGN STATUS:
    COMPLETED  — Action was executed. Log has matching bid/budget change recorded.
    PENDING    — Action was not executed. No matching activity log entry.
    FAILED     — Action was attempted but failed (API error, bulk upload rejection).
    SKIPPED    — Operator manually marked as skipped (with reason).
    DEFERRED   — Operator moved to tomorrow (with reason).
```

### Status Persistence

```json
{
  "date": "2026-03-19",
  "product_id": "B08KQKPKWC",
  "action_id": "act_20260319_001",
  "action_code": "BUDGET_INCREASE",
  "status": "COMPLETED",
  "executed_at": "2026-03-19T09:45:00Z",
  "executed_value": 37.50,
  "operator_note": null
}
```

### Feed Forward to Tomorrow

The end-of-day status feeds directly into tomorrow's Stage 7 (Yesterday Comparison):

```
Tomorrow's engine will see:
  act_20260319_001 BUDGET_INCREASE: COMPLETED
    → If problem persists tomorrow, delta = REGRESSED
    → If problem resolved, this action disappears (RESOLVED)

  act_20260319_006 SPEND_REDUCE: PENDING
    → delta = RECURRING (day 4 now)
    → Priority may ESCALATE if metrics worsened

  act_20260319_007 FLAG_LISTING_CVR: PENDING
    → delta = RECURRING (day 4)
    → After 7 days recurring with no action: auto-escalate to CRITICAL
```

### Escalation Rules

| Recurring Days | Action |
|----------------|--------|
| 1-3 days | Normal priority. Shown as RECURRING. |
| 4-6 days | Elevated priority. Highlighted in checklist. |
| 7+ days | Auto-escalate to CRITICAL segment regardless of metrics. |
| 7+ days (FLAGS) | Flag is resent in daily email with "OVERDUE" tag. |

### Daily Close Summary (stored for historical tracking)

```json
{
  "date": "2026-03-19",
  "total_actions": 34,
  "completed": 22,
  "pending": 8,
  "failed": 1,
  "skipped": 2,
  "deferred": 1,
  "completion_rate": 0.647,
  "critical_completion_rate": 0.889,
  "flags_sent": 5,
  "flags_acknowledged": 2
}
```

---

## 2.4 Database Tables Required

The Action Plan Engine requires the following tables (additions to existing PMP Systems schema):

### `action_plans`

```sql
CREATE TABLE action_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  product_id      VARCHAR(20) NOT NULL REFERENCES products(asin),
  syntax          VARCHAR(100) NOT NULL,
  quadrant        VARCHAR(20) NOT NULL,  -- STRONG, VISIBILITY, CONVERSION, BOTH_FAILING
  root_cause      VARCHAR(30),           -- PLACEMENT, RELEVANCY, INDEXING, UNDER_INVESTMENT, NULL
  action_code     VARCHAR(40) NOT NULL,
  priority        VARCHAR(10) NOT NULL,  -- CRITICAL, HIGH, MEDIUM, LOW
  current_value   DECIMAL(10,2),
  recommended_value DECIMAL(10,2),
  change_pct      DECIMAL(5,2),
  evidence        TEXT NOT NULL,
  owner           VARCHAR(20) NOT NULL,  -- PPC, FLAG_LAUNCH, FLAG_BRAND_MGMT
  gate_status     VARCHAR(30) NOT NULL,
  stage           VARCHAR(15) NOT NULL,  -- LAUNCH, GROWTH, MAINTENANCE
  segment         VARCHAR(15) NOT NULL,  -- CRITICAL, OPTIMIZATION, SCALE
  delta_type      VARCHAR(15),           -- NEW, RECURRING, RESOLVED, ESCALATED, REGRESSED
  days_recurring  INTEGER DEFAULT 0,
  status          VARCHAR(15) DEFAULT 'PENDING',  -- PENDING, COMPLETED, FAILED, SKIPPED, DEFERRED
  executed_at     TIMESTAMP,
  executed_value  DECIMAL(10,2),
  operator_note   TEXT,
  campaign_id     VARCHAR(30),
  created_at      TIMESTAMP DEFAULT NOW(),

  UNIQUE(date, product_id, syntax, action_code)
);

CREATE INDEX idx_action_plans_date ON action_plans(date);
CREATE INDEX idx_action_plans_product ON action_plans(product_id, date);
CREATE INDEX idx_action_plans_segment ON action_plans(segment, date);
CREATE INDEX idx_action_plans_status ON action_plans(status, date);
```

### `gate_evaluations`

```sql
CREATE TABLE gate_evaluations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                DATE NOT NULL,
  product_id          VARCHAR(20) NOT NULL REFERENCES products(asin),
  gate_status         VARCHAR(20) NOT NULL,
  inventory_status    VARCHAR(20) NOT NULL,
  dos                 DECIMAL(5,1),
  stock_units         INTEGER,
  daily_velocity      DECIMAL(8,2),
  profitability_status VARCHAR(10) NOT NULL,
  break_even_acos     DECIMAL(5,4),
  current_acos        DECIMAL(5,4),
  headroom_pct        DECIMAL(5,4),
  created_at          TIMESTAMP DEFAULT NOW(),

  UNIQUE(date, product_id)
);
```

### `product_stages`

```sql
CREATE TABLE product_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          VARCHAR(20) NOT NULL REFERENCES products(asin),
  stage               VARCHAR(15) NOT NULL,
  assigned_date       DATE NOT NULL,
  months_since_launch DECIMAL(4,1),
  organic_share_pct   DECIMAL(5,4),
  cm3_positive_weeks  INTEGER DEFAULT 0,
  previous_stage      VARCHAR(15),
  transition_reason   TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_product_stages_current ON product_stages(product_id, assigned_date DESC);
```

### `daily_close`

```sql
CREATE TABLE daily_close (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                    DATE NOT NULL UNIQUE,
  total_actions           INTEGER,
  completed               INTEGER,
  pending                 INTEGER,
  failed                  INTEGER,
  skipped                 INTEGER,
  deferred                INTEGER,
  completion_rate         DECIMAL(5,3),
  critical_completion_rate DECIMAL(5,3),
  flags_sent              INTEGER,
  flags_acknowledged      INTEGER,
  created_at              TIMESTAMP DEFAULT NOW()
);
```

---

## 2.5 Email Digest Format

Sent daily at 07:05 AM to subscribers.

```
Subject: PMP Action Plan — Mar 19: 2 CRITICAL | 5 OPTIMIZATION | 6 SCALE

──────────────────────────────────────
  CRITICAL PRODUCTS (2)
──────────────────────────────────────

  ⚠ Satin Fitted Sheet — INVENTORY CRITICAL
    DOS: 11 days | Action: Reduce spend 50%, pause Discovery
    → Flag sent to Brand Mgmt: Restock urgently

  ⚠ Cooling Comforter — CVR FAILING
    3 of 5 syntaxes in CONVERSION quadrant
    → Flag sent to Launch: Review listing conversion elements

──────────────────────────────────────
  OVERDUE FLAGS (not actioned >7 days)
──────────────────────────────────────

  → Bamboo Sheets: Indexing flag for "bamboo bed sheets" (9 days)

──────────────────────────────────────
  YESTERDAY'S RESULTS
──────────────────────────────────────

  Executed: 22/34 actions (64.7%)
  Critical completion: 8/9 (88.9%)
  New today: 4 actions | Resolved: 2 | Escalated: 1

  View full plan: [link to PMP Systems]
```

---

*End of Action Plan Engine specification. This document defines the complete architecture (Part 1) and daily operational workflow (Part 2) for the PMP Systems Action Plan Engine. All logic aligns with the PPC Master Framework: SEGMENT -> DEPLOY -> DIAGNOSE -> OPTIMISE.*
