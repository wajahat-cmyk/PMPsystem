# PMP SYSTEMS — EMAIL DELIVERY, APPROVAL WORKFLOW & DEPLOYMENT GATING
## Parts 8, 9, 10 of the PPC Master Framework

### Companion Files
- `PMP_SYSTEMS_ARCHITECTURE.md` — Core system (7 modules, data model, tech stack)
- `OPTIMIZATION_MODULE_SPEC.md` — 120-column optimization workbook logic
- `EXTENDED_MODULES_SPEC.md` — Syntax/Root/Inventory/Deal extensions
- `DEAL_TRACKING_SPEC.md` — Deal tracking data model
- `SYSTEM_EXPANSION_V3.md` — Marketplace, Activity Log, Forecasting
- `ACTION_PLAN_ENGINE.md` — 8-stage Action Plan Engine (Gate -> Checklist)
- `GATE_LOGIC_AND_ACTION_MAPPING.md` — Gate logic + diagnostic-to-action mapping
- `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` — Daily Plan, Yesterday Comparison, Checklist

---

# PART 1 — UPDATED DAILY EMAIL ARCHITECTURE

---

## 1.1 Email System Overview

The Daily Email is the **operating briefing** for the PPC team. It is the single artifact that bridges the Action Plan Engine (which generates recommendations) and the Approval Workflow (which gates execution). The email is NOT a report -- it is a decision document with embedded action controls.

### Trigger Chain

```
ETL Pipeline Complete (05:30 AM ET)
    │
    ├── Action Plan Engine runs (Stages 1-8)
    │   Completes by ~06:45 AM ET
    │
    ├── Email Renderer job triggered (BullMQ: DailyEmailJob)
    │   Reads: daily_action_plans (today), action_approval_queue, action_execution_log
    │   Renders: HTML email from template
    │
    └── Email dispatched at 07:05 AM ET
        Recipients: PPC team (configurable in system_settings)
        Provider: AWS SES or Resend (transactional email)
```

### Email Schedule

| Email Type | Trigger | Time | Recipients |
|------------|---------|------|------------|
| Daily Digest | Action Plan Engine completes | 07:05 AM ET | All PPC team |
| Critical Alert | Gate failure detected OR OOS+spending | Within 5 min of detection | PPC Lead + assigned operator |
| Approval Reminder | Unapproved actions exist in queue | 12:00 PM ET | Approval-tier recipients |
| End-of-Day Summary | Scheduled | 06:00 PM ET | All PPC team |

---

## 1.2 Daily Digest Email — Section-by-Section Specification

The daily digest email contains 8 sections in fixed order. Every section is collapsible in email clients that support it (progressive enhancement). The email is fully functional as plain HTML in all clients.

---

### SECTION A: EXECUTIVE SUMMARY

**Position:** Top of email, always visible. No collapse.

**Purpose:** 10-second situational awareness. The operator reads this and knows the shape of the day.

**Layout:**

```
╔══════════════════════════════════════════════════════════════════╗
║  PMP SYSTEMS — DAILY OPERATING BRIEFING                         ║
║  March 19, 2026 | Generated: 07:02 AM ET                        ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  PORTFOLIO STATUS                                                ║
║  Total Products: 12                                              ║
║  ┌─────────────┬─────────────┬─────────────┐                    ║
║  │ CRITICAL: 2  │ OPTIM: 6    │ SCALE: 4    │                    ║
║  │ (RED)        │ (YELLOW)    │ (GREEN)     │                    ║
║  └─────────────┴─────────────┴─────────────┘                    ║
║                                                                  ║
║  YESTERDAY: 23/28 actions executed (82%)                         ║
║  TODAY: 34 new actions | 5 carried forward | 7 flags             ║
║  GATE FAILURES: 2 products                                       ║
║  ACTIVE DEALS: 1 product (Satin Sheets — 7-day deal ends Mar 20)║
║  ACTIONS REQUIRING APPROVAL: 11                                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

**Data Sources:**

| Field | Source Table | Query |
|-------|-------------|-------|
| Total Products | `products` | `WHERE status = 'active'` |
| Segment counts | `daily_action_plans` | Today's plan, grouped by `product_segment` |
| Yesterday completion | `action_execution_log` | `WHERE plan_date = yesterday AND status = 'executed'` / total |
| Gate failures | `daily_action_plans` | Today's plan, `WHERE gate_status != 'CLEAR'` |
| Active deals | `deal_tracking` | `WHERE deal_start <= today AND deal_end >= today` |
| Actions requiring approval | `action_approval_queue` | `WHERE status = 'PENDING_APPROVAL'` |

**Rendering Logic:**

```typescript
interface ExecutiveSummary {
  plan_date: string;                    // ISO date
  generated_at: string;                 // ISO timestamp
  total_products: number;
  segment_counts: {
    critical: number;
    optimization: number;
    scale: number;
  };
  yesterday_completion: {
    executed: number;
    total: number;
    rate_pct: number;
  };
  today_actions: {
    new_actions: number;
    carried_forward: number;
    flags: number;
  };
  gate_failures: number;
  active_deals: { product_name: string; deal_type: string; end_date: string; }[];
  pending_approvals: number;
}
```

---

### SECTION B: CRITICAL ALERTS

**Position:** Immediately below Executive Summary. Red banner background (`#DC2626`), white text.

**Purpose:** Stop-everything items. If this section has content, the operator addresses it BEFORE touching anything else.

**Visibility Rule:** Section B is ONLY rendered if at least one alert exists. If no alerts, the section is omitted entirely (no empty red banner).

**Alert Types (in display order):**

| Alert Type | Trigger Condition | Severity |
|------------|-------------------|----------|
| Gate Failure | `gate_status IN ('BOTH_FAIL', 'INVENTORY_FAIL', 'PROFITABILITY_FAIL')` today but was `CLEAR` yesterday | CRITICAL |
| OOS + Spending | `days_of_stock <= 0` AND `yesterday_spend > 0` for any campaign on this product | CRITICAL |
| Moved to Critical | Product `segment` changed to `CRITICAL` today (was not CRITICAL yesterday) | HIGH |
| SOP Violation | Any detected violation from the criteria/naming check engine | HIGH |
| Naming Convention Violation | Campaign name does not match pattern: `{Brand}\|{Product}\|{Syntax}\|{MatchType}\|{Objective}` | MEDIUM |

**Layout:**

```
┌─── CRITICAL ALERTS ─────────────────────────────────────── [RED BANNER] ──┐
│                                                                            │
│  1. GATE FAILURE — Satin Fitted Sheet (B0DZ17NCJ4)                        │
│     Inventory: CRITICAL FAIL — 8 days of stock (was 22 days yesterday)    │
│     Profitability: CLEAR                                                   │
│     Impact: All SCALE and BOOST actions blocked. REDUCE-only mode.        │
│     Required: Reduce spend across all campaigns immediately.              │
│                                                                            │
│  2. OOS + ACTIVE SPEND — Cooling Pillowcase (B0FTSVDG77)                 │
│     Stock: 0 units FBA | Still spending: $12.40 yesterday                 │
│     Required: Pause ALL campaigns immediately.                            │
│     [PAUSE ALL CAMPAIGNS] ← one-click action button                      │
│                                                                            │
│  3. MOVED TO CRITICAL — Bamboo Sheets 6PCS (B0D952H31F)                  │
│     Was: OPTIMIZATION | Now: CRITICAL                                     │
│     Trigger: ACOS 34.2% exceeded BE ACOS 28.1% for 7 consecutive days    │
│                                                                            │
│  4. SOP VIOLATION — Silk Pillow Case (B0DQQQWYPT)                         │
│     Missing Ranking campaign for "silk pillowcase" root keyword           │
│     Criteria: Every product MUST have Ranking campaigns on top 3 roots    │
│                                                                            │
│  5. NAMING VIOLATION — 3 campaigns                                        │
│     SLEEPHORIA|CoolingSheets|Auto|SP (missing Syntax segment)             │
│     DECOLURE-Bamboo-King-Exact (wrong delimiter, must use pipe)           │
│     Satin Generic Phrase (missing brand prefix)                           │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Data Model:**

```typescript
interface CriticalAlert {
  alert_id: string;                     // UUID
  alert_type: 'GATE_FAILURE' | 'OOS_SPENDING' | 'MOVED_TO_CRITICAL' | 'SOP_VIOLATION' | 'NAMING_VIOLATION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  product_id: string;
  product_name: string;
  asin: string;
  description: string;
  evidence: string;                     // What data triggered this
  required_action: string;              // What must be done
  one_click_action_id?: string;         // If a pre-built action exists, link to approve it
  detected_at: string;                  // ISO timestamp
}
```

**Critical Alert Email (Separate from Daily Digest):**

When a CRITICAL-severity alert is detected outside the daily digest window (e.g., mid-day inventory sync reveals OOS), a standalone alert email fires within 5 minutes:

```
Subject: [CRITICAL] PMP Systems — OOS + Active Spend: Cooling Pillowcase
Body: Single alert card (same format as above) + one-click action button
```

BullMQ job: `CriticalAlertEmailJob` — triggered by event `gate.critical_change` or `inventory.oos_with_spend`.

---

### SECTION C: PERFORMANCE SNAPSHOT

**Position:** After Critical Alerts (or after Executive Summary if no alerts).

**Purpose:** Per-product performance context. The operator sees current state before reviewing recommended actions.

**Grouping:** Products are grouped by segment. Within each segment, ordered by estimated revenue impact descending (7d sales descending as proxy).

**Layout per product:**

```
┌─── CRITICAL ──────────────────────────────────────────────────────────────┐
│                                                                            │
│  SATIN SHEETS 6 PCS                                                        │
│  Brand: DECOLURE | ASIN: B0CRF7S2TH | Stage: MAINTENANCE | Segment: CRIT │
│                                                                            │
│  7-DAY METRICS                                                             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Sales    │ Spend    │ ACOS     │ TACOS    │ CVR      │ Organic% │      │
│  │ $4,626   │ $842     │ 18.2%    │ 18.2%    │ 6.1%     │ 22%      │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘      │
│                                                                            │
│  YESTERDAY DELTA                                                           │
│  Sales: $661 → $580 (▼12.2%) | Spend: $120 → $134 (▲11.7%)              │
│  ACOS: 18.2% → 23.1% (▲4.9pp) | Orders: 22 → 19 (▼13.6%)              │
│                                                                            │
│  DEAL STATUS: None                                                         │
│                                                                            │
│  INVENTORY                                                                 │
│  Hero SKU DOS: 78 days | Gate: CLEAR                                      │
│                                                                            │
│  PROFITABILITY                                                             │
│  BE ACOS: 24.8% | Current ACOS: 18.2% | Headroom: 6.6pp | Gate: CLEAR   │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  BAMBOO SHEETS                                                             │
│  Brand: DECOLURE | ASIN: B08KQKPKWC | Stage: GROWTH | Segment: CRITICAL  │
│  ... (same layout)                                                         │
│                                                                            │
├─── OPTIMIZATION ──────────────────────────────────────────────────────────┤
│  ... (products in OPTIMIZATION segment)                                    │
│                                                                            │
├─── SCALE ─────────────────────────────────────────────────────────────────┤
│  ... (products in SCALE segment)                                           │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Data Sources per product:**

| Field | Source | Calculation |
|-------|--------|-------------|
| 7d Sales | `product_daily_metrics` | SUM(sales) WHERE date BETWEEN today-7 AND today-1 |
| 7d Spend | `keyword_daily_metrics` | SUM(spend) grouped by product, last 7 days |
| ACOS | Calculated | 7d_spend / 7d_sales |
| TACOS | Calculated | 7d_spend / 7d_total_sales (incl organic) |
| CVR | `keyword_daily_metrics` | SUM(orders) / SUM(clicks) |
| Organic% | `product_daily_metrics` | organic_orders / total_orders |
| Yesterday delta | Compare day-1 vs day-2 values | Absolute + percentage change |
| Deal status | `deal_tracking` | Active deal WHERE product_id AND date range |
| Hero SKU DOS | `inventory_snapshots` | current_stock / avg_daily_units_30d for hero variation |
| BE ACOS | `product_settings` + `product_daily_metrics` | (price - cogs - fees) / price |
| Gate status | `daily_action_plans` | Today's gate evaluation output |

---

### SECTION D: RECOMMENDED ACTIONS (THE CORE)

**Position:** Center of email. This is the primary decision section.

**Purpose:** Every recommended action, per product, per syntax, with full evidence chain. The operator reads the WHY and decides whether to approve.

**Grouping:** Same product grouping as Section C (segment order). Within each product, actions are ordered by priority: URGENT first, then HIGH, MEDIUM, LOW.

**Layout per product:**

```
PRODUCT: Bamboo Sheets 4 Pcs [GROWTH] [OPTIMIZATION]
├── Gates: Profitability CLEAR | Inventory CAUTION (42 days)
│
├── ACTION 1: Increase TOS modifier on "Bamboo|King" campaigns
│   Current: 80% -> Recommended: 130%
│   WHY: VISIBILITY quadrant -- CVR strong (8.2%) but CTR below target (1.4% vs 2.3%)
│   ROOT CAUSE: Under-Investment -- IS% only 8%, impression rank >4
│   SOP RULE: "Section 4.4 Root 4: Under-Investment -- CVR above target + IS% < 15%
│              + impression rank > 4 -> increase budget, increase bid, increase TOS"
│   PRIORITY: HIGH
│   CONFIDENCE: HIGH (7d data, 340 clicks, CVR stable 3 weeks)
│   EXPECTED OUTCOME: IS% increase to ~15%, estimated +12% sales on this syntax
│   MONITORING: 48-72h window. Reassess Mar 22.
│   STATUS: PENDING APPROVAL
│   [APPROVE]  [REJECT]  [MODIFY]
│
├── ACTION 2: Reduce bids 30% on "Bamboo|Twin" keywords
│   Current avg bid: $1.80 -> Recommended: $1.26
│   WHY: CONVERSION quadrant -- CTR good (2.8%) but CVR 4.2% vs target 6.8%
│   ROOT CAUSE: Placement -- 62% of spend on PDP, only 18% TOS
│   SOP RULE: "Section 4.4 Root 1: Conversion & Placement -- CVR dropped WoW +
│              PDP spend share > 40% -> increase TOS modifier, reduce PDP bids"
│   PRIORITY: HIGH
│   CONFIDENCE: HIGH (7d data, 280 clicks)
│   EXPECTED OUTCOME: Shift spend toward TOS, expected CVR lift to ~5.5%
│   MONITORING: 48-72h window. Reassess Mar 22.
│   STATUS: PENDING APPROVAL
│   [APPROVE]  [REJECT]  [MODIFY]
│
├── FLAG -> LISTING TEAM: Bamboo|Twin CVR issue
│   Evidence: CVR 4.2% vs SQP market 6.8% -- listing review needed
│   SOP RULE: "PPC FLAGS listing issues -- PPC does NOT fix listing/pricing problems"
│   STATUS: FLAG SENT (auto-dispatched)
│
└── ACTION 3: Pause all "Bamboo|Full" campaigns
    Current: Active (spending $18/day) -> Recommended: Paused
    WHY: BOTH_FAILING -- CTR 0.8% (target 2.3%), CVR 2.1% (target 6.8%)
    ROOT CAUSE: N/A -- both metrics failing, no single PPC fix
    SOP RULE: "Section 4.3: BOTH_FAILING quadrant -> PAUSE: Stop spend, flag urgently,
               reallocate budget to STRONG syntaxes"
    PRIORITY: URGENT
    CONFIDENCE: HIGH (14d data, 190 clicks, no conversion improvement trend)
    EXPECTED OUTCOME: Save $126/week, reallocate to Bamboo|King and Bamboo|Queen
    STATUS: PENDING APPROVAL
    [APPROVE]  [REJECT]  [MODIFY]
```

**Action Card Data Model:**

```typescript
interface EmailActionCard {
  action_id: string;                    // UUID from action_approval_queue
  product_name: string;
  product_asin: string;
  product_stage: 'LAUNCH' | 'GROWTH' | 'MAINTENANCE';
  product_segment: 'CRITICAL' | 'OPTIMIZATION' | 'SCALE';
  gate_status: {
    profitability: { status: string; be_acos: number; current_acos: number; };
    inventory: { status: string; dos: number; };
  };

  // What
  action_type: string;                  // From ActionType enum (BID_INCREASE, etc.)
  target_entity: string;                // Campaign name, keyword, syntax group
  current_value: string;                // "80%" or "$1.80"
  recommended_value: string;            // "130%" or "$1.26"

  // Why (3-layer reasoning)
  diagnostic_quadrant: 'STRONG' | 'VISIBILITY' | 'CONVERSION' | 'BOTH_FAILING';
  root_cause: string;                   // PLACEMENT, RELEVANCY, INDEXING, UNDER_INVESTMENT, N/A
  sop_rule_reference: string;           // Exact section + quote from PPC Framework

  // Evidence
  evidence_metrics: {
    metric: string;                     // "CVR", "CTR", "IS%", etc.
    actual: number;
    target: number;
    gap: string;                        // "-27.3%" or "+206.7%"
  }[];

  // Impact
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_basis: string;             // "7d data, 340 clicks, CVR stable 3 weeks"
  expected_outcome: string;
  monitoring_window_hours: number;      // 48 or 72
  reassess_date: string;                // ISO date

  // Approval
  status: 'PENDING_APPROVAL' | 'AUTO_APPROVED' | 'APPROVED' | 'REJECTED';
  approval_tier: 'AUTO' | 'OPERATOR' | 'MANAGER';
  approve_url: string;                  // One-click authenticated link
  reject_url: string;                   // Opens rejection reason form
  modify_url: string;                   // Opens action editor in web app

  // Context
  is_carried_forward: boolean;
  days_pending: number;
  yesterday_status?: string;            // What happened yesterday for this action
}
```

**Flag Card (separate from PPC actions):**

Flags are auto-dispatched (they do not require PPC approval -- they are notifications to other teams). They appear inline with the product's actions but are visually distinct (yellow background, no approve/reject buttons).

```typescript
interface EmailFlagCard {
  flag_id: string;
  flag_type: 'FLAG_LISTING_INDEXING' | 'FLAG_LISTING_CVR' | 'FLAG_PRICING' | 'FLAG_INVENTORY' | 'FLAG_CPC_ESCALATION' | 'FLAG_COMPETITOR_WAR';
  recipient_team: 'LISTING' | 'BRAND_MGMT' | 'LAUNCH' | 'SUPPLY_CHAIN';
  product_name: string;
  product_asin: string;
  evidence: string;
  sop_rule_reference: string;
  dispatched_at: string;                // ISO timestamp
  status: 'SENT' | 'ACKNOWLEDGED' | 'RESOLVED';
}
```

---

### SECTION E: APPROVAL REQUIRED

**Position:** After all product action cards.

**Purpose:** Summary table of ALL actions awaiting approval. Quick-scan for batch approval.

**Layout:**

```
┌─── APPROVAL REQUIRED ─────────────────────────────────────────────────────┐
│                                                                            │
│  11 actions require your approval before deployment                        │
│                                                                            │
│  ┌────┬─────────────────────┬───────────────────────────┬──────┬─────────┐│
│  │ #  │ Product             │ Action                    │ Pri  │ Action  ││
│  ├────┼─────────────────────┼───────────────────────────┼──────┼─────────┤│
│  │ 1  │ Bamboo Sheets       │ Pause Bamboo|Full camps   │ URG  │[A] [R]  ││
│  │ 2  │ Bamboo Sheets       │ Reduce bids 30% Twin      │ HIGH │[A] [R]  ││
│  │ 3  │ Bamboo Sheets       │ Increase TOS 80%->130%    │ HIGH │[A] [R]  ││
│  │ 4  │ Satin Sheets 6Pcs   │ Pause Satin|Full camps    │ URG  │[A] [R]  ││
│  │ 5  │ Satin Sheets 6Pcs   │ Reduce bids 30% Twin      │ HIGH │[A] [R]  ││
│  │ 6  │ Satin Sheets 6Pcs   │ Negate 12 search terms    │ HIGH │[A] [R]  ││
│  │ 7  │ Cooling Sheets      │ Budget +50% Cool|Queen    │ MED  │[A] [R]  ││
│  │ 8  │ Cooling Sheets      │ TOS +80% Cool|King        │ MED  │[A] [R]  ││
│  │ 9  │ Silk Pillow Case    │ Bid -15% Silk|Generic     │ MED  │[A] [R]  ││
│  │ 10 │ Bamboo 6PCS (SS)    │ Match type expand King    │ LOW  │[A] [R]  ││
│  │ 11 │ Satin 4PCs (SS)     │ Budget +30% Satin|Queen   │ LOW  │[A] [R]  ││
│  └────┴─────────────────────┴───────────────────────────┴──────┴─────────┘│
│                                                                            │
│  [APPROVE ALL URGENT (2)]  [APPROVE ALL HIGH (4)]  [VIEW IN APP]          │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Approve/Reject Links:**

Each `[A]` and `[R]` button is a pre-authenticated URL:

```
Approve: https://app.pmpsystems.com/api/actions/{action_id}/approve?token={jwt}&t={timestamp}
Reject:  https://app.pmpsystems.com/api/actions/{action_id}/reject?token={jwt}&t={timestamp}
```

- JWT token encodes: `user_id`, `action_id`, `action_hash` (to prevent replay if action was modified), `expires_at` (24h TTL)
- Approve link triggers immediate status change to `APPROVED` and queues for execution
- Reject link redirects to a lightweight web form for rejection reason (required field)
- "Approve All URGENT" link batch-approves all URGENT actions in a single request

---

### SECTION F: SOP / CRITERIA VIOLATIONS

**Position:** After Approval table.

**Purpose:** Structural issues that are not action-level but need attention. Naming conventions, missing campaigns, criteria deviations.

**Visibility Rule:** Only rendered if violations exist.

**Layout:**

```
┌─── SOP / CRITERIA VIOLATIONS ─────────────────────────────────────────────┐
│                                                                            │
│  CAMPAIGN STRUCTURE                                                        │
│  1. Silk Pillow Case — Missing Ranking campaign for root "silk pillowcase" │
│     Criteria: "Every product MUST have Ranking campaigns on top 3 roots"   │
│     Action Required: Create Ranking|Exact and Ranking|Phrase campaigns     │
│                                                                            │
│  2. Cooling Comforter — No Discovery campaign exists                       │
│     Criteria: "All LAUNCH/GROWTH products must have Discovery campaigns"   │
│     Stage: GROWTH — Discovery campaign is mandatory                        │
│                                                                            │
│  NAMING CONVENTIONS                                                        │
│  3. "SLEEPHORIA|CoolingSheets|Auto|SP" — Missing syntax segment           │
│     Expected: {Brand}|{Product}|{Syntax}|{MatchType}|{Objective}          │
│                                                                            │
│  4. "DECOLURE-Bamboo-King-Exact" — Wrong delimiter (dash instead of pipe) │
│     Expected: DECOLURE|Bamboo|King|Exact|{Objective}                      │
│                                                                            │
│  5. "Satin Generic Phrase" — Missing brand prefix                          │
│     Expected: DECOLURE|Satin|Generic|Phrase|{Objective}                   │
│                                                                            │
│  THRESHOLD VIOLATIONS                                                      │
│  6. Bamboo 6PCS — TOS% is 8% on Ranking campaigns (threshold: >30%)      │
│     Criteria: "Ranking campaigns -> TOS% >30% threshold"                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Detection Logic:**

```typescript
interface SOPViolation {
  violation_id: string;
  violation_type: 'MISSING_CAMPAIGN' | 'NAMING_CONVENTION' | 'THRESHOLD_VIOLATION' | 'STRUCTURE_VIOLATION';
  product_id: string;
  product_name: string;
  entity_name?: string;                 // Campaign name if applicable
  criteria_reference: string;           // Exact quote from PPC Criteria sheet
  description: string;
  recommended_fix: string;
  detected_at: string;
  days_unresolved: number;              // How long this violation has persisted
}
```

**SOP Violation Detection runs as Stage 8.5** (after checklist generation, before email rendering):

```
Naming Check:
  FOR each campaign in active_campaigns:
    Parse name against pattern: {Brand}|{Product}|{Syntax}|{MatchType}|{Objective}
    IF segments < 5 OR delimiter != '|' OR brand not in known_brands:
      → NAMING_CONVENTION violation

Structure Check:
  FOR each product:
    FOR each root in product.top_3_roots:
      IF NOT EXISTS campaign WHERE objective = 'RANKING' AND root = root:
        → MISSING_CAMPAIGN violation
    IF product.stage IN ('LAUNCH', 'GROWTH'):
      IF NOT EXISTS campaign WHERE objective = 'DISCOVERY' AND product = product:
        → MISSING_CAMPAIGN violation

Threshold Check:
  FOR each campaign WHERE objective = 'RANKING':
    IF tos_spend_share < 0.30:
      → THRESHOLD_VIOLATION (TOS% below 30% on Ranking campaign)
```

---

### SECTION G: YESTERDAY REVIEW

**Position:** After SOP Violations.

**Purpose:** Accountability. What happened with yesterday's plan.

**Layout:**

```
┌─── YESTERDAY REVIEW (Mar 18) ─────────────────────────────────────────────┐
│                                                                            │
│  COMPLETION: 23/28 actions (82%)                                           │
│                                                                            │
│  COMPLETED (23)                                                            │
│  - Increase TOS on Bamboo|King 80%->130% ........... executed 10:42 AM    │
│  - Negate 8 search terms on Satin campaigns ........ executed 11:15 AM    │
│  - Reduce bids 20% on Satin|Generic ................ executed 11:30 AM    │
│  - Budget +30% on Cooling|Queen .................... executed 02:15 PM    │
│  - ... (collapsed if >5, show "and 19 more")                              │
│                                                                            │
│  PENDING — CARRIED FORWARD (3)                                             │
│  - Reduce bids 30% on Satin|Twin ................... day 2, priority HIGH │
│  - FLAG -> LISTING: Bamboo|Twin CVR ................ day 3, ESCALATED     │
│  - Pause Satin|Full campaigns ...................... skipped (deal active) │
│                                                                            │
│  SKIPPED (2)                                                               │
│  - Pause Satin|Full — Reason: "Waiting for 7-day deal to end"             │
│  - Budget +30% Bamboo|Queen — Reason: "Inventory at 42 days, restock TBD"│
│                                                                            │
│  FAILED (0)                                                                │
│  - None                                                                    │
│                                                                            │
│  NET CHANGE: +6 new actions today vs yesterday                            │
│  Yesterday: 28 actions | Today: 34 actions                                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Data Sources:**

- Completed: `action_execution_log WHERE plan_date = yesterday AND status = 'executed'`
- Pending: `action_execution_log WHERE plan_date = yesterday AND status IS NULL` (no log entry)
- Skipped: `action_execution_log WHERE plan_date = yesterday AND status = 'skipped'`
- Failed: `action_execution_log WHERE plan_date = yesterday AND status = 'failed'`
- Carried forward: actions that re-appear in today's plan with `is_carried_forward = true`

---

### SECTION H: EXECUTION CHECKLIST

**Position:** Bottom of email.

**Purpose:** Ordered execution sequence. The operator works through this top-to-bottom.

**Layout:**

```
┌─── EXECUTION CHECKLIST ───────────────────────────────────────────────────┐
│                                                                            │
│  Work through in order. Critical first, then Optimization, then Scale.    │
│                                                                            │
│  PHASE 1: BLEEDING CONTROL (Critical Products)                            │
│  [ ] 1. Pause Bamboo|Full campaigns (URGENT)                              │
│  [ ] 2. Pause Satin|Full campaigns (URGENT)                               │
│  [ ] 3. Reduce bids 30% Bamboo|Twin (HIGH)                                │
│  [ ] 4. Reduce bids 30% Satin|Twin (HIGH)                                 │
│  [ ] 5. Negate 12 search terms Satin (HIGH)                               │
│                                                                            │
│  PHASE 2: PROFITABILITY IMPROVEMENT (Optimization Products)               │
│  [ ] 6. Bid -15% Silk|Generic (MEDIUM)                                    │
│  [ ] 7. TOS +80% Satin|King (HIGH)                                        │
│  [ ] 8. TOS +130% Bamboo|King (HIGH)                                      │
│  [ ] 9. Negate 8 search terms Silk (MEDIUM)                               │
│                                                                            │
│  PHASE 3: SCALING (Scale Products)                                        │
│  [ ] 10. Budget +50% Cooling|Queen (MEDIUM)                               │
│  [ ] 11. Match type expand Bamboo 6PCS|King (LOW)                         │
│                                                                            │
│  FLAGS DISPATCHED (no action required from PPC)                            │
│  [sent] FLAG -> LISTING: Bamboo|Twin CVR issue                            │
│  [sent] FLAG -> LISTING: Satin|Twin CVR issue                             │
│  [sent] FLAG -> PRICING: Satin|Generic price gap                          │
│  [sent] FLAG -> BRAND MGMT: Silk|Generic relevancy concern                │
│                                                                            │
│  Total: 11 PPC actions + 4 flags                                          │
│  Estimated completion time: ~45 minutes                                   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

**Estimated completion time calculation:**

```
Time per action type:
  Campaign pause:        2 min (bulk sheet or API)
  Bid adjustment:        3 min (verify + apply in bulk)
  TOS modifier change:   3 min
  Budget change:         2 min
  Keyword negation:      5 min (review + apply)
  Match type expansion:  5 min (create new campaign/ad group)

Total = SUM(action_count_by_type * time_per_type)
```

---

## 1.3 Email Template Architecture

### Tech Stack

| Component | Technology | Reason |
|-----------|-----------|--------|
| Template engine | React Email (JSX -> HTML) | Type-safe, component-based, tested rendering |
| Email provider | Resend (primary) / AWS SES (fallback) | Resend has native React Email support |
| Job scheduler | BullMQ | Already in stack for ETL jobs |
| Token generation | jose (JWT) | Lightweight JWT for approve/reject links |

### Template Components

```
/src/emails/
├── templates/
│   ├── DailyDigestEmail.tsx           // Main daily email
│   ├── CriticalAlertEmail.tsx         // Standalone critical alert
│   ├── ApprovalReminderEmail.tsx      // Noon reminder
│   └── EndOfDaySummaryEmail.tsx       // 6PM summary
├── components/
│   ├── ExecutiveSummary.tsx           // Section A
│   ├── CriticalAlerts.tsx            // Section B
│   ├── PerformanceSnapshot.tsx       // Section C
│   ├── ProductActionCard.tsx         // Section D (per product)
│   ├── ActionItem.tsx                // Individual action within product
│   ├── FlagItem.tsx                  // Individual flag within product
│   ├── ApprovalTable.tsx             // Section E
│   ├── SOPViolations.tsx             // Section F
│   ├── YesterdayReview.tsx           // Section G
│   └── ExecutionChecklist.tsx        // Section H
├── layouts/
│   ├── BaseLayout.tsx                // Header, footer, responsive wrapper
│   └── AlertLayout.tsx               // Minimal layout for critical alerts
└── utils/
    ├── token.ts                      // JWT generation for approve/reject links
    ├── formatters.ts                 // Currency, percentage, delta formatting
    └── colors.ts                     // Segment colors, priority colors
```

### Responsive Design Rules

- Max width: 680px (centered)
- Font: system font stack (no web fonts in email)
- Colors: Red (#DC2626) for CRITICAL, Yellow (#F59E0B) for OPTIMIZATION, Green (#16A34A) for SCALE
- Priority badges: URGENT = red background, HIGH = orange, MEDIUM = blue, LOW = gray
- All approve/reject buttons minimum 44x44px touch target (mobile-friendly)
- Tables use `<table>` for email compatibility, not CSS grid/flex

---

## 1.4 Database Tables for Email System

```sql
-- Email dispatch log
CREATE TABLE email_dispatch_log (
    id BIGSERIAL PRIMARY KEY,
    email_type VARCHAR(50) NOT NULL,          -- 'daily_digest', 'critical_alert', 'approval_reminder', 'eod_summary'
    plan_id BIGINT REFERENCES daily_action_plans(id),
    recipients JSONB NOT NULL,                 -- [{email, name, role}]
    subject VARCHAR(500) NOT NULL,
    rendered_html TEXT,                         -- Cached rendered HTML
    sent_at TIMESTAMPTZ,
    delivery_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'bounced', 'failed'
    provider_message_id VARCHAR(200),          -- From Resend/SES
    error_details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_dispatch_plan ON email_dispatch_log(plan_id);
CREATE INDEX idx_email_dispatch_type_date ON email_dispatch_log(email_type, created_at);

-- Critical alerts (persisted separately for tracking)
CREATE TABLE critical_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    product_id VARCHAR(20) NOT NULL REFERENCES products(asin),
    description TEXT NOT NULL,
    evidence TEXT NOT NULL,
    required_action TEXT NOT NULL,
    one_click_action_id UUID REFERENCES action_approval_queue(id),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    resolution_note TEXT,
    email_sent BOOLEAN DEFAULT FALSE,
    plan_date DATE NOT NULL
);

CREATE INDEX idx_critical_alerts_date ON critical_alerts(plan_date);
CREATE INDEX idx_critical_alerts_unresolved ON critical_alerts(resolved_at) WHERE resolved_at IS NULL;

-- SOP violations (persisted for tracking resolution)
CREATE TABLE sop_violations (
    id BIGSERIAL PRIMARY KEY,
    violation_type VARCHAR(50) NOT NULL,
    product_id VARCHAR(20) REFERENCES products(asin),
    entity_name VARCHAR(500),                  -- Campaign name if applicable
    criteria_reference TEXT NOT NULL,
    description TEXT NOT NULL,
    recommended_fix TEXT NOT NULL,
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    days_unresolved INTEGER DEFAULT 0,
    plan_date DATE NOT NULL
);

CREATE INDEX idx_sop_violations_unresolved ON sop_violations(resolved_at) WHERE resolved_at IS NULL;
```

---

## 1.5 BullMQ Job Definitions

```typescript
// Job 1: Daily Digest Email
const DailyDigestEmailJob = {
  name: 'daily-digest-email',
  queue: 'email',
  schedule: '5 7 * * *',               // 07:05 AM ET daily
  dependencies: ['daily-plan-generator'], // Must complete first
  handler: async () => {
    const plan = await getPlan(today());
    const approvals = await getPendingApprovals();
    const yesterday = await getYesterdayReview();
    const alerts = await getCriticalAlerts(today());
    const violations = await getSOPViolations();

    const html = renderDailyDigest({
      plan, approvals, yesterday, alerts, violations
    });

    const recipients = await getEmailRecipients('daily_digest');
    await sendEmail({
      to: recipients,
      subject: `PMP Daily Briefing — ${formatDate(today())} | ${plan.pending_approvals} approvals pending`,
      html
    });

    await logEmailDispatch('daily_digest', plan.id, recipients);
  }
};

// Job 2: Critical Alert Email (event-triggered, not scheduled)
const CriticalAlertEmailJob = {
  name: 'critical-alert-email',
  queue: 'email',
  trigger: 'event',                     // Triggered by gate.critical_change or inventory.oos_with_spend
  handler: async (alert: CriticalAlert) => {
    const html = renderCriticalAlert(alert);
    const recipients = await getEmailRecipients('critical_alert');

    await sendEmail({
      to: recipients,
      subject: `[CRITICAL] PMP — ${alert.alert_type}: ${alert.product_name}`,
      html
    });

    await markAlertEmailSent(alert.id);
  }
};

// Job 3: Approval Reminder
const ApprovalReminderJob = {
  name: 'approval-reminder-email',
  queue: 'email',
  schedule: '0 12 * * *',              // 12:00 PM ET daily
  handler: async () => {
    const pending = await getPendingApprovals();
    if (pending.length === 0) return;   // No email if nothing pending

    const html = renderApprovalReminder(pending);
    const recipients = await getEmailRecipients('approval_reminder');

    await sendEmail({
      to: recipients,
      subject: `PMP Reminder — ${pending.length} actions still awaiting approval`,
      html
    });
  }
};

// Job 4: End-of-Day Summary
const EndOfDaySummaryJob = {
  name: 'eod-summary-email',
  queue: 'email',
  schedule: '0 18 * * *',              // 6:00 PM ET daily
  handler: async () => {
    const plan = await getPlan(today());
    const executionLog = await getExecutionLog(today());

    const completed = executionLog.filter(a => a.status === 'executed').length;
    const total = plan.total_actions;
    const pending = plan.total_actions - completed;

    const html = renderEndOfDaySummary({
      plan, executionLog, completed, total, pending
    });

    const recipients = await getEmailRecipients('eod_summary');

    await sendEmail({
      to: recipients,
      subject: `PMP End of Day — ${completed}/${total} complete (${Math.round(completed/total*100)}%)`,
      html
    });
  }
};
```

---
---

# PART 2 — RECOMMENDED ACTIONS ENGINE (Enhancement)

This section enhances the existing Action Plan Engine (Stages 1-8) with structured rationale, SOP rule references, and auto-approve/manual-approve classification. The engine output format changes from a flat action list to a fully evidence-chained action with approval metadata.

---

## 2.1 Enhanced Action Output Schema

Every action the engine generates MUST include the full `ActionWithRationale` structure. No action is emitted without all three reasoning layers (diagnostic, root cause, SOP rule).

```typescript
interface ActionWithRationale {
  // --- Identity ---
  action_id: string;                    // UUID, generated at creation
  plan_id: number;                      // Foreign key to daily_action_plans
  plan_date: string;                    // ISO date
  product_id: string;                   // ASIN
  product_name: string;
  syntax_group_id?: number;             // FK to syntax_groups (null for product-level actions)
  syntax_name?: string;                 // "Bamboo|King" (null for product-level actions)

  // --- What (the action itself) ---
  action_type: ActionType;              // Enum: BID_INCREASE, BID_DECREASE, BUDGET_INCREASE, etc.
  action_category: 'SCALE' | 'EFFICIENCY' | 'REDUCE' | 'PAUSE' | 'FLAG' | 'STRUCTURAL';
  target_entity: string;                // Campaign name, keyword group, or syntax group
  target_entity_type: 'CAMPAIGN' | 'KEYWORD' | 'PLACEMENT' | 'PRODUCT_TARGET' | 'SYNTAX_GROUP';
  current_value: number | string;       // Current state: bid amount, modifier %, budget, status
  recommended_value: number | string;   // Recommended state
  change_magnitude: number;             // Absolute % change (e.g., 30 for "reduce 30%")
  change_direction: 'INCREASE' | 'DECREASE' | 'PAUSE' | 'ENABLE' | 'CREATE' | 'NEGATE';

  // --- Why: Layer 1 — Diagnostic Quadrant ---
  diagnostic_quadrant: 'STRONG' | 'VISIBILITY' | 'CONVERSION' | 'BOTH_FAILING';
  quadrant_metrics: {
    ctr_actual: number;
    ctr_target: number;
    ctr_passing: boolean;
    cvr_actual: number;
    cvr_target: number;
    cvr_passing: boolean;
  };

  // --- Why: Layer 2 — Root Cause ---
  root_cause: 'PLACEMENT' | 'RELEVANCY' | 'INDEXING' | 'UNDER_INVESTMENT' | 'NONE' | 'UNCLEAR';
  root_cause_evidence: string;          // Human-readable evidence string
  root_cause_data: {                    // Machine-readable evidence
    metric: string;
    actual: number;
    threshold: number;
    comparison: 'ABOVE' | 'BELOW' | 'WITHIN';
  }[];

  // --- Why: Layer 3 — SOP Rule Reference ---
  sop_rule_reference: string;           // Exact section + rule from PPC Framework
  sop_rule_id: string;                  // Codified reference (e.g., "S4.4-R1", "S4.3-STRONG-SCALE")
  sop_rule_text: string;               // Full quoted text of the rule

  // --- Evidence Metrics ---
  evidence_metrics: {
    metric: string;                     // "CVR", "CTR", "IS%", "ACOS", etc.
    actual: number;
    target: number;
    gap: string;                        // Human-readable: "-27.3%", "+4.9pp"
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING'; // 3-week trend
    data_points: number;                // How many days/clicks of data
  }[];

  // --- Impact Assessment ---
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority_score: number;               // 0-100 numeric score for sorting
  expected_outcome: string;             // "IS% increase to ~15%, estimated +12% sales"
  estimated_revenue_impact: number;     // Dollar estimate (positive = gain, negative = saving)
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_basis: string;             // "7d data, 340 clicks, CVR stable 3 weeks"

  // --- Approval Metadata ---
  requires_approval: boolean;
  approval_tier: 'AUTO' | 'OPERATOR' | 'MANAGER';
  auto_approve_rule?: string;           // Which rule allowed auto-approve (null if manual)
  status: ActionStatus;

  // --- Monitoring ---
  monitoring_window_hours: number;      // 48 or 72
  reassess_date: string;                // When to re-evaluate this action's impact
  rollback_trigger?: string;            // "If ACOS increases >5pp in 48h, rollback"

  // --- Continuity ---
  is_carried_forward: boolean;
  days_pending: number;
  original_action_id?: string;          // If carried forward, the original UUID
  yesterday_status?: string;

  // --- Timestamps ---
  created_at: string;
  approved_at?: string;
  approved_by?: string;
  executed_at?: string;
  executed_by?: string;
}

// Action Type Enum
type ActionType =
  | 'BID_INCREASE'
  | 'BID_DECREASE'
  | 'BUDGET_INCREASE'
  | 'BUDGET_DECREASE'
  | 'TOS_MODIFIER_INCREASE'
  | 'TOS_MODIFIER_DECREASE'
  | 'MATCH_TYPE_EXPAND'
  | 'KEYWORD_PAUSE'
  | 'KEYWORD_ENABLE'
  | 'CAMPAIGN_PAUSE'
  | 'CAMPAIGN_ENABLE'
  | 'SPEND_REDUCE'
  | 'KEYWORD_NEGATE'
  | 'FLAG_LISTING_INDEXING'
  | 'FLAG_LISTING_CVR'
  | 'FLAG_PRICING'
  | 'FLAG_INVENTORY'
  | 'FLAG_CPC_ESCALATION'
  | 'FLAG_COMPETITOR_WAR';

// Action Status Enum
type ActionStatus =
  | 'PROPOSED'                          // Engine generated, not yet evaluated for auto-approve
  | 'PENDING_APPROVAL'                  // Requires human approval
  | 'AUTO_APPROVED'                     // Passed auto-approve rules
  | 'APPROVED'                          // Human approved
  | 'REJECTED'                          // Human rejected (with reason)
  | 'MODIFIED'                          // Human modified, re-enters approval flow
  | 'QUEUED'                            // Approved, waiting in execution queue
  | 'EXECUTING'                         // Currently being pushed to Amazon API
  | 'EXECUTED'                          // Successfully applied
  | 'EXECUTION_FAILED'                  // API call failed
  | 'MONITORING'                        // In post-execution monitoring window
  | 'IMPACT_ASSESSED'                   // Monitoring complete, impact evaluated
  | 'ROLLED_BACK';                      // Negative impact detected, changes reversed
```

---

## 2.2 Complete SOP Rule Reference Map

Every action the engine can generate maps to an exact rule in the PPC Framework. This table is the source of truth for `sop_rule_id` and `sop_rule_text`.

### Quadrant-Level Rules (Stage 3 -> Stage 5)

| Rule ID | Quadrant | Gate Status | Stage | Action(s) Generated | SOP Rule Text |
|---------|----------|-------------|-------|---------------------|---------------|
| S4.3-STRONG-SCALE | STRONG | CLEAR | GROWTH/MAINT | BID_INCREASE (5-15%), BUDGET_INCREASE (1.5-3x), MATCH_TYPE_EXPAND, TOS_MODIFIER_INCREASE | "Section 4.3: STRONG quadrant -> SCALE: Budget 1.5-3x, expand match types, protect TOS" |
| S4.3-STRONG-LAUNCH | STRONG | CLEAR | LAUNCH | BUDGET_INCREASE (2-3x), TOS_MODIFIER_INCREASE (+100-200%) | "Section 4.3: STRONG + LAUNCH -> Aggressive scale: Budget 2-3x, TOS +100-200%" |
| S4.3-STRONG-PROFGATE | STRONG | PROF_FAIL | Any | BID_DECREASE (5-10%) | "Section 4.3: STRONG + Profitability FAIL -> No scaling. Reduce bids for efficiency." |
| S4.3-STRONG-INVGATE | STRONG | INV_FAIL | Any | (no action) | "Section 4.3: STRONG + Inventory FAIL -> Maintain current bids. No spend increase." |
| S4.3-VIS-BOOST | VISIBILITY | CLEAR | Any | (see root cause rules below) | "Section 4.3: VISIBILITY quadrant -> BOOST: Fix CTR issue via root cause analysis" |
| S4.3-CONV-REDUCE | CONVERSION | CLEAR | Any | (see root cause rules below) | "Section 4.3: CONVERSION quadrant -> REDUCE: CVR failing. PPC does NOT fix listing/pricing." |
| S4.3-BOTH-PAUSE | BOTH_FAILING | Any | Any | CAMPAIGN_PAUSE or KEYWORD_PAUSE, FLAG_LISTING_CVR | "Section 4.3: BOTH_FAILING -> PAUSE: Stop spend, flag urgently, reallocate budget to STRONG" |

### Root Cause Rules (Stage 4 -> Stage 5)

| Rule ID | Quadrant | Root Cause | Action(s) Generated | SOP Rule Text |
|---------|----------|------------|---------------------|---------------|
| S4.4-R1-PLACEMENT | VISIBILITY or CONVERSION | PLACEMENT | TOS_MODIFIER_INCREASE (+50 to +200%), BID_DECREASE (base bid) | "Section 4.4 Root 1: Conversion & Placement -> CVR dropped WoW + PDP spend >40% -> increase TOS modifier, reduce PDP bids" |
| S4.4-R2-RELEVANCY | VISIBILITY or CONVERSION | RELEVANCY | SPEND_REDUCE (30-50%), FLAG to Brand Mgmt | "Section 4.4 Root 2: Relevancy -> Top clicked products not similar -> reduce investment, flag coverage gap" |
| S4.4-R3-INDEXING | VISIBILITY or CONVERSION | INDEXING | FLAG_LISTING_INDEXING, maintain spend | "Section 4.4 Root 3: Indexing -> Organic rank >20 despite spend -> add root keyword to listing title/bullets. Do NOT increase PPC spend until indexed." |
| S4.4-R4-UNDERINVEST | VISIBILITY | UNDER_INVESTMENT | BUDGET_INCREASE (30-50%), BID_INCREASE (15-25%), TOS_MODIFIER_INCREASE (+50%) | "Section 4.4 Root 4: Under-Investment -> CVR above target + IS% <15% + impression rank >4 -> increase budget, increase bid, increase TOS" |
| S4.4-CONV-DEFAULT | CONVERSION | UNCLEAR/NONE | SPEND_REDUCE (30-50%), FLAG_LISTING_CVR, FLAG_PRICING (if applicable) | "Section 4.4: CONVERSION + no clear PPC cause -> reduce spend 30-50%, flag listing team + pricing review" |

### Gate Override Rules

| Rule ID | Gate Status | Override Behavior | SOP Rule Text |
|---------|-------------|-------------------|---------------|
| S4.5-INV-CRIT | INVENTORY_FAIL (DOS <14) | Block ALL scale/boost. REDUCE-only mode. | "Section 4.5: Inventory Gate -> hero SKU <14 days -> DO NOT SCALE. Reduce spend immediately." |
| S4.5-INV-MAINT | INVENTORY_CAUTION (DOS 14-30) | Block scale. Maintenance bids only. | "Section 4.5: Inventory Gate -> hero SKU 14-30 days -> Maintenance mode. No new spend. Current bids only." |
| S4.5-PROF-FAIL | PROFITABILITY_FAIL | Block scale/boost. Efficiency actions only. | "Section 4.5: Profitability Gate -> ACOS > BE ACOS -> No scaling. Efficiency actions only (bid reductions, negations)." |
| S4.5-BOTH-FAIL | BOTH_FAIL | Emergency mode. Pause non-STRONG, reduce all. | "Section 4.5: Both gates FAIL -> Emergency mode. Pause all non-STRONG syntaxes. Reduce spend on STRONG to minimum viable." |

### Campaign Objective Rules

| Rule ID | Objective | Criteria | SOP Rule Text |
|---------|-----------|----------|---------------|
| CRIT-RANK-TOS | Ranking | TOS spend share | "Criteria Sheet: Ranking campaigns -> TOS% must be >30%. If below, increase TOS modifier." |
| CRIT-RANK-KW | Ranking | Keyword presence | "Criteria Sheet: Every product MUST have Ranking campaigns on top 3 root keywords." |
| CRIT-DISC-EXIST | Discovery | Campaign existence | "Criteria Sheet: All LAUNCH/GROWTH products must have Discovery campaigns." |
| CRIT-DEF-ASIN | Defensive | ASIN targeting | "Criteria Sheet: Defensive campaigns must target competitor ASINs on own product pages." |

### Keyword-Level Rules

| Rule ID | Condition | Action | SOP Rule Text |
|---------|-----------|--------|---------------|
| KW-NEGATE-ZERO | >25 clicks, 0 orders | KEYWORD_NEGATE | "Keyword Negation: If keyword has >25 clicks and 0 orders -> negate. WAS% threshold exceeded." |
| KW-NEGATE-HIGH | >50 clicks, ACOS >3x target | KEYWORD_NEGATE | "Keyword Negation: If keyword ACOS >3x target ACOS with >50 clicks -> negate." |
| KW-PAUSE-SPEND | >$30 spend, 0 orders, 14d | KEYWORD_PAUSE | "Keyword Pause: If keyword has >$30 spend over 14 days with 0 orders -> pause keyword." |

---

## 2.3 Auto-Approve vs Manual-Approve Rules

The auto-approve engine runs immediately after action generation (between Stage 5 output and email rendering). It evaluates each action against a rule table to determine if it can be auto-approved or must go to manual review.

### Auto-Approve Decision Table

| Action Type | Auto-Approve Condition | Manual-Approve Condition | Approval Tier if Manual |
|-------------|----------------------|--------------------------|------------------------|
| BID_DECREASE <15% | Always auto-approve | Never | N/A (auto) |
| BID_DECREASE 15-30% | Product stage = MAINTENANCE | Product stage = LAUNCH or GROWTH | OPERATOR |
| BID_DECREASE >30% | Never | Always | MANAGER |
| BID_INCREASE <10% | STRONG quadrant + both gates CLEAR | Any other condition | OPERATOR |
| BID_INCREASE 10-20% | STRONG + CLEAR + MAINTENANCE stage | Any other condition | OPERATOR |
| BID_INCREASE >20% | Never | Always | MANAGER |
| BUDGET_INCREASE <20% | STRONG + both gates CLEAR | Any other condition | OPERATOR |
| BUDGET_INCREASE 20-50% | STRONG + CLEAR + daily budget <$50 | Any other condition | MANAGER |
| BUDGET_INCREASE >50% | Never | Always | MANAGER |
| BUDGET_DECREASE any% | Always auto-approve | Never | N/A (auto) |
| TOS_MODIFIER_INCREASE to <=200% | VISIBILITY or STRONG quadrant | Any other condition | OPERATOR |
| TOS_MODIFIER_INCREASE >200% | Never | Always | MANAGER |
| TOS_MODIFIER_DECREASE any | Always auto-approve | Never | N/A (auto) |
| CAMPAIGN_PAUSE | BOTH_FAILING + data_points >= 100 clicks over 14d | Less data or non-BOTH_FAILING | MANAGER |
| KEYWORD_PAUSE | >25 clicks + 0 orders + 14d data | Less data | OPERATOR |
| KEYWORD_NEGATE | >25 clicks + 0 orders | Less data | OPERATOR |
| MATCH_TYPE_EXPAND | STRONG + CLEAR + MAINTENANCE | Any other condition | OPERATOR |
| SPEND_REDUCE <30% | CONVERSION or BOTH_FAILING quadrant | Otherwise | OPERATOR |
| SPEND_REDUCE >=30% | BOTH_FAILING + sufficient data | Otherwise | MANAGER |
| FLAG (any type) | Always auto-send | Never blocked | N/A (auto-dispatched) |

### Auto-Approve Engine Logic

```typescript
interface AutoApproveResult {
  action_id: string;
  approved: boolean;
  approval_tier: 'AUTO' | 'OPERATOR' | 'MANAGER';
  rule_applied: string;                 // Rule ID that matched
  reason: string;                       // Human-readable explanation
}

function evaluateAutoApprove(action: ActionWithRationale): AutoApproveResult {
  const rules = getAutoApproveRules(action.action_type);

  for (const rule of rules) {
    if (rule.matches(action)) {
      if (rule.auto_approve) {
        return {
          action_id: action.action_id,
          approved: true,
          approval_tier: 'AUTO',
          rule_applied: rule.rule_id,
          reason: rule.description
        };
      } else {
        return {
          action_id: action.action_id,
          approved: false,
          approval_tier: rule.manual_tier,
          rule_applied: rule.rule_id,
          reason: `Requires ${rule.manual_tier} approval: ${rule.description}`
        };
      }
    }
  }

  // Default: require MANAGER approval if no rule matched
  return {
    action_id: action.action_id,
    approved: false,
    approval_tier: 'MANAGER',
    rule_applied: 'DEFAULT',
    reason: 'No auto-approve rule matched. Defaulting to MANAGER approval.'
  };
}
```

### Auto-Approve Audit Trail

Every auto-approved action is logged with the rule that triggered it. Auto-approved actions appear in the Approval Queue with status `AUTO_APPROVED` and the rule reference, so the operator can review and override if needed.

```sql
-- Appended to action_approval_queue for auto-approved actions
INSERT INTO action_approval_queue (
  action_id, status, approval_tier,
  auto_approve_rule_id, auto_approve_reason,
  approved_at, approved_by
) VALUES (
  $1, 'AUTO_APPROVED', 'AUTO',
  $2, $3,
  NOW(), 'SYSTEM:auto-approve-engine'
);
```

---

## 2.4 Priority Scoring Algorithm

Priority is not arbitrary. It is calculated from a weighted formula:

```typescript
function calculatePriorityScore(action: ActionWithRationale): number {
  let score = 0;

  // Factor 1: Quadrant severity (0-30 points)
  const quadrantScores = {
    'BOTH_FAILING': 30,
    'CONVERSION': 20,
    'VISIBILITY': 15,
    'STRONG': 5                         // STRONG actions are scaling, lower urgency
  };
  score += quadrantScores[action.diagnostic_quadrant];

  // Factor 2: Gate status (0-25 points)
  if (action.product_gate_status === 'BOTH_FAIL') score += 25;
  else if (action.product_gate_status === 'INVENTORY_FAIL') score += 20;
  else if (action.product_gate_status === 'PROFITABILITY_FAIL') score += 15;
  else if (action.product_gate_status === 'INVENTORY_CAUTION') score += 5;

  // Factor 3: Revenue impact (0-20 points)
  const dailySpend = action.current_daily_spend || 0;
  if (dailySpend > 50) score += 20;
  else if (dailySpend > 20) score += 15;
  else if (dailySpend > 10) score += 10;
  else score += 5;

  // Factor 4: Days pending / carried forward (0-15 points)
  if (action.days_pending >= 3) score += 15;
  else if (action.days_pending >= 2) score += 10;
  else if (action.days_pending >= 1) score += 5;

  // Factor 5: Data confidence (0-10 points)
  if (action.confidence === 'HIGH') score += 10;
  else if (action.confidence === 'MEDIUM') score += 5;
  // LOW confidence = 0 bonus

  // Map score to priority label
  // 70-100 = URGENT, 50-69 = HIGH, 25-49 = MEDIUM, 0-24 = LOW
  return score;
}

function scoreToPriority(score: number): Priority {
  if (score >= 70) return 'URGENT';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}
```

---

## 2.5 Confidence Scoring

Confidence determines how much the operator should trust the recommendation. It is derived from data sufficiency:

```typescript
function calculateConfidence(action: ActionWithRationale): ConfidenceResult {
  const clicks = action.data_clicks_7d || 0;
  const days = action.data_days_available || 0;
  const trendWeeks = action.trend_weeks_stable || 0;

  // Minimum data thresholds
  if (clicks < 30 || days < 7) {
    return { level: 'LOW', basis: `Only ${clicks} clicks over ${days} days. Insufficient data.` };
  }

  if (clicks >= 100 && days >= 14 && trendWeeks >= 2) {
    return { level: 'HIGH', basis: `${clicks} clicks over ${days}d, trend stable ${trendWeeks} weeks.` };
  }

  return { level: 'MEDIUM', basis: `${clicks} clicks over ${days}d. Moderate data.` };
}
```

---
---

# PART 3 — APPROVAL WORKFLOW DESIGN

---

## 3.1 Approval Queue — Data Model

```sql
CREATE TABLE action_approval_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID NOT NULL,                    -- From ActionWithRationale
    plan_id BIGINT NOT NULL REFERENCES daily_action_plans(id),
    plan_date DATE NOT NULL,

    -- Action summary (denormalized for fast reads)
    product_id VARCHAR(20) NOT NULL,
    product_name VARCHAR(200) NOT NULL,
    syntax_name VARCHAR(200),
    action_type VARCHAR(50) NOT NULL,
    action_summary VARCHAR(500) NOT NULL,       -- Human-readable one-liner
    current_value VARCHAR(100),
    recommended_value VARCHAR(100),
    change_magnitude NUMERIC(10,2),

    -- Diagnostic context
    diagnostic_quadrant VARCHAR(20),
    root_cause VARCHAR(30),
    sop_rule_id VARCHAR(30),
    sop_rule_text TEXT,
    priority VARCHAR(10) NOT NULL,              -- URGENT, HIGH, MEDIUM, LOW
    priority_score INTEGER NOT NULL,            -- 0-100
    confidence VARCHAR(10) NOT NULL,            -- HIGH, MEDIUM, LOW

    -- Approval flow
    status VARCHAR(30) NOT NULL DEFAULT 'PROPOSED',
    approval_tier VARCHAR(20) NOT NULL,         -- AUTO, OPERATOR, MANAGER
    auto_approve_rule_id VARCHAR(50),
    auto_approve_reason TEXT,

    -- Human actions
    approved_by VARCHAR(100),
    approved_at TIMESTAMPTZ,
    rejected_by VARCHAR(100),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    modified_by VARCHAR(100),
    modified_at TIMESTAMPTZ,
    modification_details JSONB,                 -- What was changed from original

    -- Execution tracking
    queued_at TIMESTAMPTZ,
    execution_started_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    executed_by VARCHAR(100),                   -- 'SYSTEM:api-executor' or user
    execution_result JSONB,                     -- API response details
    execution_error TEXT,

    -- Monitoring
    monitoring_started_at TIMESTAMPTZ,
    monitoring_window_hours INTEGER DEFAULT 48,
    monitoring_ended_at TIMESTAMPTZ,
    impact_assessment JSONB,                    -- Post-execution metric changes
    rolled_back_at TIMESTAMPTZ,
    rollback_reason TEXT,

    -- Continuity
    is_carried_forward BOOLEAN DEFAULT FALSE,
    days_pending INTEGER DEFAULT 0,
    original_action_id UUID,                    -- If carried forward

    -- Metadata
    full_action_payload JSONB NOT NULL,         -- Complete ActionWithRationale JSON
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_approval_queue_status ON action_approval_queue(status);
CREATE INDEX idx_approval_queue_date ON action_approval_queue(plan_date);
CREATE INDEX idx_approval_queue_product ON action_approval_queue(product_id);
CREATE INDEX idx_approval_queue_priority ON action_approval_queue(priority_score DESC);
CREATE INDEX idx_approval_queue_pending ON action_approval_queue(status, priority_score DESC)
    WHERE status = 'PENDING_APPROVAL';
CREATE INDEX idx_approval_queue_tier ON action_approval_queue(approval_tier, status);

-- Approval audit log (immutable)
CREATE TABLE approval_audit_log (
    id BIGSERIAL PRIMARY KEY,
    queue_entry_id UUID NOT NULL REFERENCES action_approval_queue(id),
    action_taken VARCHAR(30) NOT NULL,          -- 'PROPOSED', 'AUTO_APPROVED', 'APPROVED', 'REJECTED', 'MODIFIED', 'EXECUTED', 'ROLLED_BACK'
    taken_by VARCHAR(100) NOT NULL,             -- User email or 'SYSTEM:auto-approve-engine'
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_status VARCHAR(30),
    new_status VARCHAR(30),
    details JSONB,                              -- Rule applied, modification diff, rejection reason, etc.
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE INDEX idx_audit_log_entry ON approval_audit_log(queue_entry_id);
CREATE INDEX idx_audit_log_user ON approval_audit_log(taken_by, taken_at);
```

---

## 3.2 Approval Queue — Web UI

### Route: `/approval-queue`

**Layout:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ APPROVAL QUEUE                                    Filter [v]  14 pending │
│                                                                          │
│ Filters: [All] [URGENT] [HIGH] [MEDIUM] [LOW] | [Today] [This Week]    │
│ Product: [All Products v]  | Tier: [All v]                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌── URGENT (3) ─────────────────────────────────────────────────────┐   │
│ │                                                                    │   │
│ │ [ ] Pause Bamboo|Full campaigns                  [Approve] [Reject]│   │
│ │     Product: Bamboo Sheets (B08KQKPKWC)                           │   │
│ │     Stage: GROWTH | Segment: CRITICAL                              │   │
│ │     Quadrant: BOTH_FAILING | Root: N/A                            │   │
│ │     SOP: S4.3 "BOTH_FAILING -> PAUSE"                             │   │
│ │     Current: Active ($18/day) -> Paused                            │   │
│ │     Confidence: HIGH (190 clicks, 14d)                             │   │
│ │     Expected: Save $126/week                                       │   │
│ │     Days Pending: 0 (new today)                                    │   │
│ │     [View Full Evidence] [Modify]                                  │   │
│ │                                                                    │   │
│ │ [ ] Pause Satin|Full campaigns                   [Approve] [Reject]│   │
│ │     Product: Satin Sheets 6 Pcs (B0CRF7S2TH)                     │   │
│ │     ... (same detail level)                                        │   │
│ │                                                                    │   │
│ │ [ ] Reduce spend 50% Cooling|Generic             [Approve] [Reject]│   │
│ │     Product: Cooling Sheets (B0FTSWF3M7)                          │   │
│ │     ... (same detail level)                                        │   │
│ │                                                                    │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│ ┌── HIGH (5) ───────────────────────────────────────────────────────┐   │
│ │                                                                    │   │
│ │ [ ] Reduce bids 30% on Bamboo|Twin               [Approve] [Reject]│  │
│ │     Product: Bamboo Sheets | Quadrant: CONVERSION                  │   │
│ │     Root: PLACEMENT (PDP 62%) | SOP: S4.4-R1                      │   │
│ │     Current: $1.80 -> $1.26 | Confidence: HIGH                    │   │
│ │     Days Pending: 1 (carried forward)                              │   │
│ │                                                                    │   │
│ │ [ ] Increase TOS 80%->130% Bamboo|King           [Approve] [Reject]│  │
│ │     ... (same detail level)                                        │   │
│ │                                                                    │   │
│ │ ... (3 more HIGH actions)                                          │   │
│ │                                                                    │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│ ┌── MEDIUM (4) ─────────────────────────────────────────────────────┐   │
│ │ ... (collapsed by default, expand on click)                        │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│ ┌── LOW (2) ────────────────────────────────────────────────────────┐   │
│ │ ... (collapsed by default)                                         │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│ ┌── AUTO-APPROVED TODAY (8) ────────────────────────────────────────┐   │
│ │ These actions were auto-approved by the engine. Review if needed.  │   │
│ │                                                                    │   │
│ │ [auto] Bid -12% on Satin|Cal King ................. Rule: <15% dec│   │
│ │ [auto] Bid -8% on Cooling|Twin .................... Rule: <15% dec│   │
│ │ [auto] Budget -20% on Silk|Generic ................ Rule: budget dec│  │
│ │ [auto] Negate "satin nightgown" (32 clicks, 0 ord). Rule: KW-NEG  │   │
│ │ ... (4 more auto-approved)                                         │   │
│ │                                                                    │   │
│ │ [Override Any] — Click to convert auto-approved to manual review   │   │
│ └────────────────────────────────────────────────────────────────────┘   │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ BATCH ACTIONS                                                            │
│ [Approve All URGENT (3)] [Approve All HIGH (5)] [Approve Selected]      │
│                                                                          │
│ HISTORY                                                                  │
│ [View Rejected] [View Executed Today] [View Rolled Back]                │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Structure

```
/src/app/approval-queue/
├── page.tsx                            // Main page with server-side data fetch
├── components/
│   ├── ApprovalQueueHeader.tsx         // Title, filter controls, pending count
│   ├── PriorityGroup.tsx              // Collapsible group (URGENT, HIGH, etc.)
│   ├── ActionApprovalCard.tsx         // Individual action with approve/reject
│   ├── AutoApprovedSection.tsx        // Auto-approved actions (collapsed by default)
│   ├── BatchActionBar.tsx             // Approve All URGENT, Approve Selected, etc.
│   ├── RejectionModal.tsx             // Modal for rejection reason (required field)
│   ├── ModificationPanel.tsx          // Edit action values before approving
│   └── ActionEvidenceDrawer.tsx       // Full evidence drawer (metrics, charts, history)
└── hooks/
    ├── useApprovalQueue.ts            // React Query hook for queue data
    ├── useApprovalAction.ts           // Mutation hooks for approve/reject/modify
    └── useBatchApproval.ts            // Batch approval mutation
```

---

## 3.3 Roles and Permissions

### Role Definitions

| Role | Can Propose | Can Approve (Auto-Tier) | Can Approve (Operator-Tier) | Can Approve (Manager-Tier) | Can Execute | Can Rollback | Scope |
|------|-----------|------------------------|---------------------------|--------------------------|-------------|-------------|-------|
| Operator (PPC Analyst) | Yes | View only (already auto) | Yes | No | After approval | With PPC Lead approval | Assigned products only |
| Senior Optimizer | Yes | View + override | Yes | Yes (except URGENT pause + budget >$100/day) | After approval | Yes | All products |
| PPC Lead / Manager | Yes | View + override | Yes | Yes (all actions) | Direct execute (skip queue) | Yes | All products + override capability |

### Permission Checks

```typescript
interface PermissionCheck {
  user_role: 'OPERATOR' | 'SENIOR_OPTIMIZER' | 'PPC_LEAD';
  action: ActionWithRationale;
  operation: 'APPROVE' | 'REJECT' | 'MODIFY' | 'EXECUTE' | 'ROLLBACK' | 'OVERRIDE_AUTO';
}

function canPerform(check: PermissionCheck): boolean {
  const { user_role, action, operation } = check;

  // PPC Lead can do everything
  if (user_role === 'PPC_LEAD') return true;

  // Operators
  if (user_role === 'OPERATOR') {
    if (operation === 'APPROVE' && action.approval_tier === 'MANAGER') return false;
    if (operation === 'ROLLBACK') return false;
    if (operation === 'OVERRIDE_AUTO') return false;
    // Operators can only act on assigned products
    if (!isAssignedProduct(user_role, action.product_id)) return false;
    return true;
  }

  // Senior Optimizer
  if (user_role === 'SENIOR_OPTIMIZER') {
    if (operation === 'APPROVE' && action.approval_tier === 'MANAGER') {
      // Exception: can approve MANAGER-tier EXCEPT urgent pauses and high-budget changes
      if (action.action_type === 'CAMPAIGN_PAUSE' && action.priority === 'URGENT') return false;
      if (action.action_type === 'BUDGET_INCREASE' && action.change_magnitude > 100) return false;
      return true;
    }
    return true;
  }

  return false;
}
```

### Role Assignment

Roles are stored in `system_settings` and linked to users:

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(200) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    role VARCHAR(30) NOT NULL,              -- 'OPERATOR', 'SENIOR_OPTIMIZER', 'PPC_LEAD'
    assigned_products JSONB DEFAULT '[]',   -- Array of product_ids (for OPERATOR scope)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email notification preferences
CREATE TABLE user_notification_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id),
    notification_type VARCHAR(50) NOT NULL,  -- 'daily_digest', 'critical_alert', 'approval_reminder', 'eod_summary'
    enabled BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, notification_type)
);
```

---

## 3.4 Action State Machine

### Complete State Transition Diagram

```
                    ┌─────────────┐
                    │   PROPOSED   │ ← Engine generates action
                    └──────┬──────┘
                           │
                    Auto-approve engine evaluates
                           │
              ┌────────────┼────────────┐
              │                         │
              ▼                         ▼
    ┌─────────────────┐      ┌──────────────────┐
    │  AUTO_APPROVED   │      │ PENDING_APPROVAL  │
    └────────┬────────┘      └────────┬─────────┘
             │                        │
             │              ┌─────────┼──────────┐
             │              │         │          │
             │              ▼         ▼          ▼
             │      ┌──────────┐ ┌────────┐ ┌──────────┐
             │      │ APPROVED  │ │REJECTED│ │ MODIFIED  │
             │      └────┬─────┘ └───┬────┘ └────┬─────┘
             │           │           │           │
             │           │           ▼           │
             │           │     (end, with        │
             │           │      reason logged)    │
             │           │                        │
             │           │         Re-enters      │
             │           │    ┌────────────────────┘
             │           │    │
             ▼           ▼    ▼
          ┌──────────────────────┐
          │       QUEUED          │ ← Enters execution queue
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │     EXECUTING         │ ← Amazon API call in progress
          └──────────┬───────────┘
                     │
              ┌──────┴──────┐
              │             │
              ▼             ▼
    ┌──────────────┐  ┌──────────────────┐
    │   EXECUTED    │  │ EXECUTION_FAILED  │
    └──────┬───────┘  └──────────────────┘
           │                    │
           ▼                    └── Retry up to 3x, then alert operator
    ┌──────────────┐
    │  MONITORING   │ ← 48-72h observation window
    └──────┬───────┘
           │
    ┌──────┴───────┐
    │              │
    ▼              ▼
┌────────────┐  ┌─────────────┐
│  IMPACT_    │  │ ROLLED_BACK  │ ← Negative impact detected
│  ASSESSED   │  └─────────────┘
└────────────┘
```

### State Transition Rules

```typescript
const STATE_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  'PROPOSED':           ['AUTO_APPROVED', 'PENDING_APPROVAL'],
  'PENDING_APPROVAL':   ['APPROVED', 'REJECTED', 'MODIFIED'],
  'AUTO_APPROVED':      ['QUEUED', 'PENDING_APPROVAL'],          // Can be overridden to manual
  'APPROVED':           ['QUEUED'],
  'REJECTED':           [],                                       // Terminal state
  'MODIFIED':           ['PENDING_APPROVAL'],                     // Re-enters approval
  'QUEUED':             ['EXECUTING'],
  'EXECUTING':          ['EXECUTED', 'EXECUTION_FAILED'],
  'EXECUTED':           ['MONITORING'],
  'EXECUTION_FAILED':   ['QUEUED', 'REJECTED'],                  // Retry or abandon
  'MONITORING':         ['IMPACT_ASSESSED', 'ROLLED_BACK'],
  'IMPACT_ASSESSED':    [],                                       // Terminal state
  'ROLLED_BACK':        [],                                       // Terminal state
};

function transitionStatus(
  entry: ApprovalQueueEntry,
  newStatus: ActionStatus,
  actor: string,
  details?: Record<string, any>
): void {
  const allowed = STATE_TRANSITIONS[entry.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Invalid transition: ${entry.status} -> ${newStatus}. Allowed: ${allowed.join(', ')}`
    );
  }

  // Update the queue entry
  entry.status = newStatus;
  entry.updated_at = new Date();

  // Write to immutable audit log
  insertAuditLog({
    queue_entry_id: entry.id,
    action_taken: newStatus,
    taken_by: actor,
    previous_status: entry.status,
    new_status: newStatus,
    details
  });
}
```

---

## 3.5 Approval via Email (One-Click)

### Token Generation

```typescript
import { SignJWT, jwtVerify } from 'jose';

const APPROVAL_SECRET = new TextEncoder().encode(process.env.APPROVAL_JWT_SECRET);

async function generateApprovalToken(
  userId: string,
  actionId: string,
  actionHash: string              // SHA-256 of action payload, prevents stale approvals
): Promise<string> {
  return new SignJWT({
    sub: userId,
    action_id: actionId,
    action_hash: actionHash,
    purpose: 'action_approval'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(APPROVAL_SECRET);
}

async function verifyApprovalToken(token: string): Promise<ApprovalTokenPayload> {
  const { payload } = await jwtVerify(token, APPROVAL_SECRET);

  // Verify action hasn't been modified since token was generated
  const currentAction = await getApprovalQueueEntry(payload.action_id);
  const currentHash = hashAction(currentAction);

  if (currentHash !== payload.action_hash) {
    throw new Error('Action was modified after this approval link was generated. Please review the updated action.');
  }

  if (currentAction.status !== 'PENDING_APPROVAL') {
    throw new Error(`Action is no longer pending approval. Current status: ${currentAction.status}`);
  }

  return payload as ApprovalTokenPayload;
}
```

### API Routes

```typescript
// POST /api/actions/:actionId/approve
async function approveAction(req: Request) {
  const { actionId } = req.params;
  const { token } = req.query;               // From email link

  // Verify token (from email) or session (from web app)
  let actor: string;
  if (token) {
    const payload = await verifyApprovalToken(token);
    actor = payload.sub;
  } else {
    const session = await getSession(req);
    actor = session.userId;
  }

  // Permission check
  const action = await getApprovalQueueEntry(actionId);
  const user = await getUser(actor);

  if (!canPerform({ user_role: user.role, action, operation: 'APPROVE' })) {
    return { error: 'Insufficient permissions', required_tier: action.approval_tier };
  }

  // Transition state
  transitionStatus(action, 'APPROVED', actor, { source: token ? 'email' : 'web_app' });

  // Queue for execution
  transitionStatus(action, 'QUEUED', 'SYSTEM:approval-handler');
  await addToExecutionQueue(action);

  // If from email, redirect to confirmation page
  if (token) {
    return redirect(`/approval-queue?approved=${actionId}`);
  }

  return { success: true, action_id: actionId, new_status: 'QUEUED' };
}

// POST /api/actions/:actionId/reject
async function rejectAction(req: Request) {
  const { actionId } = req.params;
  const { token } = req.query;
  const { reason } = req.body;                // Required field

  if (!reason || reason.trim().length < 10) {
    return { error: 'Rejection reason is required (minimum 10 characters)' };
  }

  let actor: string;
  if (token) {
    const payload = await verifyApprovalToken(token);
    actor = payload.sub;
  } else {
    const session = await getSession(req);
    actor = session.userId;
  }

  const action = await getApprovalQueueEntry(actionId);

  transitionStatus(action, 'REJECTED', actor, { reason, source: token ? 'email' : 'web_app' });

  return { success: true, action_id: actionId, new_status: 'REJECTED' };
}

// POST /api/actions/:actionId/modify
async function modifyAction(req: Request) {
  const { actionId } = req.params;
  const { modifications } = req.body;         // { recommended_value, priority, etc. }

  const session = await getSession(req);
  const action = await getApprovalQueueEntry(actionId);
  const user = await getUser(session.userId);

  if (!canPerform({ user_role: user.role, action, operation: 'MODIFY' })) {
    return { error: 'Insufficient permissions' };
  }

  // Store modification diff
  const diff = calculateDiff(action, modifications);

  // Apply modifications
  Object.assign(action, modifications);
  action.modification_details = diff;

  // Re-enter approval flow
  transitionStatus(action, 'MODIFIED', session.userId, { modifications: diff });
  transitionStatus(action, 'PENDING_APPROVAL', 'SYSTEM:modification-handler');

  // Re-run auto-approve check (modified action might qualify)
  const autoResult = evaluateAutoApprove(action);
  if (autoResult.approved) {
    transitionStatus(action, 'AUTO_APPROVED', 'SYSTEM:auto-approve-engine', {
      rule: autoResult.rule_applied
    });
  }

  return { success: true, action_id: actionId, new_status: action.status };
}

// POST /api/actions/batch-approve
async function batchApprove(req: Request) {
  const { action_ids, priority_filter } = req.body;

  // If priority_filter is provided (e.g., "URGENT"), approve all matching
  let targetIds = action_ids;
  if (priority_filter) {
    const pending = await getPendingApprovalsByPriority(priority_filter);
    targetIds = pending.map(a => a.id);
  }

  const session = await getSession(req);
  const user = await getUser(session.userId);

  const results = [];
  for (const id of targetIds) {
    const action = await getApprovalQueueEntry(id);
    if (canPerform({ user_role: user.role, action, operation: 'APPROVE' })) {
      transitionStatus(action, 'APPROVED', session.userId, { source: 'batch' });
      transitionStatus(action, 'QUEUED', 'SYSTEM:approval-handler');
      await addToExecutionQueue(action);
      results.push({ id, status: 'approved' });
    } else {
      results.push({ id, status: 'skipped', reason: 'insufficient_permissions' });
    }
  }

  return { success: true, results };
}
```

---

## 3.6 Deployment Gating — Execution Queue

### CRITICAL RULE: No action executes without approval.

The system NEVER pushes changes to Amazon Ads API based solely on engine output. The execution pipeline has three hard gates:

```
Gate 1: Approval Status
  Action MUST have status = 'APPROVED' or 'AUTO_APPROVED'
  Any other status → REJECT from execution queue

Gate 2: Staleness Check
  Action must have been approved within the last 24 hours
  If >24h since approval → Re-verify conditions still hold
  If conditions changed → Return to PENDING_APPROVAL with note

Gate 3: Gate Re-check
  Before execution, re-check inventory + profitability gates
  If gates changed since approval → HALT execution, notify operator
  Example: Action approved at 8AM, executed at 10AM, but inventory alert at 9AM
```

### Execution Queue Architecture

```typescript
// BullMQ queue for action execution
const executionQueue = new Queue('action-execution', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000                      // 1 min, 2 min, 4 min
    },
    removeOnComplete: false,            // Keep for audit
    removeOnFail: false
  }
});

// Worker processes one action at a time (serial execution to respect Amazon API rate limits)
const executionWorker = new Worker('action-execution', async (job) => {
  const { actionId } = job.data;
  const action = await getApprovalQueueEntry(actionId);

  // Gate 1: Verify approval status
  if (!['APPROVED', 'AUTO_APPROVED'].includes(action.status)) {
    throw new Error(`Action ${actionId} is not approved. Status: ${action.status}`);
  }

  // Gate 2: Staleness check
  const approvedAt = action.approved_at || action.auto_approved_at;
  const hoursSinceApproval = (Date.now() - new Date(approvedAt).getTime()) / 3600000;
  if (hoursSinceApproval > 24) {
    transitionStatus(action, 'PENDING_APPROVAL', 'SYSTEM:staleness-check', {
      reason: `Approval stale (${Math.round(hoursSinceApproval)}h). Re-approval required.`
    });
    return { status: 'stale', actionId };
  }

  // Gate 3: Re-check gates
  const currentGates = await evaluateGates(action.product_id);
  const originalGates = action.full_action_payload.gate_status;
  if (gatesChanged(originalGates, currentGates)) {
    transitionStatus(action, 'PENDING_APPROVAL', 'SYSTEM:gate-recheck', {
      reason: `Gates changed since approval. Was: ${JSON.stringify(originalGates)}, Now: ${JSON.stringify(currentGates)}`
    });
    // Notify operator
    await sendCriticalAlert({
      type: 'EXECUTION_HALTED',
      product: action.product_name,
      reason: 'Gates changed between approval and execution'
    });
    return { status: 'halted', actionId };
  }

  // All gates passed — EXECUTE
  transitionStatus(action, 'EXECUTING', 'SYSTEM:executor');

  try {
    const result = await executeOnAmazon(action);

    transitionStatus(action, 'EXECUTED', 'SYSTEM:executor', {
      api_response: result,
      executed_at: new Date().toISOString()
    });

    // Start monitoring window
    transitionStatus(action, 'MONITORING', 'SYSTEM:executor', {
      monitoring_window_hours: action.monitoring_window_hours,
      monitoring_ends_at: addHours(new Date(), action.monitoring_window_hours)
    });

    return { status: 'executed', actionId, result };

  } catch (error) {
    transitionStatus(action, 'EXECUTION_FAILED', 'SYSTEM:executor', {
      error: error.message,
      attempt: job.attemptsMade
    });
    throw error;                        // BullMQ will retry
  }
}, {
  connection: redisConnection,
  concurrency: 1,                       // Serial execution
  limiter: {
    max: 10,                            // Max 10 API calls per minute
    duration: 60000
  }
});
```

### Amazon API Execution Map

```typescript
async function executeOnAmazon(action: ApprovalQueueEntry): Promise<AmazonApiResult> {
  switch (action.action_type) {
    case 'BID_INCREASE':
    case 'BID_DECREASE':
      return await amazonAdsClient.updateKeywordBid({
        campaignId: action.target_campaign_id,
        keywordId: action.target_keyword_id,
        bid: action.recommended_value
      });

    case 'BUDGET_INCREASE':
    case 'BUDGET_DECREASE':
      return await amazonAdsClient.updateCampaignBudget({
        campaignId: action.target_campaign_id,
        budget: action.recommended_value
      });

    case 'TOS_MODIFIER_INCREASE':
    case 'TOS_MODIFIER_DECREASE':
      return await amazonAdsClient.updatePlacementBid({
        campaignId: action.target_campaign_id,
        placement: 'TOP_OF_SEARCH',
        percentage: action.recommended_value
      });

    case 'CAMPAIGN_PAUSE':
      return await amazonAdsClient.updateCampaignState({
        campaignId: action.target_campaign_id,
        state: 'PAUSED'
      });

    case 'KEYWORD_PAUSE':
      return await amazonAdsClient.updateKeywordState({
        campaignId: action.target_campaign_id,
        keywordId: action.target_keyword_id,
        state: 'PAUSED'
      });

    case 'KEYWORD_NEGATE':
      return await amazonAdsClient.createNegativeKeyword({
        campaignId: action.target_campaign_id,
        adGroupId: action.target_ad_group_id,
        keyword: action.target_entity,
        matchType: 'NEGATIVE_EXACT'
      });

    default:
      throw new Error(`Unsupported action type for API execution: ${action.action_type}`);
  }
}
```

---

## 3.7 Post-Execution Monitoring

After execution, every action enters a monitoring window (48-72 hours). The system tracks the impact of the change and can auto-rollback if negative impact is detected.

### Monitoring Job

```typescript
// Runs every 6 hours, checks all actions in MONITORING status
const MonitoringJob = {
  name: 'action-monitoring',
  queue: 'monitoring',
  schedule: '0 */6 * * *',             // Every 6 hours
  handler: async () => {
    const monitoringActions = await getActionsByStatus('MONITORING');

    for (const action of monitoringActions) {
      const hoursElapsed = hoursSince(action.executed_at);
      const windowHours = action.monitoring_window_hours;

      // Collect post-execution metrics
      const preMetrics = action.full_action_payload.evidence_metrics;
      const postMetrics = await getCurrentMetrics(action.product_id, action.syntax_group_id);

      const impact = assessImpact(preMetrics, postMetrics, action);

      if (hoursElapsed >= windowHours) {
        // Monitoring window complete
        transitionStatus(action, 'IMPACT_ASSESSED', 'SYSTEM:monitor', {
          impact_assessment: impact,
          monitoring_duration_hours: hoursElapsed
        });
      } else if (impact.requires_rollback) {
        // Negative impact detected mid-window
        await executeRollback(action, impact);
        transitionStatus(action, 'ROLLED_BACK', 'SYSTEM:monitor', {
          rollback_reason: impact.rollback_reason,
          impact_assessment: impact,
          hours_before_rollback: hoursElapsed
        });
        // Alert operator
        await sendCriticalAlert({
          type: 'AUTO_ROLLBACK',
          product: action.product_name,
          action: action.action_summary,
          reason: impact.rollback_reason
        });
      }
    }
  }
};
```

### Impact Assessment Rules

```typescript
interface ImpactAssessment {
  metrics_compared: { metric: string; pre: number; post: number; change_pct: number; }[];
  net_positive: boolean;
  requires_rollback: boolean;
  rollback_reason?: string;
  summary: string;
}

function assessImpact(
  preMetrics: EvidenceMetric[],
  postMetrics: CurrentMetric[],
  action: ApprovalQueueEntry
): ImpactAssessment {
  const comparisons = [];
  let rollbackTriggered = false;
  let rollbackReason = '';

  // Compare key metrics
  for (const pre of preMetrics) {
    const post = postMetrics.find(m => m.metric === pre.metric);
    if (!post) continue;

    const changePct = ((post.actual - pre.actual) / pre.actual) * 100;
    comparisons.push({ metric: pre.metric, pre: pre.actual, post: post.actual, change_pct: changePct });
  }

  // Rollback triggers (action-type specific)
  switch (action.action_type) {
    case 'BID_INCREASE':
    case 'BUDGET_INCREASE':
    case 'TOS_MODIFIER_INCREASE':
      // If ACOS increased by >5pp after a spend increase, rollback
      const acosComparison = comparisons.find(c => c.metric === 'ACOS');
      if (acosComparison && (acosComparison.post - acosComparison.pre) > 0.05) {
        rollbackTriggered = true;
        rollbackReason = `ACOS increased ${((acosComparison.post - acosComparison.pre) * 100).toFixed(1)}pp after spend increase. Reverting.`;
      }
      break;

    case 'BID_DECREASE':
    case 'SPEND_REDUCE':
      // If sales dropped >30% after a spend decrease, rollback
      const salesComparison = comparisons.find(c => c.metric === 'SALES');
      if (salesComparison && salesComparison.change_pct < -30) {
        rollbackTriggered = true;
        rollbackReason = `Sales dropped ${Math.abs(salesComparison.change_pct).toFixed(1)}% after spend reduction. Reverting.`;
      }
      break;
  }

  return {
    metrics_compared: comparisons,
    net_positive: !rollbackTriggered,
    requires_rollback: rollbackTriggered,
    rollback_reason: rollbackReason,
    summary: rollbackTriggered
      ? `Negative impact detected: ${rollbackReason}`
      : `Impact within expected range. ${comparisons.length} metrics tracked.`
  };
}
```

### Rollback Execution

```typescript
async function executeRollback(action: ApprovalQueueEntry, impact: ImpactAssessment): Promise<void> {
  // Rollback = apply the INVERSE of the original action
  const rollbackAction = {
    ...action,
    recommended_value: action.current_value,      // Revert to pre-change value
    current_value: action.recommended_value        // Current state is post-change
  };

  await executeOnAmazon(rollbackAction);

  // Log rollback
  insertAuditLog({
    queue_entry_id: action.id,
    action_taken: 'ROLLED_BACK',
    taken_by: 'SYSTEM:auto-rollback',
    details: {
      original_action: action.action_summary,
      rollback_reason: impact.rollback_reason,
      reverted_to: action.current_value,
      impact_data: impact.metrics_compared
    }
  });
}
```

---

## 3.8 End-to-End Flow Summary

```
06:00 AM  ETL Pipeline completes
            │
06:00 AM  Action Plan Engine runs (Stages 1-8)
            │
06:45 AM  Engine output: ActionWithRationale[] per product
            │
06:45 AM  Auto-Approve Engine evaluates each action
            │
            ├── Auto-approvable → status = AUTO_APPROVED → QUEUED
            │                      (logged, visible in queue)
            │
            └── Requires human → status = PENDING_APPROVAL
                                  (approval_tier assigned)
            │
06:50 AM  SOP Violation Detection runs
            │
06:55 AM  Email Renderer assembles daily digest
            │
07:05 AM  Daily Digest Email dispatched
            │
            ├── Operator reads email
            │
            ├── Reviews CRITICAL ALERTS first
            │
            ├── Reviews RECOMMENDED ACTIONS
            │
            └── Clicks [Approve] or [Reject] on each action
                  │
                  ├── [Approve] → status = APPROVED → QUEUED
                  │
                  ├── [Reject] → status = REJECTED (reason required)
                  │
                  └── [Modify] → opens web app → re-enters PENDING_APPROVAL
            │
Ongoing   Execution Queue processes QUEUED actions
            │
            ├── Gate 1: Verify approval status
            ├── Gate 2: Staleness check (<24h)
            ├── Gate 3: Re-check inventory + profitability gates
            │
            └── All gates pass → Execute via Amazon Ads API
                  │
                  ├── Success → EXECUTED → MONITORING (48-72h)
                  │
                  └── Failure → EXECUTION_FAILED (retry up to 3x)
            │
12:00 PM  Approval Reminder Email (if unapproved actions exist)
            │
Ongoing   Monitoring Job (every 6 hours)
            │
            ├── Metrics within range → Continue monitoring
            │
            ├── Window complete → IMPACT_ASSESSED
            │
            └── Negative impact → AUTO ROLLBACK → ROLLED_BACK
                  (operator alerted via critical alert email)
            │
06:00 PM  End-of-Day Summary Email
            │
            ├── X/Y actions executed
            ├── Z actions still pending
            └── Carried forward to tomorrow
```

---

## 3.9 Database Migration Summary

New tables introduced in this specification:

| Table | Purpose | Part |
|-------|---------|------|
| `action_approval_queue` | Central approval workflow table | Part 3 |
| `approval_audit_log` | Immutable audit trail for all state changes | Part 3 |
| `email_dispatch_log` | Track all email sends | Part 1 |
| `critical_alerts` | Persistent critical alert tracking | Part 1 |
| `sop_violations` | Persistent SOP violation tracking | Part 1 |
| `users` | User accounts with roles | Part 3 |
| `user_notification_preferences` | Email notification settings | Part 3 |

### Altered Tables

```sql
-- Add approval reference to existing action_execution_log
ALTER TABLE action_execution_log
    ADD COLUMN approval_queue_id UUID REFERENCES action_approval_queue(id),
    ADD COLUMN auto_approved BOOLEAN DEFAULT FALSE,
    ADD COLUMN approval_rule_id VARCHAR(50);
```

---

## 3.10 Configuration Constants

All tunable thresholds are stored in `system_settings` (not hardcoded):

```sql
INSERT INTO system_settings (key, value, description) VALUES
  -- Email timing
  ('email.daily_digest_time', '07:05', 'Daily digest send time (ET)'),
  ('email.approval_reminder_time', '12:00', 'Approval reminder send time (ET)'),
  ('email.eod_summary_time', '18:00', 'End-of-day summary send time (ET)'),
  ('email.critical_alert_delay_minutes', '5', 'Max delay for critical alert emails'),

  -- Auto-approve thresholds
  ('auto_approve.bid_decrease_auto_max_pct', '15', 'Max bid decrease % for auto-approve'),
  ('auto_approve.bid_increase_auto_max_pct', '10', 'Max bid increase % for auto-approve (STRONG+CLEAR)'),
  ('auto_approve.budget_increase_auto_max_pct', '20', 'Max budget increase % for auto-approve'),
  ('auto_approve.tos_modifier_manual_threshold', '200', 'TOS modifier above this requires manual'),
  ('auto_approve.keyword_negate_min_clicks', '25', 'Min clicks for auto-negate'),
  ('auto_approve.campaign_pause_min_clicks', '100', 'Min clicks for auto-pause (BOTH_FAILING)'),

  -- Monitoring
  ('monitoring.default_window_hours', '48', 'Default post-execution monitoring window'),
  ('monitoring.extended_window_hours', '72', 'Extended window for high-impact actions'),
  ('monitoring.acos_rollback_threshold_pp', '5', 'ACOS increase (pp) that triggers rollback'),
  ('monitoring.sales_rollback_threshold_pct', '30', 'Sales decrease (%) that triggers rollback'),
  ('monitoring.check_interval_hours', '6', 'How often monitoring job runs'),

  -- Execution
  ('execution.staleness_threshold_hours', '24', 'Max hours between approval and execution'),
  ('execution.max_retries', '3', 'Max API retry attempts'),
  ('execution.api_rate_limit_per_minute', '10', 'Max Amazon API calls per minute'),

  -- Priority scoring weights
  ('priority.quadrant_weight_both_failing', '30', 'Priority points for BOTH_FAILING'),
  ('priority.quadrant_weight_conversion', '20', 'Priority points for CONVERSION'),
  ('priority.quadrant_weight_visibility', '15', 'Priority points for VISIBILITY'),
  ('priority.quadrant_weight_strong', '5', 'Priority points for STRONG'),
  ('priority.gate_weight_both_fail', '25', 'Priority points for both gates failing'),
  ('priority.days_pending_3plus', '15', 'Priority points for 3+ days pending'),

  -- Escalation
  ('escalation.days_to_urgent', '3', 'Days pending before auto-escalate to URGENT'),
  ('escalation.days_to_chronic', '5', 'Days pending before flagged as chronic');
```

---

*End of specification. This document is implementation-ready and integrates with the existing Action Plan Engine (Parts 1-7). The email system reads from the engine output; the approval queue gates execution; the deployment pipeline enforces safety. No action reaches Amazon without passing through all three layers.*
