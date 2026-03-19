# PMP SYSTEMS — DAILY PLAN, ACTION ENGINE & CHECKLIST SPECIFICATION
## Parts 5, 6, 7 of the PPC Master Framework

### Companion Files
- `PMP_SYSTEMS_ARCHITECTURE.md` — Core system (7 modules, data model, tech stack)
- `OPTIMIZATION_MODULE_SPEC.md` — 120-column optimization workbook logic
- `EXTENDED_MODULES_SPEC.md` — Syntax/Root/Inventory/Deal extensions
- `DEAL_TRACKING_SPEC.md` — Deal tracking data model
- `SYSTEM_EXPANSION_V3.md` — Marketplace, Activity Log, Forecasting

---

# PART 5 — DAILY PLAN + YESTERDAY COMPARISON SYSTEM

---

## 5.1 Daily Plan Generation

A Daily Action Plan is generated every morning at 06:00 AM ET via a BullMQ scheduled job (`DailyPlanGeneratorJob`). The job reads the latest data from all source tables, runs the recommendation engine (Part 6), and writes a structured plan document to the `daily_action_plans` table.

Each plan is immutable once generated. Mid-day recalculations create a new version (plan_version increments) rather than mutating the original.

### 5.1.1 Plan-Level Header

```
╔══════════════════════════════════════════════════════════════════╗
║  DAILY ACTION PLAN — March 19, 2026                             ║
║  Generated: 06:02 AM ET | Version: 1                            ║
║  Operator: Wajahat S.                                           ║
║  Active Products: 12 | Campaigns: 187 | Keywords: 1,296         ║
╠══════════════════════════════════════════════════════════════════╣
║  SUMMARY                                                         ║
║  CRITICAL (RED):       2 products — requires immediate action    ║
║  OPTIMIZATION (YELLOW): 6 products — profitability improvements  ║
║  SCALE (GREEN):        4 products — growth opportunities         ║
║                                                                  ║
║  Total Actions: 34 | PPC Actions: 27 | Flags: 7                 ║
║  Carried Forward from Yesterday: 5                               ║
║  Yesterday Completion Rate: 82% (23/28)                          ║
╚══════════════════════════════════════════════════════════════════╝
```

### 5.1.2 Per-Product Action Card

Each product gets a self-contained action card. Products are ordered by segment priority: CRITICAL first, then OPTIMIZATION, then SCALE. Within each segment, products are ordered by estimated revenue impact (highest first).

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL — Satin Sheets 6 Pcs                                │
│ Brand: DECOLURE | ASIN: B0CRF7S2TH | Stage: MAINTENANCE         │
├──────────────────────────────────────────────────────────────────┤
│ GATE STATUS                                                      │
│ Profitability: ❌ FAIL (TACOS 18.2% vs target 12%)               │
│ Inventory:     ✅ PASS (78 days)                                  │
│ Deal Active:   No                                                │
├──────────────────────────────────────────────────────────────────┤
│ KEY METRICS (7-day)                                              │
│ Spend: $842  | Sales: $4,626 | ACOS: 18.2% | TACOS: 18.2%      │
│ WAS%: 47%    | Impressions: 124,800 | Orders: 154                │
├──────────────────────────────────────────────────────────────────┤
│ SYNTAX DIAGNOSTICS                                               │
│ ┌─────────────────┬───────────┬───────────┬──────────┬─────────┐ │
│ │ Syntax           │ Quadrant  │ Root Cause│ Priority │ Action  │ │
│ ├─────────────────┼───────────┼───────────┼──────────┼─────────┤ │
│ │ Satin|Queen      │ STRONG    │ —         │ Scale    │ +Budget │ │
│ │ Satin|King       │ VISIBILITY│ Under-Inv │ High     │ TOS+50% │ │
│ │ Satin|Twin       │ CONVERSION│ Listing   │ Flag     │ -30%bid │ │
│ │ Satin|Full       │ BOTH FAIL │ —         │ Urgent   │ Pause   │ │
│ │ Satin|Cal King   │ STRONG    │ —         │ Scale    │ +Budget │ │
│ │ Satin|Generic    │ CONVERSION│ Price     │ Flag     │ -20%bid │ │
│ └─────────────────┴───────────┴───────────┴──────────┴─────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ RECOMMENDED ACTIONS                                              │
│                                                                  │
│ 1. [PPC] Pause all campaigns on Satin|Full — ACOS 142%,         │
│    both CTR (0.08%) and CVR (1.1%) failing, no rank value        │
│                                                                  │
│ 2. [PPC] Reduce bids 30% on Satin|Twin — CTR 0.32% OK but      │
│    CVR 3.8% vs target 6.2%. Listing flag also raised.            │
│                                                                  │
│ 3. [PPC] Increase TOS modifier on Satin|King from 60% to 110%   │
│    — CVR strong (7.4%) but impression share only 8%.             │
│    Under-invested in placement.                                  │
│                                                                  │
│ 4. [PPC] Negate 12 search terms with >$15 spend and 0 orders    │
│    across all Satin campaigns. WAS% at 47%.                      │
│                                                                  │
│ 5. [FLAG -> LISTING] Satin|Twin CVR 3.8% vs market 6.8% —       │
│    listing optimization needed. Main image + bullet review.      │
│                                                                  │
│ 6. [FLAG -> PRICING] Satin|Generic syntax CVR declining 3 weeks  │
│    running. Competitor price now $24.95 vs our $29.95.           │
│                                                                  │
│ Est. Impact: Reduce WAS% from 47% to ~32%, save ~$145/week      │
└──────────────────────────────────────────────────────────────────┘
```

### 5.1.3 Quadrant Classification Logic

Each syntax group is assigned a diagnostic quadrant based on CTR and CVR relative to their targets:

| Quadrant | CTR vs Target | CVR vs Target | Meaning |
|----------|--------------|--------------|---------|
| STRONG | >= target | >= target | Performing well. Scale candidate. |
| VISIBILITY | < target | >= target | Ad creative or placement issue. CTR fix needed. |
| CONVERSION | >= target | < target | Traffic is arriving but not converting. Listing/price issue. |
| BOTH_FAILING | < target | < target | Fundamental problem. Pause or restructure. |

Targets are sourced from:
- **PPC CTR Target**: stored in `product_targets` table per product, per syntax group (default: 0.25% for SP campaigns)
- **PPC CVR Target**: stored in `product_targets` table per product, per syntax group (default: derived from SQP Market CVR when available, otherwise category average)
- **SQP Market CTR/CVR**: from `raw_sqp_data` when available — used as the benchmark

### 5.1.4 Root Cause Identification

The engine assigns a root cause for non-STRONG quadrants:

| Root Cause | Trigger Conditions | Quadrant |
|------------|-------------------|----------|
| Under-Invested | IS% < 15% AND CVR >= target | VISIBILITY |
| Placement Issue | TOS IS < 10% AND PDP IS > 30% | VISIBILITY |
| Low SV Keyword | Search volume < 500/mo, not enough data | VISIBILITY |
| Listing Issue | CVR < 0.6x market CVR, CTR OK | CONVERSION |
| Price Issue | CVR declining 3+ weeks, competitor price lower | CONVERSION |
| Relevancy Mismatch | High impressions, very low CTR+CVR, classification suspect | BOTH_FAILING |
| No Data | < 15 clicks in 14 days, cannot diagnose | Any |
| Deal Hangover | Performance drop within 7 days post-deal end | Any |

---

## 5.2 Yesterday Comparison System

### 5.2.1 Comparison Data Flow

When today's plan is generated, the system loads the most recent plan for the previous business day. Each action from yesterday is matched to its current status using the `action_execution_log` table.

```
Yesterday's Plan (Mar 18)
        │
        ├─── action_recommendations (plan_id = yesterday)
        │           │
        │           └─── JOIN action_execution_log ON recommendation_id
        │                       │
        │                       ├─── status = 'executed'   → ✅ COMPLETED
        │                       ├─── status = 'failed'     → ❌ FAILED
        │                       ├─── status = 'skipped'    → ⚪ SKIPPED
        │                       └─── no matching log entry → ⏳ PENDING
        │
        └─── PENDING or SKIPPED actions evaluated for carry-forward
                    │
                    └─── Still relevant? → 🔄 CARRIED FORWARD to today's plan
```

### 5.2.2 Action Status Definitions

| Status | Symbol | Meaning | Detection Method |
|--------|--------|---------|-----------------|
| COMPLETED | check | Action was executed and confirmed | Matching entry in `action_execution_log` with status `executed` and verified via Amazon Ads API state |
| PENDING | hourglass | Action exists but was never attempted | No matching entry in `action_execution_log` |
| FAILED | cross | Execution attempted, API or system error | Entry in `action_execution_log` with status `failed` and error details |
| SKIPPED | circle | Operator consciously decided not to execute | Entry in `action_execution_log` with status `skipped` and operator_note required |
| CARRIED FORWARD | arrows | Still relevant, copied into today's plan | System evaluation: action conditions still hold (re-run diagnostic) |

### 5.2.3 Comparison View — UI Layout

The comparison view is a collapsible panel at the top of the Daily Plan page, default expanded.

```
┌──────────────────────────────────────────────────────────────────┐
│ YESTERDAY vs TODAY — Mar 18 → Mar 19                             │
│ Completion: 82% (23/28) | Pending: 3 | Skipped: 2 | Failed: 0   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ✅ COMPLETED (23)                                 [Collapse ▾]   │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ Increase TOS on Bamboo|King 80%→130%                       │   │
│ │ Executed: 10:42 AM by Wajahat S.                           │   │
│ │ Today: Monitoring window (48-72h). Next assessment Mar 21. │   │
│ ├────────────────────────────────────────────────────────────┤   │
│ │ Negate 8 search terms on Satin campaigns                   │   │
│ │ Executed: 11:15 AM by Wajahat S.                           │   │
│ │ Today: WAS% expected to decline. Monitor in 7d.            │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ 🔄 CARRIED FORWARD (3)                           [Collapse ▾]   │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ ⏳ Reduce bids on Satin|Twin 30%                            │   │
│ │ Status Yesterday: PENDING (not executed)                    │   │
│ │ Today: CARRIED FORWARD — still recommended. Priority: HIGH │   │
│ │ Days Pending: 1                                            │   │
│ ├────────────────────────────────────────────────────────────┤   │
│ │ ⚪ Pause Satin|Full campaigns                               │   │
│ │ Status Yesterday: SKIPPED                                  │   │
│ │ Operator Note: "Waiting for 7-day deal to end"             │   │
│ │ Today: CARRIED FORWARD. Deal ends Mar 20. Auto-escalate    │   │
│ │   on Mar 21 if still not executed.                         │   │
│ ├────────────────────────────────────────────────────────────┤   │
│ │ ⏳ FLAG -> LISTING: Bamboo|Twin CVR issue                   │   │
│ │ Status Yesterday: PENDING (flag not acknowledged)          │   │
│ │ Today: CARRIED FORWARD. Escalate to daily email summary.   │   │
│ │ Days Pending: 2                                            │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ⚪ SKIPPED (2)                                    [Collapse ▾]   │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ Pause Satin|Full campaigns                                 │   │
│ │ Operator Note: "Waiting for 7-day deal to end"             │   │
│ │ → Moved to CARRIED FORWARD above                           │   │
│ ├────────────────────────────────────────────────────────────┤   │
│ │ Budget +30% on Bamboo|Queen                                │   │
│ │ Operator Note: "Inventory at 42 days, waiting for restock" │   │
│ │ → NOT carried forward (inventory gate still failing)       │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│ ❌ FAILED (0)                                     [Collapse ▾]   │
│ └── None                                                         │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2.4 Carry-Forward Evaluation Logic

Not all pending/skipped actions are automatically carried forward. The system re-evaluates each one:

```typescript
function evaluateCarryForward(action: ActionRecommendation): CarryForwardDecision {
  // 1. Re-run diagnostic for the syntax group / product
  const currentDiagnostic = runDiagnostic(action.syntax_group_id, action.product_id);

  // 2. Check if the original condition still holds
  if (currentDiagnostic.quadrant !== action.diagnostic_quadrant) {
    return {
      carry_forward: false,
      reason: `Quadrant changed from ${action.diagnostic_quadrant} to ${currentDiagnostic.quadrant}`,
      new_action: generateNewAction(currentDiagnostic) // May generate a different action
    };
  }

  // 3. Check gate status changes
  const gates = evaluateGates(action.product_id);
  if (gates.inventory === 'FAIL' && action.action_category === 'budget') {
    return {
      carry_forward: false,
      reason: 'Inventory gate now FAIL — budget increase no longer appropriate'
    };
  }

  // 4. Check for deal changes
  const dealStatus = checkActiveDeal(action.product_id);
  if (dealStatus.changed_since_yesterday) {
    return {
      carry_forward: true,
      modified: true,
      reason: `Deal status changed: ${dealStatus.description}`,
      context_update: dealStatus.description
    };
  }

  // 5. Escalate priority if pending too long
  const daysPending = action.days_pending + 1;
  let escalatedPriority = action.priority;
  if (daysPending >= 3) {
    escalatedPriority = 'URGENT';
  } else if (daysPending >= 2 && action.priority === 'LOW') {
    escalatedPriority = 'MEDIUM';
  }

  return {
    carry_forward: true,
    days_pending: daysPending,
    priority: escalatedPriority,
    reason: daysPending >= 3
      ? `ESCALATED: pending for ${daysPending} days`
      : `Still relevant, carried forward (day ${daysPending})`
  };
}
```

---

## 5.3 Continuity Rules

### 5.3.1 Pending Escalation Timeline

| Days Pending | Behavior |
|-------------|----------|
| 1 | Carried forward at same priority |
| 2 | Priority bumped one level (LOW->MEDIUM, MEDIUM->HIGH) |
| 3+ | Auto-escalated to URGENT. Highlighted red in UI. Included in daily email alert. |
| 5+ | Escalated to weekly summary as "Chronic Unresolved Action" |

### 5.3.2 Completed Action Monitoring Window

When an action is marked COMPLETED, the system does NOT immediately reassess the same syntax/product. Instead:

```
Action Completed
    │
    ├── Day 0: Execution logged. No further recommendation on this entity.
    ├── Day 1: Performance monitored but no new action generated.
    ├── Day 2: Performance monitored but no new action generated.
    ├── Day 3: 72-hour window closes. Full reassessment eligible.
    │          System runs diagnostic and may generate NEW action
    │          if performance did not improve as expected.
    └── Day 7: Post-change performance delta calculated and stored
               in optimization_changes.performance_delta.
```

Monitoring window duration is configurable per action type:

| Action Type | Window (hours) | Reason |
|------------|---------------|--------|
| Bid change | 48 | Bids take 24-48h to stabilize in Amazon's auction |
| TOS modifier change | 72 | Placement changes need more data to evaluate |
| Budget change | 24 | Budget changes take effect same day |
| Keyword pause | 0 | Immediate effect, can reassess next day |
| Campaign pause | 0 | Immediate effect |
| Negation | 48 | Need to see if WAS% actually drops |

### 5.3.3 Skipped Action Requirements

When an operator marks an action as SKIPPED, the system enforces:
1. **Note required**: A text note explaining why must be provided. If the operator clicks "Skip" without a note, a modal appears requiring input. The action remains PENDING (not SKIPPED) until a note is saved.
2. **Categorized reason**: In addition to free text, the operator selects from:
   - `waiting_for_deal_end` — Deal is active, action deferred
   - `waiting_for_inventory` — Inventory change expected
   - `operator_judgment` — Operator disagrees with recommendation
   - `waiting_for_data` — Insufficient data to act
   - `external_dependency` — Requires listing/pricing/launch team action first
   - `other` — Must provide detailed note
3. **Review trail**: All skipped actions are surfaced in the weekly operations review.

### 5.3.4 Conflict Detection

When today's plan generates an action that contradicts yesterday's:

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠️ CHANGED ACTION — Satin|King                                   │
│                                                                  │
│ Yesterday: [PPC] Increase TOS modifier from 60% to 110%         │
│ Today:     [PPC] Decrease TOS modifier from 110% to 70%         │
│                                                                  │
│ Reason: Yesterday's TOS increase was executed. 48h data shows    │
│ spend increased 3x but CVR dropped from 7.4% to 4.1% on TOS.   │
│ Reversal recommended.                                            │
│                                                                  │
│ ⚠️ This contradicts yesterday's action. Requires manual review.  │
│ [Approve Reversal] [Keep Current] [Modify]                       │
└──────────────────────────────────────────────────────────────────┘
```

Conflict detection rules:
- Same entity + opposite direction within monitoring window = CONFLICT
- Conflicts always require manual approval (`requires_approval = true`)
- Conflicts are tagged with `conflict_with_recommendation_id` linking to the original
- Conflicts are surfaced at the top of the plan, above normal actions

---

## 5.4 Data Model — Daily Plans

```sql
-- Daily Action Plans (one per day per version)
CREATE TABLE daily_action_plans (
    id BIGSERIAL PRIMARY KEY,
    plan_date DATE NOT NULL,
    plan_version INT NOT NULL DEFAULT 1,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by VARCHAR(100) NOT NULL DEFAULT 'system', -- 'system' or operator who triggered manual refresh

    -- Summary counts
    total_products INT NOT NULL,
    critical_count INT NOT NULL DEFAULT 0,
    optimization_count INT NOT NULL DEFAULT 0,
    scale_count INT NOT NULL DEFAULT 0,
    total_actions INT NOT NULL DEFAULT 0,
    ppc_action_count INT NOT NULL DEFAULT 0,
    flag_count INT NOT NULL DEFAULT 0,
    carried_forward_count INT NOT NULL DEFAULT 0,

    -- Yesterday comparison
    previous_plan_id BIGINT REFERENCES daily_action_plans(id),
    yesterday_completion_rate DECIMAL(5,2),    -- % of yesterday's actions completed
    yesterday_total_actions INT,
    yesterday_completed INT,
    yesterday_pending INT,
    yesterday_skipped INT,
    yesterday_failed INT,

    -- Metadata
    data_freshness JSONB,  -- {"ads_api": "2026-03-18", "sqp": "2026-03-16", "business_reports": "2026-03-18"}
    is_active BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE when a newer version replaces it

    UNIQUE(plan_date, plan_version)
);

CREATE INDEX idx_dap_date ON daily_action_plans(plan_date DESC);
CREATE INDEX idx_dap_active ON daily_action_plans(is_active) WHERE is_active = TRUE;

-- Product-level plan entries (one per product per plan)
CREATE TABLE daily_plan_products (
    id BIGSERIAL PRIMARY KEY,
    plan_id BIGINT NOT NULL REFERENCES daily_action_plans(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),

    -- Classification
    segment VARCHAR(20) NOT NULL,             -- 'CRITICAL', 'OPTIMIZATION', 'SCALE'
    product_stage VARCHAR(20) NOT NULL,       -- 'LAUNCH', 'GROWTH', 'MAINTENANCE'
    display_order INT NOT NULL,               -- Sort order within the plan

    -- Gate status
    profitability_gate VARCHAR(10) NOT NULL,  -- 'PASS', 'FAIL', 'WARN'
    profitability_detail JSONB,               -- {"tacos": 18.2, "target": 12, "acos": 22.1}
    inventory_gate VARCHAR(10) NOT NULL,      -- 'PASS', 'FAIL', 'WARN'
    inventory_detail JSONB,                   -- {"days_of_stock": 78, "threshold": 30}
    deal_active BOOLEAN NOT NULL DEFAULT FALSE,
    deal_detail JSONB,                        -- {"deal_id": "...", "deal_type": "LD", "end_date": "2026-03-20"}

    -- Snapshot metrics (7-day)
    metrics_snapshot JSONB NOT NULL,          -- {"spend": 842, "sales": 4626, "acos": 18.2, ...}

    -- Syntax diagnostics (array of syntax assessments)
    syntax_diagnostics JSONB NOT NULL,
    /*
      [
        {
          "syntax_group_id": 14,
          "syntax_label": "Satin|Queen",
          "quadrant": "STRONG",
          "root_cause": null,
          "priority": "SCALE",
          "summary_action": "Budget +30%",
          "ctr": 0.38, "ctr_target": 0.25,
          "cvr": 7.4, "cvr_target": 6.2,
          "impression_share": 22,
          "tos_is": 18,
          "was_pct": 28,
          "spend_7d": 312, "sales_7d": 2180
        }
      ]
    */

    UNIQUE(plan_id, product_id)
);

CREATE INDEX idx_dpp_plan ON daily_plan_products(plan_id);
CREATE INDEX idx_dpp_segment ON daily_plan_products(segment);

-- Action Recommendations (individual actions within a plan)
CREATE TABLE action_recommendations (
    id BIGSERIAL PRIMARY KEY,
    plan_id BIGINT NOT NULL REFERENCES daily_action_plans(id) ON DELETE CASCADE,
    plan_product_id BIGINT NOT NULL REFERENCES daily_plan_products(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),

    -- Targeting
    syntax_group_id INT REFERENCES syntax_groups(id),  -- NULL for product-level actions
    campaign_id VARCHAR(50),
    keyword_id VARCHAR(50),

    -- Classification
    action_type VARCHAR(20) NOT NULL,         -- 'ppc_action', 'flag'
    action_category VARCHAR(30) NOT NULL,     -- 'bid', 'placement', 'budget', 'negate', 'pause', 'enable',
                                              -- 'flag_listing', 'flag_pricing', 'flag_inventory', 'flag_launch', 'flag_brand_mgmt'

    -- Action detail
    action_description TEXT NOT NULL,
    action_specifics JSONB,
    /*
      {
        "field": "tos_modifier",
        "current_value": 60,
        "recommended_value": 110,
        "change_type": "percentage",
        "change_amount": 83.3
      }
    */

    -- Diagnostic context
    diagnostic_quadrant VARCHAR(20),          -- 'STRONG', 'VISIBILITY', 'CONVERSION', 'BOTH_FAILING'
    root_cause VARCHAR(50),
    reasoning TEXT NOT NULL,
    evidence JSONB NOT NULL,                  -- [{"metric": "CVR", "value": 3.8, "target": 6.2}]

    -- Product context
    product_stage VARCHAR(20) NOT NULL,
    gate_status JSONB NOT NULL,               -- {"profitability": "FAIL", "inventory": "PASS"}
    campaign_objective VARCHAR(50),           -- 'Ranking', 'Market Share', 'Defensive', 'Conversions', 'Discovery'

    -- Priority
    priority VARCHAR(10) NOT NULL,            -- 'URGENT', 'HIGH', 'MEDIUM', 'LOW'
    segment VARCHAR(20) NOT NULL,             -- 'CRITICAL', 'OPTIMIZATION', 'SCALE'
    display_order INT NOT NULL,

    -- Execution metadata
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    auto_executable BOOLEAN NOT NULL DEFAULT FALSE,
    estimated_impact TEXT,

    -- Carry-forward tracking
    carried_from_recommendation_id BIGINT REFERENCES action_recommendations(id),
    days_pending INT NOT NULL DEFAULT 0,
    carry_forward_reason TEXT,

    -- Conflict tracking
    conflict_with_recommendation_id BIGINT REFERENCES action_recommendations(id),
    conflict_description TEXT,

    -- Monitoring window
    monitoring_until TIMESTAMPTZ,             -- Set when action is completed. No new action on same entity until this time.

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ar_plan ON action_recommendations(plan_id);
CREATE INDEX idx_ar_product ON action_recommendations(product_id);
CREATE INDEX idx_ar_priority ON action_recommendations(priority);
CREATE INDEX idx_ar_segment ON action_recommendations(segment);
CREATE INDEX idx_ar_carried ON action_recommendations(carried_from_recommendation_id)
    WHERE carried_from_recommendation_id IS NOT NULL;

-- Action Execution Log (tracks what happened to each recommendation)
CREATE TABLE action_execution_log (
    id BIGSERIAL PRIMARY KEY,
    recommendation_id BIGINT NOT NULL REFERENCES action_recommendations(id),
    plan_id BIGINT NOT NULL REFERENCES daily_action_plans(id),

    -- Execution status
    status VARCHAR(20) NOT NULL,              -- 'executed', 'failed', 'skipped', 'pending'
    executed_at TIMESTAMPTZ,
    executed_by VARCHAR(100),

    -- For skipped actions
    skip_reason VARCHAR(50),                  -- 'waiting_for_deal_end', 'waiting_for_inventory',
                                              -- 'operator_judgment', 'waiting_for_data',
                                              -- 'external_dependency', 'other'
    operator_note TEXT,

    -- For failed actions
    error_code VARCHAR(50),
    error_message TEXT,
    retry_count INT DEFAULT 0,

    -- For executed actions — link to optimization_changes
    optimization_change_id BIGINT REFERENCES optimization_changes(id),

    -- Amazon API response (for executed PPC actions)
    api_response JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ael_recommendation ON action_execution_log(recommendation_id);
CREATE INDEX idx_ael_plan ON action_execution_log(plan_id);
CREATE INDEX idx_ael_status ON action_execution_log(status);
```

---

# PART 6 — ACTION RECOMMENDATION ENGINE

---

## 6.1 Recommendation Categories

The engine generates two classes of actions: **PPC Actions** (executable within the PPC system) and **FLAG Actions** (require intervention from another team). This mirrors the PPC OWNS vs FLAGS boundary.

### 6.1.1 PPC Actions (System Can Execute)

These actions can be executed directly via Amazon Ads API or bulk upload. The system generates the exact parameters and can auto-execute if approved.

| Action Category | Description | API Method | Auto-Executable |
|----------------|-------------|-----------|----------------|
| `bid` | Increase or decrease keyword/target bid | Ads API `updateKeywords` / `updateTargetingClauses` | Yes |
| `placement` | Increase or decrease TOS/PDP/ROS placement modifier | Ads API `updateCampaigns` (bidding adjustments) | Yes |
| `budget` | Increase or decrease daily campaign budget | Ads API `updateCampaigns` | Yes |
| `pause` | Pause a keyword, target, or campaign | Ads API state change to `paused` | Yes |
| `enable` | Re-enable a paused keyword, target, or campaign | Ads API state change to `enabled` | Yes |
| `negate` | Add negative keyword (exact or phrase) to campaign or ad group | Ads API `createNegativeKeywords` | Yes |
| `match_type_expansion` | Recommend deploying phrase/broad match for a keyword | Manual (requires campaign creation) | No |
| `cross_negative` | Add cross-campaign negative to prevent cannibalization | Ads API `createNegativeKeywords` | Yes |
| `dayparting` | Adjust budget/bid multiplier by time of day | Custom scheduling (not native Amazon) | No |

### 6.1.2 FLAG Actions (System Flags to Other Teams)

These represent issues that PPC performance data has surfaced but that PPC cannot fix. The system creates a flag record that routes to the appropriate team via notification.

| Flag Category | Trigger | Routes To | Example |
|--------------|---------|-----------|---------|
| `flag_listing` | CTR or CVR below market benchmark, PPC placement is fine | Listing Team | "Satin\|Twin CVR 3.8% vs market 6.8% — main image or bullets need review" |
| `flag_pricing` | CVR declining while CTR stable, competitor price gap detected | Pricing Team | "Competitor now at $24.95 vs our $29.95 — CVR dropped 22% over 3 weeks" |
| `flag_inventory` | Days of stock below threshold (30 days = WARN, 14 days = CRITICAL) | Inventory / Ops | "Hero SKU at 42 days stock — reorder within 2 weeks" |
| `flag_launch` | DSTR deficit, indexing gaps, batch readiness issues | Launch Team | "Discovery campaign finding winners but not enough DSTR to rank. Need launch push." |
| `flag_brand_mgmt` | CPC escalation beyond normal range, competitor bidding war, coverage gaps | Brand Management | "CPC on 'bamboo sheets queen' up 40% in 2 weeks — competitor bidding war likely" |

### 6.1.3 Flag Lifecycle

```
FLAG Created (in action_recommendations)
    │
    ├── Notification sent to team (email + in-app)
    │
    ├── Team acknowledges flag → status = 'acknowledged'
    │   │
    │   ├── Team resolves issue → status = 'resolved'
    │   │   └── PPC system re-evaluates on next plan generation
    │   │
    │   └── Team cannot resolve → status = 'blocked'
    │       └── Escalated in weekly review
    │
    └── No acknowledgment after 48h → auto-escalate
        └── Included in daily email with "UNACKNOWLEDGED FLAG" warning
```

```sql
-- Flag tracking (extends action_recommendations for flag-type actions)
CREATE TABLE flag_tracking (
    id BIGSERIAL PRIMARY KEY,
    recommendation_id BIGINT NOT NULL REFERENCES action_recommendations(id),
    flag_category VARCHAR(30) NOT NULL,       -- 'flag_listing', 'flag_pricing', etc.

    -- Routing
    assigned_team VARCHAR(50) NOT NULL,       -- 'listing', 'pricing', 'inventory', 'launch', 'brand_mgmt'
    assigned_to VARCHAR(100),                 -- Specific person, if applicable

    -- Lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open', 'acknowledged', 'in_progress', 'resolved', 'blocked'
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    resolution_note TEXT,

    -- Escalation
    escalation_level INT NOT NULL DEFAULT 0,  -- 0 = normal, 1 = 48h no response, 2 = weekly review
    last_escalated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ft_status ON flag_tracking(status) WHERE status != 'resolved';
CREATE INDEX idx_ft_team ON flag_tracking(assigned_team);
```

---

## 6.2 Recommendation Generation Rules

### 6.2.1 ActionRecommendation Interface

```typescript
interface ActionRecommendation {
  id: string;
  product_id: number;
  syntax_group_id: number | null;        // null for product-level actions
  campaign_id: string | null;
  keyword_id: string | null;

  // Classification
  action_type: 'ppc_action' | 'flag';
  action_category:
    | 'bid'
    | 'placement'
    | 'budget'
    | 'negate'
    | 'pause'
    | 'enable'
    | 'match_type_expansion'
    | 'cross_negative'
    | 'dayparting'
    | 'flag_listing'
    | 'flag_pricing'
    | 'flag_inventory'
    | 'flag_launch'
    | 'flag_brand_mgmt';

  // What to do
  action_description: string;            // Human-readable summary
  action_specifics: {
    field: string;                       // 'bid', 'tos_modifier', 'budget', 'state', etc.
    current_value: number;
    recommended_value: number;
    change_type: 'absolute' | 'percentage';
    change_amount: number;
  } | null;                              // null for flags

  // Why
  diagnostic_quadrant: 'STRONG' | 'VISIBILITY' | 'CONVERSION' | 'BOTH_FAILING';
  root_cause: string | null;
  reasoning: string;                     // 1-2 sentence explanation
  evidence: {
    metric: string;
    value: number;
    target: number;
  }[];

  // Context
  product_stage: 'LAUNCH' | 'GROWTH' | 'MAINTENANCE';
  gate_status: {
    profitability: 'PASS' | 'FAIL' | 'WARN';
    inventory: 'PASS' | 'FAIL' | 'WARN';
  };
  campaign_objective: 'Ranking' | 'Market Share' | 'Defensive' | 'Conversions' | 'Discovery';

  // Priority
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  segment: 'CRITICAL' | 'OPTIMIZATION' | 'SCALE';

  // Execution
  requires_approval: boolean;
  auto_executable: boolean;
  estimated_impact: string;              // "Expected ACOS reduction of ~5-8pp"

  // Carry-forward metadata (populated when action is carried from previous day)
  carried_from_id: string | null;
  days_pending: number;
}
```

### 6.2.2 Priority Assignment Matrix

Priority is determined by segment + action urgency:

| Segment | Condition | Priority |
|---------|-----------|----------|
| CRITICAL | BOTH_FAILING quadrant, ACOS > 2x breakeven | URGENT |
| CRITICAL | Any other CRITICAL action | HIGH |
| OPTIMIZATION | VISIBILITY quadrant with IS% < 10% (under-invested winner) | HIGH |
| OPTIMIZATION | CONVERSION quadrant (listing/price flag) | MEDIUM |
| OPTIMIZATION | WAS% > 40% (negative mining needed) | MEDIUM |
| SCALE | STRONG quadrant, inventory gate PASS | MEDIUM |
| SCALE | Match type expansion opportunity | LOW |
| Any | Carried forward 3+ days | URGENT (override) |
| Any | Conflict with yesterday's action | HIGH (override, requires approval) |

### 6.2.3 Approval Requirements

Actions that require manual approval before execution:

| Condition | Requires Approval | Reason |
|-----------|------------------|--------|
| Budget increase > 50% | Yes | Large spend commitment |
| Bid increase > 100% | Yes | Aggressive bid change |
| Campaign pause (entire campaign) | Yes | Stops all spend |
| TOS modifier > 200% | Yes | Very aggressive placement |
| Action conflicts with yesterday | Yes | Contradicts recent decision |
| Product in LAUNCH stage, any budget reduction | Yes | May harm ranking push |
| First action ever on a new product | Yes | No historical baseline |
| Carried forward 5+ days | Yes | Chronic inaction needs review |

All FLAG actions are auto-approved for creation (they are informational) but the flagged team must acknowledge them.

---

## 6.3 Stage-Specific Action Rules

The recommendation engine enforces guardrails per product stage. These are hard constraints — the engine CANNOT generate recommendations that violate them.

### 6.3.1 LAUNCH Stage Rules

**Objective**: Rank for target keywords. Efficiency is secondary to visibility.

| Rule | Allowed | Blocked |
|------|---------|---------|
| Aggressive bid increases for ranking keywords | Yes, up to 3x current bid | — |
| TOS modifier increases | Yes, up to 200% | Above 200% requires approval |
| Budget increases to hit >80% utilization | Yes | — |
| Discovery campaign expansion | Yes | — |
| ACOS-based bid reductions | BLOCKED | Investment phase — ACOS is expected to be high |
| Efficiency-based keyword pauses | BLOCKED | Need data accumulation |
| WAS%-based negations | Allowed only if WAS% > 75% | Below 75% is tolerated during launch |
| Campaign pause | Only if ACOS > 300% AND no rank improvement in 14d | — |
| Budget reduction | Requires approval | May harm ranking trajectory |

**LAUNCH engine behavior:**
```typescript
function generateLaunchActions(product: Product, diagnostics: SyntaxDiagnostic[]): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];

  for (const syntax of diagnostics) {
    // LAUNCH: Focus on visibility, not efficiency
    if (syntax.quadrant === 'VISIBILITY') {
      // Under-invested — this is the primary LAUNCH concern
      if (syntax.impression_share < 15) {
        actions.push({
          action_category: 'placement',
          action_specifics: {
            field: 'tos_modifier',
            current_value: syntax.tos_modifier,
            recommended_value: Math.min(syntax.tos_modifier + 50, 200),
            change_type: 'absolute',
            change_amount: 50
          },
          reasoning: `LAUNCH: Under-invested on ${syntax.syntax_label}. IS at ${syntax.impression_share}%. Need TOS push for ranking.`,
          priority: 'HIGH',
          requires_approval: syntax.tos_modifier + 50 > 200
        });
      }

      // Budget utilization check
      if (syntax.budget_utilization < 0.80) {
        actions.push({
          action_category: 'budget',
          action_specifics: {
            field: 'budget',
            current_value: syntax.daily_budget,
            recommended_value: syntax.daily_budget * 1.5,
            change_type: 'percentage',
            change_amount: 50
          },
          reasoning: `LAUNCH: Budget utilization at ${(syntax.budget_utilization * 100).toFixed(0)}%. Increase to capture ranking impressions.`,
          priority: 'HIGH'
        });
      }
    }

    // LAUNCH: DO NOT recommend ACOS-based bid reductions
    // This is explicitly blocked
    if (syntax.quadrant === 'CONVERSION' || syntax.quadrant === 'BOTH_FAILING') {
      // Only flag, do not reduce bids during launch
      if (syntax.cvr < syntax.cvr_target * 0.6) {
        actions.push({
          action_type: 'flag',
          action_category: 'flag_listing',
          reasoning: `LAUNCH: ${syntax.syntax_label} CVR at ${syntax.cvr}% vs target ${syntax.cvr_target}%. Listing review needed. NOT reducing bids — investment phase.`,
          priority: 'MEDIUM'
        });
      }
    }

    // LAUNCH exception: pause only if extremely wasteful
    if (syntax.acos > 300 && syntax.rank_trend === 'declining' && syntax.days_since_launch > 14) {
      actions.push({
        action_category: 'pause',
        reasoning: `LAUNCH exception: ${syntax.syntax_label} ACOS at ${syntax.acos}% with declining rank after 14 days. Investment not yielding results.`,
        priority: 'URGENT',
        requires_approval: true
      });
    }
  }

  return actions;
}
```

### 6.3.2 GROWTH Stage Rules

**Objective**: Scale winners, optimize mid-performers, identify expansion opportunities.

| Rule | Allowed | Blocked |
|------|---------|---------|
| Scaling STRONG syntaxes (budget +20-30%, bid +10-20%) | Yes | — |
| Efficiency improvements on underperformers | Yes | — |
| Match type expansion (phrase, broad) | Yes, Phase 2+ campaigns | — |
| Cross-negative cleanup | Yes | — |
| TOS modifier up to 200% | Yes | Above 200% blocked |
| Discovery campaign harvest (winners to exact) | Yes | — |
| ACOS-based bid reductions | Yes, for MAINTENANCE-objective campaigns | Not for Ranking-objective campaigns |
| Phase 4 campaign deployment | BLOCKED | Not appropriate for GROWTH stage |
| TOS > 200% | BLOCKED | Aggressive ranking reserved for LAUNCH |

**GROWTH engine behavior:**
```typescript
function generateGrowthActions(product: Product, diagnostics: SyntaxDiagnostic[]): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];

  for (const syntax of diagnostics) {

    switch (syntax.quadrant) {
      case 'STRONG':
        // Scale winners
        if (syntax.gate_status.inventory !== 'FAIL') {
          actions.push({
            action_category: 'budget',
            action_specifics: {
              field: 'budget',
              current_value: syntax.daily_budget,
              recommended_value: syntax.daily_budget * 1.25,
              change_type: 'percentage',
              change_amount: 25
            },
            reasoning: `GROWTH: ${syntax.syntax_label} is STRONG. Scale budget +25% to capture more market share.`,
            priority: 'MEDIUM',
            segment: 'SCALE'
          });

          // Match type expansion check
          if (syntax.campaign_phase >= 2 && !syntax.has_broad_match) {
            actions.push({
              action_category: 'match_type_expansion',
              reasoning: `GROWTH: ${syntax.syntax_label} performing well in exact. Deploy phrase/broad to capture long-tail.`,
              priority: 'LOW',
              auto_executable: false
            });
          }
        }
        break;

      case 'VISIBILITY':
        // Fix visibility — increase TOS or bid
        if (syntax.tos_is < 10 && syntax.pdp_is > 30) {
          actions.push({
            action_category: 'placement',
            action_specifics: {
              field: 'tos_modifier',
              current_value: syntax.tos_modifier,
              recommended_value: Math.min(syntax.tos_modifier + 50, 200),
              change_type: 'absolute',
              change_amount: 50
            },
            reasoning: `GROWTH: ${syntax.syntax_label} has CVR ${syntax.cvr}% (good) but TOS IS only ${syntax.tos_is}%. Shift placement to TOS.`,
            priority: 'HIGH'
          });
        } else if (syntax.impression_share < 15) {
          actions.push({
            action_category: 'bid',
            action_specifics: {
              field: 'bid',
              current_value: syntax.avg_bid,
              recommended_value: syntax.avg_bid * 1.2,
              change_type: 'percentage',
              change_amount: 20
            },
            reasoning: `GROWTH: ${syntax.syntax_label} under-invested. IS at ${syntax.impression_share}%. Bid +20%.`,
            priority: 'HIGH'
          });
        }
        break;

      case 'CONVERSION':
        // Reduce bids + flag listing
        actions.push({
          action_category: 'bid',
          action_specifics: {
            field: 'bid',
            current_value: syntax.avg_bid,
            recommended_value: syntax.avg_bid * 0.7,
            change_type: 'percentage',
            change_amount: -30
          },
          reasoning: `GROWTH: ${syntax.syntax_label} CTR OK but CVR ${syntax.cvr}% vs target ${syntax.cvr_target}%. Reduce bids 30% while listing is reviewed.`,
          priority: 'MEDIUM'
        });

        actions.push({
          action_type: 'flag',
          action_category: 'flag_listing',
          reasoning: `${syntax.syntax_label} CVR ${syntax.cvr}% vs market ${syntax.market_cvr}%. Listing optimization needed.`,
          priority: 'MEDIUM'
        });
        break;

      case 'BOTH_FAILING':
        // Pause or heavy reduction
        if (syntax.acos > 200 || (syntax.spend_7d > 50 && syntax.orders_7d === 0)) {
          actions.push({
            action_category: 'pause',
            reasoning: `GROWTH: ${syntax.syntax_label} failing on both CTR and CVR. ACOS ${syntax.acos}%. Pause until listing/product issues resolved.`,
            priority: 'URGENT'
          });
        } else {
          actions.push({
            action_category: 'bid',
            action_specifics: {
              field: 'bid',
              current_value: syntax.avg_bid,
              recommended_value: syntax.avg_bid * 0.5,
              change_type: 'percentage',
              change_amount: -50
            },
            reasoning: `GROWTH: ${syntax.syntax_label} both failing. Reduce bids 50% as interim measure.`,
            priority: 'HIGH'
          });
        }
        break;
    }
  }

  // Cross-syntax: WAS% check
  if (product.was_pct > 40) {
    actions.push({
      action_category: 'negate',
      reasoning: `GROWTH: Product WAS% at ${product.was_pct}%. Run negative mining — negate search terms with >${product.negate_spend_threshold} spend and 0 orders.`,
      priority: 'MEDIUM'
    });
  }

  return actions;
}
```

### 6.3.3 MAINTENANCE Stage Rules

**Objective**: Protect profitability, defend market position, minimize waste.

| Rule | Allowed | Blocked |
|------|---------|---------|
| Profit defense (bid reductions on high-ACOS keywords) | Yes | — |
| Competitor defense bid adjustments | Yes, within ACOS ceiling | — |
| WAS% reduction (negate, pause low performers) | Yes, aggressive | — |
| Budget efficiency (shift from underperformers to performers) | Yes | — |
| Budget reductions on underperforming campaigns | Yes | — |
| Aggressive ranking pushes | BLOCKED | Not appropriate for MAINTENANCE |
| Investment-phase ACOS tolerance | BLOCKED | Must meet profitability targets |
| TOS > 150% | Requires approval | Only for defensive scenarios |
| Budget increases > 30% | Requires approval | Needs justification in MAINTENANCE |

**MAINTENANCE engine behavior:**
```typescript
function generateMaintenanceActions(product: Product, diagnostics: SyntaxDiagnostic[]): ActionRecommendation[] {
  const actions: ActionRecommendation[] = [];
  const breakeven_acos = product.breakeven_acos;

  for (const syntax of diagnostics) {

    // MAINTENANCE priority: profitability enforcement
    if (syntax.acos > breakeven_acos * 2) {
      actions.push({
        action_category: 'bid',
        action_specifics: {
          field: 'bid',
          current_value: syntax.avg_bid,
          recommended_value: syntax.avg_bid * (breakeven_acos / syntax.acos),
          change_type: 'percentage',
          change_amount: -((1 - breakeven_acos / syntax.acos) * 100)
        },
        reasoning: `MAINTENANCE: ${syntax.syntax_label} ACOS ${syntax.acos}% is 2x+ breakeven (${breakeven_acos}%). Reduce bid to align with profitability.`,
        priority: 'URGENT'
      });
    }

    // MAINTENANCE: pause campaigns with ACOS > 100% and no rank value
    if (syntax.acos > 100 && syntax.campaign_objective !== 'Ranking') {
      actions.push({
        action_category: 'pause',
        reasoning: `MAINTENANCE: ${syntax.syntax_label} ACOS ${syntax.acos}% with no ranking objective. Pause — losing money.`,
        priority: 'URGENT'
      });
    }

    // MAINTENANCE: competitor defense
    if (syntax.quadrant === 'VISIBILITY' && syntax.campaign_objective === 'Defensive') {
      actions.push({
        action_category: 'bid',
        action_specifics: {
          field: 'bid',
          current_value: syntax.avg_bid,
          recommended_value: Math.min(syntax.avg_bid * 1.15, syntax.max_profitable_bid),
          change_type: 'percentage',
          change_amount: 15
        },
        reasoning: `MAINTENANCE: Defensive campaign losing visibility on ${syntax.syntax_label}. Bid +15% capped at max profitable bid.`,
        priority: 'HIGH'
      });
    }

    // MAINTENANCE: budget shift from underperformers
    if (syntax.quadrant === 'BOTH_FAILING') {
      actions.push({
        action_category: 'pause',
        reasoning: `MAINTENANCE: ${syntax.syntax_label} both failing. Pause and reallocate budget to STRONG syntaxes.`,
        priority: 'HIGH'
      });
    }
  }

  // MAINTENANCE: WAS% enforcement (stricter than GROWTH)
  if (product.was_pct > 30) {
    actions.push({
      action_category: 'negate',
      reasoning: `MAINTENANCE: Product WAS% at ${product.was_pct}% (threshold: 30%). Aggressive negative mining needed.`,
      priority: 'HIGH'
    });
  }

  // MAINTENANCE: Block aggressive actions
  // (enforced by NOT generating them — no TOS > 150% without approval, no investment-phase tolerance)

  return actions;
}
```

### 6.3.4 Stage-Gate Interaction Matrix

The recommendation engine checks gates BEFORE generating actions. Some actions are blocked or modified based on gate status:

| Gate Status | Effect on Recommendations |
|------------|--------------------------|
| Inventory FAIL (< 14 days) | BLOCK all budget increases, bid increases. Recommend campaign pause. Flag inventory. |
| Inventory WARN (14-30 days) | BLOCK budget increases > 10%. Flag inventory. Allow other actions. |
| Inventory PASS (> 30 days) | No restrictions. |
| Profitability FAIL (TACOS > 1.5x target) | Force CRITICAL segment. Prioritize cost-reduction actions. |
| Profitability WARN (TACOS 1.0-1.5x target) | Force OPTIMIZATION segment minimum. Add efficiency actions. |
| Profitability PASS | No restrictions. |
| Deal Active | Suppress ACOS-based reductions (ACOS is expected to spike). Add context note "Deal active until [date]". |

---

## 6.4 Recommendation Deduplication and Conflict Resolution

### 6.4.1 Deduplication Rules

The engine may generate multiple actions for the same entity from different diagnostic paths. Deduplication logic:

1. **Same entity + same direction**: Keep the more aggressive action (e.g., if one path says bid -20% and another says bid -30%, keep -30%)
2. **Same entity + opposite direction**: Flag as internal conflict. Resolve by priority:
   - Stage rules win over generic rules
   - Gate-driven actions win over diagnostic-driven actions
   - Higher priority action wins
   - If still tied, surface both to operator with explanation
3. **Same entity + different fields**: Keep both (e.g., bid reduction AND TOS increase are complementary)

### 6.4.2 Action Limit per Product

To prevent operator overwhelm, the engine caps actions per product:

| Segment | Max PPC Actions | Max Flags | Total Cap |
|---------|----------------|-----------|-----------|
| CRITICAL | 8 | 3 | 11 |
| OPTIMIZATION | 6 | 3 | 9 |
| SCALE | 5 | 2 | 7 |

If more actions are generated than the cap, the lowest-priority actions are deferred to the next day (marked `deferred_due_to_cap`).

---

# PART 7 — END-OF-DAY CHECKLIST SYSTEM

---

## 7.1 Checklist Generation

Three checklists are generated at the bottom of each Daily Action Plan, aligned with SOP procedures. Each checklist corresponds to a segment and contains items derived from both the recommendation engine output and SOP-mandated routine checks.

Checklists are generated alongside the action plan but are designed for end-of-day verification — confirming that all required work was completed and nothing was missed.

### 7.1.1 CHECKLIST 1: BLEEDING CONTROL (CRITICAL Products)

Generated for each product classified as CRITICAL (RED segment).

```
╔══════════════════════════════════════════════════════════════════╗
║  CHECKLIST 1: BLEEDING CONTROL                                   ║
║  Products: Satin Sheets 6 Pcs, Cooling Comforter                 ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Satin Sheets 6 Pcs (ASIN: B0CRF7S2TH)                         ║
║  ─────────────────────────────────────────                       ║
║  [ ] Reduce bids on keywords with ACOS > 2x breakeven           ║
║      Found: 14 keywords | Breakeven ACOS: 22% | Threshold: 44%  ║
║      Top offender: "satin sheet set" — ACOS 87%, spend $42      ║
║                                                                  ║
║  [ ] Pause campaigns with ACOS > 100% and no rank value         ║
║      Found: 2 campaigns                                         ║
║      - SP-Satin-Broad-Discovery (ACOS: 142%)                    ║
║      - SP-Satin-Auto-B0CRF7S2TH (ACOS: 108%)                   ║
║                                                                  ║
║  [ ] Negate search terms with > $20 spend and 0 orders          ║
║      Found: 8 search terms | Total wasted: $224                  ║
║                                                                  ║
║  [ ] Check if deal is running                                    ║
║      Status: No active deal                                      ║
║                                                                  ║
║  [ ] Verify inventory status                                     ║
║      Status: 78 days — PASS                                      ║
║      (If OOS: pause all campaigns immediately)                   ║
║                                                                  ║
║  [ ] Log all changes in Activity Log                             ║
║      Changes logged today: 3 of 5 recommended                   ║
║                                                                  ║
║  Cooling Comforter (ASIN: B0FTG1NNKG)                           ║
║  ─────────────────────────────────────────                       ║
║  [ ] Reduce bids on keywords with ACOS > 2x breakeven           ║
║      Found: 6 keywords | Breakeven ACOS: 28% | Threshold: 56%   ║
║                                                                  ║
║  [ ] Pause campaigns with ACOS > 100% and no rank value         ║
║      Found: 0 campaigns — no action needed                       ║
║                                                                  ║
║  [ ] Negate search terms with > $20 spend and 0 orders          ║
║      Found: 3 search terms | Total wasted: $78                   ║
║                                                                  ║
║  [ ] Check if deal is running                                    ║
║      Status: No active deal                                      ║
║                                                                  ║
║  [ ] Verify inventory status                                     ║
║      Status: 22 days — WARN                                      ║
║      FLAG: Reorder needed. PPC scaling blocked until resolved.   ║
║                                                                  ║
║  [ ] Log all changes in Activity Log                             ║
║      Changes logged today: 0 of 2 recommended                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 7.1.2 CHECKLIST 2: PROFITABILITY IMPROVEMENT (OPTIMIZATION Products)

Generated for each product classified as OPTIMIZATION (YELLOW segment).

```
╔══════════════════════════════════════════════════════════════════╗
║  CHECKLIST 2: PROFITABILITY IMPROVEMENT                          ║
║  Products: Bamboo Sheets, Satin Sheets, Silk Pillow Case,        ║
║           Satin 4PCs, Bamboo 6PCS (SS), Cooling Sheets           ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Bamboo Sheets (ASIN: B08KQKPKWC)                               ║
║  ─────────────────────────────────────────                       ║
║  [ ] Apply placement optimization                                ║
║      TOS ACOS: 14% | PDP ACOS: 38% | ROS ACOS: 22%             ║
║      Recommendation: Shift to TOS. PDP bleeding.                 ║
║                                                                  ║
║  [ ] Review WAS% — if > 40%, run negative mining                 ║
║      Current WAS%: 34% — below threshold. Monitor.               ║
║                                                                  ║
║  [ ] Review top 5 keywords by spend                              ║
║      1. "bamboo sheets queen" — $82/wk, ACOS 16% ✅              ║
║      2. "bamboo bed sheets" — $64/wk, ACOS 21% ✅                ║
║      3. "bamboo sheet set" — $58/wk, ACOS 28% ⚠️                 ║
║      4. "organic bamboo sheets" — $41/wk, ACOS 42% ❌            ║
║      5. "cooling bamboo sheets" — $38/wk, ACOS 19% ✅            ║
║      Action needed on: #4 ("organic bamboo sheets")              ║
║                                                                  ║
║  [ ] Check budget utilization                                    ║
║      Utilization: 87% — OK                                       ║
║                                                                  ║
║  [ ] Verify syntax gaps                                          ║
║      VISIBILITY quadrant syntaxes: Bamboo|King (IS 8%)           ║
║      Recommendation: TOS boost applied today (verify).           ║
║                                                                  ║
║  [ ] Log all changes in Activity Log                             ║
║      Changes logged today: 4 of 4 recommended                   ║
║                                                                  ║
║  [... repeat for each OPTIMIZATION product ...]                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 7.1.3 CHECKLIST 3: SCALING (SCALE Products)

Generated for each product classified as SCALE (GREEN segment).

```
╔══════════════════════════════════════════════════════════════════╗
║  CHECKLIST 3: SCALING                                            ║
║  Products: Bamboo Sheets 6PCS, Satin Fitted Sheet,               ║
║           Cooling Pillowcase, Hanging Closet                     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Bamboo Sheets 6PCS (ASIN: B0D952H31F)                          ║
║  ─────────────────────────────────────────                       ║
║  [ ] Verify inventory gate PASS before budget increase           ║
║      Status: 94 days — PASS ✅                                    ║
║      Proceed with scaling.                                       ║
║                                                                  ║
║  [ ] Increase budget on STRONG syntax campaigns +20-30%          ║
║      STRONG syntaxes: Bamboo6|Queen, Bamboo6|King                ║
║      Current combined budget: $45/day                            ║
║      Recommended: $58/day (+29%)                                 ║
║                                                                  ║
║  [ ] Expand match types if Phase 2+ and not yet deployed         ║
║      Phase: 3 — phrase match eligible                            ║
║      Bamboo6|Queen has phrase match: Yes ✅                        ║
║      Bamboo6|King has phrase match: No ❌ — deploy recommended    ║
║                                                                  ║
║  [ ] Review discovery campaigns — harvest winners to exact       ║
║      Discovery winners (>3 orders, CVR > 5%):                    ║
║      - "bamboo sheets 6 piece set" — 5 orders, CVR 6.2%         ║
║      - "6pc bamboo bed sheets" — 3 orders, CVR 5.8%             ║
║      Harvest these to exact match campaigns.                     ║
║                                                                  ║
║  [ ] Check competitor environment                                ║
║      CPC trend (4-week): Stable (+2%)                            ║
║      New competitors: None detected                              ║
║      Market share trend: Growing (+1.2pp)                        ║
║                                                                  ║
║  [ ] Log all changes in Activity Log                             ║
║      Changes logged today: 2 of 3 recommended                   ║
║                                                                  ║
║  [... repeat for each SCALE product ...]                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 7.2 Checklist Item Data Model

```sql
-- Checklist items (generated per plan, per product)
CREATE TABLE checklist_items (
    id BIGSERIAL PRIMARY KEY,
    plan_id BIGINT NOT NULL REFERENCES daily_action_plans(id) ON DELETE CASCADE,
    plan_product_id BIGINT NOT NULL REFERENCES daily_plan_products(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),

    -- Checklist classification
    checklist_type VARCHAR(30) NOT NULL,      -- 'bleeding_control', 'profitability', 'scaling'
    item_order INT NOT NULL,                  -- Display order within the checklist

    -- Item content
    item_label TEXT NOT NULL,                 -- "Reduce bids on keywords with ACOS > 2x breakeven"
    item_detail TEXT,                         -- Contextual detail (found counts, current values, etc.)
    item_data JSONB,                          -- Structured data for the item
    /*
      For "Reduce bids" item:
      {
        "keyword_count": 14,
        "breakeven_acos": 22,
        "threshold_acos": 44,
        "top_offender": {"keyword": "satin sheet set", "acos": 87, "spend": 42},
        "keywords": [{"id": "...", "keyword": "...", "acos": ..., "spend": ...}]
      }
    */

    -- Linked recommendation (if this checklist item maps to a specific recommendation)
    recommendation_id BIGINT REFERENCES action_recommendations(id),

    -- Status
    is_checked BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at TIMESTAMPTZ,
    checked_by VARCHAR(100),

    -- Auto-detection
    requires_action BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE if "Found: 0 campaigns — no action needed"
    action_count INT DEFAULT 0,                     -- How many sub-actions this item contains

    -- Carry-forward
    carried_to_plan_id BIGINT REFERENCES daily_action_plans(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ci_plan ON checklist_items(plan_id);
CREATE INDEX idx_ci_type ON checklist_items(checklist_type);
CREATE INDEX idx_ci_unchecked ON checklist_items(plan_id, is_checked) WHERE is_checked = FALSE;
```

---

## 7.3 Checklist Behavior

### 7.3.1 Interactive Checkbox Logic

When an operator checks a checklist item in the UI:

```typescript
async function handleChecklistCheck(itemId: number, operatorId: string): Promise<void> {
  // 1. Update checklist item
  await db.checklistItems.update({
    where: { id: itemId },
    data: {
      is_checked: true,
      checked_at: new Date(),
      checked_by: operatorId
    }
  });

  // 2. Auto-log to Activity Log
  const item = await db.checklistItems.findUnique({ where: { id: itemId } });
  await db.activityLog.create({
    data: {
      event_type: 'checklist_completed',
      product_id: item.product_id,
      plan_id: item.plan_id,
      description: `Checklist item completed: ${item.item_label}`,
      operator_id: operatorId,
      metadata: {
        checklist_type: item.checklist_type,
        checklist_item_id: item.id,
        item_data: item.item_data
      }
    }
  });

  // 3. If linked to a recommendation, update execution log
  if (item.recommendation_id) {
    const existingLog = await db.actionExecutionLog.findFirst({
      where: { recommendation_id: item.recommendation_id }
    });

    if (!existingLog) {
      await db.actionExecutionLog.create({
        data: {
          recommendation_id: item.recommendation_id,
          plan_id: item.plan_id,
          status: 'executed',
          executed_at: new Date(),
          executed_by: operatorId
        }
      });
    }
  }

  // 4. Check if all items in this checklist are now complete
  const remaining = await db.checklistItems.count({
    where: {
      plan_id: item.plan_id,
      checklist_type: item.checklist_type,
      is_checked: false,
      requires_action: true
    }
  });

  if (remaining === 0) {
    // Emit event for daily summary
    eventBus.emit('checklist_complete', {
      plan_id: item.plan_id,
      checklist_type: item.checklist_type,
      completed_at: new Date()
    });
  }
}
```

### 7.3.2 End-of-Day Processing

A BullMQ job runs at 11:00 PM ET (`EndOfDayChecklistJob`) to process unchecked items:

```typescript
async function processEndOfDayChecklist(planId: number): Promise<EndOfDayReport> {
  const uncheckedItems = await db.checklistItems.findMany({
    where: {
      plan_id: planId,
      is_checked: false,
      requires_action: true
    }
  });

  const report: EndOfDayReport = {
    plan_id: planId,
    total_items: 0,
    completed_items: 0,
    unchecked_items: [],
    carried_forward: []
  };

  // Count totals
  const allItems = await db.checklistItems.findMany({
    where: { plan_id: planId, requires_action: true }
  });
  report.total_items = allItems.length;
  report.completed_items = allItems.filter(i => i.is_checked).length;

  for (const item of uncheckedItems) {
    report.unchecked_items.push({
      id: item.id,
      label: item.item_label,
      checklist_type: item.checklist_type,
      product_id: item.product_id
    });

    // Carry forward to tomorrow's plan
    // (Tomorrow's plan generator will pick these up via the carried_to_plan_id field)
    // Mark for carry-forward — actual creation happens in DailyPlanGeneratorJob
    await db.checklistItems.update({
      where: { id: item.id },
      data: {
        // carried_to_plan_id set by tomorrow's generator
      }
    });

    // Also ensure the linked recommendation (if any) is marked PENDING
    if (item.recommendation_id) {
      const log = await db.actionExecutionLog.findFirst({
        where: { recommendation_id: item.recommendation_id }
      });

      if (!log) {
        // No execution log exists — remains PENDING
        // Will be picked up by carry-forward logic in Section 5.2
      }
    }
  }

  return report;
}
```

### 7.3.3 Daily Email Summary Integration

The end-of-day report feeds into the daily email summary (sent at 11:30 PM ET):

```
Subject: PMP Daily Execution Summary — Mar 19, 2026

EXECUTION SCORECARD
───────────────────
Overall Completion: 87% (26/30 items)
Bleeding Control:   100% ✅ (6/6)
Profitability:      83%  ⚠️ (15/18)
Scaling:            83%  ⚠️ (5/6)

CARRIED FORWARD TO TOMORROW
───────────────────────────
1. [PROFITABILITY] Bamboo Sheets — Review "organic bamboo sheets" ACOS 42%
2. [PROFITABILITY] Silk Pillow Case — Check budget utilization (currently 62%)
3. [PROFITABILITY] Satin 4PCs — Verify syntax gaps (Satin4|Twin at IS 6%)
4. [SCALING] Bamboo Sheets 6PCS — Deploy phrase match on Bamboo6|King

UNRESOLVED FLAGS (3)
────────────────────
1. FLAG -> LISTING: Satin|Twin CVR issue (Day 3 — ESCALATED)
2. FLAG -> INVENTORY: Cooling Comforter at 22 days stock
3. FLAG -> PRICING: Satin|Generic competitor price gap

ACTIONS PENDING 3+ DAYS (ESCALATED)
────────────────────────────────────
1. Reduce bids on Satin|Twin 30% — pending since Mar 16 (4 days)
   Status: AUTO-ESCALATED TO URGENT
```

### 7.3.4 Checklist Generation Rules

Each checklist item is generated dynamically based on current data. The items are not hardcoded — they are templates populated with live metrics.

**Bleeding Control item templates:**

| Item Template | Data Source | Condition to Include |
|--------------|------------|---------------------|
| Reduce bids on keywords with ACOS > 2x breakeven | `keyword_daily_metrics` aggregated 7d | Count of qualifying keywords > 0 |
| Pause campaigns with ACOS > 100% and no rank value | `keyword_daily_metrics` at campaign level | Count of qualifying campaigns > 0 |
| Negate search terms with > $X spend and 0 orders | `keyword_daily_metrics` search term level | Count of qualifying terms > 0. $X = product-specific threshold (default $20) |
| Check if deal is running | `deals` table | Always included for CRITICAL products |
| Verify inventory status | `inventory_snapshots` or product config | Always included for CRITICAL products |
| Log all changes in Activity Log | `action_execution_log` vs `action_recommendations` | Always included — shows completion ratio |

**Profitability item templates:**

| Item Template | Data Source | Condition to Include |
|--------------|------------|---------------------|
| Apply placement optimization | Placement-level ACOS from `keyword_daily_metrics` | PDP ACOS > 2x TOS ACOS |
| Review WAS% | Product-level wasted ad spend calculation | Always included |
| Review top 5 keywords by spend | `keyword_daily_metrics` ranked by spend 7d | Always included |
| Check budget utilization | Campaign budget vs actual spend | Utilization < 80% triggers warning |
| Verify syntax gaps | Syntax diagnostics, VISIBILITY quadrant count | Any VISIBILITY syntax exists |
| Log all changes | `action_execution_log` | Always included |

**Scaling item templates:**

| Item Template | Data Source | Condition to Include |
|--------------|------------|---------------------|
| Verify inventory gate PASS | Inventory gate evaluation | Always included before any scale action |
| Increase budget on STRONG syntax campaigns | Syntax diagnostics, STRONG quadrant | Any STRONG syntax exists |
| Expand match types | Campaign phase + match type coverage | Phase 2+ AND missing match types |
| Review discovery campaigns | Discovery campaign metrics, conversion threshold | Discovery campaigns exist |
| Check competitor environment | CPC trends, market share trends | Always included |
| Log all changes | `action_execution_log` | Always included |

---

## 7.4 Checklist API Endpoints

```typescript
// tRPC router for checklists
export const checklistRouter = router({

  // Get checklist for a specific plan
  getByPlan: publicProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input }) => {
      return db.checklistItems.findMany({
        where: { plan_id: input.planId },
        orderBy: [
          { checklist_type: 'asc' },  // bleeding_control first
          { item_order: 'asc' }
        ],
        include: {
          product: true,
          recommendation: true
        }
      });
    }),

  // Toggle a checklist item
  toggleItem: publicProcedure
    .input(z.object({
      itemId: z.number(),
      checked: z.boolean(),
      operatorId: z.string()
    }))
    .mutation(async ({ input }) => {
      if (input.checked) {
        return handleChecklistCheck(input.itemId, input.operatorId);
      } else {
        // Uncheck — remove the activity log entry too
        return handleChecklistUncheck(input.itemId, input.operatorId);
      }
    }),

  // Get completion summary for a plan
  getCompletionSummary: publicProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input }) => {
      const items = await db.checklistItems.findMany({
        where: { plan_id: input.planId, requires_action: true }
      });

      const grouped = groupBy(items, 'checklist_type');

      return Object.entries(grouped).map(([type, typeItems]) => ({
        checklist_type: type,
        total: typeItems.length,
        completed: typeItems.filter(i => i.is_checked).length,
        completion_rate: typeItems.filter(i => i.is_checked).length / typeItems.length
      }));
    }),

  // Get unchecked items (for carry-forward)
  getUnchecked: publicProcedure
    .input(z.object({ planId: z.number() }))
    .query(async ({ input }) => {
      return db.checklistItems.findMany({
        where: {
          plan_id: input.planId,
          is_checked: false,
          requires_action: true
        },
        include: { product: true }
      });
    })
});
```

---

## 7.5 Scheduled Jobs Summary

| Job | Schedule | Purpose |
|-----|----------|---------|
| `DailyPlanGeneratorJob` | 06:00 AM ET | Generate daily action plan with recommendations, carry-forward evaluation, and checklists |
| `EndOfDayChecklistJob` | 11:00 PM ET | Process unchecked items, mark for carry-forward, generate completion report |
| `DailyEmailSummaryJob` | 11:30 PM ET | Send email summary with scorecard, carried forward items, escalated flags |
| `MonitoringWindowJob` | Every 6 hours | Check completed actions whose monitoring window has elapsed, mark eligible for reassessment |
| `FlagEscalationJob` | 09:00 AM ET | Check unacknowledged flags older than 48h, escalate |

All jobs run via BullMQ on Redis, consistent with the existing system architecture defined in `PMP_SYSTEMS_ARCHITECTURE.md`.

---

**END OF PARTS 5, 6, 7 SPECIFICATION**
