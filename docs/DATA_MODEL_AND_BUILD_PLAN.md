# PMP SYSTEMS -- DATA MODEL ADDITIONS & BUILD RECOMMENDATION
## Part 7: Data Model | Part 8: Build Roadmap

### Companion Files
- `PMP_SYSTEMS_ARCHITECTURE.md` -- Core system (data model, tech stack, 7 original modules)
- `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` -- Daily plans, action recommendations, checklists
- `ACTION_PLAN_ENGINE.md` -- Action Plan Engine architecture and workflow
- `GATE_LOGIC_AND_ACTION_MAPPING.md` -- Gate logic, diagnostic-to-action mapping
- `EXTENDED_MODULES_SPEC.md` -- Syntax/Root/Inventory/Deal extensions
- `OPTIMIZATION_MODULE_SPEC.md` -- 120-column optimization workbook
- `DEAL_TRACKING_SPEC.md` -- Deal tracking data model
- `SYSTEM_EXPANSION_V3.md` -- Marketplace, Activity Log, Forecasting

---

# PART 7 -- DATA MODEL ADDITIONS

---

## 7.0 Context: Existing Action Plan Tables

The following tables already exist in the PMP Systems schema (defined in `DAILY_PLAN_ACTIONS_CHECKLIST_SPEC.md` and `ACTION_PLAN_ENGINE.md`):

| Table | Purpose |
|-------|---------|
| `daily_action_plans` | One row per day per version. Plan header with summary counts. |
| `daily_plan_products` | One row per product per plan. Gate status, segment, syntax diagnostics (JSONB). |
| `action_recommendations` | Individual recommended actions within a plan. Links to syntax, campaign, keyword. |
| `action_execution_log` | Tracks execution status of each recommendation (executed/failed/skipped/pending). |
| `flag_tracking` | Extends action_recommendations for flag-type actions. Team routing, escalation. |
| `checklist_items` | Generated per plan, per product. Interactive checkboxes for operator workflow. |
| `gate_evaluations` | Daily gate check results per product (inventory + profitability). |
| `product_stages` | Product lifecycle stage assignment (LAUNCH/GROWTH/MAINTENANCE). |
| `daily_close` | End-of-day summary (completion rate, flags sent/acknowledged). |
| `action_plans` | Alternate per-syntax action tracking from ACTION_PLAN_ENGINE.md. |

This document adds **5 new tables** for approval workflow, execution tracking, criteria violations, unified alerts, and email delivery logging. It also adds ALTER TABLE statements to connect existing tables to the new approval and execution system.

---

## 7.1 action_approvals

Tracks every approval decision. One row per action per approval event. An action can be rejected, modified, then re-approved -- each event is a separate row, creating a full audit trail.

```sql
-- ============================================================
-- ACTION APPROVALS
-- Full approval lifecycle: PROPOSED -> PENDING -> APPROVED/REJECTED/MODIFIED
-- Supports 3-tier approval: AUTO (rule-based), OPERATOR (self-approve), MANAGER
-- ============================================================
CREATE TABLE action_approvals (
    id BIGSERIAL PRIMARY KEY,

    -- Link to the action being approved
    action_item_id BIGINT NOT NULL REFERENCES action_recommendations(id) ON DELETE CASCADE,

    -- Approval tier determines who can approve
    -- AUTO: system auto-approves based on rules (low-risk, within thresholds)
    -- OPERATOR: operator self-approves (medium risk, routine changes)
    -- MANAGER: requires manager sign-off (high risk, large budget changes)
    approval_tier VARCHAR(20) NOT NULL CHECK (
        approval_tier IN ('AUTO', 'OPERATOR', 'MANAGER')
    ),

    -- Lifecycle status
    -- PROPOSED: engine generated the action, not yet submitted for approval
    -- PENDING_APPROVAL: submitted and waiting for approver decision
    -- APPROVED: approved as-is or with modifications
    -- REJECTED: rejected with reason
    -- MODIFIED: approved with changes to recommended values
    status VARCHAR(20) NOT NULL DEFAULT 'PROPOSED' CHECK (
        status IN ('PROPOSED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'MODIFIED')
    ),

    -- Who decided and when
    decided_by VARCHAR(100),               -- NULL until decision made. 'system' for auto-approvals.
    decided_at TIMESTAMPTZ,                -- NULL until decision made

    -- Reason for the decision (required for REJECTED, optional for others)
    decision_reason TEXT,

    -- For MODIFIED status: what was changed from the recommendation
    modification_details JSONB,
    /*
      {
        "field": "recommended_value",
        "original": 1.50,
        "modified_to": 1.25,
        "reason": "Conservative approach -- new product, reduce bid change to 15%"
      }
    */

    -- For AUTO approvals: which rule triggered the auto-approve
    auto_approve_rule VARCHAR(100),
    /*
      Examples:
      'bid_change_under_20pct'
      'budget_increase_under_50usd'
      'negate_keyword_any'
      'pause_both_failing_syntax'
    */

    -- Snapshot of original recommended values at time of approval request
    original_values JSONB NOT NULL,
    /*
      {
        "field": "bid",
        "current_value": 1.20,
        "recommended_value": 1.50,
        "change_pct": 25.0,
        "campaign_id": "123456789",
        "keyword_text": "bamboo sheets queen"
      }
    */

    -- Final approved values (same as original for APPROVED, different for MODIFIED)
    approved_values JSONB,
    /*
      {
        "field": "bid",
        "current_value": 1.20,
        "approved_value": 1.25,
        "change_pct": 4.2
      }
    */

    -- Sequence number for this action's approval history (1st attempt, 2nd after rejection, etc.)
    attempt_number INT NOT NULL DEFAULT 1,

    -- Link to previous approval attempt on the same action (if re-submitted after rejection)
    previous_approval_id BIGINT REFERENCES action_approvals(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_aa_action_item ON action_approvals(action_item_id);
CREATE INDEX idx_aa_status ON action_approvals(status) WHERE status IN ('PROPOSED', 'PENDING_APPROVAL');
CREATE INDEX idx_aa_tier ON action_approvals(approval_tier, status);
CREATE INDEX idx_aa_decided_by ON action_approvals(decided_by) WHERE decided_by IS NOT NULL;
CREATE INDEX idx_aa_created ON action_approvals(created_at DESC);

-- Partial index for pending approvals (the approval queue)
CREATE INDEX idx_aa_pending_queue ON action_approvals(approval_tier, created_at)
    WHERE status = 'PENDING_APPROVAL';
```

### Auto-Approve Rules Reference

The `auto_approve_rule` field maps to configurable rules stored in `system_settings` (JSONB). Default rules:

| Rule Key | Condition | Tier Result |
|----------|-----------|-------------|
| `bid_change_under_20pct` | Bid increase/decrease <= 20% AND new bid <= $3.00 | AUTO |
| `budget_increase_under_50usd` | Budget increase <= $50/day | AUTO |
| `negate_keyword_any` | Any negative keyword addition | AUTO |
| `pause_both_failing_syntax` | Pause action on BOTH_FAILING syntax with < $10/day spend | AUTO |
| `enable_after_monitoring` | Re-enable after monitoring window passed, metrics improved | AUTO |
| `cross_negative_any` | Any cross-campaign negative addition | AUTO |
| `bid_change_over_30pct` | Bid change > 30% OR new bid > $5.00 | MANAGER |
| `budget_change_over_100usd` | Budget change > $100/day | MANAGER |
| `pause_high_spend` | Pause on campaign with > $50/day spend | MANAGER |
| Everything else | Default | OPERATOR |

---

## 7.2 action_executions

Tracks the actual execution of approved actions against Amazon Ads API. Captures pre/post state snapshots for rollback capability and impact assessment.

```sql
-- ============================================================
-- ACTION EXECUTIONS
-- Tracks API execution of approved actions with full before/after snapshots
-- Supports monitoring windows and automated impact assessment
-- ============================================================
CREATE TABLE action_executions (
    id BIGSERIAL PRIMARY KEY,

    -- Links to the action and its approval
    action_item_id BIGINT NOT NULL REFERENCES action_recommendations(id) ON DELETE CASCADE,
    approval_id BIGINT NOT NULL REFERENCES action_approvals(id) ON DELETE CASCADE,

    -- Execution lifecycle
    -- QUEUED: approved, waiting to be sent to Amazon API
    -- EXECUTING: API call in progress
    -- EXECUTED: API confirmed the change
    -- FAILED: API returned error or timeout
    -- ROLLED_BACK: change was reversed (manual or automatic)
    execution_status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (
        execution_status IN ('QUEUED', 'EXECUTING', 'EXECUTED', 'FAILED', 'ROLLED_BACK')
    ),

    -- When the API call was made
    executed_at TIMESTAMPTZ,
    executed_by VARCHAR(100),              -- 'system' for auto-execution, operator name for manual

    -- Full API request payload (for audit and replay)
    api_request JSONB,
    /*
      {
        "endpoint": "sp/keywords",
        "method": "PUT",
        "body": {
          "keywordId": "987654321",
          "bid": 1.25,
          "state": "enabled"
        },
        "campaign_id": "123456789",
        "ad_group_id": "456789012"
      }
    */

    -- Full API response (for debugging and audit)
    api_response JSONB,
    /*
      {
        "status": 200,
        "body": {
          "keywordId": "987654321",
          "code": "SUCCESS",
          "description": "Successfully updated"
        },
        "latency_ms": 342
      }
    */

    -- Error details for FAILED executions
    error_message TEXT,
    error_code VARCHAR(50),                -- Amazon API error code: 'INVALID_ARGUMENT', 'THROTTLED', etc.
    retry_count INT NOT NULL DEFAULT 0,
    max_retries INT NOT NULL DEFAULT 3,
    last_retry_at TIMESTAMPTZ,

    -- PRE-EXECUTION SNAPSHOT: state of the entity BEFORE the change
    pre_execution_snapshot JSONB NOT NULL,
    /*
      {
        "entity_type": "keyword",
        "entity_id": "987654321",
        "campaign_id": "123456789",
        "captured_at": "2026-03-19T06:15:00Z",
        "values": {
          "bid": 1.20,
          "state": "enabled",
          "budget": 75.00,
          "tos_modifier": 60,
          "impressions_7d": 12400,
          "clicks_7d": 38,
          "spend_7d": 45.60,
          "sales_7d": 182.40,
          "acos_7d": 0.25,
          "orders_7d": 6
        }
      }
    */

    -- POST-EXECUTION SNAPSHOT: state confirmed after API call
    post_execution_snapshot JSONB,
    /*
      {
        "entity_type": "keyword",
        "entity_id": "987654321",
        "captured_at": "2026-03-19T06:15:02Z",
        "values": {
          "bid": 1.25,
          "state": "enabled"
        },
        "confirmed_via": "ads_api_get"
      }
    */

    -- MONITORING WINDOW: when to assess impact
    -- Starts at executed_at, ends at monitoring_window_end
    -- During this window, no new actions should be generated on the same entity
    monitoring_window_end TIMESTAMPTZ,
    /*
      Default monitoring windows by action type:
      - bid change: 72 hours (3 days)
      - placement change: 72 hours
      - budget change: 48 hours (2 days)
      - pause/enable: 48 hours
      - negate keyword: 168 hours (7 days, to see WAS% impact)
    */

    -- IMPACT ASSESSMENT: measured after monitoring window ends
    impact_assessed_at TIMESTAMPTZ,
    impact_result JSONB,
    /*
      {
        "assessment_window": "72h",
        "before": {
          "period": "2026-03-16 to 2026-03-18",
          "impressions": 12400,
          "clicks": 38,
          "spend": 45.60,
          "sales": 182.40,
          "acos": 0.25,
          "orders": 6,
          "cvr": 0.158
        },
        "after": {
          "period": "2026-03-19 to 2026-03-21",
          "impressions": 14200,
          "clicks": 46,
          "spend": 57.50,
          "sales": 230.00,
          "acos": 0.25,
          "orders": 8,
          "cvr": 0.174
        },
        "deltas": {
          "impressions_pct": 14.5,
          "clicks_pct": 21.1,
          "spend_pct": 26.1,
          "sales_pct": 26.1,
          "acos_pct": 0.0,
          "orders_pct": 33.3,
          "cvr_pct": 10.1
        },
        "verdict": "POSITIVE",
        "summary": "Bid increase drove 21% more clicks with stable ACOS. Orders up 33%."
      }
    */

    -- ROLLBACK: if the change was reversed
    rolled_back_at TIMESTAMPTZ,
    rolled_back_by VARCHAR(100),
    rollback_reason TEXT,
    rollback_api_response JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ae_action_item ON action_executions(action_item_id);
CREATE INDEX idx_ae_approval ON action_executions(approval_id);
CREATE INDEX idx_ae_status ON action_executions(execution_status);
CREATE INDEX idx_ae_executed_at ON action_executions(executed_at DESC) WHERE executed_at IS NOT NULL;
CREATE INDEX idx_ae_monitoring ON action_executions(monitoring_window_end)
    WHERE execution_status = 'EXECUTED' AND impact_assessed_at IS NULL;
CREATE INDEX idx_ae_queued ON action_executions(created_at)
    WHERE execution_status = 'QUEUED';
```

### Monitoring Window Defaults

Configured in `system_settings` under key `monitoring_windows`:

| Action Category | Default Window | Rationale |
|----------------|---------------|-----------|
| `bid` | 72 hours | Amazon needs 48-72h to recalibrate auction dynamics |
| `placement` | 72 hours | TOS/PDP modifiers affect impression distribution gradually |
| `budget` | 48 hours | Budget caps take effect within one daily cycle |
| `pause` | 48 hours | Pausing removes entity from auctions; 48h shows traffic impact |
| `enable` | 72 hours | Re-enabled entities need 72h to regain auction momentum |
| `negate` | 168 hours (7d) | WAS% reduction requires a full week of data to measure accurately |
| `cross_negative` | 168 hours (7d) | Cannibalization reduction needs a week of cross-campaign data |

---

## 7.3 criteria_violations

Stores all detected SOP/framework violations. The violation detection engine runs after the daily plan is generated and scans campaign structures, naming conventions, keyword distribution, budget utilization, and other SOP compliance criteria.

```sql
-- ============================================================
-- CRITERIA VIOLATIONS
-- All detected SOP/framework violations across 8 categories
-- Each violation links to its plan, product, and campaign context
-- ============================================================
CREATE TABLE criteria_violations (
    id BIGSERIAL PRIMARY KEY,

    -- When detected
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Context: which plan, product, campaign
    plan_id BIGINT REFERENCES daily_action_plans(id) ON DELETE SET NULL,
    product_id INT REFERENCES products(id),
    campaign_id VARCHAR(50),               -- Amazon campaign ID, NULL for product-level violations
    ad_group_id VARCHAR(50),               -- NULL unless violation is ad-group specific
    keyword_text TEXT,                      -- NULL unless violation is keyword-specific

    -- Violation category (the 8 compliance domains)
    category VARCHAR(30) NOT NULL CHECK (
        category IN (
            'naming',              -- Campaign/ad group naming convention violations
            'structure',           -- Campaign structure violations (missing match types, wrong hierarchy)
            'cross_negative',      -- Missing cross-campaign negatives causing cannibalization
            'match_distribution',  -- Unhealthy match type distribution (e.g., 90% broad, 0% exact)
            'budget_util',         -- Budget utilization issues (underspend, overspend, budget-capped)
            'was_threshold',       -- Wasted ad spend exceeding acceptable thresholds
            'rank_target',         -- Ranking keyword targets not met or declining
            'pre_deploy'           -- Pre-deployment checklist failures (new campaigns missing required elements)
        )
    ),

    -- Severity
    severity VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (
        severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')
    ),

    -- Human-readable description
    violation_description TEXT NOT NULL,
    /*
      Examples:
      - "Campaign 'SP - Bamboo Sheets - Exact' missing required prefix 'SP|DECOLURE|'"
      - "No exact match campaign exists for syntax group 'Bamboo|King'"
      - "Missing cross-negative between 'SP-Bamboo-Broad' and 'SP-Bamboo-Exact' for keyword 'bamboo sheets queen'"
      - "Match type distribution: 85% Broad, 12% Phrase, 3% Exact -- target is max 40% Broad"
      - "Campaign 'SP-Satin-Discovery' budget-capped 5 of last 7 days"
      - "WAS% at 52% for Satin|Full -- exceeds 40% threshold"
      - "Ranking keyword 'bamboo sheets' dropped from position 14 to 28 over 2 weeks"
      - "New campaign 'SP-Cooling-Launch' missing: negative keyword list, budget cap, TOS modifier"
    */

    -- Machine-readable state comparison
    current_state JSONB NOT NULL,
    /*
      {
        "campaign_name": "SP - Bamboo Sheets - Exact",
        "naming_pattern": "SP - {Material} {Product} - {MatchType}",
        "match_types_present": ["EXACT"],
        "match_types_expected": ["EXACT", "PHRASE", "BROAD"]
      }
    */

    expected_state JSONB NOT NULL,
    /*
      {
        "naming_pattern": "SP|{BRAND}|{Material}|{Product}|{MatchType}",
        "match_types_expected": ["EXACT", "PHRASE", "BROAD"],
        "cross_negatives_required": true
      }
    */

    -- SOP reference (link to the rule or documentation)
    sop_reference VARCHAR(200),
    /*
      Examples:
      'SOP-001: Campaign Naming Convention'
      'SOP-003: Match Type Distribution Requirements'
      'SOP-007: Cross-Negative Policy'
      'FRAMEWORK: Pre-Deploy Checklist v2.1'
    */

    -- Recommended fix
    recommended_fix TEXT,
    /*
      "Rename campaign from 'SP - Bamboo Sheets - Exact' to 'SP|DECOLURE|Bamboo|Sheets|Exact'"
      "Create exact match campaign for syntax group 'Bamboo|King' with keywords: bamboo sheets king, bamboo bed sheets king size"
      "Add negative exact 'bamboo sheets queen' to campaign 'SP-Bamboo-Broad'"
    */

    -- Can the system fix this automatically?
    auto_fixable BOOLEAN NOT NULL DEFAULT FALSE,
    auto_fix_details JSONB,                -- If auto_fixable, the exact API calls needed
    /*
      {
        "fix_type": "create_negative_keyword",
        "api_calls": [
          {
            "endpoint": "sp/negativeKeywords",
            "method": "POST",
            "body": {
              "campaignId": "123456789",
              "adGroupId": "456789012",
              "keywordText": "bamboo sheets queen",
              "matchType": "negativeExact"
            }
          }
        ]
      }
    */

    -- Fix lifecycle
    fix_status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (
        fix_status IN ('open', 'in_progress', 'fixed', 'waived', 'deferred')
    ),
    fixed_by VARCHAR(100),
    fixed_at TIMESTAMPTZ,

    -- Waiver: if the violation is intentionally accepted
    waived_by VARCHAR(100),
    waived_at TIMESTAMPTZ,
    waived_reason TEXT,
    waiver_expires_at TIMESTAMPTZ,         -- Waivers can expire (e.g., temporary campaign structure)

    -- Deferred: postponed to a future date
    deferred_until DATE,
    deferred_reason TEXT,

    -- Trend tracking: how many consecutive days has this violation existed?
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consecutive_days INT NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cv_plan ON criteria_violations(plan_id);
CREATE INDEX idx_cv_product ON criteria_violations(product_id);
CREATE INDEX idx_cv_campaign ON criteria_violations(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX idx_cv_category ON criteria_violations(category);
CREATE INDEX idx_cv_severity ON criteria_violations(severity);
CREATE INDEX idx_cv_status ON criteria_violations(fix_status) WHERE fix_status IN ('open', 'in_progress');
CREATE INDEX idx_cv_detected ON criteria_violations(detected_at DESC);
CREATE INDEX idx_cv_auto_fixable ON criteria_violations(auto_fixable, fix_status)
    WHERE auto_fixable = TRUE AND fix_status = 'open';

-- Composite: find all open violations for a product by category
CREATE INDEX idx_cv_product_category ON criteria_violations(product_id, category, fix_status)
    WHERE fix_status IN ('open', 'in_progress');
```

### Violation Detection Schedule

| Category | Detection Frequency | Data Source |
|----------|-------------------|-------------|
| `naming` | Daily (after ETL) | Campaign/ad group names from Ads API |
| `structure` | Daily (after ETL) | Campaign hierarchy from Ads API |
| `cross_negative` | Daily (after ETL) | Negative keyword lists + search term overlap analysis |
| `match_distribution` | Weekly (Sunday ETL) | Keyword targeting report aggregated by match type |
| `budget_util` | Daily (after ETL) | Campaign budget vs. spend from Ads API |
| `was_threshold` | Daily (after plan generation) | WAS% from syntax_weekly_metrics |
| `rank_target` | Weekly (Sunday ETL) | Keyword rank data from external tools |
| `pre_deploy` | On campaign creation event | Real-time check when new campaigns detected |

---

## 7.4 system_alerts

Unified alert table for ALL alert types across the system. Replaces scattered alert logic with a single queryable table that powers the Alert Center UI, the alert bell badge, and email notifications.

```sql
-- ============================================================
-- SYSTEM ALERTS
-- Unified alert table for all alert types
-- Powers: Alert Center page, nav bell badge, email notifications
-- ============================================================
CREATE TABLE system_alerts (
    id BIGSERIAL PRIMARY KEY,

    -- When created
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Alert classification (broad category + specific type)
    alert_category VARCHAR(30) NOT NULL CHECK (
        alert_category IN (
            'performance',       -- ACOS spike, spend anomaly, conversion drop
            'gate',              -- Gate status change (PASS->FAIL, FAIL->PASS)
            'violation',         -- SOP/criteria violation detected
            'competitor',        -- Competitor price change, new competitor, CPC war
            'cross_dept_flag',   -- Flags routed to listing/pricing/inventory/launch/brand teams
            'system',            -- ETL failures, API errors, data freshness issues
            'approval',          -- Approval reminders, escalation notices
            'execution'          -- Execution failures, rollback triggers
        )
    ),

    -- Specific alert type within the category
    alert_type VARCHAR(50) NOT NULL,
    /*
      Performance:   'acos_spike', 'spend_anomaly', 'conversion_drop', 'impression_collapse',
                     'was_threshold_breach', 'budget_capped', 'organic_share_decline'
      Gate:          'gate_fail_new', 'gate_fail_resolved', 'gate_warn_new', 'inventory_critical'
      Violation:     'naming_violation', 'structure_violation', 'cross_negative_missing',
                     'match_distribution_skewed', 'budget_util_issue', 'was_threshold_exceeded',
                     'rank_target_missed', 'pre_deploy_failure'
      Competitor:    'price_undercut', 'new_competitor', 'cpc_escalation', 'market_share_loss'
      Cross-Dept:    'flag_listing', 'flag_pricing', 'flag_inventory', 'flag_launch', 'flag_brand_mgmt'
      System:        'etl_failure', 'api_error', 'data_stale', 'quota_warning'
      Approval:      'approval_pending', 'approval_reminder', 'approval_escalated', 'approval_expired'
      Execution:     'execution_failed', 'rollback_triggered', 'monitoring_window_ended'
    */

    -- Severity
    severity VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (
        severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO')
    ),

    -- Entity context (what this alert is about)
    product_id INT REFERENCES products(id),
    campaign_id VARCHAR(50),
    syntax_group_id INT REFERENCES syntax_groups(id),
    keyword_text TEXT,

    -- Human-readable content
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,

    -- Machine-readable evidence (for programmatic consumption)
    evidence JSONB,
    /*
      {
        "metric": "acos",
        "current_value": 0.38,
        "previous_value": 0.22,
        "threshold": 0.30,
        "change_pct": 72.7,
        "period": "7d",
        "trend": [0.22, 0.24, 0.28, 0.32, 0.38]
      }
    */

    -- Recommended action (what should be done about this alert)
    recommended_action TEXT,

    -- Links to related entities
    related_plan_id BIGINT REFERENCES daily_action_plans(id),
    related_recommendation_id BIGINT REFERENCES action_recommendations(id),
    related_violation_id BIGINT REFERENCES criteria_violations(id),
    related_execution_id BIGINT REFERENCES action_executions(id),

    -- Alert lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'acknowledged', 'resolved', 'snoozed', 'auto_resolved')
    ),

    -- Snooze
    snoozed_until TIMESTAMPTZ,
    snoozed_by VARCHAR(100),
    snooze_reason TEXT,

    -- Acknowledge
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ,

    -- Resolve
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    resolution_note TEXT,

    -- Notification tracking
    notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notification_sent_at TIMESTAMPTZ,
    email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    email_log_id BIGINT,                   -- FK added after daily_email_log is created

    -- Deduplication: prevent the same alert from firing repeatedly
    -- The fingerprint is a hash of (alert_type + product_id + campaign_id + keyword_text)
    alert_fingerprint VARCHAR(64),
    suppressed_count INT NOT NULL DEFAULT 0, -- How many times this alert was suppressed as duplicate

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sa_category ON system_alerts(alert_category);
CREATE INDEX idx_sa_type ON system_alerts(alert_type);
CREATE INDEX idx_sa_severity ON system_alerts(severity);
CREATE INDEX idx_sa_product ON system_alerts(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_sa_status ON system_alerts(status) WHERE status IN ('active', 'acknowledged');
CREATE INDEX idx_sa_created ON system_alerts(created_at DESC);
CREATE INDEX idx_sa_snoozed ON system_alerts(snoozed_until)
    WHERE status = 'snoozed' AND snoozed_until IS NOT NULL;

-- For the alert bell badge: count of unacknowledged active alerts
CREATE INDEX idx_sa_unacknowledged ON system_alerts(status, severity, created_at DESC)
    WHERE status = 'active' AND acknowledged_at IS NULL;

-- Deduplication lookup
CREATE INDEX idx_sa_fingerprint ON system_alerts(alert_fingerprint, created_at DESC)
    WHERE alert_fingerprint IS NOT NULL;
```

### Alert Severity Rules

| Severity | Trigger Examples | Badge Color | Email? |
|----------|-----------------|-------------|--------|
| CRITICAL | Gate FAIL, ACOS > 2x breakeven, inventory < 14 days, execution failure | Red | Immediately |
| HIGH | WAS% > 40%, conversion drop > 30%, budget-capped 3+ days | Orange | In daily digest |
| MEDIUM | Naming violation, match distribution skew, rank target missed | Yellow | In daily digest |
| LOW | Minor structure issue, budget utilization below 70% | Blue | Weekly summary |
| INFO | Gate resolved, monitoring window ended, execution confirmed | Gray | Never |

---

## 7.5 daily_email_log

Enhanced email delivery tracking. Every email sent by PMP Systems is logged here with content metadata for debugging, analytics, and resend capability.

```sql
-- ============================================================
-- DAILY EMAIL LOG
-- Tracks every email sent by PMP Systems
-- Links to plans, approvals, and alerts for full traceability
-- ============================================================
CREATE TABLE daily_email_log (
    id BIGSERIAL PRIMARY KEY,

    -- Which plan this email relates to (NULL for non-plan emails like alert-only emails)
    plan_id BIGINT REFERENCES daily_action_plans(id),

    -- Delivery metadata
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Email type
    email_type VARCHAR(30) NOT NULL CHECK (
        email_type IN (
            'daily_digest',        -- Morning daily action plan email (06:30 AM)
            'critical_alert',      -- Immediate email for CRITICAL severity alerts
            'approval_reminder',   -- Noon reminder for pending approvals
            'approval_decision',   -- Notification of approval/rejection decision
            'eod_summary',         -- End-of-day completion summary (6:00 PM)
            'weekly_report',       -- Weekly performance rollup (Sunday night)
            'violation_report',    -- Weekly violation summary
            'system_alert'         -- System health alerts (ETL failure, API errors)
        )
    ),

    -- Recipients
    recipients TEXT[] NOT NULL,            -- Array of email addresses
    cc_recipients TEXT[],                  -- CC addresses

    -- Email content metadata
    subject VARCHAR(500) NOT NULL,

    -- Which sections were included in the email (for daily_digest)
    sections_included JSONB,
    /*
      {
        "sections": [
          "critical_products",
          "optimization_products",
          "scale_products",
          "syntax_diagnostics",
          "approval_queue",
          "violations_summary",
          "yesterday_comparison",
          "alerts_active"
        ],
        "products_covered": [1, 2, 3, 5, 7],
        "total_sections": 8
      }
    */

    -- Content counts (for quick analytics without parsing JSONB)
    actions_count INT NOT NULL DEFAULT 0,
    violations_count INT NOT NULL DEFAULT 0,
    alerts_count INT NOT NULL DEFAULT 0,
    approvals_pending_count INT NOT NULL DEFAULT 0,

    -- Delivery status
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (
        delivery_status IN ('sent', 'delivered', 'bounced', 'failed', 'pending')
    ),

    -- Resend API (Resend.com) tracking
    resend_message_id VARCHAR(100),        -- Resend API message ID for delivery tracking
    resend_status VARCHAR(20),             -- Status from Resend webhook: 'sent', 'delivered', 'bounced'
    resend_webhook_data JSONB,             -- Raw webhook payload from Resend

    -- Error tracking
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,

    -- Link to specific alerts included in this email
    alert_ids BIGINT[],                    -- Array of system_alerts.id included in this email

    -- Link to specific approval IDs referenced in this email
    approval_ids BIGINT[],                 -- Array of action_approvals.id referenced

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_del_plan ON daily_email_log(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX idx_del_type ON daily_email_log(email_type);
CREATE INDEX idx_del_sent ON daily_email_log(sent_at DESC);
CREATE INDEX idx_del_status ON daily_email_log(delivery_status) WHERE delivery_status != 'delivered';
CREATE INDEX idx_del_resend ON daily_email_log(resend_message_id) WHERE resend_message_id IS NOT NULL;
```

### Email Schedule

| Email Type | Trigger | Time | Condition |
|-----------|---------|------|-----------|
| `daily_digest` | BullMQ cron job | 06:30 AM ET | Always (every business day) |
| `critical_alert` | Real-time event | Immediate | When CRITICAL severity alert is created |
| `approval_reminder` | BullMQ cron job | 12:00 PM ET | When approvals_pending_count > 0 |
| `approval_decision` | Event-driven | Immediate | When an approval is decided (approved/rejected) |
| `eod_summary` | BullMQ cron job | 06:00 PM ET | Always (every business day) |
| `weekly_report` | BullMQ cron job | 08:00 PM ET Sunday | Always |
| `violation_report` | BullMQ cron job | 08:30 PM ET Sunday | When open violations exist |
| `system_alert` | Event-driven | Immediate | When system-level CRITICAL alert fires |

---

## 7.6 ALTER TABLE Statements for Existing Tables

These statements add columns and foreign keys to connect existing tables to the new approval and execution system.

```sql
-- ============================================================
-- ALTER: action_recommendations
-- Add approval-related columns
-- ============================================================
ALTER TABLE action_recommendations
    ADD COLUMN approval_status VARCHAR(20) DEFAULT 'NOT_REQUIRED'
        CHECK (approval_status IN ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'MODIFIED')),
    ADD COLUMN current_approval_id BIGINT REFERENCES action_approvals(id),
    ADD COLUMN execution_id BIGINT REFERENCES action_executions(id),
    ADD COLUMN risk_score INT DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100);
    -- risk_score: 0-30 = AUTO, 31-60 = OPERATOR, 61-100 = MANAGER

COMMENT ON COLUMN action_recommendations.risk_score IS
    'Risk score 0-100. Determines approval tier: 0-30=AUTO, 31-60=OPERATOR, 61-100=MANAGER';

CREATE INDEX idx_ar_approval_status ON action_recommendations(approval_status)
    WHERE approval_status IN ('PENDING', 'APPROVED');

-- ============================================================
-- ALTER: action_execution_log
-- Link to new action_executions table
-- ============================================================
ALTER TABLE action_execution_log
    ADD COLUMN execution_id BIGINT REFERENCES action_executions(id),
    ADD COLUMN approval_id BIGINT REFERENCES action_approvals(id);

-- ============================================================
-- ALTER: daily_action_plans
-- Add violation and alert summary counts
-- ============================================================
ALTER TABLE daily_action_plans
    ADD COLUMN violations_count INT NOT NULL DEFAULT 0,
    ADD COLUMN violations_critical INT NOT NULL DEFAULT 0,
    ADD COLUMN alerts_count INT NOT NULL DEFAULT 0,
    ADD COLUMN alerts_critical INT NOT NULL DEFAULT 0,
    ADD COLUMN approvals_pending INT NOT NULL DEFAULT 0,
    ADD COLUMN approvals_auto_approved INT NOT NULL DEFAULT 0,
    ADD COLUMN email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN email_sent_at TIMESTAMPTZ,
    ADD COLUMN email_log_id BIGINT;
    -- FK added after daily_email_log is created:
    -- ALTER TABLE daily_action_plans ADD CONSTRAINT fk_dap_email
    --     FOREIGN KEY (email_log_id) REFERENCES daily_email_log(id);

-- ============================================================
-- ALTER: system_alerts (add FK to daily_email_log after both exist)
-- ============================================================
ALTER TABLE system_alerts
    ADD CONSTRAINT fk_sa_email_log FOREIGN KEY (email_log_id) REFERENCES daily_email_log(id);

-- ============================================================
-- ALTER: daily_action_plans (add FK to daily_email_log after both exist)
-- ============================================================
ALTER TABLE daily_action_plans
    ADD CONSTRAINT fk_dap_email_log FOREIGN KEY (email_log_id) REFERENCES daily_email_log(id);

-- ============================================================
-- ALTER: daily_close
-- Add violation and approval metrics
-- ============================================================
ALTER TABLE daily_close
    ADD COLUMN violations_found INT DEFAULT 0,
    ADD COLUMN violations_fixed INT DEFAULT 0,
    ADD COLUMN violations_waived INT DEFAULT 0,
    ADD COLUMN auto_approved INT DEFAULT 0,
    ADD COLUMN operator_approved INT DEFAULT 0,
    ADD COLUMN manager_approved INT DEFAULT 0,
    ADD COLUMN rejected INT DEFAULT 0,
    ADD COLUMN executions_success INT DEFAULT 0,
    ADD COLUMN executions_failed INT DEFAULT 0,
    ADD COLUMN executions_rolled_back INT DEFAULT 0;
```

---

## 7.7 Entity Relationship Diagram (New Tables)

```
action_recommendations (existing)
    │
    ├──► action_approvals (1:N -- one action can have multiple approval attempts)
    │        │
    │        └──► action_executions (1:1 per approved action)
    │                 │
    │                 └── impact_result (JSONB -- before/after metrics)
    │
    ├──► system_alerts (via related_recommendation_id)
    │
    └──► criteria_violations (via related_recommendation_id in alerts)

daily_action_plans (existing)
    │
    ├──► criteria_violations (plan_id)
    ├──► system_alerts (related_plan_id)
    └──► daily_email_log (plan_id)

products (existing)
    │
    ├──► criteria_violations (product_id)
    └──► system_alerts (product_id)
```

---

## 7.8 Complete Table Count

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
| **Approval workflow** | **1** | **action_approvals** |
| **Execution tracking** | **1** | **action_executions** |
| **Violations** | **1** | **criteria_violations** |
| **Alerts** | **1** | **system_alerts** |
| **Email** | **1** | **daily_email_log** |
| **Total** | **~42** | **5 new + 4 ALTERs** |

---
---

# PART 8 -- BUILD RECOMMENDATION

---

## 8.1 Phase 1 (MVP) -- Approval + Email Foundation

**Duration:** 3-4 weeks
**Goal:** Get the approval queue, basic email, and violation detection running so the operator can review and approve actions before execution.

### What to Build

| Component | Description | Priority |
|-----------|-------------|----------|
| **Approval Queue UI** | Web page showing all PENDING_APPROVAL actions grouped by tier (AUTO/OPERATOR/MANAGER). Approve, reject, or modify inline. | P0 |
| **Basic Approval Workflow** | Backend: action_recommendations -> Propose -> auto-approve (if rule matches) or route to queue -> Approve/Reject -> update status. | P0 |
| **Auto-Approve Rules Engine** | Configurable rules (stored in `system_settings` JSONB). Evaluate each action against rules. Low-risk actions auto-approve without human intervention. | P0 |
| **Daily Digest Email** | Morning email via Resend with all 8 sections: critical products, optimization products, scale products, syntax diagnostics, approval queue summary, violations summary, yesterday comparison, active alerts. | P0 |
| **Criteria Violation Detection (naming + structure)** | Scan campaign names against SOP naming convention. Detect missing match type campaigns per syntax group. Write violations to `criteria_violations` table. | P1 |
| **Alert Bell + Alert Center** | Nav bar bell icon with unacknowledged count badge. Alert Center page: filterable list of all active alerts. Acknowledge, snooze, resolve inline. | P1 |
| **Action Execution Logging (manual)** | Operator clicks "Mark as Executed" on an approved action. System records in `action_execution_log` and `action_executions` with manual status. No API calls yet. | P1 |
| **DB Migrations** | Create all 5 new tables + 4 ALTER statements. Seed auto-approve rules. | P0 |

### Deliverables

1. `/api/approvals` -- CRUD endpoints for approval queue
2. `/api/violations` -- List/filter/update violations
3. `/api/alerts` -- List/filter/acknowledge/resolve alerts
4. `/api/email/daily-digest` -- Trigger daily digest (also on cron)
5. `/app/approvals` -- Approval Queue page (Next.js)
6. `/app/alerts` -- Alert Center page (Next.js)
7. Email template: `daily-digest.tsx` (React Email + Resend)
8. BullMQ job: `DailyDigestEmailJob` (06:30 AM ET)
9. BullMQ job: `ViolationDetectionJob` (after ETL)
10. BullMQ job: `AlertGenerationJob` (after plan generation)

---

## 8.2 Phase 2 -- Full Compliance + Automation

**Duration:** 3-4 weeks
**Goal:** Complete the violation detection suite across all 8 categories, add email interactivity, and begin tracking action impact.

### What to Build

| Component | Description | Priority |
|-----------|-------------|----------|
| **Full Violation Suite (all 8 categories)** | Extend violation engine: cross-negative detection, match distribution analysis, budget utilization checks, WAS threshold monitoring, rank target tracking, pre-deploy validation. | P0 |
| **Cross-Negative Detection Engine** | Analyze search term reports to find keywords appearing in multiple campaigns without cross-negatives. Flag cannibalization. | P0 |
| **Match Type Distribution Analysis** | Per syntax group: calculate % of spend/impressions by match type. Flag when distribution is outside healthy bounds (e.g., > 50% broad). | P1 |
| **Auto-Fix for Detectable Violations** | For `auto_fixable = TRUE` violations: generate the fix, submit for approval, execute if auto-approved. Start with cross-negatives and naming fixes. | P1 |
| **Approval Email with One-Click Links** | Email contains approve/reject buttons using signed URLs. Clicking the link hits `/api/approvals/:id/decide?token=...&decision=APPROVED`. | P0 |
| **Approval Reminder Emails** | Noon BullMQ job checks for pending approvals. Sends reminder email listing all pending items with one-click approve links. | P1 |
| **Action Impact Tracking** | After monitoring window ends (3/7/14 day windows), run impact assessment: compare before/after metrics, write to `action_executions.impact_result`. | P0 |
| **Violation Trend Analysis** | Track `consecutive_days` per violation. Escalate severity if violation persists > 7 days. Weekly violation trend chart on Alert Center. | P1 |

### Deliverables

1. 6 additional violation detector services (one per category)
2. `CrossNegativeDetector` service
3. `MatchDistributionAnalyzer` service
4. `AutoFixExecutor` service (generates fix -> submits for approval)
5. Email template: `approval-reminder.tsx`
6. Email template: `approval-decision.tsx`
7. Signed URL generation for one-click email approve/reject
8. BullMQ job: `ApprovalReminderJob` (12:00 PM ET)
9. BullMQ job: `ImpactAssessmentJob` (hourly -- checks if monitoring windows have ended)
10. Violation trend chart component (Recharts)

---

## 8.3 Phase 3 -- Automated Execution + Intelligence

**Duration:** 2-3 weeks
**Goal:** Connect to Amazon Ads API for real execution, add rollback, impact scoring, and full audit capability.

### What to Build

| Component | Description | Priority |
|-----------|-------------|----------|
| **Amazon Ads API Execution** | For approved actions: build API request, call Amazon Ads API (bid push, budget change, keyword pause, placement modifier, negative keyword add). Write request/response to `action_executions`. | P0 |
| **Pre-Execution Snapshot** | Before any API call, read current state from Amazon Ads API. Store in `pre_execution_snapshot`. | P0 |
| **Post-Execution Confirmation** | After API call, re-read entity state to confirm change applied. Store in `post_execution_snapshot`. | P0 |
| **Monitoring Window Enforcement** | During monitoring window: suppress new recommendations on the same entity. Show "In Monitoring" badge on action cards. | P0 |
| **Rollback Capability** | "Rollback" button on executed actions: reads `pre_execution_snapshot`, builds reverse API call, executes, marks as ROLLED_BACK. | P1 |
| **Impact Assessment Engine** | Automated comparison: pull metrics for the before-period and after-period. Calculate deltas. Assign verdict (POSITIVE/NEUTRAL/NEGATIVE). | P0 |
| **Operator Scoring** | Track per-operator: actions approved, execution success rate, avg impact score. Surface on Settings page. | P2 |
| **Violation Auto-Remediation** | For persistent violations (> 14 days): auto-generate fix action, auto-approve if low risk, execute. | P2 |
| **EOD Summary Email** | 6:00 PM email: today's completion rate, actions executed, violations found/fixed, alerts resolved, tomorrow preview. | P1 |
| **Full Audit Trail** | Audit log page: chronological view of all approvals, executions, rollbacks, violations, alerts for any product/campaign. Exportable. | P1 |

### Deliverables

1. `AmazonAdsExecutor` service (builds + sends API requests)
2. `SnapshotService` (captures pre/post state)
3. `MonitoringWindowEnforcer` (suppresses recommendations)
4. `RollbackService` (reverse execution)
5. `ImpactAssessmentEngine` (metrics comparison + verdict)
6. Email template: `eod-summary.tsx`
7. `/app/audit` -- Audit Trail page
8. BullMQ job: `ExecutionQueueProcessor` (processes QUEUED executions)
9. BullMQ job: `EODSummaryEmailJob` (6:00 PM ET)
10. BullMQ job: `AutoRemediationJob` (daily, after violation detection)

---

## 8.4 Complete System Build Sequence -- Master Plan

### 8.4.1 Workstream Dependency Map

```
FOUNDATION LAYER (must complete first)
──────────────────────────────────────
[1] Data Pipeline (Amazon APIs + SP-API)
[2] Core UI Shell (Next.js + nav + auth)
[15] Settings (API credentials, product config, COGS)

CORE ANALYTICS (depends on Foundation)
──────────────────────────────────────
[3] Executive Control Panel ─────────────── depends on [1, 2]
[4] Keyword Engine ──────────────────────── depends on [1, 2]
[5] Syntax Analysis + Root Analysis ─────── depends on [1, 2, 4]

OPERATIONAL MODULES (depends on Core Analytics)
──────────────────────────────────────
[6] Optimization Module ─────────────────── depends on [4, 5]
[7] Inventory Management ───────────────── depends on [1, 2]
[11] Marketplace Tracking ──────────────── depends on [1, 2]
[12] Deal Tracking ─────────────────────── depends on [1, 2, 7]

ACTION + INTELLIGENCE (depends on Operational)
──────────────────────────────────────
[8] Action Plan Engine + Approval ───────── depends on [5, 6, 7]
[14] Alert System + Violation Detection ─── depends on [5, 6, 8]
[9] Email Automation ───────────────────── depends on [8, 14]
[13] Forecasting ───────────────────────── depends on [3, 5, 6]
[10] Activity Log + Comments ───────────── depends on [2, 8]
```

### 8.4.2 Week-by-Week Gantt Chart

```
WEEK    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
────────────────────────────────────────────────────────────────────────────────────

[15] Settings
        ████████
        W1   W2

[1]  Data Pipeline (Amazon APIs + SP-API)
        ████████████████████████
        W1   W2   W3   W4

[2]  Core UI Shell (Next.js + nav + auth)
        ████████████████
        W1   W2   W3

[3]  Executive Control Panel
                       ████████████████
                       W4   W5   W6

[4]  Keyword Engine
                       ████████████████████████
                       W4   W5   W6   W7

[5]  Syntax + Root Analysis
                             ████████████████████████
                             W5   W6   W7   W8

[7]  Inventory Management
                       ████████████████
                       W4   W5   W6

[11] Marketplace Tracking
                             ████████████████
                             W5   W6   W7

[12] Deal Tracking
                                  ████████████████
                                  W6   W7   W8

[6]  Optimization Module
                                       ████████████████████████
                                       W7   W8   W9   W10

[8]  Action Plan Engine + Approval (Phase 1)
                                            ████████████████████████
                                            W8   W9   W10  W11

[14] Alert System + Violation Detection
                                                 ████████████████████████
                                                 W9   W10  W11  W12

[9]  Email Automation
                                                      ████████████████
                                                      W10  W11  W12

[10] Activity Log + Comments
                                                      ████████████████
                                                      W10  W11  W12

[13] Forecasting
                                                           ████████████████
                                                           W11  W12  W13

[8b] Action Plan Phase 2 (Full Compliance)
                                                                ████████████████████████
                                                                W12  W13  W14  W15

[8c] Action Plan Phase 3 (Auto-Execution)
                                                                          ████████████████
                                                                          W14  W15  W16

LEGEND:  ████ = Active development week
```

### 8.4.3 Critical Path

The critical path (longest sequential dependency chain) is:

```
Data Pipeline [W1-W4]
  -> Keyword Engine [W4-W7]
    -> Syntax + Root [W5-W8]
      -> Optimization Module [W7-W10]
        -> Action Plan Engine [W8-W11]
          -> Alert System [W9-W12]
            -> Phase 2 Compliance [W12-W15]
              -> Phase 3 Auto-Execution [W14-W16]
```

**Total critical path: 16 weeks.** Parallel workstreams (Inventory, Marketplace, Deal Tracking, Forecasting, Activity Log) run alongside without extending the critical path.

### 8.4.4 Parallel Workstream Groups

| Parallel Group | Workstreams | Weeks |
|---------------|-------------|-------|
| Group A: Foundation | Data Pipeline + Core UI + Settings | W1-W4 |
| Group B: Analytics | Executive Panel + Keyword Engine + Inventory | W4-W7 |
| Group C: Analysis | Syntax/Root + Marketplace + Deal Tracking | W5-W8 |
| Group D: Optimization | Optimization Module + Action Plan Ph1 | W7-W11 |
| Group E: Intelligence | Alerts + Email + Activity Log + Forecasting | W9-W13 |
| Group F: Advanced | Phase 2 Compliance + Phase 3 Execution | W12-W16 |

---

## 8.5 Parallel Execution Strategy for 2 Developers

### Dev A: Backend (APIs, ETL, engine logic, database)
### Dev B: Frontend (UI, components, pages, charts)

### 8.5.1 Contract-First Development

To prevent blocking, Dev A and Dev B agree on API contracts (tRPC router types) BEFORE building. Dev A implements the API; Dev B builds the UI against mock data, then swaps to real data when the API is ready.

```
DEV A (Backend)                          DEV B (Frontend)
──────────────                          ──────────────────
                    │
  Define tRPC types ◄─── AGREE ON ───► Define tRPC types
  for each module        CONTRACTS     for each module
                    │
  Build API + DB    │                   Build UI + components
  (real data)       │                   (mock data from types)
                    │
  API ready ────────┼──── INTEGRATE ──► Swap mock → real API
                    │
```

### 8.5.2 Week-by-Week Developer Assignments

```
WEEK  DEV A (Backend)                        DEV B (Frontend)
──────────────────────────────────────────────────────────────────

W1    DB schema creation (all tables)        Next.js project setup
      Amazon Ads API client scaffold         Tailwind + design tokens
      SP-API client scaffold                 Layout shell (sidebar, nav, header)
      Redis + BullMQ setup                   Auth flow (API key login)
      Settings API (credentials CRUD)        Settings pages (credentials, products)
                                             Component library start
      ─── CONTRACT: Settings tRPC types ───

W2    ETL pipeline: raw ingestion jobs       Executive Control Panel UI (mock data)
      Ads API: campaign report sync          Product cards + KPI widgets
      SP-API: business report sync           TanStack Table base config
      SQP data import pipeline               Recharts chart components
      Data cleaning + transformation         Responsive grid layout
      ─── CONTRACT: Executive tRPC types ──

W3    ETL: aggregation jobs (weekly rollup)  Executive Panel: charts + drill-down
      Syntax classification engine           Keyword Engine UI (mock data)
      Keyword-to-syntax mapping              Keyword table (67+ columns, virtual scroll)
      Product weekly metrics calc            Filter bar component
      Account weekly metrics calc            Column visibility manager
      ─── CONTRACT: Keyword tRPC types ────

W4    Keyword Engine API                     Keyword Engine: integrate real API
      Root aggregation engine                Syntax Analysis UI (mock data)
      Syntax weekly metrics calc             Syntax table + quadrant badges
      Root weekly metrics calc               Root Analysis UI (mock data)
      Gate evaluation engine                 Root table + drill-down to syntax
      ─── CONTRACT: Syntax/Root types ─────

W5    Syntax + Root API endpoints            Syntax: quadrant visualization
      Inventory snapshot sync (SP-API)       Root: performance heatmap
      Inventory days-of-stock calc           Inventory Management UI (mock data)
      Marketplace tracking API               Marketplace Tracking UI (mock data)
      Deal tracking data sync                Deal Tracking UI (mock data)
      ─── CONTRACT: Inventory/Market/Deal ─

W6    Optimization Module API                Inventory: integrate real API
      120-column optimization logic          Marketplace: integrate real API
      WAS calculation engine                 Optimization Module UI (mock data)
      Bid recommendation engine              Optimization workbook table (120 cols)
      Placement recommendation engine        Bulk action toolbar
      ─── CONTRACT: Optimization types ────

W7    Deal tracking API + lifecycle          Optimization: integrate real API
      Optimization integration testing       Deal Tracking: integrate real API
      Action Plan Engine: Stage 1-3          Action Plan UI shell (mock data)
      (gate eval, stage classify, quadrant)  Daily plan card layout
      DB migrations for 5 new tables         Yesterday comparison panel
      ─── CONTRACT: Action Plan types ─────

W8    Action Plan Engine: Stage 4-6          Action Plan: integrate Stage 1-3
      (root cause, action gen, prioritize)   Syntax diagnostic mini-table per product
      Approval workflow backend              Approval Queue page (mock data)
      Auto-approve rules engine              Approve/reject/modify inline UI
      action_approvals API                   Risk score badge component
      ─── CONTRACT: Approval types ────────

W9    Approval queue API (filter/sort/page)  Approval Queue: integrate real API
      Alert generation engine                Alert Center page (mock data)
      system_alerts API                      Alert bell badge in nav
      Violation detection (naming+structure) Violation list/filter UI
      criteria_violations API                Snooze/acknowledge/resolve inline
      ─── CONTRACT: Alert/Violation types ─

W10   Email automation: daily digest         Alert Center: integrate real API
      Resend integration                     Violation UI: integrate real API
      Email template: daily-digest.tsx       Activity Log page (mock data)
      BullMQ: DailyDigestEmailJob            Comments component (threaded)
      Activity Log API                       Email preview component
      ─── CONTRACT: Email/Activity types ──

W11   Approval email (signed URL links)      Activity Log: integrate real API
      Approval reminder job                  Forecasting UI (mock data)
      Full violation suite (6 remaining)     Trend charts + projections
      Cross-negative detection engine        Action Plan Phase 2 UI polish
      Match distribution analyzer            Violation trend chart
      ─── CONTRACT: Forecast types ────────

W12   Impact assessment engine               Forecasting: integrate real API
      EOD summary email                      Impact assessment result cards
      Forecasting API                        Execution status badges
      Monitoring window enforcer             Rollback confirmation modal
      Auto-fix for violations                Audit trail page (mock data)

W13   Amazon Ads API execution service       Audit trail: integrate real API
      Pre/post execution snapshots           One-click email approve integration
      Execution queue processor              Operator scoring dashboard
      Rollback service                       Phase 2 violation views
      Operator scoring API                   Auto-remediation status UI

W14   Integration testing (all modules)      End-to-end UI testing
      Performance optimization (queries)     Mobile responsiveness pass
      Error handling + retry logic           Loading states + error boundaries
      API rate limit tuning                  Accessibility audit

W15   Load testing (12 products, 187 camps)  Polish: animations, transitions
      Security review                        User acceptance testing
      Monitoring + alerting setup            Bug fixes from UAT
      Documentation                         Documentation (UI guide)

W16   Production deployment                  Production deployment
      Smoke testing                          Smoke testing
      Runbook creation                       Operator training walkthrough
      Handoff                                Handoff
```

### 8.5.3 Integration Points (Where Dev A + Dev B Must Sync)

Each integration point is a 30-minute sync meeting to verify the API contract works end-to-end.

| Week | Integration | What to Verify |
|------|------------|----------------|
| W3 | Executive Panel | KPI data flows from DB -> API -> UI correctly |
| W4 | Keyword Engine | 67-column table renders real data, filters work |
| W5 | Syntax/Root | Quadrant classification displays correctly, drill-down works |
| W6 | Inventory + Marketplace | Stock levels, marketplace data renders |
| W7 | Optimization | 120-column workbook loads, bulk actions send |
| W8 | Action Plan | Daily plan renders with real gate/syntax data |
| W9 | Approval Queue | Approve/reject flow works end-to-end |
| W10 | Alerts + Violations | Alert bell badge, violation list, real data |
| W11 | Email | Daily digest sends with real data, links work |
| W12 | Impact + Forecasting | Impact cards display, forecast charts render |
| W13 | Execution | API execution works, rollback works |
| W14 | Full Integration | All modules connected, no mock data remaining |

### 8.5.4 Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Amazon API rate limits during testing | Delays in data pipeline | Build mock API layer for development. Only test against live API in staging. |
| Approval workflow edge cases | Complex state machine bugs | Write state machine tests first (PROPOSED -> PENDING -> APPROVED -> EXECUTED). Cover rejection + resubmit loop. |
| Email deliverability | Digest lands in spam | Set up Resend domain verification in W1. Test with real recipients in W10. |
| 120-column table performance | UI freezes on large datasets | Use TanStack Table virtual scrolling from W3. Benchmark with 10K rows. |
| Cross-negative detection accuracy | False positives in violation detection | Start with high-confidence rules only (exact keyword matches across campaigns). Add fuzzy matching in Phase 2. |
| Developer illness / unavailability | 1-2 week delay | Both developers document API contracts. Either developer can pick up the other's work if contracts are well-defined. |
| Scope creep | Timeline extends beyond 16 weeks | Strict Phase 1/2/3 boundaries. Phase 3 features (auto-execution, rollback) can be deferred without breaking core functionality. |

### 8.5.5 Minimum Viable System (Week 11 Checkpoint)

By Week 11, even if Phase 3 is delayed, the system delivers:

- Full data pipeline (Amazon APIs -> PostgreSQL)
- All 7 original modules (Executive, Keyword, Syntax, Root, Optimization, Inventory, Marketplace)
- Deal Tracking
- Daily Action Plan with approval workflow
- Alert Center with violation detection (naming + structure)
- Daily digest email
- Activity Log with comments
- Manual action execution logging

This is a fully operational PPC operating system. Phase 3 (automated API execution, rollback, impact assessment) adds automation but is not required for daily operations.

---

*End of Part 7 (Data Model) and Part 8 (Build Recommendation). These additions bring the PMP Systems database to ~42 tables with full approval, execution, violation, alert, and email tracking capability. The 16-week build plan delivers a minimum viable system by Week 11 with two developers working in parallel.*
