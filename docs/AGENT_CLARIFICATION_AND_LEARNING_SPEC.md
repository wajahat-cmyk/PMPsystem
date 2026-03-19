# PMP SYSTEMS — AGENT CLARIFICATION LOOP & LEARNING SYSTEM
## Part 5: Clarification/Question Loop | Part 6: Learning/Feedback System

### Companion Files
- `PMP_SYSTEMS_ARCHITECTURE.md` — Core system (data model, tech stack, 7 original modules)
- `ACTION_PLAN_ENGINE.md` — 8-stage Action Plan Engine (Gate -> Checklist)
- `GATE_LOGIC_AND_ACTION_MAPPING.md` — Gate logic + diagnostic-to-action mapping
- `EMAIL_APPROVAL_DEPLOYMENT_SPEC.md` — Daily email, approval workflow, deployment gating
- `DATA_MODEL_AND_BUILD_PLAN.md` — Data model additions + build roadmap
- `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` — Daily plans, action recommendations, checklists

---

# PART 5 — CLARIFICATION / QUESTION LOOP

Product Agents operate autonomously through the Action Plan Engine pipeline (gates, stage, diagnostic, root cause, actions) but they are NOT omniscient. When the data is incomplete, ambiguous, or conflicting, the agent must STOP and ask rather than guess. This part specifies when agents ask, what they ask, how operators answer, and how answers flow back into the pipeline.

---

## 5.1 When Agents Enter NEEDS_CLARIFICATION State

An agent transitions from ANALYZING to NEEDS_CLARIFICATION when it encounters any of the following seven trigger categories. Each trigger maps to a specific pipeline stage that becomes blocked.

| # | Trigger Category | Blocked Pipeline Stage | Example |
|---|-----------------|----------------------|---------|
| 1 | **Missing data** | Gate Evaluation (Stage 1) | COGS not entered — cannot calculate BE ACOS — profitability gate returns UNKNOWN |
| 2 | **Ambiguous context** | Root Cause Analysis (Stage 4) | Deal is running but deal type/dates not configured — agent cannot determine if ACOS spike is deal-driven or organic |
| 3 | **Conflicting signals** | Action Generation (Stage 5) | Profitability gate says "don't scale" but inventory is 90+ days with declining velocity — agent needs human judgment on maintain vs. reduce |
| 4 | **External dependency** | Action Generation (Stage 5) | Agent detects indexing issue (Root Cause: INDEXING) but doesn't know if listing team has already been notified |
| 5 | **Stage uncertainty** | Stage Classification (Stage 2) | Product metrics suggest Growth to Maintenance transition but CM3 data is missing — agent cannot confirm stage change |
| 6 | **Competitor context** | Root Cause Analysis (Stage 4) | New competitor detected via SQP data but agent doesn't know if this is a known private-label variant or a genuinely new entrant |
| 7 | **Campaign classification** | Diagnostic (Stage 3) | Campaign name does not parse to a recognized objective — agent cannot route the syntax through the correct diagnostic threshold set |

### 5.1.1 State Transition Diagram

```
IDLE
  │
  ├── ETL triggers pipeline ──> ANALYZING
  │                                │
  │                 ┌──────────────┼──────────────────┐
  │                 │              │                   │
  │                 ▼              ▼                   ▼
  │          Pipeline stage    Pipeline stage    Pipeline completes
  │          encounters        encounters        without issues
  │          BLOCKING gap      IMPORTANT gap          │
  │                │              │                    │
  │                ▼              ▼                    ▼
  │     NEEDS_CLARIFICATION   Agent continues    PROPOSING
  │     (pipeline paused)     with reduced       (actions generated)
  │            │              confidence              │
  │            │              + logs IMPORTANT        │
  │            │              question                │
  │            ▼                                      ▼
  │     Question posted ──> Operator answers    Normal approval flow
  │            │
  │            ▼
  │     ANALYZING (re-enters pipeline
  │              at blocked stage)
  │            │
  │            ▼
  │     PROPOSING (actions generated)
```

### 5.1.2 Pipeline Behavior During NEEDS_CLARIFICATION

When an agent enters NEEDS_CLARIFICATION:

1. **Completed stages are cached.** If the agent blocked at Stage 4 (Root Cause), Stages 1-3 results are preserved. When the answer arrives, the pipeline resumes from Stage 4 — it does NOT re-run Stages 1-3 unless the answer invalidates an upstream result (e.g., a COGS answer changes the profitability gate).

2. **Non-blocked syntaxes continue.** If only one syntax triggered the question, the agent completes the pipeline for all other syntaxes. The blocked syntax gets a `status: WAITING_CLARIFICATION` in the plan output.

3. **Multiple questions are batched.** If the agent encounters multiple gaps during a single pipeline run, all questions are posted simultaneously rather than one at a time. This prevents drip-feeding questions to the operator.

4. **Daily re-check.** If a question remains OPEN, the next day's pipeline run re-evaluates whether the question is still relevant. If new data resolved the ambiguity (e.g., COGS was entered mid-day), the question is auto-closed with status AUTO_RESOLVED.

---

## 5.2 Question Data Structure

### 5.2.1 Database Table: `agent_questions`

```sql
-- ============================================================
-- AGENT QUESTIONS
-- Tracks every question an agent posts to operators.
-- Questions are tied to a specific product agent and optionally
-- to a specific blocked action or pipeline stage.
-- ============================================================
CREATE TABLE agent_questions (
    id BIGSERIAL PRIMARY KEY,

    -- Which agent is asking
    agent_id VARCHAR(50) NOT NULL,          -- e.g., 'agent_bamboo_sheets'
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Question content
    question_text TEXT NOT NULL,             -- Human-readable question shown to operator
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

    -- What input the agent needs
    required_input_type VARCHAR(10) NOT NULL CHECK (
        required_input_type IN ('text', 'number', 'boolean', 'select', 'date')
    ),
    options JSONB,                           -- For 'select' type: ["Ranking", "Discovery", "Defensive"]
                                             -- NULL for free-form input types

    -- What is blocked
    blocking_action_id BIGINT REFERENCES action_recommendations(id) ON DELETE SET NULL,
    blocking_stage VARCHAR(50) NOT NULL,     -- Pipeline stage name: 'gate_evaluation', 'stage_classification',
                                             -- 'diagnostic', 'root_cause', 'action_generation'
    evidence JSONB NOT NULL DEFAULT '[]',    -- Array of { metric, value, issue } objects providing context
    /*
      Example:
      [
        { "metric": "acos_7d", "value": 0.48, "issue": "Exceeds BE ACOS of 0.30" },
        { "metric": "days_of_stock", "value": 92, "issue": "Over 90-day threshold" },
        { "metric": "velocity_wow_change", "value": -0.18, "issue": "Declining 18% WoW" }
      ]
    */

    -- Priority
    priority VARCHAR(15) NOT NULL DEFAULT 'IMPORTANT' CHECK (
        priority IN ('BLOCKING', 'IMPORTANT', 'INFORMATIONAL')
    ),
    -- BLOCKING:       Agent cannot proceed without answer. Pipeline paused for this product.
    -- IMPORTANT:      Agent can proceed with reduced confidence. Answer improves recommendation quality.
    -- INFORMATIONAL:  Agent proceeds normally. Answer stored for future accuracy improvement.

    -- Status lifecycle
    status VARCHAR(15) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'ANSWERED', 'EXPIRED', 'AUTO_RESOLVED')
    ),

    -- Timestamps
    asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,         -- Computed from priority on creation

    -- Answer
    answered_by VARCHAR(100),                -- User who answered (NULL until answered)
    answer_value TEXT,                        -- The operator's response
    answer_source VARCHAR(20) CHECK (
        answer_source IN ('in_app', 'email', 'api') OR answer_source IS NULL
    ),

    -- Plan linkage
    plan_date DATE NOT NULL,                 -- Which daily plan triggered this question

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_questions_product ON agent_questions(product_id);
CREATE INDEX idx_agent_questions_status ON agent_questions(status);
CREATE INDEX idx_agent_questions_agent_status ON agent_questions(agent_id, status);
CREATE INDEX idx_agent_questions_priority_open ON agent_questions(priority) WHERE status = 'OPEN';
CREATE INDEX idx_agent_questions_plan_date ON agent_questions(plan_date);
```

### 5.2.2 TypeScript Interface

```typescript
interface AgentQuestion {
  id: string;
  agent_id: string;
  product_id: number;

  // Question content
  question_text: string;
  question_type:
    | 'missing_data'
    | 'ambiguous_context'
    | 'conflicting_signals'
    | 'external_dependency'
    | 'stage_uncertainty'
    | 'competitor_context'
    | 'campaign_classification';

  // What the agent needs
  required_input_type: 'text' | 'number' | 'boolean' | 'select' | 'date';
  options: string[] | null;

  // Context
  blocking_action_id: string | null;
  blocking_stage: string;
  evidence: { metric: string; value: any; issue: string }[];

  // Status
  status: 'OPEN' | 'ANSWERED' | 'EXPIRED' | 'AUTO_RESOLVED';
  asked_at: Date;
  answered_at: Date | null;
  answered_by: string | null;
  answer_value: string | null;
  answer_source: 'in_app' | 'email' | 'api' | null;

  // Priority
  priority: 'BLOCKING' | 'IMPORTANT' | 'INFORMATIONAL';

  // Expiration
  expires_at: Date;

  // Plan linkage
  plan_date: string;
}
```

### 5.2.3 Expiration Rules

Expiration is computed at question creation time based on priority:

| Priority | TTL | Conservative Default When Expired |
|----------|-----|-----------------------------------|
| BLOCKING | 72 hours | Agent proceeds with the safest action: reduce or maintain spend. NEVER scale. |
| IMPORTANT | 7 days | Agent proceeds with reduced confidence flag on the affected recommendation. |
| INFORMATIONAL | 14 days | Auto-close. No impact on current pipeline. Answer would have improved future runs. |

Expiration is checked by a cron job (`QuestionExpirationJob`) running every hour. When a question expires:

```typescript
// Pseudocode: QuestionExpirationJob
async function expireQuestions(): Promise<void> {
  const expired = await db.agent_questions.findMany({
    where: { status: 'OPEN', expires_at: { lte: new Date() } }
  });

  for (const q of expired) {
    await db.agent_questions.update({
      where: { id: q.id },
      data: { status: 'EXPIRED', updated_at: new Date() }
    });

    // Log to activity log
    await logActivity({
      type: 'agent_question_expired',
      product_id: q.product_id,
      agent_id: q.agent_id,
      metadata: {
        question_id: q.id,
        priority: q.priority,
        question_type: q.question_type,
        age_hours: differenceInHours(new Date(), q.asked_at)
      }
    });

    // If BLOCKING, trigger agent to resume with conservative default
    if (q.priority === 'BLOCKING') {
      await agentService.resumeWithConservativeDefault(q.agent_id, q.id);
    }
  }
}
```

---

## 5.3 Question Generation Logic

### 5.3.1 When the Pipeline Generates Questions

Each pipeline stage has specific checkpoints that emit questions. The engine does NOT generate free-form questions. Every question follows a template tied to its trigger category.

**Stage 1 — Gate Evaluation:**

```typescript
// Missing COGS
if (!product.cogs || product.cogs === 0) {
  emit({
    question_type: 'missing_data',
    question_text: `COGS is not set for ${product.name}. I cannot calculate the break-even ACOS or evaluate the profitability gate. What is the current COGS (landed cost per unit in USD)?`,
    required_input_type: 'number',
    blocking_stage: 'gate_evaluation',
    priority: 'BLOCKING',
    evidence: [
      { metric: 'cogs', value: null, issue: 'Not configured in product settings' },
      { metric: 'profitability_gate', value: 'UNKNOWN', issue: 'Cannot evaluate without COGS' }
    ]
  });
}

// Missing Amazon fees
if (!product.fba_fees && !product.fba_fee_override) {
  emit({
    question_type: 'missing_data',
    question_text: `FBA fees are unavailable for ${product.name}. Neither the SP-API fee estimate nor a manual override is set. What is the estimated FBA fee per unit (fulfillment + referral)?`,
    required_input_type: 'number',
    blocking_stage: 'gate_evaluation',
    priority: 'BLOCKING',
    evidence: [
      { metric: 'fba_fees', value: null, issue: 'SP-API returned no data' },
      { metric: 'fba_fee_override', value: null, issue: 'No manual override set' }
    ]
  });
}
```

**Stage 2 — Stage Classification:**

```typescript
// CM3 data missing during potential stage transition
if (stageIndicators.suggestsTransition('GROWTH', 'MAINTENANCE') && !product.cm3_status) {
  emit({
    question_type: 'stage_uncertainty',
    question_text: `${product.name} appears ready for Maintenance stage (organic share ${product.organic_share_pct}%, launched ${daysSinceLaunch} days ago), but CM3 profitability data is missing. Should I classify this product as MAINTENANCE or keep it in GROWTH until CM3 data is available?`,
    required_input_type: 'select',
    options: ['Move to MAINTENANCE', 'Keep in GROWTH until CM3 available'],
    blocking_stage: 'stage_classification',
    priority: 'IMPORTANT',
    evidence: [
      { metric: 'organic_share_pct', value: product.organic_share_pct, issue: 'Meets MAINTENANCE threshold' },
      { metric: 'days_since_launch', value: daysSinceLaunch, issue: 'Exceeds GROWTH window' },
      { metric: 'cm3_status', value: null, issue: 'Not available' }
    ]
  });
}
```

**Stage 3 — Diagnostic:**

```typescript
// Unparseable campaign name
if (!parseCampaignName(campaign.name)) {
  emit({
    question_type: 'campaign_classification',
    question_text: `I cannot determine the objective for campaign "${campaign.name}". The naming convention does not match the expected pattern {Brand}|{Product}|{Syntax}|{MatchType}|{Objective}. What is this campaign's objective?`,
    required_input_type: 'select',
    options: ['Ranking', 'Discovery', 'Efficiency', 'Defensive', 'Launch', 'Liquidation'],
    blocking_stage: 'diagnostic',
    priority: 'BLOCKING',
    evidence: [
      { metric: 'campaign_name', value: campaign.name, issue: 'Does not match naming convention' },
      { metric: 'expected_pattern', value: '{Brand}|{Product}|{Syntax}|{MatchType}|{Objective}', issue: 'Parse failure' }
    ]
  });
}
```

**Stage 4 — Root Cause:**

```typescript
// Ambiguous deal context
if (product.has_active_deal && !product.deal_type) {
  emit({
    question_type: 'ambiguous_context',
    question_text: `${product.name} has an active deal but the deal type and dates are not configured. ACOS spiked ${acosDelta}% this week. I need to know: is this spike deal-driven (expected) or organic (requires intervention)?`,
    required_input_type: 'select',
    options: [
      'Deal-driven spike (expected, no action needed)',
      'Organic spike (needs intervention)',
      'Not sure — investigate further'
    ],
    blocking_stage: 'root_cause',
    priority: 'BLOCKING',
    evidence: [
      { metric: 'acos_wow_change', value: acosDelta, issue: 'Significant spike coincides with deal' },
      { metric: 'deal_type', value: null, issue: 'Not configured' },
      { metric: 'deal_dates', value: null, issue: 'Start/end dates unknown' }
    ]
  });
}

// New competitor detected
if (newCompetitorDetected && !isKnownCompetitor(competitor.asin)) {
  emit({
    question_type: 'competitor_context',
    question_text: `A new competitor (${competitor.asin}) appeared in SQP data for ${product.name}, capturing ${competitor.share_pct}% of clicks on shared search terms. Is this a known competitor, a private-label variant, or a genuinely new entrant?`,
    required_input_type: 'select',
    options: ['Known competitor', 'Private-label variant', 'New entrant — monitor', 'Not relevant — ignore'],
    blocking_stage: 'root_cause',
    priority: 'INFORMATIONAL',
    evidence: [
      { metric: 'competitor_asin', value: competitor.asin, issue: 'Not in known competitors list' },
      { metric: 'competitor_click_share', value: competitor.share_pct, issue: 'Capturing significant share' }
    ]
  });
}
```

**Stage 5 — Action Generation:**

```typescript
// Conflicting signals: profitability vs. inventory
if (gateStatus === 'PROFITABILITY_FAIL' && inventory.days_of_stock > 90 && inventory.velocity_wow_change < -0.10) {
  emit({
    question_type: 'conflicting_signals',
    question_text: `The profitability gate is failing for ${product.name} (ACOS ${currentAcos}% > BE ${beAcos}%), but inventory is at ${inventory.days_of_stock} days with declining velocity (${Math.round(inventory.velocity_wow_change * 100)}% WoW). Should I: (A) Maintain current spend to protect rank, (B) Reduce spend to improve profitability, or (C) Reduce spend AND flag for price review?`,
    required_input_type: 'select',
    options: [
      'Maintain current spend to protect rank',
      'Reduce spend to improve profitability',
      'Reduce spend AND flag for price review'
    ],
    blocking_stage: 'action_generation',
    priority: 'BLOCKING',
    evidence: [
      { metric: 'acos_7d', value: currentAcos, issue: `Exceeds BE ACOS of ${beAcos}%` },
      { metric: 'days_of_stock', value: inventory.days_of_stock, issue: 'Over 90-day threshold' },
      { metric: 'velocity_wow_change', value: inventory.velocity_wow_change, issue: 'Declining velocity' }
    ]
  });
}

// External dependency: indexing issue already flagged?
if (rootCause === 'INDEXING') {
  emit({
    question_type: 'external_dependency',
    question_text: `I detected an indexing issue for ${product.name} on the keyword "${keyword.text}" (Root Cause: INDEXING). Has this already been flagged to the listing team, or should I create a new flag?`,
    required_input_type: 'select',
    options: ['Already flagged — skip', 'Create new flag'],
    blocking_stage: 'action_generation',
    priority: 'IMPORTANT',
    evidence: [
      { metric: 'keyword', value: keyword.text, issue: 'Not indexed per rank tracker' },
      { metric: 'root_cause', value: 'INDEXING', issue: 'PPC cannot fix — requires listing change' }
    ]
  });
}
```

### 5.3.2 Question Deduplication

Before emitting a question, the engine checks:

1. **Exact duplicate:** Same `product_id` + `question_type` + `blocking_stage` with status OPEN already exists. Skip.
2. **Recently answered:** Same `product_id` + `question_type` answered within the last 30 days. Use previous answer as default instead of re-asking. The agent proceeds using the cached answer but logs: "Used previous answer from {date}. Same as before? [Yes/No]" as an INFORMATIONAL question.
3. **Auto-resolvable:** If the missing data was filled since the last run (e.g., COGS now exists), mark any matching OPEN question as AUTO_RESOLVED instead of asking again.

---

## 5.4 Where Questions Appear in the UI

Questions surface in five locations, ordered by urgency:

### 5.4.1 Alert Bell (Notification Center)

BLOCKING questions appear as system alerts in the top-right notification bell. They display alongside other critical alerts (gate failures, OOS+spending). Format:

```
🔵 Bamboo Sheets Agent needs clarification
   "Profitability gate failing but inventory at 90+ days..."
   Asked 2h ago | BLOCKING — agent paused
   [Answer Now]
```

Clicking "Answer Now" opens the question panel inline (no page navigation).

### 5.4.2 Agents Page (`/agents`)

The Agents table adds an "Open Questions" column:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Product Agent       │ Status   │ Confidence │ Open Questions │ Actions  │
├─────────────────────┼──────────┼────────────┼────────────────┼──────────┤
│ Bamboo Sheets       │ 🔵 WAIT  │ 72/100     │ 1 BLOCKING     │ 4 ready  │
│ Satin Sheets        │ 🟢 RUN   │ 85/100     │ —              │ 6 ready  │
│ Silk Pillow Case    │ 🟡 WAIT  │ 61/100     │ 1 IMPORTANT    │ 3 ready  │
│ Cooling Sheets      │ 🟢 RUN   │ 78/100     │ —              │ 5 ready  │
│ ...                 │          │            │                │          │
└──────────────────────────────────────────────────────────────────────────┘
```

Agent status values:
- `RUN` (green) — Pipeline completed, actions proposed
- `WAIT` (yellow) — Waiting for clarification (IMPORTANT priority — agent proceeded but flagged)
- `WAIT` (blue) — Waiting for clarification (BLOCKING priority — pipeline paused)
- `ERR` (red) — Pipeline error (not a question — system failure)

Clicking the "Open Questions" count opens a slide-out panel with the full question list for that agent.

### 5.4.3 Agent Detail Page (`/agents/:productId`) — Questions Tab

Full question history for one agent. Three sections:

1. **Open Questions** — Unanswered, sorted by priority (BLOCKING first) then age (oldest first).
2. **Recently Answered** — Last 30 days, showing question + answer + who answered + outcome.
3. **Expired / Auto-Resolved** — Historical record. Shows what default the agent used when the question expired.

### 5.4.4 Action Plan — Product Cards

Product cards on the Daily Action Plan page display a banner when the agent has BLOCKING questions:

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠️ AGENT NEEDS CLARIFICATION                                     │
│ The Bamboo Sheets agent has 1 blocking question.                 │
│ Some actions may be incomplete until the question is answered.   │
│ [View Question]                                                  │
├──────────────────────────────────────────────────────────────────┤
│ 🔴 CRITICAL — Bamboo Sheets 6PCS                                 │
│ ...                                                              │
```

### 5.4.5 Daily Email — Agent Questions Section

See Part 6, Section 6.6 for the full daily email specification. The email includes a dedicated "Agent Questions Requiring Your Input" section with direct-answer links.

---

## 5.5 How Users Answer Questions

### 5.5.1 In-App Answer Flow (Primary)

The question panel renders a self-contained answer widget. Layout:

```
┌─ Agent Question ──────────────────────────────────────────────┐
│ 🔵 BAMBOO SHEETS AGENT asks:                                  │
│                                                                │
│ "The profitability gate is failing (ACOS 48% > BE 30%), but   │
│  inventory is at 90+ days with declining velocity. Should I:   │
│  (A) Maintain current spend to protect rank                    │
│  (B) Reduce spend to improve profitability                     │
│  (C) Reduce spend AND flag for price review                    │
│                                                                │
│ Context:                                                       │
│  - ACOS: 48% (BE: 30%)                                        │
│  - DOS: 92 days                                                │
│  - Velocity: ▼18% WoW                                         │
│  - Organic rank: #8 (was #5)                                   │
│                                                                │
│ [A] Maintain spend  [B] Reduce spend  [C] Reduce + flag       │
│                                                                │
│ Or type a custom response:                                     │
│ [_____________________________________________] [Submit]        │
│                                                                │
│ 💡 Your answer will be remembered for similar future situations│
└────────────────────────────────────────────────────────────────┘
```

**Input types and their widgets:**

| `required_input_type` | Widget | Validation |
|----------------------|--------|------------|
| `select` | Button group (one per option) + free-text fallback | Must pick one option or provide text |
| `text` | Textarea (max 500 chars) | Non-empty |
| `number` | Number input with unit label (e.g., "$" or "%") | Positive number, within sane range |
| `boolean` | Yes / No toggle buttons | Must pick one |
| `date` | Date picker | Must be a valid date, not in the far past |

### 5.5.2 Email Answer Flow (Secondary)

Questions included in the daily email have direct-response links. For `select` type questions, each option is a separate link:

```
URL format: https://app.pmpsystems.com/api/questions/{question_id}/answer?value={encoded_option}&token={auth_token}
```

The `auth_token` is a short-lived JWT (24h expiry) scoped to this specific question. Clicking the link:
1. Authenticates via the token (no login required).
2. Records the answer.
3. Redirects to a confirmation page: "Answer recorded. The Bamboo Sheets agent will resume analysis."

For `text` and `number` type questions, the email link opens the in-app question panel (no inline email response for free-form input).

### 5.5.3 API Answer Flow (Programmatic)

```
POST /api/v1/agents/questions/{question_id}/answer
Authorization: Bearer {api_token}

{
  "answer_value": "Reduce spend to improve profitability",
  "answered_by": "wajahat@pmpsystems.com"
}

Response:
{
  "status": "ok",
  "question_id": "q_123",
  "new_status": "ANSWERED",
  "agent_will_resume": true,
  "agent_id": "agent_bamboo_sheets"
}
```

---

## 5.6 Answer Processing Pipeline

When a user answers a question, the system executes the following steps in order:

```typescript
async function processAnswer(
  questionId: string,
  answerValue: string,
  answeredBy: string,
  source: 'in_app' | 'email' | 'api'
): Promise<void> {

  // 1. Update question record
  await db.agent_questions.update({
    where: { id: questionId },
    data: {
      status: 'ANSWERED',
      answer_value: answerValue,
      answered_by: answeredBy,
      answered_at: new Date(),
      answer_source: source,
      updated_at: new Date()
    }
  });

  const question = await db.agent_questions.findUnique({ where: { id: questionId } });

  // 2. Log to activity log
  await logActivity({
    type: 'agent_question_answered',
    product_id: question.product_id,
    agent_id: question.agent_id,
    user_id: answeredBy,
    metadata: {
      question_id: questionId,
      question_type: question.question_type,
      priority: question.priority,
      answer_value: answerValue,
      answer_source: source,
      time_to_answer_hours: differenceInHours(new Date(), question.asked_at)
    }
  });

  // 3. Store in agent memory (learning loop — see Part 6)
  await agentMemoryService.storeContextMemory({
    agent_id: question.agent_id,
    product_id: question.product_id,
    context_type: mapQuestionTypeToContextType(question.question_type),
    context_text: `Q: ${question.question_text} A: ${answerValue}`,
    source: 'question_answer',
    applies_to: {
      products: [question.product_id],
      stages: 'all',
      seasons: 'all'
    },
    expires_at: computeMemoryExpiry(question.question_type),
    confidence: 1.0  // Direct human answer = maximum confidence
  });

  // 4. If BLOCKING: trigger agent to resume pipeline
  if (question.priority === 'BLOCKING') {
    await agentService.resumeFromClarification(question.agent_id, questionId, answerValue);
    // This re-enters the pipeline at question.blocking_stage with the answer injected
  }

  // 5. Check for recurring question pattern
  const previousSameType = await db.agent_questions.count({
    where: {
      product_id: question.product_id,
      question_type: question.question_type,
      status: 'ANSWERED',
      id: { not: questionId }
    }
  });

  if (previousSameType >= 2) {
    // This question type recurs for this product — flag for potential automation
    await logActivity({
      type: 'recurring_question_pattern',
      product_id: question.product_id,
      agent_id: question.agent_id,
      metadata: {
        question_type: question.question_type,
        occurrence_count: previousSameType + 1,
        suggestion: 'Consider configuring a default answer for this question type in product settings'
      }
    });
  }
}
```

### 5.6.1 Context Type Mapping

```typescript
function mapQuestionTypeToContextType(
  questionType: AgentQuestion['question_type']
): ContextMemory['context_type'] {
  const map: Record<string, string> = {
    'missing_data':           'product_specific',
    'ambiguous_context':      'product_specific',
    'conflicting_signals':    'user_preference',
    'external_dependency':    'product_specific',
    'stage_uncertainty':      'business_rule',
    'competitor_context':     'competitor',
    'campaign_classification': 'product_specific'
  };
  return map[questionType] as ContextMemory['context_type'];
}
```

### 5.6.2 Memory Expiry by Question Type

```typescript
function computeMemoryExpiry(questionType: string): Date | null {
  const expiryDays: Record<string, number | null> = {
    'missing_data':           null,   // Permanent — COGS doesn't change often
    'ambiguous_context':      90,     // Context may change quarterly
    'conflicting_signals':    30,     // Preferences may evolve monthly
    'external_dependency':    7,      // External status changes frequently
    'stage_uncertainty':      null,   // Stage decisions are durable
    'competitor_context':     180,    // Competitor landscape changes slowly
    'campaign_classification': null   // Campaign classification is permanent until renamed
  };
  const days = expiryDays[questionType];
  return days ? addDays(new Date(), days) : null;
}
```

### 5.6.3 Repeat Question Handling

When the same question type recurs for the same product and the agent has a previous answer on file:

```
┌─ Agent Question ──────────────────────────────────────────────┐
│ 🔵 BAMBOO SHEETS AGENT asks:                                  │
│                                                                │
│ "Same situation as March 5: profitability gate failing with    │
│  high inventory. Last time you chose: 'Reduce spend to        │
│  improve profitability.' Same approach this time?"             │
│                                                                │
│ [Yes — same as before]   [No — let me choose differently]     │
│                                                                │
│ 📋 Previous context:                                           │
│  - Mar 5: ACOS 52%, DOS 88 → Chose "Reduce spend"            │
│  - Outcome: ACOS improved to 38% within 10 days               │
└────────────────────────────────────────────────────────────────┘
```

This reduces operator fatigue by leveraging previous decisions while still requiring confirmation.

---

## 5.7 Question Analytics

The system tracks question metrics for operational insight:

| Metric | Calculation | Purpose |
|--------|-------------|---------|
| Avg time to answer (BLOCKING) | Mean hours from `asked_at` to `answered_at` for BLOCKING questions | Measures operator responsiveness |
| Expiration rate | % of questions that expired vs. were answered | Indicates operator engagement with agent system |
| Most common question type | Count by `question_type` per 30-day window | Reveals systemic data gaps that should be fixed at the source |
| Auto-resolve rate | % of questions that were auto-resolved by next-day data | Indicates transient vs. persistent data issues |
| Repeat question rate | % of questions where a previous answer existed for same product+type | If high, suggests product settings need permanent defaults |

These metrics are displayed on the Agents dashboard and included in the monthly system health report.

---

---

# PART 6 — LEARNING / FEEDBACK SYSTEM

Product Agents are not static rule executors. They accumulate experience over time by observing what operators approve, reject, modify, and explain. This part specifies the memory architecture, confidence scoring, learning mechanics, and safety controls that govern how agents improve.

**Core principle:** Learning adjusts recommendation quality and confidence. It NEVER overrides the PPC Master Framework rules. SOP rules are immutable. Learning operates WITHIN the framework, not above it.

---

## 6.1 What Agents Learn From

There are six learning sources, ordered by signal strength:

| # | Source | What Is Learned | Signal Strength | Example |
|---|--------|----------------|-----------------|---------|
| 1 | **Execution outcomes** | "This action produced X metric change within Y days" | Strongest | Increased TOS by 50% on "bamboo sheets" — IS% improved 22% in 7 days |
| 2 | **Approved actions** | "This action type in this situation is acceptable" | Strong | Bid reduction on Visibility+Placement syntax during PROFITABILITY_FAIL gate was approved |
| 3 | **Rejected actions** | "This action was wrong" + rejection reason | Strong (negative) | Operator rejected "increase budget 30%" with reason: "Product is seasonal, Q1 is low season" |
| 4 | **Modified actions** | "Direction was right, magnitude was wrong" | Medium | Recommended bid increase of 25%, operator modified to 15% |
| 5 | **Clarification answers** | Operator preferences and business rules | Medium | Operator chose "Reduce spend" over "Maintain spend" when profitability vs. inventory conflict |
| 6 | **User comments** | Strategic context not in the data | Weak (contextual) | "This product is being phased out — don't invest in ranking" |

---

## 6.2 Memory Architecture

### 6.2.1 Database Tables

```sql
-- ============================================================
-- AGENT MEMORY — ACTION PATTERNS
-- Learned from approvals, rejections, and modifications.
-- Each pattern represents: "In situation X, action Y was [approved/rejected/modified]"
-- ============================================================
CREATE TABLE agent_action_patterns (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    pattern_type VARCHAR(10) NOT NULL CHECK (
        pattern_type IN ('approved', 'rejected', 'modified')
    ),

    -- The situation when this pattern was recorded
    conditions JSONB NOT NULL,
    /*
      {
        "quadrant": "VISIBILITY",
        "root_cause": "PLACEMENT",
        "stage": "GROWTH",
        "gate_status": "CLEAR",
        "campaign_objective": "Ranking",
        "metric_ranges": [
          { "metric": "acos_7d", "min": 0.20, "max": 0.30 },
          { "metric": "impression_share", "min": 0.15, "max": 0.25 }
        ]
      }
    */

    -- The action that was taken
    action_type VARCHAR(50) NOT NULL,         -- e.g., 'bid_increase', 'budget_reduce', 'negate_keyword', 'pause_campaign'
    action_magnitude NUMERIC(10,4),           -- e.g., 0.25 for 25% bid increase. NULL for binary actions (pause/unpause).

    -- Outcome of the approval
    was_approved BOOLEAN NOT NULL,
    was_modified BOOLEAN NOT NULL DEFAULT FALSE,
    modification_details TEXT,                -- "Reduced magnitude from 25% to 15%"
    rejection_reason TEXT,                    -- "Product is seasonal, Q1 is low season"

    -- Source action reference
    source_action_id BIGINT REFERENCES action_recommendations(id) ON DELETE SET NULL,
    source_approval_id BIGINT REFERENCES action_approvals(id) ON DELETE SET NULL,

    -- Weight: 0-1, higher = more influential. Decays over time.
    weight NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurrence_count INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_patterns_agent ON agent_action_patterns(agent_id);
CREATE INDEX idx_action_patterns_product ON agent_action_patterns(product_id);
CREATE INDEX idx_action_patterns_conditions ON agent_action_patterns USING GIN (conditions);
CREATE INDEX idx_action_patterns_type ON agent_action_patterns(action_type);


-- ============================================================
-- AGENT MEMORY — CONTEXT MEMORIES
-- Learned from question answers, comments, and manual input.
-- Stores business rules and preferences that data alone can't provide.
-- ============================================================
CREATE TABLE agent_context_memories (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    context_type VARCHAR(20) NOT NULL CHECK (
        context_type IN ('user_preference', 'business_rule', 'product_specific', 'seasonal', 'competitor')
    ),
    context_text TEXT NOT NULL,               -- The actual information, e.g., "Never reduce bids below $1.50 on this product"
    source VARCHAR(20) NOT NULL CHECK (
        source IN ('question_answer', 'comment', 'manual_input')
    ),

    -- When this context applies
    applies_to_products JSONB NOT NULL DEFAULT '[]',   -- Array of product IDs, or empty = this product only
    applies_to_stages JSONB NOT NULL DEFAULT '"all"',  -- Array of stage names, or "all"
    applies_to_seasons JSONB NOT NULL DEFAULT '"all"',  -- Array of season names, or "all"

    -- Durability
    expires_at TIMESTAMPTZ,                  -- NULL = permanent
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,

    -- Audit
    created_by VARCHAR(100),                 -- Who created this memory (user or 'system')
    source_question_id BIGINT REFERENCES agent_questions(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_context_memories_agent ON agent_context_memories(agent_id);
CREATE INDEX idx_context_memories_product ON agent_context_memories(product_id);
CREATE INDEX idx_context_memories_type ON agent_context_memories(context_type);
CREATE INDEX idx_context_memories_expires ON agent_context_memories(expires_at) WHERE expires_at IS NOT NULL;


-- ============================================================
-- AGENT MEMORY — OUTCOME MEMORIES
-- Learned from execution results. Most powerful learning signal.
-- Links an action pattern to its measured impact.
-- ============================================================
CREATE TABLE agent_outcome_memories (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Links to the action pattern this outcome evaluates
    action_pattern_id BIGINT NOT NULL REFERENCES agent_action_patterns(id) ON DELETE CASCADE,

    -- What happened
    metric_name VARCHAR(50) NOT NULL,         -- e.g., 'acos_7d', 'impression_share', 'organic_rank'
    metric_before NUMERIC(12,4) NOT NULL,
    metric_after NUMERIC(12,4) NOT NULL,
    measurement_window_days INTEGER NOT NULL,  -- How many days after execution the measurement was taken

    -- Assessment
    outcome_positive BOOLEAN NOT NULL,
    impact_magnitude NUMERIC(8,4) NOT NULL,   -- Absolute % change, e.g., 0.22 for 22% improvement

    -- Source execution reference
    source_execution_id BIGINT REFERENCES action_execution_log(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outcome_memories_agent ON agent_outcome_memories(agent_id);
CREATE INDEX idx_outcome_memories_pattern ON agent_outcome_memories(action_pattern_id);
CREATE INDEX idx_outcome_memories_metric ON agent_outcome_memories(metric_name);


-- ============================================================
-- AGENT CONFIDENCE LOG
-- Tracks confidence score changes over time for audit and display.
-- ============================================================
CREATE TABLE agent_confidence_log (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    confidence_score NUMERIC(5,2) NOT NULL,   -- 10.00 to 95.00
    previous_score NUMERIC(5,2),
    change_reason VARCHAR(100) NOT NULL,       -- e.g., 'action_approved', 'negative_outcome', 'daily_recalc'
    change_amount NUMERIC(5,2) NOT NULL,

    -- Reference to what caused the change
    source_type VARCHAR(30),                  -- 'approval', 'rejection', 'outcome', 'recalculation'
    source_id BIGINT,                         -- ID in the source table

    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_confidence_log_agent ON agent_confidence_log(agent_id);
CREATE INDEX idx_confidence_log_recorded ON agent_confidence_log(recorded_at);
```

### 6.2.2 TypeScript Interfaces

```typescript
interface AgentMemory {
  agent_id: string;
  product_id: number;

  action_patterns: ActionPattern[];
  context_memories: ContextMemory[];
  outcome_memories: OutcomeMemory[];
  confidence_score: number;
}

interface ActionPattern {
  id: string;
  pattern_type: 'approved' | 'rejected' | 'modified';

  // The situation
  conditions: {
    quadrant: string;
    root_cause: string;
    stage: string;
    gate_status: string;
    campaign_objective: string;
    metric_ranges: { metric: string; min: number; max: number }[];
  };

  // The action
  action_type: string;
  action_magnitude: number | null;

  // The outcome
  was_approved: boolean;
  was_modified: boolean;
  modification_details: string | null;
  rejection_reason: string | null;

  // Weight (decays over time, boosted by recurrence)
  weight: number;
  last_updated: Date;
  occurrence_count: number;
}

interface ContextMemory {
  id: string;
  context_type: 'user_preference' | 'business_rule' | 'product_specific' | 'seasonal' | 'competitor';
  context_text: string;
  source: 'question_answer' | 'comment' | 'manual_input';

  applies_to: {
    products: number[] | 'all';
    stages: string[] | 'all';
    seasons: string[] | 'all';
  };

  expires_at: Date | null;
  confidence: number;
}

interface OutcomeMemory {
  id: string;
  action_pattern_id: string;

  metric_name: string;
  metric_before: number;
  metric_after: number;
  measurement_window_days: number;

  outcome_positive: boolean;
  impact_magnitude: number;
}
```

---

## 6.3 Memory Recording Pipelines

### 6.3.1 On Action Approval / Rejection / Modification

Triggered by the approval workflow (see `EMAIL_APPROVAL_DEPLOYMENT_SPEC.md` Part 3). When an approval decision is recorded in `action_approvals`:

```typescript
async function recordApprovalPattern(approval: ActionApproval): Promise<void> {
  const action = await db.action_recommendations.findUnique({
    where: { id: approval.action_item_id },
    include: { daily_plan_product: true }
  });

  const planProduct = action.daily_plan_product;

  // Build the conditions snapshot
  const conditions = {
    quadrant: planProduct.syntax_diagnostics?.[action.syntax_id]?.quadrant,
    root_cause: planProduct.syntax_diagnostics?.[action.syntax_id]?.root_cause,
    stage: planProduct.stage,
    gate_status: planProduct.gate_status,
    campaign_objective: action.campaign_objective,
    metric_ranges: buildMetricRanges(action)
  };

  // Check for existing pattern match (same agent + similar conditions + same action type)
  const existingPattern = await findMatchingPattern(
    action.agent_id,
    conditions,
    action.action_type
  );

  if (existingPattern) {
    // Update existing pattern: increment occurrence, refresh weight
    await db.agent_action_patterns.update({
      where: { id: existingPattern.id },
      data: {
        occurrence_count: existingPattern.occurrence_count + 1,
        weight: Math.min(1.0, existingPattern.weight + 0.1),
        was_approved: approval.status === 'APPROVED' || approval.status === 'MODIFIED',
        was_modified: approval.status === 'MODIFIED',
        modification_details: approval.modification_details
          ? JSON.stringify(approval.modification_details)
          : existingPattern.modification_details,
        rejection_reason: approval.status === 'REJECTED'
          ? approval.decision_reason
          : existingPattern.rejection_reason,
        last_updated: new Date()
      }
    });
  } else {
    // Create new pattern
    await db.agent_action_patterns.create({
      data: {
        agent_id: action.agent_id,
        product_id: planProduct.product_id,
        pattern_type: mapApprovalToPatternType(approval.status),
        conditions: conditions,
        action_type: action.action_type,
        action_magnitude: action.recommended_change_pct,
        was_approved: approval.status === 'APPROVED' || approval.status === 'MODIFIED',
        was_modified: approval.status === 'MODIFIED',
        modification_details: approval.modification_details
          ? JSON.stringify(approval.modification_details)
          : null,
        rejection_reason: approval.status === 'REJECTED'
          ? approval.decision_reason
          : null,
        source_action_id: action.id,
        source_approval_id: approval.id,
        weight: 1.0,
        occurrence_count: 1
      }
    });
  }

  // Update confidence score
  await recalculateConfidence(action.agent_id);
}
```

### 6.3.2 On Execution Outcome Measurement

Outcomes are measured by a scheduled job (`OutcomeMeasurementJob`) that runs daily. For each executed action, it checks whether enough time has passed to measure impact:

```typescript
// Measurement windows by action type
const MEASUREMENT_WINDOWS: Record<string, number> = {
  'bid_increase':      7,   // 7 days to see bid change impact
  'bid_decrease':      7,
  'budget_increase':   7,
  'budget_decrease':   7,
  'tos_increase':      7,   // TOS placement changes need a week
  'tos_decrease':      7,
  'negate_keyword':    14,  // Negations take longer to show impact
  'pause_campaign':    14,
  'new_keyword':       21,  // New keywords need 3 weeks for meaningful data
  'match_type_change': 14,
};

async function measureOutcomes(): Promise<void> {
  const executedActions = await db.action_execution_log.findMany({
    where: {
      status: 'executed',
      outcome_measured: false,
      executed_at: { lte: subDays(new Date(), 7) } // At least 7 days ago
    },
    include: { action_recommendation: true }
  });

  for (const execution of executedActions) {
    const action = execution.action_recommendation;
    const windowDays = MEASUREMENT_WINDOWS[action.action_type] || 14;

    // Check if enough time has passed
    if (differenceInDays(new Date(), execution.executed_at) < windowDays) {
      continue;
    }

    // Get the primary metric for this action type
    const metricName = getPrimaryMetric(action.action_type);

    // Measure before/after
    const metricBefore = await getMetricValue(
      action.product_id,
      metricName,
      subDays(execution.executed_at, 7),  // 7-day avg before execution
      execution.executed_at
    );

    const metricAfter = await getMetricValue(
      action.product_id,
      metricName,
      subDays(new Date(), 7),             // 7-day avg ending now
      new Date()
    );

    if (metricBefore === null || metricAfter === null) continue;

    const impactMagnitude = Math.abs((metricAfter - metricBefore) / metricBefore);
    const outcomePositive = isPositiveOutcome(action.action_type, metricBefore, metricAfter);

    // Find the associated action pattern
    const pattern = await db.agent_action_patterns.findFirst({
      where: { source_action_id: action.id }
    });

    if (pattern) {
      await db.agent_outcome_memories.create({
        data: {
          agent_id: action.agent_id,
          product_id: action.product_id,
          action_pattern_id: pattern.id,
          metric_name: metricName,
          metric_before: metricBefore,
          metric_after: metricAfter,
          measurement_window_days: windowDays,
          outcome_positive: outcomePositive,
          impact_magnitude: impactMagnitude,
          source_execution_id: execution.id
        }
      });

      // Update the pattern weight based on outcome
      const weightAdjustment = outcomePositive
        ? Math.min(0.2, impactMagnitude * 0.5)    // Positive: small boost
        : -Math.min(0.3, impactMagnitude * 0.75);  // Negative: larger penalty

      await db.agent_action_patterns.update({
        where: { id: pattern.id },
        data: {
          weight: Math.max(0, Math.min(1.0, pattern.weight + weightAdjustment)),
          last_updated: new Date()
        }
      });
    }

    // Mark execution as measured
    await db.action_execution_log.update({
      where: { id: execution.id },
      data: { outcome_measured: true }
    });

    // Update confidence score
    await recalculateConfidence(action.agent_id);
  }
}
```

### 6.3.3 Primary Metrics by Action Type

```typescript
function getPrimaryMetric(actionType: string): string {
  const map: Record<string, string> = {
    'bid_increase':      'impression_share',
    'bid_decrease':      'acos_7d',
    'budget_increase':   'total_spend',
    'budget_decrease':   'acos_7d',
    'tos_increase':      'impression_share',
    'tos_decrease':      'acos_7d',
    'negate_keyword':    'acos_7d',
    'pause_campaign':    'acos_7d',
    'new_keyword':       'impressions',
    'match_type_change': 'impressions',
  };
  return map[actionType] || 'acos_7d';
}

function isPositiveOutcome(actionType: string, before: number, after: number): boolean {
  // For cost metrics (ACOS, spend), lower is better after reduction actions
  const lowerIsBetter = ['bid_decrease', 'budget_decrease', 'tos_decrease', 'negate_keyword', 'pause_campaign'];
  // For volume metrics (IS%, impressions), higher is better after increase actions
  const higherIsBetter = ['bid_increase', 'budget_increase', 'tos_increase', 'new_keyword', 'match_type_change'];

  if (lowerIsBetter.includes(actionType)) return after < before;
  if (higherIsBetter.includes(actionType)) return after > before;
  return after >= before; // Default: no regression = positive
}
```

---

## 6.4 Confidence Scoring

### 6.4.1 Calculation

Each agent maintains a confidence score (10-95) that reflects the reliability of its recommendations. The score is recalculated after every approval, rejection, or outcome measurement.

```typescript
async function recalculateConfidence(agentId: string): Promise<number> {
  const BASE_CONFIDENCE = 50;
  const now = new Date();
  const ninetyDaysAgo = subDays(now, 90);

  // Fetch all signals from last 90 days
  const approvals = await db.agent_action_patterns.findMany({
    where: {
      agent_id: agentId,
      was_approved: true,
      last_updated: { gte: ninetyDaysAgo }
    }
  });

  const rejections = await db.agent_action_patterns.findMany({
    where: {
      agent_id: agentId,
      was_approved: false,
      last_updated: { gte: ninetyDaysAgo }
    }
  });

  const outcomes = await db.agent_outcome_memories.findMany({
    where: {
      agent_id: agentId,
      created_at: { gte: ninetyDaysAgo }
    }
  });

  let confidence = BASE_CONFIDENCE;

  // Approvals boost confidence (recent ones weigh more)
  for (const a of approvals) {
    const daysSince = differenceInDays(now, a.last_updated);
    confidence += 0.5 * (1 / Math.max(1, daysSince));
  }

  // Rejections penalize confidence (recent ones penalize more)
  for (const r of rejections) {
    const daysSince = differenceInDays(now, r.last_updated);
    confidence -= 1.0 * (1 / Math.max(1, daysSince));
  }

  // Positive outcomes: strongest positive signal
  for (const o of outcomes) {
    if (o.outcome_positive) {
      confidence += 2.0 * o.impact_magnitude;
    } else {
      // Negative outcomes: strongest negative signal
      confidence -= 3.0 * o.impact_magnitude;
    }
  }

  // Clamp to [10, 95] — never 0, never 100
  confidence = Math.max(10, Math.min(95, confidence));

  // Round to 1 decimal
  confidence = Math.round(confidence * 10) / 10;

  // Log the change
  const previousScore = await getLatestConfidenceScore(agentId);
  await db.agent_confidence_log.create({
    data: {
      agent_id: agentId,
      product_id: await getProductIdForAgent(agentId),
      confidence_score: confidence,
      previous_score: previousScore,
      change_reason: 'daily_recalc',
      change_amount: confidence - (previousScore || BASE_CONFIDENCE),
      source_type: 'recalculation',
      recorded_at: now
    }
  });

  return confidence;
}
```

### 6.4.2 Confidence Display Tiers

| Range | Label | Badge Color | Meaning |
|-------|-------|-------------|---------|
| 80-95 | High Confidence | Green | Agent has a strong track record. Recommendations are reliable. |
| 50-79 | Moderate Confidence | Yellow | Normal operating range. Standard review applies. |
| 30-49 | Low Confidence | Orange | Agent needs more data or is making too many mistakes. Extra scrutiny recommended. |
| 10-29 | Very Low Confidence | Red | Agent recommendations should be reviewed carefully. May indicate corrupted patterns or fundamental data issues. |

### 6.4.3 Confidence-Based Approval Routing

Confidence score directly affects which approval tier is required:

```typescript
function getRequiredApprovalTier(
  action: ActionRecommendation,
  agentConfidence: number,
  standardTier: ApprovalTier
): ApprovalTier {
  // LOW CONFIDENCE OVERRIDE
  // If confidence < 30, ALL actions require MANAGER approval regardless of standard rules
  if (agentConfidence < 30) {
    return 'MANAGER';
  }

  // STANDARD RANGE (30-80)
  // Normal approval rules from EMAIL_APPROVAL_DEPLOYMENT_SPEC.md apply
  if (agentConfidence <= 80) {
    return standardTier;
  }

  // HIGH CONFIDENCE + TRACK RECORD (Phase 2 only)
  // Eligible for auto-approve on LOW-RISK actions if:
  //   1. Confidence > 80
  //   2. 30-day approval rate > 85%
  //   3. Action is classified as low-risk
  //   4. Auto-approve feature flag is enabled
  if (agentConfidence > 80 && standardTier === 'OPERATOR') {
    const thirtyDayApprovalRate = await getApprovalRate(action.agent_id, 30);
    const isLowRisk = LOW_RISK_ACTIONS.includes(action.action_type);
    const autoApproveEnabled = await getFeatureFlag('agent_auto_approve');

    if (thirtyDayApprovalRate > 0.85 && isLowRisk && autoApproveEnabled) {
      return 'AUTO';
    }
  }

  return standardTier;
}

// Low-risk actions eligible for auto-approve (Phase 2)
const LOW_RISK_ACTIONS = [
  'negate_keyword',        // Adding negatives is almost always safe
  'bid_decrease_small',    // Bid reductions < 10%
  'pause_both_failing',    // Pausing syntaxes in BOTH_FAILING quadrant
];
```

---

## 6.5 How Learning Influences Recommendations

When the Action Plan Engine reaches Stage 5 (Action Generation), the agent consults its memory before producing recommendations.

### 6.5.1 Pattern Matching Logic

```typescript
async function generateActionWithMemory(
  agentId: string,
  productId: number,
  syntaxDiagnostic: SyntaxDiagnostic,
  gateStatus: string,
  stage: string,
  campaignObjective: string
): Promise<ActionRecommendation> {

  // Step 1: Generate the base recommendation from framework rules (SOP)
  const baseAction = generateFrameworkAction(syntaxDiagnostic, gateStatus, stage, campaignObjective);

  // Step 2: Check agent memory for matching patterns
  const patterns = await findMatchingPatterns(agentId, {
    quadrant: syntaxDiagnostic.quadrant,
    root_cause: syntaxDiagnostic.root_cause,
    stage: stage,
    gate_status: gateStatus,
    campaign_objective: campaignObjective,
    current_metrics: syntaxDiagnostic.metrics
  });

  if (patterns.length === 0) {
    // No memory — return base recommendation
    return baseAction;
  }

  // Step 3: Apply learned adjustments
  let adjustedAction = { ...baseAction };
  const memoryNotes: string[] = [];

  for (const pattern of patterns.sort((a, b) => b.weight - a.weight)) {
    if (pattern.pattern_type === 'rejected' && pattern.action_type === baseAction.action_type) {
      // This exact action type was rejected in a similar situation
      if (pattern.rejection_reason?.includes('magnitude')) {
        // Magnitude issue — reduce
        adjustedAction.recommended_change_pct *= 0.7; // Reduce by 30%
        memoryNotes.push(
          `Magnitude reduced based on previous rejection (${pattern.rejection_reason})`
        );
      } else if (pattern.rejection_reason?.includes('wrong action') ||
                 pattern.rejection_reason?.includes('not appropriate')) {
        // Wrong action type — skip and try next best from framework
        adjustedAction = generateNextBestAction(syntaxDiagnostic, gateStatus, stage, campaignObjective);
        memoryNotes.push(
          `Action type changed from ${baseAction.action_type} based on previous rejection`
        );
        break;
      } else if (pattern.rejection_reason?.includes('timing') ||
                 pattern.rejection_reason?.includes('seasonal') ||
                 pattern.rejection_reason?.includes('wait')) {
        // Timing issue — add context note
        memoryNotes.push(
          `Note: Similar action was previously rejected for timing reasons: "${pattern.rejection_reason}"`
        );
      }
    }

    if (pattern.pattern_type === 'modified' && pattern.action_type === baseAction.action_type) {
      // Action was modified — use the modified magnitude as baseline
      if (pattern.modification_details) {
        const modDetails = JSON.parse(pattern.modification_details);
        if (modDetails.modified_to && typeof modDetails.modified_to === 'number') {
          adjustedAction.recommended_change_pct = modDetails.modified_to;
          memoryNotes.push(
            `Magnitude calibrated to ${modDetails.modified_to} based on previous operator adjustment`
          );
        }
      }
    }

    if (pattern.pattern_type === 'approved' && pattern.action_type === baseAction.action_type) {
      // Boost confidence for this recommendation
      memoryNotes.push(
        `Similar action approved ${pattern.occurrence_count} time(s) in comparable situations`
      );
    }
  }

  // Step 4: Check context memories for constraints
  const contextMemories = await db.agent_context_memories.findMany({
    where: {
      agent_id: agentId,
      product_id: productId,
      OR: [
        { expires_at: null },
        { expires_at: { gte: new Date() } }
      ]
    }
  });

  for (const ctx of contextMemories) {
    // Apply hard constraints from user preferences
    if (ctx.context_type === 'user_preference') {
      const constraint = parseConstraint(ctx.context_text);
      if (constraint && violatesConstraint(adjustedAction, constraint)) {
        adjustedAction = applyConstraint(adjustedAction, constraint);
        memoryNotes.push(`Constrained by operator preference: "${ctx.context_text}"`);
      }
    }

    // Add seasonal context
    if (ctx.context_type === 'seasonal') {
      memoryNotes.push(`Seasonal context: ${ctx.context_text}`);
    }

    // Add competitor context
    if (ctx.context_type === 'competitor') {
      memoryNotes.push(`Competitor context: ${ctx.context_text}`);
    }
  }

  // Step 5: Check outcome memories for evidence
  const relevantOutcomes = await findRelevantOutcomes(agentId, baseAction.action_type, syntaxDiagnostic);
  for (const outcome of relevantOutcomes) {
    if (outcome.outcome_positive) {
      memoryNotes.push(
        `Evidence: Last time this action was taken on similar syntax, ${outcome.metric_name} improved ${Math.round(outcome.impact_magnitude * 100)}% within ${outcome.measurement_window_days} days`
      );
    } else {
      memoryNotes.push(
        `Warning: Last time this action was taken on similar syntax, ${outcome.metric_name} worsened ${Math.round(outcome.impact_magnitude * 100)}% within ${outcome.measurement_window_days} days`
      );
    }
  }

  // Attach memory notes to the recommendation for transparency
  adjustedAction.memory_notes = memoryNotes;
  adjustedAction.memory_influenced = memoryNotes.length > 0;

  return adjustedAction;
}
```

### 6.5.2 Pattern Matching Criteria

Two situations "match" when:

```typescript
function situationsMatch(
  current: SituationSnapshot,
  stored: ActionPattern['conditions']
): boolean {
  // HARD match: quadrant + root_cause + stage must be identical
  if (current.quadrant !== stored.quadrant) return false;
  if (current.root_cause !== stored.root_cause) return false;
  if (current.stage !== stored.stage) return false;

  // SOFT match: gate_status and campaign_objective are preferred but not required
  let matchScore = 3; // 3 hard matches
  if (current.gate_status === stored.gate_status) matchScore++;
  if (current.campaign_objective === stored.campaign_objective) matchScore++;

  // RANGE match: current metrics must fall within stored metric ranges (within 20% tolerance)
  for (const range of stored.metric_ranges) {
    const currentValue = current.current_metrics[range.metric];
    if (currentValue !== undefined) {
      const tolerance = (range.max - range.min) * 0.2;
      if (currentValue >= range.min - tolerance && currentValue <= range.max + tolerance) {
        matchScore++;
      }
    }
  }

  // Minimum match score: 3 (hard matches only) is a weak match.
  // 5+ is a strong match.
  return matchScore >= 3;
}
```

### 6.5.3 Memory Notes in the UI

When an action is influenced by memory, the action card shows a "Memory" badge:

```
┌──────────────────────────────────────────────────────────────────┐
│ ACTION: Reduce bid by 15% on "bamboo sheets" (Exact)            │
│ Campaign: SLEEPHORIA|BambooSheets|BambooSheets|Exact|Ranking    │
│                                                                  │
│ Evidence:                                                        │
│  - Quadrant: VISIBILITY | Root Cause: PLACEMENT                  │
│  - IS%: 18% (below 25% target) | TOS IS%: 8%                   │
│                                                                  │
│ [MEMORY] This recommendation was adjusted by agent memory:       │
│  - Magnitude calibrated to 15% based on previous operator        │
│    adjustment (was 25%, operator modified to 15% on Mar 5)       │
│  - Similar action approved 3 times in comparable situations      │
│  - Evidence: Last time, ACOS improved 12% within 7 days         │
│                                                                  │
│ [Approve]  [Modify]  [Reject]                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6.6 Memory Decay

Patterns are not permanent at full weight. Old memories decay to prevent stale learning from dominating current decisions.

### 6.6.1 Decay Schedule

```
Age 0-180 days:   weight unchanged (full influence)
Age 181-210 days: weight * 0.5
Age 211-240 days: weight * 0.25
Age 241-270 days: weight * 0.125
Age 271+ days:    weight * 0.0 (effectively zero, but record retained for audit)
```

### 6.6.2 Decay Job

```typescript
// Runs daily as part of the morning pipeline
async function decayPatternWeights(): Promise<void> {
  const now = new Date();

  // Patterns older than 180 days
  const stalePatterns = await db.agent_action_patterns.findMany({
    where: {
      last_updated: { lt: subDays(now, 180) },
      weight: { gt: 0 }
    }
  });

  for (const pattern of stalePatterns) {
    const daysPast180 = differenceInDays(now, pattern.last_updated) - 180;
    const decayPeriods = Math.floor(daysPast180 / 30);
    const decayedWeight = pattern.weight * Math.pow(0.5, decayPeriods);

    // If weight drops below 0.01, set to 0 (effectively dead)
    const finalWeight = decayedWeight < 0.01 ? 0 : decayedWeight;

    await db.agent_action_patterns.update({
      where: { id: pattern.id },
      data: { weight: finalWeight }
    });
  }
}
```

### 6.6.3 Weight Refresh

When a pattern is re-encountered (same situation, same action type, new approval/rejection), its `last_updated` resets and its weight is refreshed. This means frequently recurring patterns stay alive indefinitely, while one-off patterns naturally fade.

---

## 6.7 Safety Controls

Learning is a powerful system that must be tightly controlled to prevent drift, corruption, or unintended behavior.

### 6.7.1 Framework Override Rule

**SOP rules ALWAYS take precedence over learned patterns.** No amount of historical approvals can override a framework constraint.

```typescript
function applyFrameworkGuardrails(
  memoryAdjustedAction: ActionRecommendation,
  gateStatus: string,
  stage: string
): ActionRecommendation {
  const action = { ...memoryAdjustedAction };

  // HARD RULE: If inventory gate FAILS, NEVER scale — regardless of memory
  if (gateStatus === 'INVENTORY_FAIL' || gateStatus === 'BOTH_FAIL') {
    if (isScalingAction(action)) {
      action.action_type = 'reduce_bid'; // Override to safe default
      action.memory_notes.push(
        'FRAMEWORK OVERRIDE: Scaling blocked by inventory gate failure. Memory-based recommendation overridden.'
      );
    }
  }

  // HARD RULE: If profitability gate FAILS, NEVER increase bids/budgets
  if (gateStatus === 'PROFITABILITY_FAIL' || gateStatus === 'BOTH_FAIL') {
    if (isIncreaseAction(action)) {
      action.action_type = 'reduce_bid';
      action.memory_notes.push(
        'FRAMEWORK OVERRIDE: Increases blocked by profitability gate failure. Memory-based recommendation overridden.'
      );
    }
  }

  // HARD RULE: LAUNCH stage cannot have efficiency-focused reductions
  //            unless gate is failing
  if (stage === 'LAUNCH' && gateStatus === 'CLEAR') {
    if (isReductionAction(action) && action.memory_notes.some(n => n.includes('rejection'))) {
      // Memory says reduce, but framework says LAUNCH products should be aggressive
      action.memory_notes.push(
        'FRAMEWORK NOTE: LAUNCH stage product — reductions from memory may conflict with growth objectives. Flagged for review.'
      );
      action.requires_review = true;
    }
  }

  return action;
}
```

### 6.7.2 No Autonomous Drift

Agent memory is fully transparent and editable by operators:

**Memory Management UI (`/agents/:productId/memory`):**

```
┌─ AGENT MEMORY — Bamboo Sheets ────────────────────────────────┐
│                                                                │
│ ACTION PATTERNS (24 stored)                                    │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ #1 | APPROVED | bid_decrease 15%                           │ │
│ │    Conditions: VISIBILITY + PLACEMENT + GROWTH + CLEAR     │ │
│ │    Weight: 0.85 | Occurrences: 5 | Last: Mar 12            │ │
│ │    [View Details]  [Delete]                                │ │
│ ├────────────────────────────────────────────────────────────┤ │
│ │ #2 | REJECTED | budget_increase 30%                        │ │
│ │    Conditions: STRONG + N/A + MAINTENANCE + CLEAR          │ │
│ │    Reason: "Product is seasonal, Q1 is low season"         │ │
│ │    Weight: 0.72 | Occurrences: 2 | Last: Feb 28            │ │
│ │    [View Details]  [Delete]                                │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ CONTEXT MEMORIES (8 stored)                                    │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ "Never reduce bids below $1.50 on this product"            │ │
│ │ Type: user_preference | Source: comment | Expires: never   │ │
│ │ [Edit]  [Delete]                                           │ │
│ ├────────────────────────────────────────────────────────────┤ │
│ │ "Q4 metrics don't apply to Q1 — seasonal product"          │ │
│ │ Type: seasonal | Source: question_answer | Expires: Jun 1  │ │
│ │ [Edit]  [Delete]                                           │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ OUTCOME MEMORIES (12 stored)                                   │
│ Most recent: TOS increase 50% → IS% improved 22% in 7 days   │
│ [View All Outcomes]                                            │
│                                                                │
│ ──────────────────────────────────────────────────────────────  │
│ [🔄 Reset All Memory]  [📥 Export Memory]  [📤 Import Memory]  │
└────────────────────────────────────────────────────────────────┘
```

### 6.7.3 Confidence Floor

Minimum confidence is 10, not 0. Even the worst-performing agent continues to generate recommendations. At confidence 10-29, every action routes to MANAGER approval, ensuring human oversight on every decision.

### 6.7.4 Memory Reset

Admins can perform a full memory reset for any agent. This is the nuclear option for corrupted patterns.

```typescript
async function resetAgentMemory(agentId: string, resetBy: string): Promise<void> {
  // Archive existing memory before deletion (for audit)
  await archiveAgentMemory(agentId);

  // Delete all patterns, context, and outcomes
  await db.agent_action_patterns.deleteMany({ where: { agent_id: agentId } });
  await db.agent_context_memories.deleteMany({ where: { agent_id: agentId } });
  await db.agent_outcome_memories.deleteMany({ where: { agent_id: agentId } });

  // Reset confidence to base
  await db.agent_confidence_log.create({
    data: {
      agent_id: agentId,
      product_id: await getProductIdForAgent(agentId),
      confidence_score: 50,
      previous_score: await getLatestConfidenceScore(agentId),
      change_reason: 'memory_reset',
      change_amount: 50 - (await getLatestConfidenceScore(agentId) || 50),
      source_type: 'recalculation',
      recorded_at: new Date()
    }
  });

  // Log the reset
  await logActivity({
    type: 'agent_memory_reset',
    agent_id: agentId,
    user_id: resetBy,
    metadata: { reason: 'manual_reset' }
  });
}
```

### 6.7.5 Audit Trail

Every memory creation, update, and deletion is logged. The question "Why did the agent recommend X?" can always be answered by tracing:

1. **Framework rules** that generated the base action (always logged in `action_recommendations.evidence`).
2. **Memory patterns** that influenced the adjustment (logged in `action_recommendations.memory_notes`).
3. **Context memories** that applied constraints (logged in `action_recommendations.memory_notes`).
4. **Outcome evidence** that supported the recommendation (logged in `action_recommendations.memory_notes`).

---

## 6.8 Daily Email — Agent Section

The following section is added to the Daily Digest Email (see `EMAIL_APPROVAL_DEPLOYMENT_SPEC.md`) after the Approval Queue section (Section D). It surfaces agent status, blocking questions, and performance metrics.

### 6.8.1 Section Position

```
SECTION A: Executive Summary
SECTION B: Critical Alerts
SECTION C: Product Action Cards (by segment)
SECTION D: Approval Queue
SECTION E: Agent Status & Questions     ← NEW
SECTION F: Flags Sent
SECTION G: Yesterday Comparison
SECTION H: Execution Checklist Link
```

### 6.8.2 Section Layout

```
════════════════════════════════════════
AGENT STATUS
════════════════════════════════════════
Agents: 13 total | 🟢 10 Running | 🟡 2 Waiting | 🔵 1 Needs Clarification

⚠️ AGENTS NEEDING INPUT:
  Bamboo Sheets Agent — BLOCKING question:
  "Profitability gate failing but inventory at 90+ days.
   Should I maintain spend or reduce?"
  [Answer Now →]

  Silk Pillow Case Agent — IMPORTANT question:
  "Indexing issue on 'silk pillowcase' — has listing team
   been notified?"
  [Answer Now →]

📊 AGENT PERFORMANCE (30-day rolling):
  Avg Confidence: 72/100
  Approval Rate: 87% (201/231 actions approved)
  Positive Outcome Rate: 74% (89/120 measured outcomes)
  Questions Asked: 8 (6 answered, 2 pending)
  Avg Time to Answer: 4.2 hours (BLOCKING), 18 hours (IMPORTANT)

🏆 TOP PERFORMING AGENTS:
  1. Satin Sheets — 89/100 confidence, 94% approval rate
  2. Cooling Sheets — 85/100 confidence, 91% approval rate

⚠️ AGENTS NEEDING ATTENTION:
  1. Bamboo Pillow — 28/100 confidence (all actions routed to Manager)
     Reason: 3 negative outcomes in last 14 days
```

### 6.8.3 Data Model for Email Section

```typescript
interface AgentEmailSection {
  total_agents: number;
  status_counts: {
    running: number;
    waiting: number;
    needs_clarification: number;
    error: number;
  };

  // Blocking questions to surface
  blocking_questions: {
    agent_name: string;
    question_text: string;      // Truncated to 120 chars for email
    priority: 'BLOCKING' | 'IMPORTANT';
    answer_url: string;          // Direct-answer link with auth token
    hours_open: number;
  }[];

  // 30-day performance metrics
  performance: {
    avg_confidence: number;
    approval_rate_pct: number;
    approval_count: number;
    approval_total: number;
    positive_outcome_rate_pct: number;
    positive_outcomes: number;
    total_outcomes: number;
    questions_asked: number;
    questions_answered: number;
    questions_pending: number;
    avg_time_to_answer_blocking_hours: number;
    avg_time_to_answer_important_hours: number;
  };

  // Top and bottom performers
  top_agents: {
    agent_name: string;
    confidence: number;
    approval_rate_pct: number;
  }[];

  attention_agents: {
    agent_name: string;
    confidence: number;
    reason: string;
  }[];
}
```

### 6.8.4 Rendering Logic

```typescript
function renderAgentEmailSection(data: AgentEmailSection): string {
  let html = '';

  // Status bar
  html += renderStatusBar(data.total_agents, data.status_counts);

  // Blocking questions (only shown if any exist)
  if (data.blocking_questions.length > 0) {
    html += renderBlockingQuestions(data.blocking_questions);
  }

  // Performance metrics
  html += renderPerformanceMetrics(data.performance);

  // Top performers (only show top 3)
  if (data.top_agents.length > 0) {
    html += renderTopAgents(data.top_agents.slice(0, 3));
  }

  // Attention agents (only shown if confidence < 30)
  if (data.attention_agents.length > 0) {
    html += renderAttentionAgents(data.attention_agents);
  }

  return html;
}
```

### 6.8.5 Email Query Sources

| Field | Source Table | Query |
|-------|-------------|-------|
| Agent status counts | `agent_status` (runtime) | Group by status, count per group |
| Blocking questions | `agent_questions` | `WHERE status = 'OPEN' AND priority IN ('BLOCKING', 'IMPORTANT') ORDER BY priority, asked_at` |
| Avg confidence | `agent_confidence_log` | Latest score per agent, averaged |
| Approval rate | `action_approvals` | `WHERE decided_at >= now() - 30 days`, approved / total |
| Positive outcome rate | `agent_outcome_memories` | `WHERE created_at >= now() - 30 days`, positive / total |
| Questions stats | `agent_questions` | `WHERE asked_at >= now() - 30 days`, grouped by status |
| Top agents | `agent_confidence_log` | Latest score per agent, top 3 by confidence |
| Attention agents | `agent_confidence_log` | Latest score per agent, `WHERE confidence_score < 30` |

---

## 6.9 Implementation Notes

### 6.9.1 ALTER TABLE Additions

The following columns must be added to existing tables to support the learning system:

```sql
-- Add memory influence tracking to action_recommendations
ALTER TABLE action_recommendations
  ADD COLUMN memory_influenced BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN memory_notes JSONB DEFAULT '[]',
  ADD COLUMN agent_confidence_at_generation NUMERIC(5,2);

-- Add outcome measurement tracking to action_execution_log
ALTER TABLE action_execution_log
  ADD COLUMN outcome_measured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN outcome_measured_at TIMESTAMPTZ;
```

### 6.9.2 Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `QuestionExpirationJob` | Every hour | Expire open questions past their TTL |
| `OutcomeMeasurementJob` | Daily, 06:00 AM ET (during pipeline) | Measure execution outcomes and record to memory |
| `PatternDecayJob` | Daily, 05:30 AM ET (before pipeline) | Decay weights on patterns older than 180 days |
| `ConfidenceRecalcJob` | Daily, 05:45 AM ET (before pipeline) | Recalculate all agent confidence scores |

### 6.9.3 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `agent_questions_enabled` | `true` | Enables the clarification question loop. When off, agents proceed with conservative defaults instead of asking. |
| `agent_learning_enabled` | `true` | Enables memory recording. When off, agents still generate recommendations from framework rules but do not learn. |
| `agent_memory_influence_enabled` | `true` | Enables memory influence on recommendations. When off, memory is recorded but not used during action generation. |
| `agent_auto_approve` | `false` | Enables Phase 2 auto-approve for high-confidence agents on low-risk actions. |

### 6.9.4 Migration Order

1. Create `agent_questions` table
2. Create `agent_action_patterns` table
3. Create `agent_context_memories` table
4. Create `agent_outcome_memories` table
5. Create `agent_confidence_log` table
6. ALTER `action_recommendations` (add memory columns)
7. ALTER `action_execution_log` (add outcome tracking columns)
8. Seed initial confidence scores (50 for all 13 agents)
9. Deploy scheduled jobs
10. Enable feature flags incrementally
