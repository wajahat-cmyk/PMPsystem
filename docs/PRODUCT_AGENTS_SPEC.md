# PMP SYSTEMS — PRODUCT AGENTS SPECIFICATION
## Parts 1-4: Navigation, Agents Module, Approval Enhancement, Activity Log Integration

### Companion Files
- `PMP_SYSTEMS_ARCHITECTURE.md` — Core system (7 modules, data model, tech stack)
- `ACTION_PLAN_ENGINE.md` — 8-stage Action Plan Engine (Gate -> Checklist)
- `GATE_LOGIC_AND_ACTION_MAPPING.md` — Gate logic + diagnostic-to-action mapping
- `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` — Daily Plan, Yesterday Comparison, Checklist
- `DATA_MODEL_AND_BUILD_PLAN.md` — Data model additions, approval workflow, execution tracking
- `EMAIL_APPROVAL_DEPLOYMENT_SPEC.md` — Daily email, approval links, deployment gating
- `SYSTEM_EXPANSION_V3.md` — Marketplace, Activity Log, Forecasting

---

# PART 1 — UPDATED NAVIGATION

---

## 1.1 Navigation Change Summary

A single addition: **Agents** is placed in the OPERATIONS section between Optimization and Inventory Management. The Agents module is an operational tool — it runs the diagnostic pipeline and proposes actions per product. It is not analytics (read-only) or intelligence (research). It operates on products and produces actionable outputs, which places it alongside Optimization and Inventory Management.

## 1.2 Complete Navigation Structure

```
COMMAND CENTER
  ⬡ Overview                         /overview
  ⚑ Action Plan                      /action-plan

ANALYTICS
  ▦ Reporting                         /reporting
  ◎ Tracking                          /tracking
       └─ Deal Tracking               /tracking/deals

INTELLIGENCE
  ⌘ Keyword Engine                    /keyword-engine
  ◈ Root Analysis                     /root-analysis
  ◉ Syntax Analysis                   /syntax-analysis
  ⊞ Variation Analysis                /variation-analysis
  🌐 Marketplace Tracking             /marketplace-tracking

OPERATIONS
  ▲ Optimization                      /optimization
  🤖 Agents                           /agents          ← NEW
       └─ Agent Detail                /agents/:productId
  ▣ Inventory Management              /inventory

SYSTEM
  ≡ Activity Log                      /activity-log
  ◷ Forecasting                       /forecasting
  ✦ Settings                          /settings
```

## 1.3 Sidebar Rendering

The Agents item renders with a live badge showing the count of agents currently in `WAITING_FOR_APPROVAL` state. This gives the operator passive awareness without opening the page.

```
🤖 Agents                    [3]
```

Badge rules:
- Badge shows count of agents with `status = 'WAITING_FOR_APPROVAL'` OR `status = 'NEEDS_CLARIFICATION'`
- Badge color: amber if any are waiting, red if any need clarification
- Badge hidden when count is 0

## 1.4 Navigation Data Source

```typescript
// sidebar nav item
{
  section: 'OPERATIONS',
  icon: '🤖',
  label: 'Agents',
  route: '/agents',
  badge: {
    query: `SELECT COUNT(*) FROM agent_runs
            WHERE status IN ('WAITING_FOR_APPROVAL', 'NEEDS_CLARIFICATION')
            AND is_latest = true`,
    color: 'amber', // upgrades to 'red' if any NEEDS_CLARIFICATION
    hideWhenZero: true,
  },
  submenu: null, // detail pages are drill-down, not submenu items
}
```

---

# PART 2 — AGENTS MODULE SPECIFICATION

---

## 2.0 Concept: Product Agents

Each of the 13 active products gets a dedicated Product Agent. An agent is NOT an autonomous executor. It is a structured pipeline runner that:

1. Runs the full Action Plan Engine pipeline (gates, stage, diagnostic, root cause, actions, segmentation) for its assigned product
2. Produces typed action proposals with evidence chains
3. Submits proposals to the approval queue
4. Asks clarification questions when it encounters ambiguity
5. Learns from approval/rejection patterns over time

**Agents do NOT execute.** All execution flows through the existing approval workflow with an elevated gating requirement (see Part 3).

---

## 2.1 Data Model — New Tables

### 2.1.1 product_agents

One row per product. The agent identity record.

```sql
CREATE TABLE product_agents (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Agent identity
    agent_name VARCHAR(200) NOT NULL,          -- "Bamboo Sheets Agent"
    agent_status VARCHAR(30) NOT NULL DEFAULT 'IDLE' CHECK (
        agent_status IN (
            'IDLE', 'RUNNING', 'ANALYZING', 'RECOMMENDING',
            'WAITING_FOR_APPROVAL', 'NEEDS_CLARIFICATION',
            'APPROVED', 'QUEUED_FOR_EXECUTION', 'EXECUTING',
            'COMPLETED', 'PAUSED', 'ERROR'
        )
    ),

    -- Scheduling
    schedule_cron VARCHAR(50) NOT NULL DEFAULT '0 6 * * *',  -- Daily at 6 AM ET
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,

    -- Confidence (learning loop)
    confidence_score INT NOT NULL DEFAULT 50 CHECK (
        confidence_score >= 0 AND confidence_score <= 100
    ),
    confidence_factors JSONB NOT NULL DEFAULT '[]',
    /*
      [
        { "factor": "approval_rate_30d", "value": 0.82, "weight": 0.4 },
        { "factor": "execution_success_rate", "value": 0.95, "weight": 0.3 },
        { "factor": "impact_accuracy", "value": 0.71, "weight": 0.2 },
        { "factor": "data_completeness", "value": 0.90, "weight": 0.1 }
      ]
    */

    -- Learning state
    learning_state JSONB NOT NULL DEFAULT '{}',
    /*
      {
        "approved_patterns": [...],
        "rejected_patterns": [...],
        "user_feedback": [...],
        "bias_corrections": [...]
      }
    */

    -- Admin
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    paused_by VARCHAR(100),
    paused_at TIMESTAMPTZ,
    pause_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(product_id)
);

CREATE INDEX idx_pa_status ON product_agents(agent_status);
CREATE INDEX idx_pa_next_run ON product_agents(next_run_at) WHERE is_enabled = true;
CREATE INDEX idx_pa_product ON product_agents(product_id);
```

### 2.1.2 agent_runs

One row per execution of an agent's pipeline. Tracks the full run lifecycle.

```sql
CREATE TABLE agent_runs (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Run identity
    run_number INT NOT NULL,                    -- Sequential per agent
    trigger_type VARCHAR(20) NOT NULL CHECK (
        trigger_type IN ('SCHEDULED', 'MANUAL', 'FORCED', 'EVENT')
    ),
    triggered_by VARCHAR(100),                  -- 'scheduler', operator name, 'gate_change_event'

    -- Lifecycle
    status VARCHAR(30) NOT NULL DEFAULT 'RUNNING' CHECK (
        status IN (
            'RUNNING', 'ANALYZING', 'RECOMMENDING',
            'WAITING_FOR_APPROVAL', 'NEEDS_CLARIFICATION',
            'COMPLETED', 'FAILED', 'CANCELLED'
        )
    ),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analysis_completed_at TIMESTAMPTZ,
    recommendations_ready_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    -- Results summary
    syntaxes_analyzed INT DEFAULT 0,
    quadrants_found JSONB,
    /*
      { "STRONG": 4, "VISIBILITY": 2, "CONVERSION": 3, "BOTH_FAILING": 1 }
    */
    actions_proposed INT DEFAULT 0,
    questions_raised INT DEFAULT 0,
    violations_detected INT DEFAULT 0,

    -- Gate snapshot at time of run
    gate_snapshot JSONB,
    /*
      { "profitability": "CLEAR", "inventory": "CAUTION", "dos": 42 }
    */

    -- Stage snapshot at time of run
    stage_snapshot VARCHAR(20),                  -- LAUNCH / GROWTH / MAINTENANCE
    segment_snapshot VARCHAR(20),                -- CRITICAL / OPTIMIZATION / SCALE

    -- Error tracking
    error_message TEXT,
    error_stack TEXT,

    -- Is this the latest run for this agent?
    is_latest BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ar_agent ON agent_runs(agent_id, run_number DESC);
CREATE INDEX idx_ar_status ON agent_runs(status) WHERE status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED');
CREATE INDEX idx_ar_latest ON agent_runs(agent_id) WHERE is_latest = true;
CREATE INDEX idx_ar_product ON agent_runs(product_id, started_at DESC);

-- Trigger: when a new run is inserted, set is_latest=false on previous runs for the same agent
CREATE OR REPLACE FUNCTION set_latest_agent_run()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE agent_runs SET is_latest = false
    WHERE agent_id = NEW.agent_id AND id != NEW.id AND is_latest = true;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_run_latest
AFTER INSERT ON agent_runs
FOR EACH ROW EXECUTE FUNCTION set_latest_agent_run();
```

### 2.1.3 agent_proposals

Agent-generated action proposals. Links to the existing `action_recommendations` and `action_approvals` tables but adds agent-specific metadata.

```sql
CREATE TABLE agent_proposals (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    run_id BIGINT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Link to existing approval system
    action_item_id BIGINT REFERENCES action_recommendations(id),
    approval_id BIGINT REFERENCES action_approvals(id),

    -- The action
    action_type VARCHAR(50) NOT NULL,
    /*
      BID_INCREASE, BID_DECREASE, BUDGET_INCREASE, BUDGET_DECREASE,
      TOS_INCREASE, TOS_DECREASE, PAUSE_CAMPAIGN, ENABLE_CAMPAIGN,
      NEGATE_KEYWORD, ADD_KEYWORD, MATCH_TYPE_CHANGE, PLACEMENT_ADJUST
    */
    target_entity_type VARCHAR(30) NOT NULL,    -- 'campaign', 'keyword', 'ad_group', 'syntax_group'
    target_entity_id VARCHAR(100),              -- Amazon entity ID or internal ID
    target_entity_name VARCHAR(500),            -- Human-readable name

    current_value VARCHAR(100) NOT NULL,
    recommended_value VARCHAR(100) NOT NULL,
    change_magnitude DECIMAL(10,2),             -- Percentage or absolute change

    -- 3-layer reasoning chain
    diagnostic_quadrant VARCHAR(20) NOT NULL CHECK (
        diagnostic_quadrant IN ('STRONG', 'VISIBILITY', 'CONVERSION', 'BOTH_FAILING')
    ),
    root_cause VARCHAR(30),                     -- PLACEMENT, RELEVANCY, INDEXING, UNDER_INVESTMENT, NULL
    sop_rule_reference TEXT NOT NULL,            -- Exact SOP section + rule text
    reasoning_narrative TEXT NOT NULL,           -- Human-readable explanation

    -- Evidence
    supporting_metrics JSONB NOT NULL,
    /*
      [
        { "metric": "CVR", "value": 4.2, "target": 6.8, "gap_pct": -38.2 },
        { "metric": "CTR", "value": 2.8, "target": 2.3, "gap_pct": 21.7 },
        { "metric": "IS%", "value": 8.0, "target": 15.0, "gap_pct": -46.7 }
      ]
    */

    -- Framework alignment
    product_stage VARCHAR(20) NOT NULL,
    gate_status JSONB NOT NULL,
    /*
      { "profitability": "CLEAR", "inventory": "CAUTION" }
    */
    campaign_objective VARCHAR(50),             -- RANKING, EFFICIENCY, DISCOVERY, DEFENSE

    -- Confidence
    confidence_score INT NOT NULL CHECK (
        confidence_score >= 0 AND confidence_score <= 100
    ),
    confidence_factors JSONB NOT NULL,
    /*
      [
        "7d data window with 340 clicks",
        "CVR stable across 3 consecutive weeks",
        "Similar action approved 4 times on this product",
        "SOP rule match is exact (not inferred)"
      ]
    */

    -- Expected outcome
    expected_outcome TEXT,
    monitoring_window_hours INT DEFAULT 72,
    reassess_date DATE,

    -- Approval routing (always at least OPERATOR for agent-generated)
    approval_tier VARCHAR(20) NOT NULL DEFAULT 'OPERATOR' CHECK (
        approval_tier IN ('OPERATOR', 'MANAGER')
        -- NOTE: AUTO is intentionally excluded. Agent proposals never auto-approve.
    ),

    -- Status
    status VARCHAR(30) NOT NULL DEFAULT 'PROPOSED' CHECK (
        status IN (
            'PROPOSED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
            'MODIFIED', 'EXECUTED', 'ROLLED_BACK', 'EXPIRED'
        )
    ),

    -- Feedback (post-decision)
    rejection_reason TEXT,
    modification_details JSONB,
    operator_feedback TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ap_agent ON agent_proposals(agent_id, created_at DESC);
CREATE INDEX idx_ap_run ON agent_proposals(run_id);
CREATE INDEX idx_ap_product ON agent_proposals(product_id, status);
CREATE INDEX idx_ap_status ON agent_proposals(status) WHERE status IN ('PROPOSED', 'PENDING_APPROVAL');
CREATE INDEX idx_ap_approval ON agent_proposals(approval_id) WHERE approval_id IS NOT NULL;
```

### 2.1.4 agent_questions

When an agent encounters ambiguity, it raises a clarification question rather than guessing.

```sql
CREATE TABLE agent_questions (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    run_id BIGINT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Question content
    question_text TEXT NOT NULL,
    question_context JSONB NOT NULL,
    /*
      {
        "syntax": "Bamboo|Twin",
        "quadrant": "CONVERSION",
        "ambiguity_type": "conflicting_signals",
        "detail": "CVR dropped 22% WoW but price was also changed. Cannot attribute root cause."
      }
    */

    -- Options (if structured question)
    question_type VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (
        question_type IN ('OPEN', 'MULTIPLE_CHOICE', 'YES_NO', 'THRESHOLD')
    ),
    options JSONB,
    /*
      ["Price change is the cause — skip PPC adjustment",
       "Ignore price change — proceed with PPC bid reduction",
       "Wait 7 more days for stabilization"]
    */

    -- Blocking status
    is_blocking BOOLEAN NOT NULL DEFAULT false,  -- If true, agent pauses until answered
    blocks_action_ids BIGINT[],                  -- Which proposals are blocked by this question

    -- Answer
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'ANSWERED', 'DISMISSED', 'EXPIRED')
    ),
    answered_by VARCHAR(100),
    answered_at TIMESTAMPTZ,
    answer_text TEXT,
    selected_option INT,                         -- Index into options array, if applicable

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aq_agent ON agent_questions(agent_id, status);
CREATE INDEX idx_aq_open ON agent_questions(status, created_at) WHERE status = 'OPEN';
CREATE INDEX idx_aq_product ON agent_questions(product_id);
```

### 2.1.5 agent_learning_events

Tracks every event that contributes to the agent's learning loop. Approval patterns, rejection patterns, user feedback, and outcome measurements.

```sql
CREATE TABLE agent_learning_events (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,

    -- What happened
    event_type VARCHAR(30) NOT NULL CHECK (
        event_type IN (
            'PROPOSAL_APPROVED', 'PROPOSAL_REJECTED', 'PROPOSAL_MODIFIED',
            'OUTCOME_POSITIVE', 'OUTCOME_NEGATIVE', 'OUTCOME_NEUTRAL',
            'USER_FEEDBACK', 'CONFIDENCE_RECALC', 'PATTERN_LEARNED'
        )
    ),

    -- Links
    proposal_id BIGINT REFERENCES agent_proposals(id),
    run_id BIGINT REFERENCES agent_runs(id),

    -- Pattern data
    pattern_key VARCHAR(200),
    /*
      Examples:
      "VISIBILITY:UNDER_INVESTMENT:TOS_INCREASE"
      "CONVERSION:PLACEMENT:BID_DECREASE"
      "BOTH_FAILING:PAUSE_CAMPAIGN"
    */
    pattern_detail JSONB NOT NULL,
    /*
      {
        "action_type": "TOS_INCREASE",
        "quadrant": "VISIBILITY",
        "root_cause": "UNDER_INVESTMENT",
        "outcome": "APPROVED",
        "operator_note": "Good call, but reduce magnitude next time",
        "impact_measured": { "is_pct_change": 7.2, "cvr_change": 0.3 }
      }
    */

    -- Impact on confidence
    confidence_delta INT,                       -- e.g., +3 or -5
    confidence_after INT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ale_agent ON agent_learning_events(agent_id, created_at DESC);
CREATE INDEX idx_ale_pattern ON agent_learning_events(pattern_key, agent_id);
CREATE INDEX idx_ale_type ON agent_learning_events(event_type, agent_id);
```

---

## 2.2 Page Layout — /agents

### 2.2.1 Summary Cards Row

Six summary cards across the top of the page, providing instant fleet status.

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ TOTAL AGENTS │ │   RUNNING    │ │   PAUSED     │ │  WAITING FOR │ │    NEEDS     │ │  COMPLETED   │
│              │ │              │ │              │ │   APPROVAL   │ │CLARIFICATION │ │   (TODAY)    │
│      13      │ │      4       │ │      1       │ │      3       │ │      1       │ │      4       │
│              │ │   🟢         │ │   🔴         │ │   🟡         │ │   🔵         │ │   ⚪         │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**Card queries:**

| Card | Query |
|------|-------|
| Total Agents | `SELECT COUNT(*) FROM product_agents WHERE is_enabled = true` |
| Running | `SELECT COUNT(*) FROM product_agents WHERE agent_status IN ('RUNNING', 'ANALYZING', 'RECOMMENDING')` |
| Paused | `SELECT COUNT(*) FROM product_agents WHERE agent_status = 'PAUSED'` |
| Waiting for Approval | `SELECT COUNT(*) FROM product_agents WHERE agent_status = 'WAITING_FOR_APPROVAL'` |
| Needs Clarification | `SELECT COUNT(*) FROM product_agents WHERE agent_status = 'NEEDS_CLARIFICATION'` |
| Completed (today) | `SELECT COUNT(*) FROM agent_runs WHERE status = 'COMPLETED' AND completed_at::date = CURRENT_DATE` |

Each card is clickable and filters the table below to the corresponding status.

### 2.2.2 Bulk Controls Bar

Positioned between summary cards and the agent table.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  [⏸ Pause All]  [▶ Resume All]  [🔄 Force Rerun All]  [✅ Approve All Pending] │
│                                                                                 │
│  Filters: [Status ▾] [Brand ▾] [Stage ▾] [Segment ▾]   Search: [___________]  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Bulk action rules:**

| Action | Confirmation Required | Notes |
|--------|-----------------------|-------|
| Pause All | Yes — "Pause all 12 running agents?" | Sets `agent_status = 'PAUSED'` on all non-PAUSED agents |
| Resume All | No | Sets `agent_status = 'IDLE'` on all PAUSED agents, triggers next scheduled run |
| Force Rerun All | Yes — "This will re-run all 13 agents. Current queued proposals will be preserved." | Inserts new `agent_runs` row with `trigger_type = 'FORCED'` |
| Approve All Pending | Yes — "Approve all X pending agent proposals? This cannot be undone." | Batch approves, requires OPERATOR role minimum |

### 2.2.3 Agent Status Table

The primary view. One row per product agent, 14 columns.

```
┌───┬─────────────────────┬──────────────┬──────────────────┬─────────┬──────────┬──────────────────────┬──────────────┬─────────┬───────────┬────────────┬──────────┬──────────┬────────┬─────────┐
│   │ Product Name        │ Parent ASIN  │ Brand            │ Stage   │ Segment  │ Agent Status         │ Last Run     │ Pending │ Open Qs   │ Violations │ Approved │ Executed │ Conf.  │ Actions │
│   │                     │              │                  │         │          │                      │              │ Actions │           │            │ Today    │ Today    │ Score  │         │
├───┼─────────────────────┼──────────────┼──────────────────┼─────────┼──────────┼──────────────────────┼──────────────┼─────────┼───────────┼────────────┼──────────┼──────────┼────────┼─────────┤
│🟢 │ Bamboo Sheets       │ B08KQKPKWC   │ DECOLURE         │ GROWTH  │ OPTIM    │ Running              │ 2h ago       │ 0       │ 0         │ 0          │ 3        │ 3        │ 78     │ ⋯       │
│🟡 │ Bamboo Sheets 6PCS  │ B0D952H31F   │ DECOLURE         │ GROWTH  │ CRITICAL │ Waiting for Approval │ Today 06:32  │ 4       │ 0         │ 1          │ 0        │ 0        │ 65     │ ⋯       │
│🟢 │ Satin Sheets        │ B0CRVZ1TTS   │ DECOLURE         │ MAINT   │ SCALE    │ Running              │ 1h ago       │ 0       │ 0         │ 0          │ 2        │ 2        │ 82     │ ⋯       │
│🔵 │ Satin Sheets 6 Pcs  │ B0CRF7S2TH   │ DECOLURE         │ MAINT   │ CRITICAL │ Needs Clarification  │ Today 06:45  │ 2       │ 1         │ 0          │ 1        │ 0        │ 58     │ ⋯       │
│⚪ │ Satin Fitted Sheet  │ B0DZ17NCJ4   │ DECOLURE         │ LAUNCH  │ OPTIM    │ Completed            │ Today 06:15  │ 0       │ 0         │ 0          │ 5        │ 4        │ 71     │ ⋯       │
│🟢 │ Silk Pillow Case    │ B0DQQQWYPT   │ DECOLURE         │ LAUNCH  │ OPTIM    │ Running              │ 3h ago       │ 1       │ 0         │ 1          │ 0        │ 0        │ 55     │ ⋯       │
│⚪ │ Cooling Sheets      │ B0FTSWF3M7   │ SLEEPHORIA       │ LAUNCH  │ SCALE    │ Completed            │ Today 06:22  │ 0       │ 0         │ 0          │ 3        │ 3        │ 68     │ ⋯       │
│🟡 │ Cooling Pillowcase  │ B0FTSVDG77   │ SLEEPHORIA       │ LAUNCH  │ OPTIM    │ Waiting for Approval │ Today 06:38  │ 3       │ 0         │ 0          │ 0        │ 0        │ 62     │ ⋯       │
│⚪ │ Cooling Comforter   │ B0FTG1NNKG   │ SLEEPHORIA       │ LAUNCH  │ OPTIM    │ Completed            │ Today 06:18  │ 0       │ 0         │ 0          │ 2        │ 2        │ 60     │ ⋯       │
│🟢 │ Satin 4PCs          │ B0F2G983W3   │ SLEEP SANCTUARY  │ LAUNCH  │ SCALE    │ Running              │ 2h ago       │ 0       │ 0         │ 0          │ 1        │ 1        │ 53     │ ⋯       │
│🔴 │ Bamboo 6PCS         │ B0F55Y1P53   │ SLEEP SANCTUARY  │ LAUNCH  │ OPTIM    │ Paused               │ Yesterday    │ 0       │ 0         │ 0          │ 0        │ 0        │ 45     │ ⋯       │
│⚪ │ Hanging Closet      │ B0FGZGFRL2   │ DECOLURE         │ LAUNCH  │ SCALE    │ Completed            │ Today 06:25  │ 0       │ 0         │ 0          │ 4        │ 4        │ 72     │ ⋯       │
│🟡 │ [Product 13]        │ [ASIN]       │ [Brand]          │ [Stage] │ [Seg]    │ Waiting for Approval │ Today 06:41  │ 2       │ 0         │ 0          │ 0        │ 0        │ 59     │ ⋯       │
└───┴─────────────────────┴──────────────┴──────────────────┴─────────┴──────────┴──────────────────────┴──────────────┴─────────┴───────────┴────────────┴──────────┴──────────┴────────┴─────────┘
```

**Column specifications:**

| # | Column | Source | Type | Sortable | Notes |
|---|--------|--------|------|----------|-------|
| 1 | Status Indicator | `product_agents.agent_status` | Icon | Yes | 🟢 Running/Analyzing/Recommending, 🟡 Waiting for Approval, 🔴 Paused, 🔵 Needs Clarification, ⚪ Completed/Idle |
| 2 | Product Name | `products.name` | Text | Yes | Links to `/agents/:productId` |
| 3 | Parent ASIN | `products.parent_asin` | Text | Yes | Monospace font, copyable |
| 4 | Brand | `brands.name` via `products.brand_id` | Text | Yes | Filterable |
| 5 | Stage | `product_stages.stage` (latest) | Badge | Yes | Color-coded: LAUNCH=blue, GROWTH=green, MAINTENANCE=gray |
| 6 | Segment | `daily_plan_products.segment` (today) | Badge | Yes | CRITICAL=red, OPTIMIZATION=yellow, SCALE=green |
| 7 | Agent Status | `product_agents.agent_status` | Text | Yes | Human-readable label |
| 8 | Last Run | `agent_runs.started_at` (latest) | Relative time | Yes | "2h ago", "Today 06:32 AM", "Yesterday" |
| 9 | Pending Actions | `agent_proposals` | Count | Yes | `WHERE agent_id = X AND status = 'PENDING_APPROVAL'` |
| 10 | Open Questions | `agent_questions` | Count | Yes | `WHERE agent_id = X AND status = 'OPEN'` |
| 11 | Violations | `criteria_violations` | Count | Yes | `WHERE product_id = X AND status = 'OPEN'` |
| 12 | Approved Today | `agent_proposals` | Count | Yes | `WHERE agent_id = X AND status = 'APPROVED' AND updated_at::date = today` |
| 13 | Executed Today | `agent_proposals` | Count | Yes | `WHERE agent_id = X AND status = 'EXECUTED' AND updated_at::date = today` |
| 14 | Confidence Score | `product_agents.confidence_score` | Number | Yes | 0-100, color gradient: red <40, yellow 40-70, green >70 |
| 15 | Actions | Row actions | Menu | No | See below |

**Row actions (column 15, overflow menu):**

| Action | Icon | Availability | Behavior |
|--------|------|-------------|----------|
| Resume / Pause | ▶️ / ⏸️ | Always | Toggle. Pause sets `agent_status = 'PAUSED'`, records `paused_by` and `pause_reason` (modal). Resume sets `agent_status = 'IDLE'`. |
| Force Rerun | 🔄 | When not RUNNING | Creates new `agent_runs` row with `trigger_type = 'FORCED'`. Confirmation required. |
| View Action Queue | 📋 | Always | Opens `/agents/:productId?tab=actions` |
| View Activity History | 📜 | Always | Opens `/agents/:productId?tab=history` |
| Change Stage | ⚙️ | Admin role only | Opens stage change modal. Records in `product_stage_history`. |
| Open Detail Page | 🔍 | Always | Navigates to `/agents/:productId` |

### 2.2.4 Table Sorting and Filtering

**Default sort:** Segment priority (CRITICAL first) then Pending Actions descending. This surfaces the most urgent items first.

**Filter options:**

| Filter | Options | Default |
|--------|---------|---------|
| Status | All, Running, Paused, Waiting for Approval, Needs Clarification, Completed | All |
| Brand | All, DECOLURE, SLEEPHORIA, SLEEP SANCTUARY | All |
| Stage | All, LAUNCH, GROWTH, MAINTENANCE | All |
| Segment | All, CRITICAL, OPTIMIZATION, SCALE | All |

**Search:** Filters by product name or ASIN (client-side, 13 rows is small enough).

---

## 2.3 Agent Detail Page — /agents/:productId

### 2.3.1 Header Section

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  🤖 BAMBOO SHEETS AGENT                                              [⏸ Pause] │
│                                                                                 │
│  Product: Bamboo Sheets                    ASIN: B08KQKPKWC                    │
│  Brand: DECOLURE                           Stage: GROWTH                        │
│  Segment: OPTIMIZATION                     Confidence: 78/100 ████████░░        │
│                                                                                 │
│  Gates:  Profitability ✅ CLEAR (BE ACOS: 24.8% | Current: 18.2%)              │
│          Inventory ⚠️ CAUTION (42 days)                                         │
│                                                                                 │
│  Agent Status: 🟢 Running                  Last Run: Today 06:32 AM            │
│  Next Scheduled Run: Tomorrow 06:00 AM     Run #: 47                            │
│                                                                                 │
│  [🔄 Force Rerun]  [📊 View in Action Plan]  [📧 View in Daily Email]          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3.2 Tab Structure

Six tabs below the header. Each tab is a self-contained view.

```
[ Action Queue ]  [ Questions ]  [ Diagnostic ]  [ History ]  [ Learning ]  [ Performance ]
```

---

#### Tab 1: Action Queue

Shows all proposals from this agent, grouped by status.

**Sections (in order):**
1. **Pending Approval** — Actions awaiting operator/manager decision
2. **Approved (not yet executed)** — Approved but execution pending
3. **Recently Executed** — Last 7 days of executed actions with outcome
4. **Rejected** — Last 30 days of rejected actions with rejection reasons

**Per-proposal card:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ACTION: Increase TOS modifier on "Bamboo|King" campaigns                   │
│  Current: 80% → Recommended: 130%                     Confidence: 85/100   │
├─────────────────────────────────────────────────────────────────────────────┤
│  DIAGNOSTIC: VISIBILITY quadrant                                            │
│  ROOT CAUSE: Under-Investment — IS% only 8%, impression rank >4            │
│  SOP RULE: Section 4.4 Root 4: Under-Investment — CVR above target +       │
│            IS% < 15% + impression rank > 4 → increase TOS                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  EVIDENCE                                                                   │
│  ┌──────────┬──────────┬──────────┬──────────┐                             │
│  │ Metric   │ Actual   │ Target   │ Gap      │                             │
│  ├──────────┼──────────┼──────────┼──────────┤                             │
│  │ CVR      │ 8.2%     │ 6.8%     │ +20.6%   │                             │
│  │ CTR      │ 1.4%     │ 2.3%     │ -39.1%   │                             │
│  │ IS%      │ 8.0%     │ 15.0%    │ -46.7%   │                             │
│  └──────────┴──────────┴──────────┴──────────┘                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  EXPECTED OUTCOME: IS% increase to ~15%, estimated +12% sales              │
│  MONITORING WINDOW: 72 hours — reassess Mar 22                             │
│  APPROVAL TIER: OPERATOR                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  [✅ Approve]  [❌ Reject]  [✏️ Modify]  [❓ Request Clarification]         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 2: Questions

Open clarification requests from this agent.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  QUESTION #1                                     🔴 BLOCKING — 2 actions   │
├─────────────────────────────────────────────────────────────────────────────┤
│  "Bamboo|Twin CVR dropped 22% WoW, but a price change from $75.99 to      │
│   $69.99 was also made this week. Should I attribute the CVR drop to       │
│   the price change (skip PPC adjustment) or proceed with bid reduction?"   │
│                                                                             │
│  Context: Syntax=Bamboo|Twin, Quadrant=CONVERSION, 7d clicks=280           │
│                                                                             │
│  ○ Price change is the cause — skip PPC adjustment                         │
│  ○ Ignore price change — proceed with PPC bid reduction                    │
│  ○ Wait 7 more days for data stabilization                                 │
│  ○ Other: [free text input]                                                │
│                                                                             │
│  [Submit Answer]                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 3: Diagnostic

Current 4-quadrant diagnostic results for every syntax under this product.

Displays the same quadrant visualization used in the Action Plan product cards, but with full detail per syntax:
- Quadrant assignment with evidence
- Root cause per non-STRONG syntax
- Trend arrows (WoW direction)
- Link to proposed action (if one exists)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  4-QUADRANT DIAGNOSTIC — Bamboo Sheets (Run #47, Today 06:32 AM)           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│          HIGH CTR                                                           │
│            │                                                                │
│   STRONG   │   VISIBILITY                                                   │
│  Bamboo|Q  │  Bamboo|King ▼                                                │
│  Bamboo|CK │                                                                │
│  ──────────┼──────────────                                                  │
│  CONVERSION│  BOTH FAILING                                                  │
│  Bamboo|Tw │  Bamboo|Full                                                   │
│  Bamboo|Gen│                                                                │
│            │                                                                │
│          LOW CTR                                                            │
│                                                                             │
│  LOW CVR ← ──────────────── → HIGH CVR                                     │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  SYNTAX DETAIL TABLE                                                        │
│  ┌──────────────┬───────────┬──────────────────┬───────┬───────┬──────────┐│
│  │ Syntax       │ Quadrant  │ Root Cause       │ CTR   │ CVR   │ Action   ││
│  ├──────────────┼───────────┼──────────────────┼───────┼───────┼──────────┤│
│  │ Bamboo|Queen │ STRONG    │ —                │ 2.8%  │ 8.2%  │ +Budget  ││
│  │ Bamboo|King  │ VISIBILITY│ Under-Investment │ 1.4%  │ 7.9%  │ TOS+50% ││
│  │ Bamboo|Cal K │ STRONG    │ —                │ 2.5%  │ 7.4%  │ +Budget  ││
│  │ Bamboo|Twin  │ CONVERSION│ Placement        │ 2.8%  │ 4.2%  │ -30% bid ││
│  │ Bamboo|Genrc │ CONVERSION│ Relevancy        │ 2.1%  │ 3.9%  │ Flag     ││
│  │ Bamboo|Full  │ BOTH FAIL │ —                │ 0.8%  │ 2.1%  │ Pause    ││
│  └──────────────┴───────────┴──────────────────┴───────┴───────┴──────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 4: History

Timeline view of all agent events for this product. Sources from `activity_log` filtered by `actor_type = 'AGENT'` and `product_id = :productId`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AGENT HISTORY — Bamboo Sheets                        [Date Range ▾]       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TODAY                                                                      │
│  ├─ 06:32 AM  🟢 Agent run #47 started (scheduled)                        │
│  ├─ 06:34 AM  📊 Analysis completed: 6 syntaxes, 2 STRONG, 1 VIS, 2 CONV │
│  ├─ 06:35 AM  📋 Proposed: Increase TOS 80%→130% on Bamboo|King           │
│  ├─ 06:35 AM  📋 Proposed: Reduce bids 30% on Bamboo|Twin                 │
│  ├─ 06:35 AM  📋 Proposed: Pause all Bamboo|Full campaigns                │
│  ├─ 06:35 AM  🚩 Flag raised: Bamboo|Twin CVR — listing review            │
│  ├─ 06:36 AM  🟡 Status → Waiting for Approval (3 proposals pending)      │
│  ├─ 08:15 AM  ✅ Approved: Increase TOS on Bamboo|King (by: Wajahat)      │
│  ├─ 08:15 AM  ✅ Approved: Reduce bids on Bamboo|Twin (by: Wajahat)       │
│  ├─ 08:16 AM  ✅ Approved: Pause Bamboo|Full (by: Wajahat)                │
│  ├─ 08:20 AM  ⚡ Executed: TOS change Bamboo|King — API success           │
│  ├─ 08:20 AM  ⚡ Executed: Bid reduction Bamboo|Twin — API success        │
│  ├─ 08:21 AM  ⚡ Executed: Pause Bamboo|Full — API success                │
│  └─ 08:21 AM  ⚪ Run #47 completed (3/3 executed, 0 rejected)             │
│                                                                             │
│  YESTERDAY                                                                  │
│  ├─ 06:30 AM  🟢 Agent run #46 started (scheduled)                        │
│  ├─ ...                                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 5: Learning

What the agent has learned from approval/rejection patterns and outcome measurements.

**Sections:**

1. **Approved Patterns** — Action types and conditions that are consistently approved
2. **Rejected Patterns** — Action types and conditions that are consistently rejected, with aggregated rejection reasons
3. **User Feedback** — Operator notes and modification patterns
4. **Confidence Trend** — Chart showing confidence score over time with events annotated

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  APPROVED PATTERNS (last 30 days)                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. VISIBILITY + Under-Investment → TOS Increase                           │
│     Approved: 8/8 (100%) | Avg confidence at proposal: 82                  │
│     Avg impact: IS% +6.2pp after 72h                                       │
│                                                                             │
│  2. BOTH_FAILING → Pause Campaign                                          │
│     Approved: 5/5 (100%) | Avg confidence at proposal: 88                  │
│     Avg savings: $34/week per paused syntax                                │
│                                                                             │
│  3. CONVERSION + Placement → Bid Decrease (15-30%)                         │
│     Approved: 6/7 (86%) | 1 modified to 15% from proposed 30%             │
│     Avg impact: CVR +1.1pp after 72h                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  REJECTED PATTERNS (last 30 days)                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. CONVERSION + Relevancy → Negate Keyword (broad terms)                  │
│     Rejected: 3/5 (60%) | Common reason: "Too aggressive, these           │
│     broad terms still drive discovery"                                      │
│     Learning: Agent now proposes bid reduction instead of negation          │
│     for broad terms with <$20 spend                                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  CONFIDENCE TREND                                                           │
│  100 ┤                                                                      │
│   80 ┤          ╭──╮    ╭────────╮        ╭──────                          │
│   60 ┤    ╭─────╯  ╰────╯        ╰──╮╭───╯                                │
│   40 ┤╭───╯                          ╰╯ ← rejection spike (Mar 8)         │
│   20 ┤│                                                                     │
│    0 ┤└──────────────────────────────────────────                           │
│       Feb 17     Feb 24     Mar 3      Mar 10     Mar 17                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

#### Tab 6: Performance

Agent effectiveness metrics. How good is this agent at its job?

**Metrics:**

| Metric | Calculation | Target |
|--------|-------------|--------|
| Proposal Acceptance Rate | `approved / (approved + rejected)` over 30 days | >80% |
| Modification Rate | `modified / total_decided` over 30 days | <15% |
| Execution Success Rate | `executed / approved` over 30 days | >95% |
| Average Confidence at Proposal | `AVG(confidence_score)` across proposals, 30 days | >70 |
| Impact Accuracy | % of executed actions where measured outcome matched expected direction | >70% |
| Time to Approval | `AVG(approved_at - proposed_at)` in hours | <4h |
| Questions per Run | `AVG(questions_raised)` per run, 30 days | <2 |
| False Positive Rate | Actions proposed then rejected due to incorrect diagnosis | <10% |

**Displayed as:**
- Metric cards with trend arrows (WoW)
- 30-day rolling chart per metric
- Comparison against fleet average (all 13 agents)

---

## 2.4 Agent State Machine

```
                                    ┌──────────────────────┐
                                    │                      │
                                    ▼                      │
┌──────┐    ┌─────────┐    ┌───────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ IDLE │───▶│ RUNNING │───▶│ ANALYZING │───▶│  RECOMMENDING    │───▶│ WAITING_FOR_APPROVAL │
└──────┘    └─────────┘    └───────────┘    └──────────────────┘    └──────────────────────┘
  ▲                              │                                          │         │
  │                              │                                          │         │
  │                              ▼                                          ▼         │
  │                     ┌─────────────────────┐                    ┌───────────┐      │
  │                     │ NEEDS_CLARIFICATION │◀───────────────────│ APPROVED  │      │
  │                     └─────────────────────┘                    └───────────┘      │
  │                              │                                      │             │
  │                              │ (user answers)                       ▼             │
  │                              │                          ┌────────────────────┐    │
  │                              └──────────────────────────│QUEUED_FOR_EXECUTION│    │
  │                                                         └────────────────────┘    │
  │                                                                  │                │
  │                                                                  ▼                │
  │                                                          ┌────────────┐           │
  │                                                          │ EXECUTING  │           │
  │                                                          └────────────┘           │
  │                                                                  │                │
  │                                                                  ▼                │
  │                                                          ┌────────────┐           │
  └──────────────────────────────────────────────────────────│ COMPLETED  │◀──────────┘
                                                             └────────────┘  (rejected)

  ┌────────┐
  │ PAUSED │◀──── (manual pause from ANY state)
  └────────┘──── (resume returns to state before pause)
```

**Transition rules:**

| From | To | Trigger | Side Effects |
|------|----|---------|-------------|
| IDLE | RUNNING | Scheduled cron fires, manual trigger, or forced rerun | Creates `agent_runs` row. Logs `agent_run_started` in activity log. |
| RUNNING | ANALYZING | Pipeline begins gate evaluation and diagnostic | Updates `agent_runs.status`. |
| ANALYZING | RECOMMENDING | Diagnostic complete, action generation begins | Records `agent_analysis_completed` in activity log. Stores quadrant results. |
| ANALYZING | NEEDS_CLARIFICATION | Ambiguity detected that blocks analysis | Creates `agent_questions` row. Logs `agent_question_raised`. |
| NEEDS_CLARIFICATION | ANALYZING | User answers the blocking question | Logs `agent_question_answered`. Resumes pipeline. |
| RECOMMENDING | WAITING_FOR_APPROVAL | Proposals created and submitted | Creates `agent_proposals` rows. Populates approval queue. Logs each `agent_action_proposed`. |
| RECOMMENDING | COMPLETED | No actions needed (all syntaxes STRONG, no violations) | Logs `agent_run_completed` with zero proposals. |
| WAITING_FOR_APPROVAL | APPROVED | All proposals for this run are decided | Transition happens when last pending proposal is approved/rejected. |
| APPROVED | QUEUED_FOR_EXECUTION | Approved proposals queued for API execution | Creates `action_executions` rows via existing system. |
| QUEUED_FOR_EXECUTION | EXECUTING | BullMQ job picks up the execution | API calls begin. |
| EXECUTING | COMPLETED | All executions finished (success or failure) | Logs each `agent_action_executed`. Updates confidence. |
| WAITING_FOR_APPROVAL | COMPLETED | All proposals rejected | Logs rejections. Records in learning events. |
| Any | PAUSED | Manual pause by operator | Records `paused_by`, `paused_at`, `pause_reason`. Logs `agent_paused`. Preserves pre-pause state for resume. |
| PAUSED | (previous state) | Manual resume | Clears pause fields. Logs `agent_resumed`. |

**Error handling:**

| Error Scenario | Behavior |
|----------------|----------|
| Pipeline crashes mid-analysis | Status set to `ERROR`. Error logged. Agent retries on next scheduled run. |
| API execution fails | Individual execution marked `FAILED`. Agent completes with partial success. Alert raised. |
| Question unanswered for >24h | Reminder notification sent. After 72h, question auto-dismissed with note. Agent completes without blocked proposals. |
| All proposals expired (>7 days pending) | Proposals set to `EXPIRED`. Agent marks run as `COMPLETED` with expiration note. |

---

# PART 3 — APPROVAL WORKFLOW (Agent-Specific Enhancement)

---

## 3.0 Principle: Trust Through Verification

The existing approval system (3-tier: AUTO/OPERATOR/MANAGER) remains unchanged for human-generated actions from the Action Plan Engine. For agent-generated proposals, the approval system is enhanced with a higher trust threshold and a learning-based relaxation path.

**HARD RULE: Agent proposals NEVER auto-execute.** No agent proposal routes through the AUTO tier. The minimum tier for any agent-generated action is OPERATOR. This is non-negotiable in Phase 1.

---

## 3.1 Agent Action Proposal Format

When an agent proposes an action, the `agent_proposals` table stores the full context. The proposal is also linked into the existing `action_recommendations` and `action_approvals` tables for unified tracking.

```typescript
interface AgentProposal {
  // Identity
  id: string;                          // UUID
  agent_id: string;                    // FK to product_agents.id
  run_id: string;                      // FK to agent_runs.id
  product_id: number;                  // FK to products.id

  // The action
  action_type: ActionType;             // BID_INCREASE, TOS_INCREASE, PAUSE_CAMPAIGN, etc.
  target_entity_type: 'campaign' | 'keyword' | 'ad_group' | 'syntax_group';
  target_entity_id: string;            // Amazon entity ID or internal ID
  target_entity_name: string;          // Human-readable
  current_value: string;               // "80%" or "$1.80"
  recommended_value: string;           // "130%" or "$1.26"
  change_magnitude: number;            // Percentage change for threshold checks

  // 3-layer reasoning chain (matches existing Action Plan Engine output)
  diagnostic_quadrant: 'STRONG' | 'VISIBILITY' | 'CONVERSION' | 'BOTH_FAILING';
  root_cause: 'PLACEMENT' | 'RELEVANCY' | 'INDEXING' | 'UNDER_INVESTMENT' | null;
  sop_rule_reference: string;          // Exact SOP section + rule text
  reasoning_narrative: string;         // Human-readable explanation of why

  // Evidence (hard numbers backing the recommendation)
  supporting_metrics: {
    metric: string;                    // "CVR", "CTR", "IS%", "ACOS", "WAS%"
    value: number;                     // Actual measured value
    target: number;                    // Target/benchmark value
    gap_pct: number;                   // Percentage gap from target
  }[];

  // Framework alignment (proves the action fits the product's current context)
  product_stage: 'LAUNCH' | 'GROWTH' | 'MAINTENANCE';
  gate_status: {
    profitability: 'CLEAR' | 'FAIL';
    inventory: 'CLEAR' | 'CAUTION' | 'FAIL';
  };
  campaign_objective: 'RANKING' | 'EFFICIENCY' | 'DISCOVERY' | 'DEFENSE';

  // Agent confidence (quantified certainty)
  confidence_score: number;            // 0-100
  confidence_factors: string[];        // Human-readable list of what contributed
  /*
    [
      "7d data window with 340 clicks (sufficient sample)",
      "CVR stable across 3 consecutive weeks (no volatility)",
      "Identical action approved 4 times on this product (learned pattern)",
      "SOP rule match is exact — not inferred (high rule confidence)"
    ]
  */

  // Expected outcome
  expected_outcome: string;            // "IS% increase to ~15%, estimated +12% sales"
  monitoring_window_hours: number;     // 48 or 72
  reassess_date: string;               // ISO date

  // Approval routing
  approval_tier: 'OPERATOR' | 'MANAGER';  // Never AUTO for agent proposals
  requires_approval: true;                 // ALWAYS true. Hardcoded. Not configurable.

  // Status lifecycle
  status: 'PROPOSED'
        | 'PENDING_APPROVAL'
        | 'APPROVED'
        | 'REJECTED'
        | 'MODIFIED'
        | 'EXECUTED'
        | 'ROLLED_BACK'
        | 'EXPIRED';
}
```

### 3.1.1 Approval Tier Routing for Agent Proposals

Agent proposals use elevated tier routing compared to human-generated actions:

| Human-Generated Tier | Agent-Generated Tier | Reason |
|----------------------|---------------------|--------|
| AUTO | OPERATOR | Agents cannot auto-execute. Minimum human review required. |
| OPERATOR | OPERATOR | Same tier. Operator reviews as normal. |
| MANAGER | MANAGER | Same tier. High-risk actions still require manager sign-off. |

**Additional MANAGER escalation rules for agents:**

| Condition | Tier |
|-----------|------|
| Agent confidence score < 50 | MANAGER |
| Action changes spend by > $100/day | MANAGER |
| Action affects > 5 campaigns simultaneously | MANAGER |
| Agent has < 70% approval rate (30d rolling) | MANAGER |
| Product is in CRITICAL segment | MANAGER |

---

## 3.2 Approval Queue Enhancement

### 3.2.1 New Tab on /approval-queue

The existing `/approval-queue` page gains an "Agent Proposals" tab alongside the existing "Action Plan" tab.

```
[ Action Plan Proposals (11) ]  [ Agent Proposals (9) ]  [ All (20) ]
```

### 3.2.2 Agent Proposals Tab Layout

Proposals are grouped by product, then sorted within each product group by:
1. Priority (URGENT > HIGH > MEDIUM > LOW)
2. Confidence score descending (highest confidence first — these are the most certain recommendations)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AGENT PROPOSALS — 9 pending                                                │
│                                                                             │
│  ┌─ BAMBOO SHEETS 6PCS (CRITICAL) ────────────────── 4 proposals ─────────┐│
│  │                                                                         ││
│  │  1. Pause all Bamboo6P|Full campaigns            Confidence: 92        ││
│  │     BOTH_FAILING | No single PPC fix             Tier: OPERATOR        ││
│  │     SOP: Section 4.3 — BOTH_FAILING → PAUSE      Savings: $18/day     ││
│  │     [✅ Approve] [❌ Reject] [✏️ Modify] [❓ Clarify]                   ││
│  │                                                                         ││
│  │  2. Reduce bids 25% on Bamboo6P|Twin             Confidence: 78        ││
│  │     CONVERSION + Placement | PDP spend 58%       Tier: OPERATOR        ││
│  │     SOP: Section 4.4 Root 1 — Placement fix      Est: CVR +1.2pp      ││
│  │     [✅ Approve] [❌ Reject] [✏️ Modify] [❓ Clarify]                   ││
│  │                                                                         ││
│  │  3. Increase TOS 70%→120% on Bamboo6P|King       Confidence: 74        ││
│  │     ...                                                                 ││
│  │                                                                         ││
│  │  4. Negate 8 search terms (>$12 spend, 0 orders)  Confidence: 88       ││
│  │     ...                                                                 ││
│  │                                                                         ││
│  │  [Approve All 4 for Bamboo Sheets 6PCS]                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─ COOLING PILLOWCASE (OPTIMIZATION) ───────────── 3 proposals ──────────┐│
│  │  ...                                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─ [PRODUCT 13] (SCALE) ────────────────────────── 2 proposals ──────────┐│
│  │  ...                                                                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [Approve All 9 Pending Agent Proposals]                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2.3 Approval Actions

Each proposal supports four actions:

| Action | Behavior | Required Fields | Activity Log Event |
|--------|----------|-----------------|-------------------|
| **Approve** | Sets status to `APPROVED`. Queues for execution. | None (one-click). | `agent_action_approved` |
| **Reject** | Sets status to `REJECTED`. Records reason. Feeds learning loop. | `rejection_reason` (required, text). | `agent_action_rejected` |
| **Modify** | Opens editor to change `recommended_value`. Approves modified version. | `modified_value`, `modification_reason`. | `agent_action_approved` with `modification_details` |
| **Request Clarification** | Creates `agent_questions` row linked to this proposal. Sets proposal to `PENDING_CLARIFICATION` sub-status. | `question_text` (required). | `agent_question_raised` (by operator) |

### 3.2.4 Batch Approval

- "Approve All for [Product]" — Approves all pending proposals for one product. Confirmation modal shows count and lists the actions.
- "Approve All Pending Agent Proposals" — Approves all agent proposals across all products. Requires MANAGER role. Confirmation modal with full summary.

---

## 3.3 Execution Gating

### 3.3.1 Phase 1: Full Human Gating (Launch)

All agent proposals require at minimum OPERATOR approval. No exceptions.

```
Agent Proposes → OPERATOR reviews → Approve/Reject/Modify → Execute (if approved)
```

This phase runs from launch until per-agent trust metrics are established (minimum 30 days of data).

### 3.3.2 Phase 2: Earned Autonomy (Configurable)

After an agent achieves sufficient trust, specific low-risk action types can be granted auto-approve status. This is configured per-agent in Settings.

**Eligibility criteria (ALL must be met):**

| Criterion | Threshold |
|-----------|-----------|
| Agent approval rate (30d rolling) | > 85% |
| Agent has been active for | > 30 days |
| Agent confidence score | > 75 |
| Specific action type approval rate | > 90% for that action type |
| No MANAGER escalations in last 14 days | True |

**Configurable auto-approve action types (Settings page):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AGENT AUTO-APPROVE SETTINGS                                    [Admin Only]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ⚠️  These settings allow agents to auto-execute certain low-risk actions   │
│      without human review. Enable only after reviewing agent performance.   │
│                                                                             │
│  GLOBAL CONTROLS                                                            │
│  ☐  Enable Agent Auto-Approve (master switch — off by default)             │
│                                                                             │
│  PER-ACTION-TYPE CONTROLS (only shown when master switch is on)            │
│  ☐  Negate keyword (any)                      Risk: LOW                    │
│  ☐  Bid decrease ≤ 15%                        Risk: LOW                    │
│  ☐  Budget increase ≤ $25/day                 Risk: LOW                    │
│  ☐  Pause BOTH_FAILING syntax (< $10/day)     Risk: LOW                    │
│  ☐  Cross-campaign negatives                  Risk: LOW                    │
│                                                                             │
│  NEVER AUTO-APPROVE (hardcoded, not configurable)                          │
│  ✗  Bid increases > 30%                                                    │
│  ✗  Budget changes > $100/day                                              │
│  ✗  Pause campaigns with > $50/day spend                                   │
│  ✗  Enable previously paused campaigns                                     │
│  ✗  Any action on CRITICAL segment products                                │
│  ✗  Any action when agent confidence < 70                                  │
│                                                                             │
│  PER-AGENT ELIGIBILITY STATUS                                              │
│  ┌──────────────────────┬──────────┬──────────┬──────────┬────────────────┐│
│  │ Agent                │ Approval │ Active   │ Confid.  │ Eligible?      ││
│  │                      │ Rate     │ Days     │ Score    │                ││
│  ├──────────────────────┼──────────┼──────────┼──────────┼────────────────┤│
│  │ Bamboo Sheets        │ 88%      │ 47d      │ 78       │ ✅ Yes         ││
│  │ Satin Sheets         │ 82%      │ 47d      │ 82       │ ❌ Rate < 85%  ││
│  │ Cooling Sheets       │ 91%      │ 12d      │ 68       │ ❌ < 30 days   ││
│  │ ...                  │          │          │          │                ││
│  └──────────────────────┴──────────┴──────────┴──────────┴────────────────┘│
│                                                                             │
│  [Save Settings]                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3.3 Auto-Approve Flow (Phase 2 Only)

```
Agent Proposes
    │
    ├── Is master switch ON? ──── No ──→ Route to OPERATOR (normal flow)
    │
    ├── Is agent eligible? ──── No ──→ Route to OPERATOR (normal flow)
    │
    ├── Is action type auto-approvable? ──── No ──→ Route to OPERATOR
    │
    ├── Is action on NEVER-AUTO list? ──── Yes ──→ Route to OPERATOR/MANAGER
    │
    ├── Is agent confidence ≥ 70? ──── No ──→ Route to OPERATOR
    │
    └── All checks pass ──→ AUTO-APPROVE
        │
        ├── Status set to APPROVED with approval_tier = 'AUTO_AGENT'
        ├── auto_approve_rule = 'agent_earned_autonomy:{action_type}'
        ├── Logged in activity_log as agent_action_auto_approved
        ├── Included in daily email under "Agent Auto-Approved Actions" section
        └── Operator can still review and ROLLBACK within monitoring window
```

**Rollback safety:** Even auto-approved agent actions have a monitoring window (48-72h). If metrics deteriorate beyond threshold during monitoring, the system auto-raises an alert and the operator can one-click rollback.

---

## 3.4 Learning Loop Integration

Every approval decision feeds back into the agent's learning state:

```
APPROVED ──→ agent_learning_events: PROPOSAL_APPROVED
           ──→ Increment confidence if pattern is new
           ──→ Add to approved_patterns in learning_state

REJECTED ──→ agent_learning_events: PROPOSAL_REJECTED
           ──→ Decrement confidence
           ──→ Add to rejected_patterns with reason
           ──→ Agent adjusts future proposals for similar conditions

MODIFIED ──→ agent_learning_events: PROPOSAL_MODIFIED
           ──→ Slight confidence decrement (right direction, wrong magnitude)
           ──→ Record magnitude adjustment for calibration

EXECUTED + OUTCOME MEASURED ──→ agent_learning_events: OUTCOME_POSITIVE/NEGATIVE
           ──→ Major confidence impact based on prediction accuracy
           ──→ Refines expected_outcome calibration
```

**Confidence score calculation:**

```typescript
function recalculateConfidence(agentId: string): number {
  const weights = {
    approval_rate_30d: 0.35,        // % of proposals approved (30-day rolling)
    execution_success_rate: 0.20,   // % of approved actions that executed without error
    impact_accuracy: 0.25,          // % of executed actions where outcome matched prediction
    data_completeness: 0.10,        // % of required metrics available for this product
    recency_bonus: 0.10,            // Higher if recent runs had good outcomes
  };

  // Each factor is 0-100, weighted sum produces final score
  return Math.round(
    factors.approval_rate_30d * weights.approval_rate_30d +
    factors.execution_success_rate * weights.execution_success_rate +
    factors.impact_accuracy * weights.impact_accuracy +
    factors.data_completeness * weights.data_completeness +
    factors.recency_bonus * weights.recency_bonus
  );
}
```

---

# PART 4 — ACTIVITY LOG INTEGRATION

---

## 4.0 Integration Principle

Every agent event produces a row in the existing `activity_log` table. Agent events are first-class citizens in the activity log — they use the same table, same schema, same UI. The difference is the `actor_type` field: human events have `actor_type = 'USER'`, agent events have `actor_type = 'AGENT'`.

---

## 4.1 Agent Events in Activity Log

### 4.1.1 Event Type Registry

| Event | `activity_type` Value | `actor_type` | Details (JSONB) |
|-------|-----------------------|-------------|-----------------|
| Agent run started | `agent_run_started` | `AGENT` | `{ "product_id": 1, "run_id": 47, "trigger": "scheduled", "triggered_by": "scheduler" }` |
| Agent analysis completed | `agent_analysis_completed` | `AGENT` | `{ "product_id": 1, "run_id": 47, "syntaxes_analyzed": 6, "quadrants": { "STRONG": 2, "VISIBILITY": 1, "CONVERSION": 2, "BOTH_FAILING": 1 } }` |
| Agent proposed action | `agent_action_proposed` | `AGENT` | `{ "product_id": 1, "run_id": 47, "proposal_id": "uuid", "action_type": "TOS_INCREASE", "target": "Bamboo|King", "current": "80%", "recommended": "130%", "confidence": 85, "quadrant": "VISIBILITY", "root_cause": "UNDER_INVESTMENT", "sop_rule": "Section 4.4 Root 4" }` |
| Agent question raised | `agent_question_raised` | `AGENT` | `{ "product_id": 1, "run_id": 47, "question_id": "uuid", "question_text": "...", "is_blocking": true, "blocked_proposals": [1, 2] }` |
| User answered question | `agent_question_answered` | `USER` | `{ "product_id": 1, "question_id": "uuid", "answer_text": "...", "answered_by": "Wajahat" }` |
| Action approved | `agent_action_approved` | `USER` | `{ "product_id": 1, "proposal_id": "uuid", "action_type": "TOS_INCREASE", "approved_by": "Wajahat", "modifications": null }` |
| Action auto-approved (Phase 2) | `agent_action_auto_approved` | `SYSTEM` | `{ "product_id": 1, "proposal_id": "uuid", "action_type": "NEGATE_KEYWORD", "auto_rule": "agent_earned_autonomy:negate_keyword", "agent_confidence": 82 }` |
| Action rejected | `agent_action_rejected` | `USER` | `{ "product_id": 1, "proposal_id": "uuid", "action_type": "BID_DECREASE", "rejected_by": "Wajahat", "reason": "Too aggressive for a LAUNCH product" }` |
| Action modified and approved | `agent_action_modified` | `USER` | `{ "product_id": 1, "proposal_id": "uuid", "original_value": "130%", "modified_value": "110%", "modified_by": "Wajahat", "reason": "Conservative approach" }` |
| Action executed | `agent_action_executed` | `SYSTEM` | `{ "product_id": 1, "proposal_id": "uuid", "execution_id": "uuid", "pre_value": "80%", "post_value": "130%", "api_response_status": 200, "api_entity_id": "amzn1.sp.campaign.xxx" }` |
| Action execution failed | `agent_action_execution_failed` | `SYSTEM` | `{ "product_id": 1, "proposal_id": "uuid", "error": "API rate limit exceeded", "retry_scheduled": true, "retry_at": "2026-03-19T09:00:00Z" }` |
| Action rolled back | `agent_action_rolled_back` | `USER` or `SYSTEM` | `{ "product_id": 1, "proposal_id": "uuid", "reason": "Metrics deteriorated beyond threshold", "restored_value": "80%", "rolled_back_by": "Wajahat" }` |
| Agent paused | `agent_paused` | `USER` | `{ "product_id": 1, "agent_id": 1, "paused_by": "Wajahat", "reason": "Product under listing review" }` |
| Agent resumed | `agent_resumed` | `USER` | `{ "product_id": 1, "agent_id": 1, "resumed_by": "Wajahat" }` |
| Agent confidence updated | `agent_confidence_updated` | `SYSTEM` | `{ "product_id": 1, "agent_id": 1, "old_score": 72, "new_score": 78, "contributing_factors": ["3 consecutive approvals", "outcome accuracy +5%"] }` |
| Agent run completed | `agent_run_completed` | `AGENT` | `{ "product_id": 1, "run_id": 47, "duration_ms": 4200, "proposals": 3, "questions": 0, "violations": 1 }` |
| Agent error | `agent_error` | `SYSTEM` | `{ "product_id": 1, "run_id": 47, "error": "Pipeline timeout after 60s", "stage": "ANALYZING" }` |

### 4.1.2 Schema Addition

The existing `activity_log` table needs one new column and one new index:

```sql
-- Add actor_type to distinguish human vs agent vs system events
ALTER TABLE activity_log ADD COLUMN actor_type VARCHAR(10) NOT NULL DEFAULT 'USER' CHECK (
    actor_type IN ('USER', 'AGENT', 'SYSTEM')
);

-- Add agent_id for efficient per-agent filtering
ALTER TABLE activity_log ADD COLUMN agent_id BIGINT REFERENCES product_agents(id);

-- Index for agent-filtered queries
CREATE INDEX idx_al_agent ON activity_log(agent_id, created_at DESC) WHERE agent_id IS NOT NULL;

-- Index for actor_type filtering
CREATE INDEX idx_al_actor_type ON activity_log(actor_type, created_at DESC);

-- Composite index for agent detail page history tab
CREATE INDEX idx_al_agent_product ON activity_log(agent_id, product_id, created_at DESC)
    WHERE agent_id IS NOT NULL;
```

---

## 4.2 Cross-System Connections

### 4.2.1 Action Plan Integration

Agent proposals appear in the daily Action Plan alongside human-generated recommendations. They are visually distinguished with an agent badge.

**In the product action card (Daily Plan view):**

```
├── ACTION 3: [🤖 AGENT] Increase TOS modifier on "Bamboo|King"
│   Current: 80% -> Recommended: 130%
│   Agent Confidence: 85/100
│   WHY: VISIBILITY quadrant — Under-Investment
│   ... (same format as human-generated actions)
│   STATUS: PENDING APPROVAL
│   [APPROVE]  [REJECT]  [MODIFY]
```

**Implementation:** When the Action Plan Engine runs and the Agent has already run for a product, the engine checks for existing agent proposals and merges them into the daily plan rather than generating duplicate recommendations. Priority:
1. If agent has proposed an action for a syntax, the agent's proposal takes precedence
2. If the Action Plan Engine identifies an action the agent missed, it generates it as a standard recommendation
3. Deduplication key: `(product_id, syntax_group, action_type)`

### 4.2.2 Approval Queue Integration

Agent proposals flow into the same `action_approvals` table as human-generated actions. The approval queue page shows them under the "Agent Proposals" tab (see Part 3.2). The "All" tab merges both sources.

**Linking:** Each `agent_proposals` row creates a corresponding `action_recommendations` row (for unified tracking) and an `action_approvals` row (for the approval queue). The `agent_proposals.action_item_id` and `agent_proposals.approval_id` fields maintain the FK link.

### 4.2.3 Daily Email Integration

The daily email gains a new section (Section I) for agent status:

```
┌─── AGENT STATUS ─────────────────────────────────────────────────────────────┐
│                                                                              │
│  FLEET OVERVIEW                                                              │
│  Running: 4 | Completed: 7 | Waiting: 3 | Paused: 1 | Needs Clarification: 1│
│                                                                              │
│  AGENTS WAITING FOR APPROVAL                                                 │
│  ┌───────────────────────┬────────────┬───────────────────────┬──────┐      │
│  │ Agent                 │ Proposals  │ Highest Priority      │ Conf │      │
│  ├───────────────────────┼────────────┼───────────────────────┼──────┤      │
│  │ Bamboo Sheets 6PCS    │ 4 pending  │ URGENT (Pause Full)   │ 65   │      │
│  │ Cooling Pillowcase    │ 3 pending  │ HIGH (Bid -25% Twin)  │ 62   │      │
│  │ [Product 13]          │ 2 pending  │ MEDIUM (Budget +30%)  │ 59   │      │
│  └───────────────────────┴────────────┴───────────────────────┴──────┘      │
│                                                                              │
│  AGENTS NEEDING CLARIFICATION                                                │
│  • Satin Sheets 6 Pcs — "CVR dropped 22% WoW but price also changed.       │
│    Should I attribute to price change or proceed with PPC adjustment?"       │
│    [Answer in App]                                                           │
│                                                                              │
│  AGENT PERFORMANCE (7-day)                                                   │
│  Fleet Approval Rate: 84% | Avg Confidence: 67 | Proposals Today: 14       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Position in email:** After Section H (Checklist Summary), before footer. New section letter: I.

**BullMQ job:** The existing `DailyEmailJob` is extended to query `product_agents`, `agent_runs`, and `agent_proposals` tables and render Section I.

### 4.2.4 Tracking Integration

Agent-executed actions are tracked for Week-over-Week impact analysis in the Tracking module:
- Each executed agent action gets a `tracking_events` row linking the execution to the pre/post metrics
- The monitoring window (48-72h) triggers an automated comparison job
- Results feed back into `agent_learning_events` as `OUTCOME_POSITIVE`, `OUTCOME_NEGATIVE`, or `OUTCOME_NEUTRAL`

### 4.2.5 Alert System Integration

Agents raise alerts through the existing `unified_alerts` table when they detect:

| Detection | Alert Type | Severity | Channel |
|-----------|-----------|----------|---------|
| Gate status changed from CLEAR to FAIL | `GATE_FAILURE` | CRITICAL | Immediate email + in-app |
| OOS with active spend detected | `OOS_SPENDING` | CRITICAL | Immediate email + in-app |
| Product moved to CRITICAL segment | `SEGMENT_ESCALATION` | HIGH | In-app, included in daily email |
| Naming convention violation | `NAMING_VIOLATION` | MEDIUM | In-app, included in daily email |
| Missing required campaign structure | `SOP_VIOLATION` | HIGH | In-app, included in daily email |
| Agent confidence dropped below 40 | `AGENT_LOW_CONFIDENCE` | MEDIUM | In-app, included in daily email |
| Agent blocked on unanswered question >24h | `AGENT_BLOCKED` | MEDIUM | In-app, reminder email |

---

## 4.3 Activity Log Filters for Agents

### 4.3.1 Global Activity Log (/activity-log)

New filter option added to the existing filter bar:

```
Filters: [Actor ▾] [Type ▾] [Product ▾] [Date Range ▾]  Search: [___________]
```

**Actor filter options:**
- All (default)
- User — Shows only human-initiated events
- Agent — Shows only agent-initiated events
- System — Shows only system-initiated events (executions, confidence updates)

**Type filter additions:**
All `agent_*` activity types are added to the Type dropdown, grouped under an "Agent Events" header:

```
Type ▾
├── Action Plan Events
│   ├── action_proposed
│   ├── action_approved
│   └── ...
├── Agent Events           ← NEW GROUP
│   ├── agent_run_started
│   ├── agent_run_completed
│   ├── agent_analysis_completed
│   ├── agent_action_proposed
│   ├── agent_action_approved
│   ├── agent_action_auto_approved
│   ├── agent_action_rejected
│   ├── agent_action_modified
│   ├── agent_action_executed
│   ├── agent_action_execution_failed
│   ├── agent_action_rolled_back
│   ├── agent_question_raised
│   ├── agent_question_answered
│   ├── agent_paused
│   ├── agent_resumed
│   ├── agent_confidence_updated
│   └── agent_error
└── System Events
    ├── data_sync_completed
    └── ...
```

### 4.3.2 Agent Detail Page History Tab (/agents/:productId → History)

This tab renders the activity log filtered to a single agent:

```sql
SELECT * FROM activity_log
WHERE agent_id = :agentId
  AND product_id = :productId
ORDER BY created_at DESC
LIMIT 100 OFFSET :offset;
```

The tab uses the same timeline UI as the global activity log, but with automatic product + agent filtering applied. The user can further filter by:
- Date range
- Event type (within agent events)
- Run number (to see all events from a specific run)

### 4.3.3 Activity Log Entry Rendering

Agent events render with a distinct visual treatment in the activity log:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🤖 agent_action_proposed                             Today 06:35 AM       │
│  Agent: Bamboo Sheets Agent                                                 │
│  Product: Bamboo Sheets (B08KQKPKWC)                  Run #47              │
│                                                                             │
│  Proposed: Increase TOS modifier 80% → 130% on "Bamboo|King"              │
│  Quadrant: VISIBILITY | Root Cause: Under-Investment                       │
│  Confidence: 85/100                                                         │
│  SOP: Section 4.4 Root 4                                                   │
│                                                                             │
│  [View Proposal]  [View Run]                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  👤 agent_action_approved                             Today 08:15 AM       │
│  User: Wajahat S.                                                           │
│  Product: Bamboo Sheets (B08KQKPKWC)                                       │
│                                                                             │
│  Approved: Increase TOS modifier 80% → 130% on "Bamboo|King"              │
│  No modifications                                                           │
│                                                                             │
│  [View Execution Status]                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚡ agent_action_executed                             Today 08:20 AM       │
│  System: Execution Engine                                                   │
│  Product: Bamboo Sheets (B08KQKPKWC)                                       │
│                                                                             │
│  Executed: TOS modifier change on campaign "DECOLURE|Bamboo|King|Exact|Rnk"│
│  Pre: 80% | Post: 130% | API Status: 200 OK                               │
│  Monitoring window: 72h (reassess Mar 22)                                  │
│                                                                             │
│  [View API Response]  [Rollback]                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Icon mapping:**
- 🤖 — `actor_type = 'AGENT'`
- 👤 — `actor_type = 'USER'`
- ⚡ — `actor_type = 'SYSTEM'`

---

## 4.4 BullMQ Job Integration

New jobs added to the background job system:

| Job Name | Queue | Trigger | Purpose |
|----------|-------|---------|---------|
| `AgentSchedulerJob` | `agent-scheduler` | Cron (every minute) | Checks `product_agents.next_run_at`, starts agents whose time has come |
| `AgentPipelineJob` | `agent-pipeline` | `AgentSchedulerJob` or manual trigger | Runs the full diagnostic pipeline for one product agent |
| `AgentConfidenceRecalcJob` | `agent-confidence` | After any approval/rejection/execution event | Recalculates confidence score for the affected agent |
| `AgentQuestionReminderJob` | `agent-questions` | Cron (daily at 12:00 PM) | Sends reminder for unanswered questions older than 24h |
| `AgentProposalExpiryJob` | `agent-expiry` | Cron (daily at 11:00 PM) | Expires proposals that have been pending for >7 days |
| `AgentOutcomeMeasurementJob` | `agent-outcomes` | After monitoring window expires (per execution) | Compares pre/post metrics, records outcome, updates learning |

**Concurrency rules:**
- Only ONE `AgentPipelineJob` per product can run at a time (BullMQ concurrency limiter keyed on `product_id`)
- `AgentConfidenceRecalcJob` is debounced: if multiple events fire within 5 minutes, only one recalc runs
- All agent jobs use the existing BullMQ retry configuration: 3 retries with exponential backoff

---

## 4.5 tRPC Router Addition

New router: `agentRouter`

```typescript
// Endpoints added to the tRPC API
export const agentRouter = router({
  // List all agents with summary stats
  list: publicProcedure
    .query(() => { /* returns AgentListItem[] */ }),

  // Get single agent detail
  getById: publicProcedure
    .input(z.object({ productId: z.number() }))
    .query(() => { /* returns AgentDetail */ }),

  // Get agent's action queue
  getProposals: publicProcedure
    .input(z.object({ agentId: z.number(), status: z.string().optional() }))
    .query(() => { /* returns AgentProposal[] */ }),

  // Get agent's open questions
  getQuestions: publicProcedure
    .input(z.object({ agentId: z.number(), status: z.string().optional() }))
    .query(() => { /* returns AgentQuestion[] */ }),

  // Get agent's diagnostic results (latest run)
  getDiagnostic: publicProcedure
    .input(z.object({ agentId: z.number() }))
    .query(() => { /* returns DiagnosticResult */ }),

  // Get agent's activity history
  getHistory: publicProcedure
    .input(z.object({ agentId: z.number(), limit: z.number().default(100), offset: z.number().default(0) }))
    .query(() => { /* returns ActivityLogEntry[] */ }),

  // Get agent's learning state
  getLearning: publicProcedure
    .input(z.object({ agentId: z.number() }))
    .query(() => { /* returns LearningState */ }),

  // Get agent's performance metrics
  getPerformance: publicProcedure
    .input(z.object({ agentId: z.number(), days: z.number().default(30) }))
    .query(() => { /* returns PerformanceMetrics */ }),

  // Pause an agent
  pause: publicProcedure
    .input(z.object({ agentId: z.number(), reason: z.string() }))
    .mutation(() => { /* updates agent_status, logs event */ }),

  // Resume an agent
  resume: publicProcedure
    .input(z.object({ agentId: z.number() }))
    .mutation(() => { /* updates agent_status, logs event */ }),

  // Force rerun an agent
  forceRerun: publicProcedure
    .input(z.object({ agentId: z.number() }))
    .mutation(() => { /* creates agent_run, triggers pipeline job */ }),

  // Approve a proposal
  approveProposal: publicProcedure
    .input(z.object({ proposalId: z.number(), modifications: z.any().optional() }))
    .mutation(() => { /* updates status, creates execution, logs event */ }),

  // Reject a proposal
  rejectProposal: publicProcedure
    .input(z.object({ proposalId: z.number(), reason: z.string() }))
    .mutation(() => { /* updates status, feeds learning loop, logs event */ }),

  // Answer a question
  answerQuestion: publicProcedure
    .input(z.object({ questionId: z.number(), answer: z.string(), selectedOption: z.number().optional() }))
    .mutation(() => { /* updates question, unblocks agent, logs event */ }),

  // Bulk operations
  pauseAll: publicProcedure.mutation(() => { /* pauses all active agents */ }),
  resumeAll: publicProcedure.mutation(() => { /* resumes all paused agents */ }),
  forceRerunAll: publicProcedure.mutation(() => { /* triggers rerun for all agents */ }),
  approveAllPending: publicProcedure.mutation(() => { /* batch approves, requires MANAGER */ }),

  // Summary stats (for sidebar badge and summary cards)
  getSummaryStats: publicProcedure
    .query(() => { /* returns { total, running, paused, waiting, clarification, completedToday } */ }),
});
```

---

# APPENDIX A — MIGRATION PLAN

## New Tables (5)

1. `product_agents` — Agent identity and state
2. `agent_runs` — Run lifecycle tracking
3. `agent_proposals` — Agent-generated action proposals
4. `agent_questions` — Clarification questions
5. `agent_learning_events` — Learning loop event store

## Schema Alterations (1)

1. `activity_log` — Add `actor_type` column, `agent_id` column, new indexes

## New BullMQ Jobs (6)

1. `AgentSchedulerJob`
2. `AgentPipelineJob`
3. `AgentConfidenceRecalcJob`
4. `AgentQuestionReminderJob`
5. `AgentProposalExpiryJob`
6. `AgentOutcomeMeasurementJob`

## New tRPC Router (1)

1. `agentRouter` — 17 endpoints

## UI Pages (2)

1. `/agents` — Agent fleet overview
2. `/agents/:productId` — Agent detail with 6 tabs

## Modified Pages (3)

1. Sidebar navigation — Add Agents item with live badge
2. `/approval-queue` — Add "Agent Proposals" tab
3. `/activity-log` — Add Actor filter, Agent event types

## Modified Email (1)

1. Daily Digest — Add Section I: Agent Status

---

# APPENDIX B — COMPANION FILE INDEX

| File | Relevance to Agents Spec |
|------|-------------------------|
| `ACTION_PLAN_ENGINE.md` | Agent runs the same 8-stage pipeline. Agents wrap this pipeline per product. |
| `DATA_MODEL_AND_BUILD_PLAN.md` | Agent proposals link into `action_recommendations` and `action_approvals`. |
| `EMAIL_APPROVAL_DEPLOYMENT_SPEC.md` | Agent proposals appear in the daily email and use the same approval link format. |
| `GATE_LOGIC_AND_ACTION_MAPPING.md` | Agents use the same gate logic and diagnostic-to-action mapping. |
| `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` | Agent proposals merge into the daily plan product cards. |
| `SYSTEM_EXPANSION_V3.md` | Activity Log schema extended for agent events. |
| `PMP_SYSTEMS_ARCHITECTURE.md` | Tech stack (tRPC, BullMQ, PostgreSQL) applies to all new agent infrastructure. |
