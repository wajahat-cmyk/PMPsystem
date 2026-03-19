# PMP SYSTEMS -- AGENT SYSTEM DATA MODEL & BUILD PLAN
## Part 7: Agent Data Model Additions | Part 8: Agent Build Recommendation

### Companion Files
- `PMP_SYSTEMS_ARCHITECTURE.md` -- Core system (data model, tech stack, 7 original modules)
- `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` -- Daily plans, action recommendations, checklists
- `ACTION_PLAN_ENGINE.md` -- Action Plan Engine architecture and workflow
- `GATE_LOGIC_AND_ACTION_MAPPING.md` -- Gate logic, diagnostic-to-action mapping
- `DATA_MODEL_AND_BUILD_PLAN.md` -- Approval workflow, execution tracking, violations, alerts, email
- `EXTENDED_MODULES_SPEC.md` -- Syntax/Root/Inventory/Deal extensions
- `SYSTEM_EXPANSION_V3.md` -- Marketplace, Activity Log, Forecasting

---

# PART 7 -- AGENT SYSTEM DATA MODEL ADDITIONS

---

## 7.0 Context: Existing Tables Referenced by Agent System

The Agent system wraps around and extends the existing Action Plan Engine. These tables already exist and are referenced by foreign keys in the new agent tables:

| Table | Purpose | Defined In |
|-------|---------|------------|
| `products` | Core product entity (ASIN, title, brand, status) | `PMP_SYSTEMS_ARCHITECTURE.md` |
| `brands` | Brand entity (DECOLURE, SLEEPHORIA, SLEEP SANCTUARY) | `PMP_SYSTEMS_ARCHITECTURE.md` |
| `daily_action_plans` | One row per day per version. Plan header with summary counts. | `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` |
| `action_recommendations` | Individual recommended actions within a plan. | `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` |
| `action_approvals` | Full approval lifecycle per action. | `DATA_MODEL_AND_BUILD_PLAN.md` |
| `action_executions` | API execution tracking with pre/post snapshots. | `DATA_MODEL_AND_BUILD_PLAN.md` |
| `activity_log` | Unified event log for all system activities. | `SYSTEM_EXPANSION_V3.md` |
| `comments` | Threaded comments on any entity. | `SYSTEM_EXPANSION_V3.md` |

This document adds **6 new tables** for the Agent system: agent configuration, run tracking, question/clarification workflow, and three-layer memory (patterns, context, outcomes).

---

## 7.1 product_agents

One row per product. The agent's configuration, current state, and lifetime performance counters. Auto-created when a product is added to PMP Systems.

```sql
-- ============================================================
-- PRODUCT AGENTS
-- One agent per product. Wraps the Action Plan Engine as the
-- agent's "brain" and adds state tracking, confidence scoring,
-- and lifetime performance counters.
-- Auto-created: INSERT trigger on products table.
-- ============================================================
CREATE TABLE product_agents (
    id BIGSERIAL PRIMARY KEY,

    -- Which product this agent manages (1:1 relationship)
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    brand_id INT NOT NULL REFERENCES brands(id),
    marketplace_id INT NOT NULL DEFAULT 1,
    -- marketplace_id: 1 = US, 2 = CA, 3 = MX, etc. (from marketplaces table)

    -- Agent lifecycle status
    -- IDLE: waiting for next scheduled run
    -- RUNNING: currently executing analysis pipeline (stages 1-6)
    -- ANALYZING: post-pipeline, evaluating results and building recommendations
    -- RECOMMENDING: generating action proposals from analysis
    -- WAITING_FOR_APPROVAL: actions proposed, waiting for operator/manager decision
    -- NEEDS_CLARIFICATION: agent raised questions that block further analysis
    -- EXECUTING: approved actions being sent to Amazon Ads API
    -- COMPLETED: run finished, all actions resolved (approved/rejected/executed)
    -- PAUSED: manually paused by operator or manager
    agent_status VARCHAR(30) NOT NULL DEFAULT 'IDLE' CHECK (
        agent_status IN (
            'IDLE',
            'RUNNING',
            'ANALYZING',
            'RECOMMENDING',
            'WAITING_FOR_APPROVAL',
            'NEEDS_CLARIFICATION',
            'EXECUTING',
            'COMPLETED',
            'PAUSED'
        )
    ),

    -- Product lifecycle stage (mirrors product_stages but denormalized for agent queries)
    -- Updated each run from the Stage Classification engine (Stage 2 of pipeline)
    current_stage VARCHAR(20) NOT NULL DEFAULT 'LAUNCH' CHECK (
        current_stage IN ('LAUNCH', 'GROWTH', 'MAINTENANCE')
    ),

    -- Agent confidence score (0.00 - 100.00)
    -- Starts at 50.00 (neutral). Increases with approved actions that produce positive outcomes.
    -- Decreases with rejected actions or negative outcomes.
    -- Phase 1: calculated from approval_rate only
    -- Phase 3: calibrated from outcome tracking (positive_outcome_rate)
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 50.00
        CHECK (confidence_score >= 0 AND confidence_score <= 100),

    -- Scheduling
    last_run_at TIMESTAMPTZ,                -- When the agent last completed a run
    next_scheduled_run TIMESTAMPTZ,         -- When the next run is scheduled
    run_frequency_hours INT NOT NULL DEFAULT 24
        CHECK (run_frequency_hours >= 1 AND run_frequency_hours <= 168),
    -- run_frequency_hours: 24 = daily (default), 12 = twice daily, 168 = weekly

    -- Lifetime performance counters (denormalized for dashboard display)
    total_actions_proposed INT NOT NULL DEFAULT 0,
    total_actions_approved INT NOT NULL DEFAULT 0,
    total_actions_rejected INT NOT NULL DEFAULT 0,
    total_actions_executed INT NOT NULL DEFAULT 0,

    -- Calculated rates (updated after each approval decision or outcome measurement)
    -- approval_rate = total_actions_approved / NULLIF(total_actions_proposed, 0) * 100
    approval_rate NUMERIC(5,2) DEFAULT NULL
        CHECK (approval_rate IS NULL OR (approval_rate >= 0 AND approval_rate <= 100)),

    -- positive_outcome_rate: % of executed actions that produced positive impact
    -- NULL until Phase 3 outcome tracking is active
    positive_outcome_rate NUMERIC(5,2) DEFAULT NULL
        CHECK (positive_outcome_rate IS NULL OR (positive_outcome_rate >= 0 AND positive_outcome_rate <= 100)),

    -- Pause controls
    paused_by VARCHAR(100),                 -- Who paused the agent (operator name or 'system')
    paused_at TIMESTAMPTZ,
    pause_reason TEXT,
    -- Examples: 'Product out of stock', 'Price war -- manual management needed',
    --           'Holiday season -- pausing automation', 'system: confidence below threshold'

    -- Active flag (soft delete; FALSE = agent will not be scheduled)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints
ALTER TABLE product_agents
    ADD CONSTRAINT uq_pa_product UNIQUE (product_id);
    -- One agent per product. Enforced at DB level.

-- Indexes
CREATE INDEX idx_pa_product ON product_agents(product_id);
CREATE INDEX idx_pa_brand ON product_agents(brand_id);
CREATE INDEX idx_pa_status ON product_agents(agent_status);
CREATE INDEX idx_pa_stage ON product_agents(current_stage);
CREATE INDEX idx_pa_confidence ON product_agents(confidence_score DESC);
CREATE INDEX idx_pa_next_run ON product_agents(next_scheduled_run)
    WHERE is_active = TRUE AND agent_status != 'PAUSED';
CREATE INDEX idx_pa_active ON product_agents(is_active, agent_status)
    WHERE is_active = TRUE;

-- Partial index: agents needing attention (not idle, not completed)
CREATE INDEX idx_pa_attention ON product_agents(agent_status, updated_at DESC)
    WHERE agent_status IN ('WAITING_FOR_APPROVAL', 'NEEDS_CLARIFICATION', 'PAUSED');

COMMENT ON TABLE product_agents IS
    'One agent per product. Wraps the Action Plan Engine as the agent brain. Tracks state, confidence, and lifetime performance.';
COMMENT ON COLUMN product_agents.confidence_score IS
    'Agent confidence 0-100. Phase 1: approval_rate based. Phase 3: calibrated from outcome tracking. Affects approval routing thresholds.';
COMMENT ON COLUMN product_agents.run_frequency_hours IS
    'Hours between scheduled runs. Default 24 (daily). Range: 1 (hourly) to 168 (weekly).';
```

### Auto-Creation Trigger

When a new product is inserted into the `products` table, a trigger auto-creates the corresponding agent:

```sql
-- ============================================================
-- TRIGGER: Auto-create agent when product is added
-- ============================================================
CREATE OR REPLACE FUNCTION fn_create_product_agent()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO product_agents (product_id, brand_id, marketplace_id)
    VALUES (NEW.id, NEW.brand_id, COALESCE(NEW.marketplace_id, 1))
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_product_agent
    AFTER INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION fn_create_product_agent();
```

---

## 7.2 agent_runs

Each execution of an agent's analysis cycle. One row per run. Links the agent to the Action Plan Engine pipeline stages and captures run-level metrics.

```sql
-- ============================================================
-- AGENT RUNS
-- Each execution of an agent's daily (or manual) analysis cycle.
-- Maps 1:1 with an Action Plan Engine pipeline execution.
-- Captures which stages ran, what was produced, and any errors.
-- ============================================================
CREATE TABLE agent_runs (
    id BIGSERIAL PRIMARY KEY,

    -- Which agent ran, and for which product
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),

    -- When this run occurred
    run_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- What triggered this run
    -- scheduled: normal daily/periodic run from BullMQ cron
    -- manual: operator clicked "Run Now" on agent detail page
    -- forced: system forced re-run (e.g., after data correction)
    -- question_answered: re-run triggered because a blocking question was answered
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (
        trigger_type IN ('scheduled', 'manual', 'forced', 'question_answered')
    ),

    -- Run lifecycle
    -- running: pipeline is executing
    -- completed: all stages finished, actions proposed
    -- failed: pipeline errored out (see error_message)
    -- paused: agent was paused mid-run
    -- blocked: run cannot proceed because a question needs answering
    status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (
        status IN ('running', 'completed', 'failed', 'paused', 'blocked')
    ),

    -- If status = 'blocked', why?
    blocked_reason TEXT,
    -- Example: 'Awaiting answer to question #42: "Is this product seasonal?"'

    -- Which pipeline stages completed successfully
    -- Maps to Action Plan Engine stages 1-6
    stages_completed JSONB NOT NULL DEFAULT '[]'::JSONB,
    /*
      [
        {"stage": 1, "name": "gate_evaluation", "duration_ms": 120, "status": "completed"},
        {"stage": 2, "name": "stage_classification", "duration_ms": 45, "status": "completed"},
        {"stage": 3, "name": "four_quadrant_diagnostic", "duration_ms": 890, "status": "completed"},
        {"stage": 4, "name": "root_cause_analysis", "duration_ms": 1200, "status": "completed"},
        {"stage": 5, "name": "action_generation", "duration_ms": 650, "status": "completed"},
        {"stage": 6, "name": "prioritization", "duration_ms": 180, "status": "blocked", "blocked_by": "question_42"}
      ]
    */

    -- Output counts for this run
    actions_proposed INT NOT NULL DEFAULT 0,
    questions_raised INT NOT NULL DEFAULT 0,
    violations_found INT NOT NULL DEFAULT 0,

    -- Engine version (for debugging and rollback of engine logic)
    engine_version VARCHAR(20) NOT NULL DEFAULT '1.0.0',

    -- Error details (if status = 'failed')
    error_message TEXT,
    -- Example: 'Stage 3 failed: division by zero in quadrant calculation for syntax_group_id=47'

    -- Link to the daily action plan generated by this run (if completed)
    plan_id BIGINT REFERENCES daily_action_plans(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ar_agent ON agent_runs(agent_id);
CREATE INDEX idx_ar_product ON agent_runs(product_id);
CREATE INDEX idx_ar_date ON agent_runs(run_date DESC);
CREATE INDEX idx_ar_status ON agent_runs(status) WHERE status IN ('running', 'blocked');
CREATE INDEX idx_ar_trigger ON agent_runs(trigger_type);
CREATE INDEX idx_ar_agent_date ON agent_runs(agent_id, run_date DESC);
CREATE INDEX idx_ar_plan ON agent_runs(plan_id) WHERE plan_id IS NOT NULL;

-- Composite: find the latest completed run per agent
CREATE INDEX idx_ar_latest_completed ON agent_runs(agent_id, completed_at DESC)
    WHERE status = 'completed';

COMMENT ON TABLE agent_runs IS
    'Each execution of an agent analysis cycle. Maps to Action Plan Engine pipeline runs. One-to-many with product_agents.';
COMMENT ON COLUMN agent_runs.stages_completed IS
    'JSONB array of pipeline stages (1-6) with name, duration_ms, and status. Tracks partial completions.';
```

---

## 7.3 agent_questions

Questions raised by agents when they encounter ambiguity, missing data, or conflicting signals during analysis. Questions can block specific actions or entire pipeline stages until answered.

```sql
-- ============================================================
-- AGENT QUESTIONS
-- Questions raised by agents when they need human clarification.
-- Three priority levels: BLOCKING (halts pipeline), IMPORTANT
-- (halts specific action), INFORMATIONAL (advisory only).
-- Answers feed into agent_context_memories for future runs.
-- ============================================================
CREATE TABLE agent_questions (
    id BIGSERIAL PRIMARY KEY,

    -- Which agent asked, for which product, during which run
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),
    run_id BIGINT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,

    -- The question itself
    question_text TEXT NOT NULL,
    /*
      Examples:
      - "This product has been active for 45 days but organic share is only 8%. Should I classify
         it as LAUNCH (age-based) or GROWTH (performance-based)?"
      - "Keyword 'bamboo sheets' CPC increased 40% in 3 days. Is there a known competitor
         promotion or event driving this?"
      - "Campaign 'SP-Satin-Discovery' has no historical data. What is the target ACOS
         for this campaign?"
      - "I found 3 campaigns targeting the same keyword 'cooling sheets queen'. Which campaign
         should be the primary one?"
    */

    -- Question classification
    -- missing_data: required input not available (e.g., target ACOS, COGS)
    -- ambiguous_context: multiple valid interpretations (e.g., stage classification conflict)
    -- conflicting_signals: metrics disagree (e.g., clicks up but CVR down)
    -- external_dependency: answer requires info from outside PMP (e.g., supplier ETA)
    -- stage_uncertainty: product stage classification is unclear
    -- competitor_context: competitor activity needs human interpretation
    -- campaign_classification: campaign purpose/objective is ambiguous
    question_type VARCHAR(30) NOT NULL CHECK (
        question_type IN (
            'missing_data',
            'ambiguous_context',
            'conflicting_signals',
            'external_dependency',
            'stage_uncertainty',
            'competitor_context',
            'campaign_classification'
        )
    ),

    -- What type of input the answer requires
    -- text: free-form text answer
    -- number: numeric value (e.g., target ACOS = 0.25)
    -- boolean: yes/no answer
    -- select: pick from predefined options (see options field)
    -- date: date value (e.g., restock ETA)
    required_input_type VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (
        required_input_type IN ('text', 'number', 'boolean', 'select', 'date')
    ),

    -- For 'select' type: the available options
    options JSONB,
    /*
      {
        "choices": [
          {"value": "LAUNCH", "label": "Keep as LAUNCH stage (age-based, < 90 days)"},
          {"value": "GROWTH", "label": "Classify as GROWTH (performance warrants it)"},
          {"value": "MAINTENANCE", "label": "Jump to MAINTENANCE (product is mature)"}
        ]
      }
    */

    -- What this question blocks
    -- If blocking an action: link to the specific action_recommendation
    blocking_action_id BIGINT REFERENCES action_recommendations(id) ON DELETE SET NULL,

    -- If blocking a pipeline stage: which stage name
    blocking_stage VARCHAR(50),
    -- Examples: 'stage_classification', 'action_generation', 'prioritization'

    -- Evidence supporting why the agent is confused
    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
    /*
      {
        "conflicting_data": {
          "age_days": 45,
          "organic_share_pct": 8.2,
          "launch_threshold_days": 90,
          "growth_organic_threshold": 15.0
        },
        "analysis": "Product age (45 days) indicates LAUNCH, but organic share (8.2%) is below
                     the GROWTH threshold (15%). The product may need more time or a strategy change.",
        "related_metrics": {
          "sessions_trend_7d": "declining",
          "conversion_rate_7d": 0.12,
          "acos_7d": 0.35
        }
      }
    */

    -- Priority determines what gets blocked
    -- BLOCKING: entire pipeline run is halted until answered (status = 'blocked' on agent_runs)
    -- IMPORTANT: specific action is held; other actions proceed normally
    -- INFORMATIONAL: advisory only; does not block anything; agent proceeds with best guess
    priority VARCHAR(15) NOT NULL DEFAULT 'IMPORTANT' CHECK (
        priority IN ('BLOCKING', 'IMPORTANT', 'INFORMATIONAL')
    ),

    -- Question lifecycle
    -- OPEN: waiting for answer
    -- ANSWERED: human provided an answer (see answer_value)
    -- EXPIRED: question expired without answer (past expires_at)
    -- AUTO_RESOLVED: system resolved the question (e.g., missing data appeared in next ETL)
    status VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'ANSWERED', 'EXPIRED', 'AUTO_RESOLVED')
    ),

    -- Timing
    asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    answered_by VARCHAR(100),               -- Operator or manager who answered

    -- The answer
    answer_value TEXT,
    /*
      For text: free-form answer text
      For number: numeric string (e.g., '0.25')
      For boolean: 'true' or 'false'
      For select: the selected option value (e.g., 'GROWTH')
      For date: ISO date string (e.g., '2026-04-15')
    */

    -- Expiration: if not answered by this time, status -> 'EXPIRED'
    -- BLOCKING questions: 48 hours
    -- IMPORTANT questions: 72 hours
    -- INFORMATIONAL questions: 7 days
    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_aq_agent ON agent_questions(agent_id);
CREATE INDEX idx_aq_product ON agent_questions(product_id);
CREATE INDEX idx_aq_run ON agent_questions(run_id);
CREATE INDEX idx_aq_status ON agent_questions(status) WHERE status = 'OPEN';
CREATE INDEX idx_aq_priority ON agent_questions(priority, status)
    WHERE status = 'OPEN';
CREATE INDEX idx_aq_type ON agent_questions(question_type);
CREATE INDEX idx_aq_asked ON agent_questions(asked_at DESC);
CREATE INDEX idx_aq_blocking ON agent_questions(blocking_action_id)
    WHERE blocking_action_id IS NOT NULL AND status = 'OPEN';

-- Partial index: open blocking questions (the question queue)
CREATE INDEX idx_aq_blocking_queue ON agent_questions(priority, asked_at)
    WHERE status = 'OPEN' AND priority = 'BLOCKING';

-- Expiration check: find questions past their expiry
CREATE INDEX idx_aq_expiring ON agent_questions(expires_at)
    WHERE status = 'OPEN' AND expires_at IS NOT NULL;

COMMENT ON TABLE agent_questions IS
    'Questions raised by agents during analysis. Three priority levels (BLOCKING/IMPORTANT/INFORMATIONAL). Answers feed into context memories.';
COMMENT ON COLUMN agent_questions.priority IS
    'BLOCKING = halts entire run. IMPORTANT = holds one action. INFORMATIONAL = advisory, agent proceeds with best guess.';
```

---

## 7.4 agent_memory_patterns

Learned patterns from the operator's approval and rejection decisions. Each row captures the conditions under which an action was proposed, whether it was approved/rejected/modified, and the eventual outcome. Patterns with high occurrence counts and positive outcomes increase agent confidence.

```sql
-- ============================================================
-- AGENT MEMORY PATTERNS
-- Learned patterns from approval/rejection/modification decisions.
-- The agent's "experience" -- used to calibrate future proposals.
-- Pattern matching: conditions JSONB is compared against current
-- product state to predict whether a similar action will be approved.
-- ============================================================
CREATE TABLE agent_memory_patterns (
    id BIGSERIAL PRIMARY KEY,

    -- Which agent learned this pattern
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),

    -- What happened to the action
    -- approved: action was approved as-is
    -- rejected: action was rejected by operator/manager
    -- modified: action was approved but with changed values
    pattern_type VARCHAR(10) NOT NULL CHECK (
        pattern_type IN ('approved', 'rejected', 'modified')
    ),

    -- The conditions under which this action was proposed
    -- Used for pattern matching against current product state
    conditions JSONB NOT NULL,
    /*
      {
        "quadrant": "VISIBILITY",
        "root_cause": "PLACEMENT",
        "stage": "GROWTH",
        "gate_status": "CLEAR",
        "campaign_objective": "ranking",
        "metric_ranges": {
          "acos_7d": {"min": 0.20, "max": 0.35},
          "impressions_7d": {"min": 5000, "max": 20000},
          "cvr_7d": {"min": 0.08, "max": 0.15},
          "organic_share_pct": {"min": 10, "max": 30}
        },
        "match_type": "EXACT",
        "spend_level": "medium"
      }
    */

    -- What action was proposed under these conditions
    action_type VARCHAR(50) NOT NULL,
    /*
      Examples: 'bid_increase', 'bid_decrease', 'budget_increase', 'budget_decrease',
      'placement_tos_increase', 'placement_tos_decrease', 'pause_keyword',
      'pause_campaign', 'enable_keyword', 'negate_keyword', 'cross_negate',
      'flag_listing', 'flag_pricing', 'flag_inventory'
    */

    -- The magnitude of the proposed change
    -- For bids: the % change (e.g., 0.15 = 15% increase)
    -- For budgets: the $ change (e.g., 25.00 = $25 increase)
    -- For placements: the % point change (e.g., 10.0 = +10% TOS modifier)
    action_magnitude NUMERIC(8,4),

    -- Decision outcome
    was_approved BOOLEAN NOT NULL,
    was_modified BOOLEAN NOT NULL DEFAULT FALSE,

    -- If modified: what was changed
    modification_details TEXT,
    -- Example: 'Reduced bid increase from 25% to 15%. Reason: conservative approach for new keyword.'

    -- If rejected: why
    rejection_reason TEXT,
    -- Example: 'Product is in price war. Do not increase bids until pricing stabilizes.'

    -- Pattern weight (0.0001 - 1.0000)
    -- Higher weight = stronger signal. Decays over time.
    -- Fresh patterns: 1.0. Decays by 0.05 per week without reinforcement.
    -- Reinforced (same pattern repeated): weight resets to 1.0.
    weight NUMERIC(5,4) NOT NULL DEFAULT 1.0000
        CHECK (weight > 0 AND weight <= 1),

    -- How many times this exact pattern (conditions + action_type) has occurred
    occurrence_count INT NOT NULL DEFAULT 1,

    -- Most recent outcome tracking (updated by agent_outcome_memories)
    last_outcome_positive BOOLEAN,
    last_outcome_impact NUMERIC(8,4),
    -- last_outcome_impact: magnitude of impact (e.g., -5.2 = ACOS improved 5.2%, +12.0 = impressions up 12%)

    -- Source: which specific action recommendation created this pattern
    source_action_id BIGINT REFERENCES action_recommendations(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_amp_agent ON agent_memory_patterns(agent_id);
CREATE INDEX idx_amp_product ON agent_memory_patterns(product_id);
CREATE INDEX idx_amp_type ON agent_memory_patterns(pattern_type);
CREATE INDEX idx_amp_action ON agent_memory_patterns(action_type);
CREATE INDEX idx_amp_approved ON agent_memory_patterns(was_approved);
CREATE INDEX idx_amp_weight ON agent_memory_patterns(weight DESC)
    WHERE weight > 0.1;
CREATE INDEX idx_amp_source ON agent_memory_patterns(source_action_id)
    WHERE source_action_id IS NOT NULL;

-- Composite: lookup patterns for a product by action type and approval status
CREATE INDEX idx_amp_product_action ON agent_memory_patterns(product_id, action_type, was_approved);

-- Composite: find strong patterns (high weight, high occurrence) for an agent
CREATE INDEX idx_amp_strong ON agent_memory_patterns(agent_id, weight DESC, occurrence_count DESC)
    WHERE weight >= 0.5 AND occurrence_count >= 3;

-- GIN index on conditions JSONB for pattern matching queries
CREATE INDEX idx_amp_conditions ON agent_memory_patterns USING GIN (conditions jsonb_path_ops);

COMMENT ON TABLE agent_memory_patterns IS
    'Learned patterns from approval/rejection decisions. Each row captures conditions + action + outcome. Used for confidence calibration and future proposal adjustment.';
COMMENT ON COLUMN agent_memory_patterns.weight IS
    'Pattern strength 0-1. Starts at 1.0, decays 0.05/week without reinforcement. Reinforcement resets to 1.0.';
COMMENT ON COLUMN agent_memory_patterns.conditions IS
    'JSONB snapshot of product state when action was proposed. Used for similarity matching against current state.';
```

---

## 7.5 agent_context_memories

Contextual knowledge learned from user answers to questions, comments on actions, and manual inputs. This is the agent's "institutional knowledge" -- things like business rules, product-specific constraints, seasonal patterns, and competitor intelligence that cannot be derived from metrics alone.

```sql
-- ============================================================
-- AGENT CONTEXT MEMORIES
-- Contextual knowledge from human inputs: question answers,
-- comments, and manual entries. The agent's "institutional
-- knowledge" that persists across runs.
-- Can be scoped to specific products, stages, or all products.
-- Supports expiration for time-limited context (e.g., seasonal).
-- ============================================================
CREATE TABLE agent_context_memories (
    id BIGSERIAL PRIMARY KEY,

    -- Which agent owns this memory
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id),

    -- What kind of context this is
    -- user_preference: operator preference (e.g., "I prefer conservative bid changes")
    -- business_rule: business constraint (e.g., "Never exceed $5 CPC on any keyword")
    -- product_specific: product-level knowledge (e.g., "This product is seasonal -- peak in Nov/Dec")
    -- seasonal: time-bound context (e.g., "Prime Day starts July 8")
    -- competitor: competitor intelligence (e.g., "Brand X launched a competing product at $19.99")
    context_type VARCHAR(20) NOT NULL CHECK (
        context_type IN (
            'user_preference',
            'business_rule',
            'product_specific',
            'seasonal',
            'competitor'
        )
    ),

    -- The knowledge itself, in natural language
    context_text TEXT NOT NULL,
    /*
      Examples:
      - "Operator prefers bid changes under 15% per adjustment"
      - "Never run discovery campaigns during Q4 -- budget is reserved for ranking keywords"
      - "This product's main competitor is Brand X SKU B07XXXXX, priced at $24.99"
      - "Product is seasonal: peak demand Nov 15 - Dec 31, shoulder season Oct 1 - Nov 14"
      - "Listing team is updating images next week -- hold off on listing quality flags"
    */

    -- Where this context came from
    -- question_answer: from an answered agent_question
    -- comment: from a comment on an action or product
    -- manual_input: manually entered by operator on agent detail page
    source VARCHAR(15) NOT NULL CHECK (
        source IN ('question_answer', 'comment', 'manual_input')
    ),

    -- Link to the source entity
    -- If source = 'question_answer': agent_questions.id
    -- If source = 'comment': comments.id
    -- If source = 'manual_input': NULL
    source_id BIGINT,

    -- Scope: which products does this context apply to?
    -- NULL = applies to ALL products for this brand/agent
    -- Array of product IDs = applies only to those products
    applies_to_products INT[],
    /*
      Examples:
      NULL -- "Never exceed $5 CPC" applies to all products
      {1, 3, 7} -- "Seasonal peak Nov-Dec" applies to products 1, 3, 7
      {5} -- "Competitor launched at $19.99" applies only to product 5
    */

    -- Scope: which lifecycle stages does this context apply to?
    -- NULL = applies to all stages
    applies_to_stages TEXT[],
    /*
      Examples:
      NULL -- "Conservative bids" applies to all stages
      {'LAUNCH'} -- "Aggressive TOS bidding" applies only to LAUNCH
      {'GROWTH', 'MAINTENANCE'} -- "Focus on profitability" applies to GROWTH and MAINTENANCE
    */

    -- Expiration: when does this context become stale?
    -- NULL = permanent (never expires)
    -- Timestamptz = expires at this time (agent ignores after expiry)
    expires_at TIMESTAMPTZ,
    -- Examples:
    --   NULL for "Never exceed $5 CPC" (permanent business rule)
    --   '2026-01-01' for "Prime Day peak July 8-10" (seasonal, set to expire after event)

    -- How confident the agent should be in this context
    -- 1.0 = fully confident (direct user statement)
    -- 0.5-0.9 = inferred from patterns or comments
    -- < 0.5 = weak signal, use as tiebreaker only
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0000
        CHECK (confidence > 0 AND confidence <= 1),

    -- Active flag (admin can deactivate without deleting)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_acm_agent ON agent_context_memories(agent_id);
CREATE INDEX idx_acm_product ON agent_context_memories(product_id);
CREATE INDEX idx_acm_type ON agent_context_memories(context_type);
CREATE INDEX idx_acm_source ON agent_context_memories(source);
CREATE INDEX idx_acm_active ON agent_context_memories(is_active)
    WHERE is_active = TRUE;

-- Find all active, non-expired context for a product
CREATE INDEX idx_acm_product_active ON agent_context_memories(product_id, context_type)
    WHERE is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW());

-- GIN index on applies_to_products array for containment queries
CREATE INDEX idx_acm_products_array ON agent_context_memories USING GIN (applies_to_products)
    WHERE applies_to_products IS NOT NULL;

-- GIN index on applies_to_stages array
CREATE INDEX idx_acm_stages_array ON agent_context_memories USING GIN (applies_to_stages)
    WHERE applies_to_stages IS NOT NULL;

-- Expiration cleanup: find expired contexts
CREATE INDEX idx_acm_expired ON agent_context_memories(expires_at)
    WHERE is_active = TRUE AND expires_at IS NOT NULL;

COMMENT ON TABLE agent_context_memories IS
    'Contextual knowledge from human inputs. Persists across runs. Scoped by product, stage, and expiration. The agent institutional knowledge layer.';
COMMENT ON COLUMN agent_context_memories.applies_to_products IS
    'INT array of product IDs this context applies to. NULL = all products for this brand.';
COMMENT ON COLUMN agent_context_memories.expires_at IS
    'NULL = permanent. Timestamptz = auto-ignored after this time. Use for seasonal or time-limited context.';
```

---

## 7.6 agent_outcome_memories

Tracked outcomes of executed actions. After an action is executed and its monitoring window ends, the impact assessment engine measures before/after metrics and writes the result here. Outcomes feed back into `agent_memory_patterns` to calibrate the agent's confidence and future proposals.

```sql
-- ============================================================
-- AGENT OUTCOME MEMORIES
-- Tracked outcomes of executed actions. Written by the impact
-- assessment engine after monitoring windows close (3/7/14 days).
-- Each row links a metric measurement to a pattern and execution.
-- Multiple rows per execution (one per metric measured).
-- Feeds back into agent_memory_patterns for confidence calibration.
-- ============================================================
CREATE TABLE agent_outcome_memories (
    id BIGSERIAL PRIMARY KEY,

    -- Which agent and which learned pattern
    agent_id BIGINT NOT NULL REFERENCES product_agents(id) ON DELETE CASCADE,
    pattern_id BIGINT NOT NULL REFERENCES agent_memory_patterns(id) ON DELETE CASCADE,

    -- Which action and execution this outcome measures
    action_item_id BIGINT NOT NULL REFERENCES action_recommendations(id) ON DELETE CASCADE,
    execution_id BIGINT NOT NULL REFERENCES action_executions(id) ON DELETE CASCADE,

    -- Which metric was measured
    metric_name VARCHAR(50) NOT NULL,
    /*
      Examples:
      'acos', 'roas', 'cpc', 'cvr', 'ctr',
      'impressions', 'clicks', 'spend', 'sales', 'orders',
      'organic_share_pct', 'was_pct', 'rank_position',
      'impression_share', 'tos_impression_share'
    */

    -- Before/after values
    metric_before NUMERIC(12,4) NOT NULL,
    metric_after NUMERIC(12,4) NOT NULL,

    -- How long after execution was this measured?
    measurement_window_days INT NOT NULL
        CHECK (measurement_window_days IN (3, 7, 14)),
    -- 3 = short-term (bid/placement changes)
    -- 7 = medium-term (budget changes, negatives)
    -- 14 = long-term (structural changes, campaign pauses)

    -- When the measurement was taken
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Was the outcome positive? (determined by impact assessment engine)
    -- Positive = metric moved in the desired direction
    --   For ACOS: decrease is positive
    --   For impressions, clicks, sales, orders: increase is positive
    --   For CVR, CTR: increase is positive
    --   For WAS%: decrease is positive
    outcome_positive BOOLEAN NOT NULL,

    -- Magnitude of impact (signed: negative = improvement for cost metrics)
    -- Percentage change: (after - before) / before * 100
    impact_magnitude NUMERIC(8,4) NOT NULL,
    /*
      Examples:
      -12.5 = ACOS decreased 12.5% (positive outcome)
      +25.0 = impressions increased 25% (positive outcome)
      +8.3 = ACOS increased 8.3% (negative outcome)
      -15.0 = clicks decreased 15% (negative outcome)
    */

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_aom_agent ON agent_outcome_memories(agent_id);
CREATE INDEX idx_aom_pattern ON agent_outcome_memories(pattern_id);
CREATE INDEX idx_aom_action ON agent_outcome_memories(action_item_id);
CREATE INDEX idx_aom_execution ON agent_outcome_memories(execution_id);
CREATE INDEX idx_aom_metric ON agent_outcome_memories(metric_name);
CREATE INDEX idx_aom_outcome ON agent_outcome_memories(outcome_positive);
CREATE INDEX idx_aom_measured ON agent_outcome_memories(measured_at DESC);
CREATE INDEX idx_aom_window ON agent_outcome_memories(measurement_window_days);

-- Composite: find all outcomes for a pattern (to calibrate confidence)
CREATE INDEX idx_aom_pattern_outcome ON agent_outcome_memories(pattern_id, outcome_positive, measured_at DESC);

-- Composite: find outcomes by agent and metric (for trend analysis)
CREATE INDEX idx_aom_agent_metric ON agent_outcome_memories(agent_id, metric_name, measured_at DESC);

COMMENT ON TABLE agent_outcome_memories IS
    'Outcome measurements for executed actions. One row per metric per measurement window. Feeds back into patterns for confidence calibration.';
COMMENT ON COLUMN agent_outcome_memories.measurement_window_days IS
    'Days after execution when measured. 3 = short-term (bids), 7 = medium-term (budgets), 14 = long-term (structural).';
COMMENT ON COLUMN agent_outcome_memories.impact_magnitude IS
    'Signed % change. Negative values are improvements for cost metrics (ACOS, CPC). Positive values are improvements for volume metrics (impressions, clicks).';
```

---

## 7.7 ALTER TABLE Statements for Existing Tables

These statements connect existing tables to the new agent system.

```sql
-- ============================================================
-- ALTER: action_recommendations
-- Link actions to the agent that proposed them
-- ============================================================
ALTER TABLE action_recommendations
    ADD COLUMN agent_id BIGINT REFERENCES product_agents(id),
    ADD COLUMN agent_run_id BIGINT REFERENCES agent_runs(id),
    ADD COLUMN agent_confidence_at_proposal NUMERIC(5,2);
    -- Snapshot of agent confidence when this action was proposed.
    -- Used for historical analysis: "Was the agent confident when it proposed this?"

COMMENT ON COLUMN action_recommendations.agent_id IS
    'The agent that proposed this action. NULL for pre-agent actions.';
COMMENT ON COLUMN action_recommendations.agent_run_id IS
    'The specific agent run that produced this action.';
COMMENT ON COLUMN action_recommendations.agent_confidence_at_proposal IS
    'Agent confidence score at time of proposal. Snapshot for historical analysis.';

CREATE INDEX idx_ar_agent_id ON action_recommendations(agent_id)
    WHERE agent_id IS NOT NULL;
CREATE INDEX idx_ar_agent_run ON action_recommendations(agent_run_id)
    WHERE agent_run_id IS NOT NULL;

-- ============================================================
-- ALTER: daily_action_plans
-- Link plans to the agent run that generated them
-- ============================================================
ALTER TABLE daily_action_plans
    ADD COLUMN agent_id BIGINT REFERENCES product_agents(id),
    ADD COLUMN agent_run_id BIGINT REFERENCES agent_runs(id),
    ADD COLUMN questions_pending INT NOT NULL DEFAULT 0;

CREATE INDEX idx_dap_agent ON daily_action_plans(agent_id)
    WHERE agent_id IS NOT NULL;

-- ============================================================
-- ALTER: activity_log
-- Add agent event types for the Activity Log
-- ============================================================
-- No schema change needed -- activity_log already supports flexible event_type VARCHAR.
-- New event_type values for agent system:
--   'agent_run_started', 'agent_run_completed', 'agent_run_failed',
--   'agent_question_asked', 'agent_question_answered',
--   'agent_paused', 'agent_resumed',
--   'agent_confidence_changed', 'agent_auto_approved',
--   'agent_memory_created', 'agent_memory_decayed'
-- The entity_type column uses: 'agent', 'agent_question', 'agent_memory'
-- The entity_id column references product_agents.id, agent_questions.id, etc.

-- ============================================================
-- ALTER: daily_email_log
-- Add agent-related email types
-- ============================================================
-- Extend the email_type CHECK constraint to include agent email types
ALTER TABLE daily_email_log
    DROP CONSTRAINT IF EXISTS daily_email_log_email_type_check;

ALTER TABLE daily_email_log
    ADD CONSTRAINT daily_email_log_email_type_check CHECK (
        email_type IN (
            'daily_digest',
            'critical_alert',
            'approval_reminder',
            'approval_decision',
            'eod_summary',
            'weekly_report',
            'violation_report',
            'system_alert',
            'agent_question',
            'agent_status_update'
        )
    );

-- Add agent question count to daily email log
ALTER TABLE daily_email_log
    ADD COLUMN questions_pending_count INT NOT NULL DEFAULT 0;
```

---

## 7.8 Entity Relationship Diagram (Agent Tables)

```
products (existing)
    │
    └──► product_agents (1:1 -- one agent per product)
             │
             ├──► agent_runs (1:N -- one agent, many runs)
             │        │
             │        ├──► agent_questions (1:N -- one run, many questions)
             │        │        │
             │        │        └──► agent_context_memories (via source_id)
             │        │
             │        └──► action_recommendations (via agent_run_id)
             │                 │
             │                 ├──► action_approvals (existing, 1:N)
             │                 │        │
             │                 │        └──► action_executions (existing, 1:1)
             │                 │
             │                 └──► agent_memory_patterns (via source_action_id)
             │                          │
             │                          └──► agent_outcome_memories (1:N per pattern)
             │
             ├──► agent_memory_patterns (1:N -- one agent, many patterns)
             │
             └──► agent_context_memories (1:N -- one agent, many contexts)
```

---

## 7.9 Complete Table Count

After these additions, the PMP Systems database contains:

| Layer | Tables | New in This Doc |
|-------|--------|-----------------|
| Raw ingestion | 4 | 0 |
| Core entities | 6 | 0 |
| Root/Syntax mapping | 5 | 0 |
| Cleaned metrics | 4 | 0 |
| Aggregation | 5 | 0 |
| Settings/system | 3 | 0 |
| Action plan | 10 | 0 |
| Approval workflow | 1 | 0 |
| Execution tracking | 1 | 0 |
| Violations | 1 | 0 |
| Alerts | 1 | 0 |
| Email | 1 | 0 |
| **Agent core** | **2** | **product_agents, agent_runs** |
| **Agent questions** | **1** | **agent_questions** |
| **Agent memory** | **3** | **agent_memory_patterns, agent_context_memories, agent_outcome_memories** |
| **Total** | **~48** | **6 new + 3 ALTERs** |

---
---

# PART 8 -- AGENT SYSTEM BUILD RECOMMENDATION

---

## 8.1 Phase 1 (MVP) -- Agent Framework

**Duration:** 3-4 weeks
**Goal:** Wrap the existing Action Plan Engine in an agent abstraction. Every product gets an agent. Agents run on schedule, propose actions, and display status. No questions, no learning, no auto-approve -- just the framework.

### What to Build

| Component | Description | Priority |
|-----------|-------------|----------|
| **DB Migrations** | Create `product_agents` and `agent_runs` tables. ALTER `action_recommendations` and `daily_action_plans` to add agent columns. Seed one agent per existing product. | P0 |
| **Agent Auto-Creation** | Trigger on `products` table: INSERT creates a `product_agents` row. Backfill existing products. | P0 |
| **Agent Scheduler** | BullMQ recurring job: queries `product_agents` where `next_scheduled_run <= NOW()` and `is_active = TRUE` and `agent_status != 'PAUSED'`. Enqueues agent runs. | P0 |
| **Agent Run Orchestrator** | Service: creates `agent_runs` row, calls existing Action Plan Engine (stages 1-6), captures stage results in `stages_completed` JSONB, updates agent status through lifecycle (IDLE -> RUNNING -> ANALYZING -> RECOMMENDING -> WAITING_FOR_APPROVAL -> COMPLETED). | P0 |
| **Agent Status Tracking** | Update `product_agents.agent_status` in real-time as the run progresses. Calculate `approval_rate` after each approval decision. Update `last_run_at` and `next_scheduled_run` after completion. | P0 |
| **Agents List Page** | `/app/agents` page: table of all agents with columns: product name, brand, stage, agent status, confidence score, last run, next run, actions proposed/approved/rejected. Status badges (color-coded). Filter by brand, stage, status. | P0 |
| **Agent Detail Page** | `/app/agents/:id` page: agent overview card (status, confidence, counters), recent runs list with stage completion indicators, list of proposed actions from latest run. "Run Now" button. "Pause/Resume" button. | P1 |
| **Agent Events in Activity Log** | Log agent lifecycle events to `activity_log`: run started, run completed, run failed, agent paused, agent resumed. Use `entity_type = 'agent'`. | P1 |
| **Agent Status in Nav** | Sidebar badge showing count of agents in WAITING_FOR_APPROVAL or NEEDS_CLARIFICATION state. | P1 |

### Deliverables

1. DB migration: `product_agents` + `agent_runs` tables + ALTER statements
2. `AgentSchedulerJob` -- BullMQ cron (runs every 5 minutes, checks for due agents)
3. `AgentRunOrchestrator` service (wraps Action Plan Engine)
4. `/api/agents` -- CRUD endpoints (list, get, pause, resume, run-now)
5. `/api/agents/:id/runs` -- List runs for an agent
6. `/app/agents` -- Agents List page (Next.js)
7. `/app/agents/:id` -- Agent Detail page (Next.js)
8. Activity log integration (6 new event types)
9. Backfill script: create agents for all existing products

### What This Phase Does NOT Include

- No agent questions (Phase 2)
- No learning or memory (Phase 3)
- No auto-approve based on confidence (Phase 3)
- No outcome tracking (Phase 3)
- Agents are a wrapper -- the Action Plan Engine does all the thinking

---

## 8.2 Phase 2 -- Questions + Enhanced Approval

**Duration:** 3-4 weeks
**Goal:** Agents can ask questions when they encounter ambiguity. Questions appear in-app and via email. Answers unblock analysis. Basic confidence scoring (approval-rate based) begins influencing approval routing.

### What to Build

| Component | Description | Priority |
|-----------|-------------|----------|
| **DB Migration** | Create `agent_questions` table. | P0 |
| **Question Detection Engine** | Extension to Action Plan Engine: at each pipeline stage, check for ambiguity conditions (conflicting signals, missing data, stage uncertainty). Generate `agent_questions` rows with appropriate priority. | P0 |
| **Question Blocking Logic** | BLOCKING questions set `agent_runs.status = 'blocked'` and `product_agents.agent_status = 'NEEDS_CLARIFICATION'`. IMPORTANT questions hold specific `action_recommendations` without blocking the run. INFORMATIONAL questions are logged but do not block. | P0 |
| **Question UI (In-App)** | Question queue page: `/app/agents/questions`. Filterable by priority, status, product, question type. Inline answer form (text, number, boolean, select, date). | P0 |
| **Question UI (Agent Detail)** | Agent detail page: "Questions" tab showing all open questions for this agent. Answer directly from agent context. | P0 |
| **Question Email Notification** | When a BLOCKING or IMPORTANT question is raised, send email via Resend with question text, evidence summary, and one-click answer link (for boolean/select types). | P1 |
| **Answer Processing** | When a question is answered: update `agent_questions.status = 'ANSWERED'`, create `agent_context_memories` entry from the answer, if BLOCKING -> trigger `question_answered` re-run of the agent. | P0 |
| **Question Expiration** | BullMQ job: check for questions past `expires_at`. BLOCKING: 48h. IMPORTANT: 72h. INFORMATIONAL: 7d. Expired questions set `status = 'EXPIRED'`. BLOCKING expired questions unblock the run (agent proceeds with best guess). | P1 |
| **Confidence Scoring (Basic)** | Calculate `confidence_score` from `approval_rate`: `confidence = 30 + (approval_rate * 0.70)`. Range: 30 (0% approval) to 100 (100% approval). Updated after each approval decision. | P0 |
| **Confidence-Based Approval Routing** | Confidence affects approval tier thresholds. High confidence (>80): more actions qualify for AUTO approval (expand auto-approve rules). Low confidence (<40): all actions require MANAGER approval regardless of risk score. | P1 |
| **Agent Status in Daily Email** | Add "Agent Status" section to daily digest email: agents needing attention (NEEDS_CLARIFICATION, PAUSED), open question count, confidence trend (up/down/stable). | P1 |

### Deliverables

1. DB migration: `agent_questions` table
2. `QuestionDetectionEngine` service (hooks into pipeline stages)
3. `QuestionBlockingService` (manages blocked runs and held actions)
4. `/api/agents/questions` -- CRUD + answer endpoints
5. `/app/agents/questions` -- Question Queue page
6. Agent Detail page: Questions tab
7. Email template: `agent-question.tsx`
8. `QuestionExpirationJob` -- BullMQ cron (hourly)
9. `ConfidenceCalculator` service (approval-rate based)
10. Updated auto-approve rules engine (confidence-aware thresholds)
11. Daily digest email: Agent Status section

---

## 8.3 Phase 3 -- Learning + Feedback

**Duration:** 4-5 weeks
**Goal:** Agents learn from decisions and outcomes. Three-layer memory system (patterns, context, outcomes). Confidence calibration from real outcomes. Auto-approve eligibility for high-confidence agents. Safety controls (decay, framework override, reset).

### What to Build

| Component | Description | Priority |
|-----------|-------------|----------|
| **DB Migration** | Create `agent_memory_patterns`, `agent_context_memories`, `agent_outcome_memories` tables. | P0 |
| **Pattern Memory from Approvals** | On every approval/rejection/modification: extract conditions from the action's context (quadrant, root cause, stage, gate status, campaign objective, metric ranges). Create or update `agent_memory_patterns` row. If pattern already exists (same conditions + action_type), increment `occurrence_count` and reset `weight` to 1.0. | P0 |
| **Pattern Memory from Rejections** | On rejection: record `rejection_reason`. On modification: record `modification_details`. These inform future proposals -- the agent adjusts magnitude or avoids the action entirely. | P0 |
| **Context Memory from Questions** | When a question is answered, create `agent_context_memories` entry with `source = 'question_answer'`. Set scope (`applies_to_products`, `applies_to_stages`) based on question context. | P0 |
| **Context Memory from Comments** | When a comment is added to an action or product, evaluate if it contains actionable context. If yes, create `agent_context_memories` entry with `source = 'comment'`. | P1 |
| **Outcome Tracking (3/7/14 Day Windows)** | After an action's monitoring window closes, measure before/after metrics. Write one `agent_outcome_memories` row per metric. Update the linked `agent_memory_patterns` row with `last_outcome_positive` and `last_outcome_impact`. | P0 |
| **Confidence Calibration from Outcomes** | Replace basic confidence formula with outcome-weighted calculation: `confidence = (approval_weight * approval_rate + outcome_weight * positive_outcome_rate) / (approval_weight + outcome_weight)`. Weights: approval=0.4, outcome=0.6. Calibrated from real results, not just human agreement. | P0 |
| **Memory Display on Agent Detail** | Agent Detail page: "Memory" tab with three sub-sections: Patterns (table of learned patterns with weight, occurrence count, last outcome), Context (list of contextual knowledge with type, scope, expiration), Outcomes (recent outcome measurements with before/after charts). | P1 |
| **Memory Editing (Admin)** | Admin controls on Memory tab: deactivate a context memory, reset a pattern's weight, bulk-clear all patterns for an agent. Requires confirmation modal. All edits logged to `activity_log`. | P1 |
| **Weight Decay** | BullMQ weekly job: for all `agent_memory_patterns` where `last_updated` > 7 days ago and no new reinforcement, decay `weight` by 0.05. Patterns with `weight` < 0.10 are soft-deleted (flagged but retained for audit). | P1 |
| **Framework Override** | Safety control: the Action Plan Engine's framework rules (gate logic, quadrant mapping, SOP compliance) ALWAYS override agent memory. If memory says "approve bid increase" but gate status is BOTH_FAIL, the framework vetoes the action. Memory informs confidence, never overrides rules. | P0 |
| **Memory Reset** | Admin action: "Reset Agent Memory" button on agent detail page. Clears all patterns and outcomes for an agent. Resets confidence to 50.00. Context memories are preserved (they are human knowledge, not learned). | P1 |
| **Auto-Approve Eligibility** | Agents with `approval_rate >= 85%` AND `confidence_score >= 80` AND `positive_outcome_rate >= 70%` are eligible for expanded auto-approve. Configurable thresholds in `system_settings`. Auto-approve expands to include medium-risk actions (risk_score 31-60) that match high-weight approved patterns. | P0 |
| **Auto-Approve Safety Limits** | Maximum auto-approved actions per run: 10 (configurable). Maximum bid change via auto-approve: 25% (configurable). Maximum budget change via auto-approve: $75/day (configurable). Any action exceeding limits requires human approval regardless of confidence. | P0 |

### Deliverables

1. DB migration: 3 memory tables
2. `PatternLearningService` (creates/updates patterns from approval decisions)
3. `ContextLearningService` (creates context memories from questions and comments)
4. `OutcomeTrackingService` (measures 3/7/14 day outcomes)
5. `ConfidenceCalibrationService` (outcome-weighted confidence calculation)
6. `MemoryDecayJob` -- BullMQ cron (weekly)
7. `AutoApproveEligibilityChecker` service
8. Agent Detail page: Memory tab (patterns, context, outcomes)
9. Admin controls: memory editing, reset, deactivation
10. Updated Action Plan Engine: memory-informed proposal adjustment
11. Updated auto-approve rules: confidence-aware + pattern-matching
12. System settings: auto-approve thresholds, safety limits

---

## 8.4 Dependencies

### Phase 1 Prerequisites (Must Exist Before Starting)

| Dependency | Source | Status Required |
|------------|--------|-----------------|
| `products` table with active products | `PMP_SYSTEMS_ARCHITECTURE.md` | Deployed |
| `brands` table | `PMP_SYSTEMS_ARCHITECTURE.md` | Deployed |
| Action Plan Engine (stages 1-6) | `ACTION_PLAN_ENGINE.md` | Functional |
| `action_recommendations` table | `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` | Deployed |
| `daily_action_plans` table | `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` | Deployed |
| `action_approvals` table | `DATA_MODEL_AND_BUILD_PLAN.md` | Deployed |
| `activity_log` table | `SYSTEM_EXPANSION_V3.md` | Deployed |
| BullMQ infrastructure (Redis + workers) | `PMP_SYSTEMS_ARCHITECTURE.md` | Running |
| Approval Queue UI | `DATA_MODEL_AND_BUILD_PLAN.md` Phase 1 | Deployed |

### Phase 2 Prerequisites (Must Exist Before Starting)

| Dependency | Source | Status Required |
|------------|--------|-----------------|
| Phase 1 agent framework | This document | Deployed and stable (2+ weeks in production) |
| Email automation (Resend) | `DATA_MODEL_AND_BUILD_PLAN.md` | Functional |
| `daily_email_log` table | `DATA_MODEL_AND_BUILD_PLAN.md` | Deployed |
| Auto-approve rules engine | `DATA_MODEL_AND_BUILD_PLAN.md` Phase 1 | Functional |
| `comments` table | `SYSTEM_EXPANSION_V3.md` | Deployed |

### Phase 3 Prerequisites (Must Exist Before Starting)

| Dependency | Source | Status Required |
|------------|--------|-----------------|
| Phase 2 question system | This document | Deployed and stable (2+ weeks in production) |
| `action_executions` table | `DATA_MODEL_AND_BUILD_PLAN.md` | Deployed |
| Impact assessment engine | `DATA_MODEL_AND_BUILD_PLAN.md` Phase 2 | Functional |
| Monitoring window enforcement | `DATA_MODEL_AND_BUILD_PLAN.md` Phase 3 | Functional |
| Sufficient approval history | -- | Minimum 50 approval decisions per agent |
| Sufficient execution history | -- | Minimum 20 executed actions with completed monitoring windows |

### Cross-Phase Dependency Map

```
DATA_MODEL Phase 1 (Approval + Email)
    │
    └──► DATA_MODEL Phase 2 (Full Compliance)
              │
              └──► DATA_MODEL Phase 3 (Auto-Execution)
                        │
                        ├──► AGENT Phase 1 (Framework)
                        │         │
                        │         └──► AGENT Phase 2 (Questions)
                        │                   │
                        │                   └──► AGENT Phase 3 (Learning)
                        │
                        └── (parallel development possible for Agent Phase 1
                             alongside Data Model Phase 3, sharing the same
                             action_recommendations and approval tables)
```

**Earliest Start:** Agent Phase 1 can begin as soon as Data Model Phase 1 (approval workflow) is deployed. The Action Plan Engine must be functional. Agent Phases 2 and 3 stack sequentially with stabilization gaps between each.

---

## 8.5 Risk Assessment

### Risk 1: Confidence Score Gaming / Miscalibration

**Description:** The confidence score could become misleading if the operator approves everything without reviewing (inflating approval_rate) or if outcomes are measured on too short a window (missing delayed effects). A miscalibrated confidence score leads to premature auto-approve, which leads to bad actions executed without human review.

**Likelihood:** HIGH
**Impact:** HIGH (bad actions executed automatically, revenue loss, wasted ad spend)

**Mitigations:**
1. Auto-approve safety limits (max 10 actions/run, max 25% bid change, max $75 budget change) act as hard guardrails regardless of confidence.
2. Require BOTH high approval_rate AND high positive_outcome_rate for auto-approve eligibility. Rubber-stamping approvals without positive outcomes will not unlock auto-approve.
3. Confidence decay: if outcome data stops flowing (e.g., execution pipeline breaks), confidence decays toward 50.00 over 4 weeks.
4. Framework override: gate logic, SOP compliance, and quadrant rules always supersede memory-based confidence.
5. Admin "kill switch": any operator can pause an agent or reset its memory at any time.

### Risk 2: Question Fatigue

**Description:** If agents raise too many questions, operators will stop answering them. Unanswered BLOCKING questions stall the pipeline, creating a backlog of blocked agents. The system becomes less useful than the pre-agent manual workflow.

**Likelihood:** MEDIUM
**Impact:** HIGH (agents become useless if blocked, operator frustration)

**Mitigations:**
1. Question budget: maximum 3 BLOCKING questions per agent per run. Maximum 5 total questions (all priorities) per run. Excess questions are downgraded to INFORMATIONAL.
2. Question expiration: BLOCKING questions expire after 48 hours. On expiry, the agent proceeds with its best guess and logs the assumption. The operator can correct later.
3. Auto-resolution: if the data that triggered the question appears in the next ETL cycle (e.g., missing COGS data is added), the question auto-resolves without human input.
4. Context memory reduces repeat questions: once a question is answered, the answer is stored as context memory. The agent will not ask the same type of question for the same product again unless conditions change significantly.
5. Question metrics in daily email: track question response rate. If response rate drops below 60% for 7 consecutive days, alert the operator and suggest reducing question sensitivity.

### Risk 3: Memory Accumulation and Stale Patterns

**Description:** Over months of operation, the memory tables accumulate thousands of patterns. Old patterns may reflect outdated market conditions, discontinued campaigns, or superseded business rules. Stale patterns can cause the agent to propose actions based on conditions that no longer exist.

**Likelihood:** MEDIUM
**Impact:** MEDIUM (suboptimal actions proposed, not catastrophic due to framework override)

**Mitigations:**
1. Weight decay: patterns lose 0.05 weight per week without reinforcement. After 20 weeks of inactivity, a pattern's weight drops to 0.0 and it is soft-deleted.
2. Context memory expiration: seasonal and time-limited contexts have explicit `expires_at` dates. Expired contexts are automatically ignored.
3. Outcome-based pruning: patterns with `occurrence_count >= 5` AND `last_outcome_positive = FALSE` for the last 3 consecutive outcomes are flagged for admin review.
4. Memory reset capability: admin can reset all learned patterns for an agent, returning it to the 50.00 confidence baseline. Context memories (human knowledge) are preserved.
5. Engine version tracking: when `engine_version` changes (pipeline logic update), all patterns created under the previous version are marked with a `legacy_engine` flag and their weight is halved. This prevents old engine logic from influencing new engine decisions.

---

## 8.6 Timeline Summary

```
AGENT PHASE 1 (MVP Framework)              3-4 weeks
    ├── DB migrations + backfill            Week 1
    ├── Agent scheduler + orchestrator      Week 1-2
    ├── Agent list + detail pages           Week 2-3
    └── Activity log + nav integration      Week 3-4

    ─── 2 week stabilization gap ───

AGENT PHASE 2 (Questions + Approval)        3-4 weeks
    ├── Question detection + blocking        Week 1-2
    ├── Question UI (in-app + email)         Week 2-3
    ├── Answer processing + re-analysis      Week 2-3
    ├── Confidence scoring (basic)           Week 3
    └── Confidence-based routing + email     Week 3-4

    ─── 2 week stabilization gap ───

AGENT PHASE 3 (Learning + Feedback)          4-5 weeks
    ├── Pattern memory from approvals        Week 1-2
    ├── Context memory from questions        Week 1-2
    ├── Outcome tracking (3/7/14 day)        Week 2-3
    ├── Confidence calibration               Week 3
    ├── Memory UI + admin controls           Week 3-4
    ├── Auto-approve eligibility             Week 4
    └── Safety controls + decay              Week 4-5

TOTAL: 10-13 weeks + 4 weeks stabilization = 14-17 weeks
```
