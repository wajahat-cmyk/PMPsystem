# PART 4 — DEAL TRACKING SPECIFICATION

---

## 4.1 Data Model

### 4.1.1 `deals` Table

The primary record for each deal event across all brands and products.

```sql
CREATE TABLE deals (
    deal_id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id            VARCHAR(50)     NOT NULL,               -- 'DECOLURE' | 'SLEEPHORIA' | 'SLEEP_SANCTUARY'
    product_id          VARCHAR(50)     NOT NULL,               -- internal product ID
    asin                VARCHAR(10)     NOT NULL,               -- Amazon ASIN
    marketplace_id      VARCHAR(20)     NOT NULL DEFAULT 'ATVPDKIKX0DER', -- US marketplace

    -- Deal Identity
    deal_type           VARCHAR(50)     NOT NULL,               -- see ENUM below
    deal_name           VARCHAR(255),                           -- e.g. "Prime Day Lightning Deal - DECOLURE Pillow Set"
    amazon_deal_id      VARCHAR(100),                           -- Amazon's internal deal ID (when available via API)
    promotion_id        VARCHAR(100),                           -- SP-API Promotions ID (if applicable)

    -- Deal Timing
    start_date          DATE            NOT NULL,
    end_date            DATE            NOT NULL,
    start_time          TIME,                                   -- for Lightning Deals (exact hour)
    end_time            TIME,                                   -- for Lightning Deals (exact hour)
    duration_hours      NUMERIC(6,2)    GENERATED ALWAYS AS    -- auto-calculated
                            (EXTRACT(EPOCH FROM (end_date + end_time - start_date - start_time)) / 3600) STORED,
    duration_days       INTEGER         GENERATED ALWAYS AS
                            (end_date - start_date + 1) STORED,

    -- Pricing & Discount
    regular_price       NUMERIC(10,2)   NOT NULL,               -- price immediately before deal
    deal_price          NUMERIC(10,2)   NOT NULL,               -- price during deal
    discount_amount     NUMERIC(10,2)   GENERATED ALWAYS AS
                            (regular_price - deal_price) STORED,
    discount_pct        NUMERIC(5,2)    GENERATED ALWAYS AS
                            (ROUND((regular_price - deal_price) / regular_price * 100, 2)) STORED,
    discount_type       VARCHAR(20)     NOT NULL,               -- 'AMOUNT' | 'PERCENTAGE'
    coupon_clip_type    VARCHAR(20),                            -- 'PERCENTAGE' | 'AMOUNT' (for coupons only)
    coupon_amount       NUMERIC(10,2),                          -- face value of coupon

    -- Deal Status
    status              VARCHAR(30)     NOT NULL DEFAULT 'SCHEDULED',
                                                                -- 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'SUPPRESSED'
    suppression_reason  VARCHAR(255),                           -- populated if status = 'SUPPRESSED'
    is_prime_exclusive  BOOLEAN         NOT NULL DEFAULT FALSE,
    requires_prime      BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Inventory Context
    units_available_at_start    INTEGER,                        -- snapshot at deal start
    inventory_cap               INTEGER,                        -- max units Amazon allowed to sell at deal price

    -- Data Source Tracking
    data_source         VARCHAR(50)     NOT NULL,               -- 'SP_API' | 'MANUAL' | 'REPORT_INGEST'
    manually_entered_by VARCHAR(100),                           -- user email if manual
    notes               TEXT,

    -- Audit
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(100),

    -- Constraints
    CONSTRAINT fk_product       FOREIGN KEY (product_id) REFERENCES products(product_id),
    CONSTRAINT fk_brand         FOREIGN KEY (brand_id) REFERENCES brands(brand_id),
    CONSTRAINT chk_dates        CHECK (end_date >= start_date),
    CONSTRAINT chk_deal_price   CHECK (deal_price < regular_price),
    CONSTRAINT chk_deal_type    CHECK (deal_type IN (
                                    'LIGHTNING_DEAL',
                                    'BEST_DEAL',
                                    'DEAL_OF_THE_DAY',
                                    'PRIME_EXCLUSIVE_DISCOUNT',
                                    'COUPON',
                                    'PRICE_DISCOUNT',
                                    'SEVEN_DAY_DEAL'
                                ))
);

CREATE INDEX idx_deals_asin        ON deals(asin);
CREATE INDEX idx_deals_brand       ON deals(brand_id);
CREATE INDEX idx_deals_status      ON deals(status);
CREATE INDEX idx_deals_date_range  ON deals(start_date, end_date);
CREATE INDEX idx_deals_type        ON deals(deal_type);
```

---

### 4.1.2 `deal_daily_performance` Table

One row per deal per calendar day. Captures the metrics while the deal is running, as well as the pre-deal and post-deal windows for comparison.

```sql
CREATE TABLE deal_daily_performance (
    ddp_id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id             UUID            NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
    product_id          VARCHAR(50)     NOT NULL,
    asin                VARCHAR(10)     NOT NULL,
    performance_date    DATE            NOT NULL,

    -- Period Classification
    period_type         VARCHAR(20)     NOT NULL,
                                        -- 'PRE_DEAL'    → 7 days before start_date
                                        -- 'DEAL_DAY'    → days within start_date..end_date
                                        -- 'POST_DEAL'   → 7 days after end_date
    deal_day_number     INTEGER,        -- 1, 2, 3... (NULL for pre/post periods)

    -- Sales Metrics (from Sales & Traffic Report)
    ordered_units       INTEGER         DEFAULT 0,
    ordered_revenue     NUMERIC(12,2)   DEFAULT 0.00,
    sessions            INTEGER         DEFAULT 0,
    page_views          INTEGER         DEFAULT 0,
    unit_session_pct    NUMERIC(6,4),   -- conversion rate
    buy_box_pct         NUMERIC(6,4),

    -- Advertising Metrics (from Sponsored Products Report)
    ad_impressions      INTEGER         DEFAULT 0,
    ad_clicks           INTEGER         DEFAULT 0,
    ad_spend            NUMERIC(10,2)   DEFAULT 0.00,
    ad_sales            NUMERIC(12,2)   DEFAULT 0.00,
    acos                NUMERIC(6,4),   -- ad_spend / ad_sales
    roas                NUMERIC(8,4),   -- ad_sales / ad_spend
    cpc                 NUMERIC(8,4),   -- ad_spend / ad_clicks
    ctr                 NUMERIC(8,6),   -- ad_clicks / ad_impressions

    -- Organic Metrics
    organic_units       INTEGER         GENERATED ALWAYS AS
                            (GREATEST(ordered_units - ad_units_attributed, 0)) STORED,
    ad_units_attributed INTEGER         DEFAULT 0,
    tacos               NUMERIC(6,4),   -- ad_spend / ordered_revenue (total ACOS)

    -- Rank & Visibility
    bsr_rank            INTEGER,        -- Best Seller Rank snapshot (manual or scraped)
    bsr_category        VARCHAR(255),   -- e.g. "Bed Pillow Cases"
    keyword_rank_main   INTEGER,        -- rank for primary tracked keyword (manual)
    keyword_tracked     VARCHAR(255),   -- which keyword was tracked

    -- Pricing
    actual_price        NUMERIC(10,2),  -- confirmed deal price that day
    was_suppressed      BOOLEAN         DEFAULT FALSE,

    -- Inventory
    units_remaining     INTEGER,        -- end-of-day inventory snapshot

    -- Coupon Specific
    coupon_clips        INTEGER,        -- number of times coupon was clipped
    coupon_redemptions  INTEGER,        -- number of times coupon was redeemed

    -- Data Quality
    data_source         VARCHAR(50),    -- 'REPORT_INGEST' | 'SP_API' | 'MANUAL'
    is_estimated        BOOLEAN         DEFAULT FALSE, -- flagged if data is gap-filled
    ingested_at         TIMESTAMPTZ     DEFAULT NOW(),

    CONSTRAINT fk_ddp_deal      FOREIGN KEY (deal_id) REFERENCES deals(deal_id),
    CONSTRAINT chk_period_type  CHECK (period_type IN ('PRE_DEAL', 'DEAL_DAY', 'POST_DEAL')),
    CONSTRAINT uq_deal_date     UNIQUE (deal_id, performance_date)
);

CREATE INDEX idx_ddp_deal_id        ON deal_daily_performance(deal_id);
CREATE INDEX idx_ddp_asin_date      ON deal_daily_performance(asin, performance_date);
CREATE INDEX idx_ddp_period         ON deal_daily_performance(period_type);
CREATE INDEX idx_ddp_perf_date      ON deal_daily_performance(performance_date);
```

---

### 4.1.3 `deal_impact_analysis` Table

Aggregated summary computed after a deal completes. One row per deal. Stores the before/during/after rollup used to evaluate deal ROI and lasting impact.

```sql
CREATE TABLE deal_impact_analysis (
    analysis_id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id                 UUID            NOT NULL UNIQUE REFERENCES deals(deal_id),
    product_id              VARCHAR(50)     NOT NULL,
    asin                    VARCHAR(10)     NOT NULL,
    analysis_generated_at   TIMESTAMPTZ     DEFAULT NOW(),
    analysis_status         VARCHAR(20)     DEFAULT 'PENDING',
                                            -- 'PENDING' | 'COMPLETE' | 'PARTIAL' (post period not yet elapsed)

    -- ── PRE-DEAL WINDOW (7 days before start_date) ──────────────────────────
    pre_window_start        DATE,
    pre_window_end          DATE,
    pre_total_units         INTEGER,
    pre_total_revenue       NUMERIC(12,2),
    pre_avg_daily_units     NUMERIC(8,2),
    pre_avg_daily_revenue   NUMERIC(10,2),
    pre_avg_sessions        NUMERIC(10,2),
    pre_avg_conversion      NUMERIC(6,4),
    pre_avg_acos            NUMERIC(6,4),
    pre_avg_ad_spend        NUMERIC(10,2),
    pre_bsr_avg             NUMERIC(10,2),
    pre_bsr_best            INTEGER,

    -- ── DURING-DEAL WINDOW ───────────────────────────────────────────────────
    during_window_start     DATE,
    during_window_end       DATE,
    during_total_units      INTEGER,
    during_total_revenue    NUMERIC(12,2),
    during_avg_daily_units  NUMERIC(8,2),
    during_avg_daily_revenue NUMERIC(10,2),
    during_avg_sessions     NUMERIC(10,2),
    during_avg_conversion   NUMERIC(6,4),
    during_avg_acos         NUMERIC(6,4),
    during_avg_ad_spend     NUMERIC(10,2),
    during_bsr_avg          NUMERIC(10,2),
    during_bsr_best         INTEGER,
    during_coupon_clips     INTEGER,
    during_coupon_redemptions INTEGER,

    -- ── POST-DEAL WINDOW (7 days after end_date) ─────────────────────────────
    post_window_start       DATE,
    post_window_end         DATE,
    post_total_units        INTEGER,
    post_total_revenue      NUMERIC(12,2),
    post_avg_daily_units    NUMERIC(8,2),
    post_avg_daily_revenue  NUMERIC(10,2),
    post_avg_sessions       NUMERIC(10,2),
    post_avg_conversion     NUMERIC(6,4),
    post_avg_acos           NUMERIC(6,4),
    post_avg_ad_spend       NUMERIC(10,2),
    post_bsr_avg            NUMERIC(10,2),
    post_bsr_best           INTEGER,

    -- ── LIFT CALCULATIONS ────────────────────────────────────────────────────
    -- Sales Lift: (during - pre) / pre
    unit_lift_pct               NUMERIC(8,4),   -- units during vs pre
    revenue_lift_pct            NUMERIC(8,4),   -- revenue during vs pre
    session_lift_pct            NUMERIC(8,4),
    conversion_lift_pct         NUMERIC(8,4),

    -- Stickiness: (post - pre) / pre  — did the deal create lasting change?
    post_unit_lift_vs_pre_pct   NUMERIC(8,4),
    post_revenue_lift_vs_pre_pct NUMERIC(8,4),
    post_bsr_change_vs_pre      INTEGER,        -- BSR improvement: negative = better rank
    post_conversion_vs_pre_pct  NUMERIC(8,4),

    -- Rank Impact
    bsr_improvement_during      INTEGER,        -- pre_bsr_avg - during_bsr_best (positive = improved)
    bsr_improvement_post        INTEGER,        -- pre_bsr_avg - post_bsr_avg

    -- ACOS Impact
    acos_delta_during           NUMERIC(6,4),   -- during_avg_acos - pre_avg_acos
    acos_delta_post             NUMERIC(6,4),   -- post_avg_acos - pre_avg_acos

    -- Deal Economics
    estimated_deal_margin_impact NUMERIC(12,2), -- revenue lost to discount: units * discount_amount
    effective_deal_roas         NUMERIC(8,4),   -- total_revenue / total_ad_spend_during
    break_even_assessment       VARCHAR(20),    -- 'POSITIVE' | 'BREAK_EVEN' | 'NEGATIVE'

    -- PPC Context
    ppc_spend_increase_pct      NUMERIC(8,4),   -- how much did spend rise during deal
    cpc_change_during           NUMERIC(8,4),

    -- Velocity Score
    velocity_score_pre          NUMERIC(8,4),   -- units/day pre
    velocity_score_during       NUMERIC(8,4),
    velocity_score_post         NUMERIC(8,4),
    velocity_retained_pct       NUMERIC(8,4),   -- post_velocity / during_velocity

    -- Auto-generated Insights
    insights_summary            TEXT,           -- system-generated plain text summary
    recommendation              VARCHAR(50),    -- 'RUN_AGAIN' | 'ADJUST_DISCOUNT' | 'DO_NOT_REPEAT' | 'REVIEW'

    updated_at                  TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_dia_deal_id    ON deal_impact_analysis(deal_id);
CREATE INDEX idx_dia_asin       ON deal_impact_analysis(asin);
CREATE INDEX idx_dia_status     ON deal_impact_analysis(analysis_status);
```

---

### 4.1.4 Supporting Reference Tables

```sql
-- Deal type metadata (static config)
CREATE TABLE deal_type_config (
    deal_type               VARCHAR(50)     PRIMARY KEY,
    display_name            VARCHAR(100)    NOT NULL,
    color_hex               VARCHAR(7)      NOT NULL,   -- for calendar UI
    max_duration_days       INTEGER,
    min_discount_pct        NUMERIC(5,2),
    requires_amazon_approval BOOLEAN        DEFAULT FALSE,
    is_time_limited         BOOLEAN         DEFAULT FALSE,
    api_discoverable        BOOLEAN         DEFAULT FALSE,  -- can SP-API detect this?
    notes                   TEXT
);

INSERT INTO deal_type_config VALUES
    ('LIGHTNING_DEAL',          'Lightning Deal',           '#FF6B00', 1,    20.00, TRUE,  TRUE,  FALSE, 'Max 12h window; SP-API cannot pre-discover'),
    ('BEST_DEAL',               'Best Deal',                '#0066CC', 14,   15.00, TRUE,  FALSE, FALSE, 'Can run 1-14 days'),
    ('DEAL_OF_THE_DAY',         'Deal of the Day',          '#9900CC', 1,    20.00, TRUE,  FALSE, FALSE, 'Single featured deal'),
    ('PRIME_EXCLUSIVE_DISCOUNT','Prime Exclusive Discount', '#00A8E0', 30,   10.00, FALSE, FALSE, TRUE,  'Discoverable via Pricing API'),
    ('COUPON',                  'Coupon',                   '#00A550', NULL, 5.00,  FALSE, FALSE, TRUE,  'Partially discoverable via Pricing API'),
    ('PRICE_DISCOUNT',          'Price Discount',           '#FFAA00', NULL, NULL,  FALSE, FALSE, TRUE,  'Standard price reduction'),
    ('SEVEN_DAY_DEAL',          '7-Day Deal',               '#CC0033', 7,    15.00, TRUE,  FALSE, FALSE, 'Runs exactly 7 days');
```

---

## 4.2 API / Data Sources

### Overview: What Amazon SP-API Can and Cannot Provide

Before detailing each endpoint, this matrix sets accurate expectations. The Amazon SP-API does not have a dedicated "Deals API" for third-party sellers. Deal data must be assembled from multiple sources, and several critical fields require manual entry.

| Data Point | SP-API Available | Report Available | Manual Required |
|---|---|---|---|
| Deal active status | Partial (Pricing API) | No | Fallback |
| Deal start/end time | No | No | Yes |
| Deal type | No | No | Yes |
| Deal price | Yes (Pricing API) | No | Fallback |
| Units sold during deal | No | Yes (Sales & Traffic) | No |
| Revenue during deal | No | Yes (Sales & Traffic) | No |
| ACOS during deal | No | Yes (SP Report) | No |
| Coupon clips | No | No | Yes |
| BSR during deal | No | Partial (Sales & Traffic) | Supplement |
| Inventory cap | No | No | Yes |

---

### 4.2.1 SP-API: Product Pricing API

**Endpoint:** `GET /products/pricing/v0/price`
`GET /products/pricing/v0/competitivePrice`

**Purpose:** Detect when an active discount or promotional price is in effect. Useful for confirming that a deal price is live and capturing the deal price at the moment of polling.

**Fields Available:**
- `ListingPrice.Amount` — current buy box price
- `SalePrice.Amount` — sale price if active
- `SalePrice.StartDate` / `SalePrice.EndDate` — sale window (when present)
- `NumberOfOfferListings`
- `CompetitivePriceThreshold`

**PMP Usage:**
- Poll this endpoint at deal start time to confirm price drop is live
- Capture `SalePrice.Amount` → write to `deals.deal_price` if not manually entered
- Confirm deal is suppressed if `ListingPrice` equals `regular_price` when it should be at deal price
- For Prime Exclusive Discounts specifically, the discounted price appears in this endpoint with a `PrimeExclusivePrice` field

**Ingestion Method:** Scheduled polling via PMP backend job

**Frequency:** Every 30 minutes while a deal is expected to be active; hourly otherwise

**Rate Limits:** 0.5 requests/second (10 requests burst). With 13 ASINs, a full poll cycle completes in under 30 seconds.

**Limitations:**
- Does NOT indicate deal type (cannot distinguish Lightning Deal from Price Discount)
- Does NOT provide deal start/end times programmatically
- SalePrice dates are unreliable — Amazon does not always populate them
- No historical pricing data — only current state at time of request
- Lightning Deals and Best Deals do NOT consistently surface here

---

### 4.2.2 SP-API: Listings Items API

**Endpoint:** `GET /listings/2021-08-01/items/{sellerId}/{sku}`

**Purpose:** Retrieve listing-level attributes that may indicate promotional state or suppression.

**Fields Available:**
- `summaries[].status` — ACTIVE | INACTIVE | INCOMPLETE
- `summaries[].conditionType`
- `issues[]` — suppression reasons (e.g., pricing policy violations that might suppress a deal)
- `attributes.sale_price` — sale price if configured at listing level
- `fulfillmentAvailability[].quantity`

**PMP Usage:**
- Detect if a listing is suppressed during a deal window (deal may be live but listing has issues)
- Capture listing-level sale price for deals configured at the listing attribute level
- Write suppression flag to `deals.status = 'SUPPRESSED'` and `deals.suppression_reason`

**Ingestion Method:** Triggered check at deal start, then hourly during deal window

**Frequency:** Hourly during active deal windows

**Rate Limits:** 5 requests/second. No concern for 13 SKUs.

**Limitations:**
- Does not directly expose deal type or deal enrollment
- `sale_price` at listing level is rarely how Lightning Deals / Best Deals are priced — those are managed by Amazon promotion tools, not listing attributes
- Not a reliable primary source for deal detection

---

### 4.2.3 SP-API: Reports API — Sales & Traffic Report

**Report Type:** `GET_SALES_AND_TRAFFIC_REPORT`

**Purpose:** Primary source for daily performance metrics during deal windows. This is the most important automated data source for PMP deal tracking.

**Fields Available (by ASIN, daily granularity):**
- `orderedProductSales.amount` — total ordered revenue
- `unitsOrdered` — total units
- `totalOrderItems`
- `sessions` — unique visit sessions
- `pageViews`
- `buyBoxPercentage`
- `unitSessionPercentage` — conversion rate
- `averageOfferCount`
- `averageSalesRank` — BSR approximation (note: this is an average over the period, not a snapshot)

**PMP Usage:**
- Ingest daily → populate `deal_daily_performance` for all period_types (PRE_DEAL, DEAL_DAY, POST_DEAL)
- Drive all sales lift and velocity calculations
- `averageSalesRank` feeds `bsr_rank` in `deal_daily_performance`
- Combined with advertising report to compute TACOS

**Ingestion Method:** Scheduled daily batch job via Reports API

**Frequency:** Daily, run at 06:00 UTC for the prior calendar day

**Rate Limits:** Report creation is rate-limited to 0.0167 requests/second. One report per ASIN per day. For 13 ASINs, request all in a single report filtered by all ASINs. Report processing typically takes 15–60 minutes.

**Limitations:**
- Data is only available at daily granularity — cannot isolate Lightning Deal hours within a day
- For a 6-hour Lightning Deal, the day's metrics include both deal and non-deal hours
- `averageSalesRank` is an average over the reporting period, not a point-in-time BSR
- Data lag: prior day data available approximately 24–48 hours after the period ends
- Does not distinguish organic vs. advertising-attributed sales directly

---

### 4.2.4 SP-API: Reports API — Sponsored Products Report

**Report Type:** `GET_SPONSORED_PRODUCTS_REPORT` (via Advertising API / Reports API)

**Note:** Advertising data is more accurately accessed via the Amazon Advertising API (a separate API from SP-API), but PMP already integrates this for PPC tracking.

**Fields Available (daily, by campaign/ad group/ASIN):**
- `impressions`
- `clicks`
- `cost` (ad spend)
- `attributedSales14d`
- `attributedUnitsOrdered14d`
- `acos`

**PMP Usage:**
- Populate `deal_daily_performance.ad_impressions`, `.ad_clicks`, `.ad_spend`, `.ad_sales`, `.acos`
- Compute `deal_daily_performance.tacos` = ad_spend / ordered_revenue
- Feed `deal_impact_analysis.acos_delta_during`

**Ingestion Method:** Existing PPC pipeline in PMP — extend to tag records with `deal_id` when `performance_date` falls within a deal window

**Frequency:** Daily, same batch as Sales & Traffic

**Limitations:**
- 14-day attribution window means sales attributed to ads during a deal may include organic-period purchases
- Cannot separate deal-driven ad clicks from non-deal ad clicks within the same day

---

### 4.2.5 SP-API: Promotions API

**Endpoint:** `GET /promotions/v1/promotions`

**Availability Status:** This endpoint is available in SP-API but has significant limitations for deal tracking.

**What It Covers:**
- Seller-created promotions: Money Off, Buy One Get One, Free Shipping
- Coupons created via Seller Central in some marketplace configurations

**Fields Available:**
- `promotionId`
- `promotionType` — MONEY_OFF | PERCENTAGE_OFF | BOGO | FREE_SHIPPING
- `startDate` / `endDate`
- `status` — ACTIVE | INACTIVE | DRAFT | EXPIRED
- `discountValue`
- `applicableASINs[]`

**PMP Usage:**
- Auto-discover active coupons and price promotions
- Write to `deals.promotion_id` and `deals.amazon_deal_id` when matched
- Allows pre-population of scheduled deals before they go live

**Ingestion Method:** Daily poll + triggered check at 00:00 UTC

**Frequency:** Daily

**Limitations:**
- Does NOT cover Lightning Deals, Best Deals, Deal of the Day, or 7-Day Deals — those are managed by Amazon's deal engine, not the Promotions API
- Limited to seller-configured promotions only
- Does not return performance data (units sold under promotion, redemption counts)
- Coupon redemption data is not available via any SP-API endpoint

---

### 4.2.6 Seller Central: Deals Dashboard

**Location in Seller Central:** Advertising → Deals (or Inventory → Manage Deals depending on account configuration)

**Data Available:**
- All submitted and approved deals with status
- Deal type, start/end date and time
- Approved discount percentage
- Deal submission history
- Inventory committed to the deal
- Deal performance summary (units claimed, percentage claimed)

**PMP Usage:**
- This is the authoritative source for Lightning Deals, Best Deals, Deal of the Day, and 7-Day Deals
- Manual entry workflow: user exports or reads from this dashboard and enters into PMP deal entry form
- PMP will pre-fill fields where possible from API sources; user confirms or corrects

**Ingestion Method:** Manual — user-initiated data entry into PMP deal entry form

**Frequency:** As deals are scheduled or completed

**Limitations:**
- No API access to this dashboard's deal management data
- No programmatic export of per-deal performance metrics
- Coupon performance (clips, redemptions) shown here but not exportable via API

---

### 4.2.7 Seller Central: Business Reports — Detail Page Sales and Traffic by ASIN

**Location:** Reports → Business Reports → Detail Page Sales and Traffic by ASIN

**Data Available (exportable as CSV):**
- Same fields as the API-based Sales & Traffic Report
- Date range selectable up to 2 years
- Per-ASIN daily data

**PMP Usage:**
- Fallback if Reports API ingestion fails
- Historical backfill for deals that occurred before PMP was tracking
- User uploads CSV → PMP parses and populates `deal_daily_performance`

**Ingestion Method:** Manual CSV upload via PMP interface (drag-and-drop upload in Tracking module settings)

**Frequency:** On-demand / as needed for backfill

---

### 4.2.8 Data That MUST Be Manually Entered

The following fields have no API source and must be entered by the PMP user at deal creation or completion:

| Field | When to Enter | Source |
|---|---|---|
| `deal_type` | At deal creation | Seller Central Deals Dashboard |
| `start_date` / `start_time` | At deal creation | Seller Central Deals Dashboard |
| `end_date` / `end_time` | At deal creation | Seller Central Deals Dashboard |
| `regular_price` | At deal creation | Known product price |
| `deal_price` (if not caught by Pricing API) | At deal creation | Seller Central |
| `inventory_cap` | At deal creation | Deal submission confirmation |
| `coupon_clips` | Post-deal | Seller Central Coupon Performance report |
| `coupon_redemptions` | Post-deal | Seller Central Coupon Performance report |
| `bsr_rank` (point-in-time snapshots) | During/after deal | Manual observation or 3rd-party tool |
| `keyword_rank_main` | During/after deal | Helium 10 / manual tracking |
| `deal_name` | At deal creation | User-defined label |
| `notes` | Any time | Free text |

PMP must surface a "Deal Entry Required" notification to the appropriate user when a deal window is approaching (48 hours before `start_date`) if `data_source = 'MANUAL'` fields are incomplete.

---

## 4.3 UI Design

### 4.3.1 Deal Calendar View

The Deal Calendar is the default view when the user navigates to Tracking → Deals.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEALS                                    [+ Add Deal]  [List View] │
│                                                                     │
│  Brand: [ALL ▾]   Product: [ALL ▾]                                  │
│                                                                     │
│  ◀  MARCH 2026  ▶                                                   │
│─────────────────────────────────────────────────────────────────────│
│  SUN    MON    TUE    WED    THU    FRI    SAT                       │
│                                                                     │
│    1      2      3      4      5      6      7                      │
│                 ████████████████████                                │
│                 [⚡ LD: Pillow Set]                                  │
│                                                                     │
│    8      9     10     11     12     13     14                      │
│         ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                        │
│         [🏷 7-Day: Sheet Set BLUE]                                  │
│                                                                     │
│   15     16     17     18     19     20     21                      │
│                               ▓▓▓▓▓▓                               │
│                               [🎫 CPN: Duvet]                       │
│                                                                     │
│   22     23     24     25     26     27     28                      │
│                                                                     │
│   29     30     31                                                  │
└─────────────────────────────────────────────────────────────────────┘

LEGEND:
  ████  Lightning Deal      ░░░░  7-Day Deal
  ▓▓▓▓  Coupon              ════  Prime Exclusive Discount
  ────  Best Deal           ████  Price Discount
  ████  Deal of the Day

COLOR CODING (matches deal_type_config.color_hex):
  Lightning Deal:             #FF6B00  Orange
  Best Deal:                  #0066CC  Blue
  Deal of the Day:            #9900CC  Purple
  Prime Exclusive Discount:   #00A8E0  Cyan
  Coupon:                     #00A550  Green
  Price Discount:             #FFAA00  Amber
  7-Day Deal:                 #CC0033  Red
```

**Calendar Interactions:**
- Clicking a deal bar opens the Deal Performance Panel (section 4.3.4) in a right-side drawer
- Hovering a deal bar shows a tooltip: `[Deal Type] | [ASIN] | [Discount %] | [Status]`
- Multi-day deals render as a continuous bar spanning all calendar days
- If two deals overlap for the same product, bars stack vertically (up to 3 per cell before "show more")
- Today's date is highlighted with a border
- Active deals pulse with a subtle animation on the calendar bar

**Calendar Controls:**
- Month navigation arrows
- "Today" button to jump to current month
- Brand filter and Product filter dropdowns at top
- Toggle between Monthly and Weekly calendar views

---

### 4.3.2 Deal List View

Accessible via the [List View] toggle button on the Deal Calendar.

**Table Columns:**

| Column | Field Source | Width | Notes |
|---|---|---|---|
| Product | `deals.asin` + product name | 180px | Thumbnail + name |
| Brand | `deals.brand_id` | 100px | |
| Deal Type | `deals.deal_type` | 120px | Color-coded badge |
| Discount | `deals.discount_pct` | 80px | e.g. "25% off" |
| Start | `deals.start_date` | 90px | |
| End | `deals.end_date` | 90px | |
| Duration | `deals.duration_days` | 80px | "3 days" or "6h" |
| Status | `deals.status` | 90px | Colored badge |
| Deal Units | `deal_impact_analysis.during_total_units` | 90px | |
| Deal Revenue | `deal_impact_analysis.during_total_revenue` | 100px | |
| Unit Lift | `deal_impact_analysis.unit_lift_pct` | 90px | Green/red delta |
| Rev Lift | `deal_impact_analysis.revenue_lift_pct` | 90px | Green/red delta |
| ACOS Impact | `deal_impact_analysis.acos_delta_during` | 100px | Green/red delta |
| BSR Impact | `deal_impact_analysis.bsr_improvement_during` | 100px | Green/red delta |
| Assessment | `deal_impact_analysis.recommendation` | 110px | Verdict badge |
| Actions | — | 80px | View / Edit / Clone |

**Table Controls:**
- Sort by any column (click header)
- Filter: Status (Active / Scheduled / Completed / All), Date Range, Deal Type, Brand, Product
- Search bar: search by deal name or ASIN
- Export to CSV button
- "Active Deals" quick filter button — shows only currently running deals with pulsing indicator

**Row Behavior:**
- Clicking any row opens the Deal Performance Panel for that deal
- Active deals rows are highlighted with a subtle left border in the deal type color
- Scheduled deals show a countdown: "Starts in 3 days"

---

### 4.3.3 Active Deal Banner

When any deal is currently active (i.e., `deals.status = 'ACTIVE'` and `NOW()` between `start_date` and `end_date`), PMP must display a persistent notification banner on the following surfaces.

**Banner Specification:**

```
┌────────────────────────────────────────────────────────────────────┐
│  ⚡ ACTIVE DEAL  │  DECOLURE Pillow Set (B0XXXXXX)                 │
│  Lightning Deal  │  25% off  •  Ends in 4h 32m  •  +147% sessions │
│                  │  [View Deal Performance]  [Adjust PPC ▸]        │
└────────────────────────────────────────────────────────────────────┘
```

**Banner Placement:**

1. **Executive Control Panel** — Fixed position at top of the ECP dashboard, below the main header. If multiple deals are active simultaneously, show a carousel or stacked banners (max 3 visible, "and X more" link if beyond 3).

2. **Product Detail Views** — Inline banner within the product card/page for the specific product on deal. Replaces the standard pricing display with deal price + discount badge.

3. **Tracking Module** — Sticky banner at top of any Tracking module view when that product has an active deal. Alerts the user that metrics may be deal-influenced.

4. **Any Metric Affected** — When viewing performance charts or metric cards for a product with an active deal:
   - Overlay a shaded region on time-series charts marking the deal window
   - Add a deal badge icon next to ACOS, units, and revenue metrics
   - Tooltip on the badge: "Metrics during this period may reflect deal-driven activity. View deal impact analysis for context."

**Banner States by Deal Status:**
- `SCHEDULED` → Amber banner: "Deal starts in X days/hours — [Complete Setup]" if fields are incomplete
- `ACTIVE` → Green/orange banner (per deal type color) with live countdown
- `SUPPRESSED` → Red banner: "Deal suppressed — [View Reason]"
- `COMPLETED` (within 48h of end) → Blue banner: "Deal ended — [View Results]"

---

### 4.3.4 Deal Performance Panel

Opens as a right-side drawer (640px wide) from the Calendar or List View when a deal is clicked. Can also be opened from any Active Deal Banner.

**Panel Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Back    DECOLURE Pillow Set  •  Lightning Deal  •  COMPLETED  │
│            B0XXXXXXXXXX  •  Mar 4 2026  06:00 – 12:00 (6h)       │
│            Discount: 25% off  ($49.99 → $37.49)                  │
├──────────────────────────────────────────────────────────────────┤
│  [Summary]  [Daily Breakdown]  [PPC Impact]  [Rank Tracking]     │
├──────────────────────────────────────────────────────────────────┤
│  PERFORMANCE COMPARISON                                          │
│                                                                  │
│  Metric           Pre-Deal   During Deal  Post-Deal  Lift        │
│                   (7d avg)                (7d avg)               │
│  ─────────────────────────────────────────────────────────────── │
│  Daily Units         4.3        38.0         5.1     +783% ▲     │
│  Daily Revenue    $215.00    $1,425.00     $254.70   +563% ▲     │
│  Sessions           68.1       410.5        71.3     +503% ▲     │
│  Conversion %       6.3%       9.3%         7.1%     +47% ▲      │
│  ACOS              22.4%      41.2%        20.8%     +18.8pp ▼   │
│  TACOS             18.1%      28.5%        17.9%     +10.4pp ▼   │
│  BSR (avg)          842        213          780       +629 ▲      │
│  Ad Spend/Day     $48.10     $587.20       $52.30     n/a         │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  DEAL ECONOMICS                                                  │
│  Total Deal Revenue:        $1,425.00                            │
│  Discount Given:            -$375.00  (25% × 38 units)          │
│  Revenue at Regular Price:  $1,900.00  (opportunity comparison)  │
│  Ad Spend During Deal:      $587.20                              │
│  Net Revenue - Ad Spend:    $837.80                              │
│                                                                  │
│  Assessment:  ● RUN AGAIN  (strong rank + velocity gain)         │
├──────────────────────────────────────────────────────────────────┤
│  STICKINESS CHECK  (Post-Deal vs Pre-Deal)                       │
│  Daily Units Post:   5.1 vs 4.3 pre   →  +19% retained lift     │
│  BSR Post:           780 vs 842 pre   →  +62 rank points kept   │
│  Conversion Post:    7.1% vs 6.3%     →  +0.8pp retained        │
│  Velocity Retained:  11.2% of deal-day velocity                  │
└──────────────────────────────────────────────────────────────────┘
```

**Daily Breakdown Tab** (for multi-day deals):

```
  Day   Date      Units   Revenue    ACOS    BSR    vs Pre-Deal
  ────────────────────────────────────────────────────────────
  Pre-7  Feb 25    4        $200     22.1%   854     baseline
  Pre-6  Feb 26    5        $250     21.8%   831     +16%
  ...
  Day 1  Mar 4     38     $1,425    41.2%   213     +783%
  Day 2  Mar 5     22       $825    38.7%   295     +411%
  Day 3  Mar 6     14       $525    35.1%   402     +226%
  ...
  Post-1 Mar 8      6       $225    21.4%   750     +40%
  Post-7 Mar 14     5       $188    20.9%   790     +16%
```

**PPC Impact Tab:**
- Side-by-side chart: bid landscape pre vs. during vs. post
- CPC trend line across the full window
- Impression share during deal (did increased visibility affect auction?)
- Recommended bid adjustments for next similar deal

**Rank Tracking Tab:**
- BSR trend chart spanning pre + during + post window
- Primary keyword rank chart (if data available)
- Annotation markers for deal start and end dates on chart

---

## 4.4 Deal + PPC Interaction Logic

### 4.4.1 During a Deal: Bid Strategy

When `deals.status = 'ACTIVE'`, PMP should apply the following guidance. These are recommendations surfaced in the UI — PMP does not automatically change bids, but flags recommended actions.

**General Principle:** Deals naturally drive a surge in organic traffic and conversion rate. The marginal value of each incremental ad-driven click increases during a deal because the deal price lowers the barrier to purchase and improves conversion. However, ACOS will almost always rise because ad spend tends to increase while the deal price reduces revenue per unit. The goal during a deal is not to minimize ACOS — it is to maximize total velocity and rank gain.

**Bid Recommendations by Deal Type:**

| Deal Type | Recommended Bid Action | Rationale |
|---|---|---|
| Lightning Deal (4–12h) | Increase bids 20–40% for the deal window | Short window; maximize impression share; every sale counts toward BSR and rank velocity |
| Best Deal / 7-Day Deal | Increase bids 15–25% for deal duration | Sustained window allows more measured approach; avoid overspending early |
| Deal of the Day | Increase bids 25–40% | Featured placement + deal badge = high conversion; maximize reach |
| Prime Exclusive Discount | Increase bids 10–20% | Discount is Prime-only; target Prime shoppers via Sponsored Products |
| Coupon | Increase bids 5–15% | Coupon clips add friction; moderate increase appropriate |
| Price Discount | Increase bids 10–20% | Higher conversion rate justifies higher CPC |

**PMP Active Deal PPC Widget:**

When a deal is active, the PPC module surfaces a contextual panel:

```
⚡ DEAL ACTIVE: Lightning Deal — DECOLURE Pillow Set
─────────────────────────────────────────────────────
Current ACOS:  41.2%  (pre-deal avg: 22.4%)
  → ACOS elevation is EXPECTED. Do not pause campaigns.

Recommended Actions:
  ✓ Increase SP bids by 30% for ASIN B0XXXXXXXX
  ✓ Activate broad match campaigns if paused
  ✓ Prioritize top-of-search placement modifier (+50%)
  ✓ Do not optimize or pause based on today's ACOS

Deal ends in: 3h 14m
```

**Bid Automation Rule (optional, user-enabled):**
PMP can create a scheduled bid rule that:
1. At `start_time`, multiplies all active bids for the deal ASIN by a configured multiplier (default 1.25×)
2. At `end_time`, resets bids to pre-deal values
3. Logs the bid change event in the deal record for post-analysis

---

### 4.4.2 During a Deal: Interpreting ACOS Changes

ACOS during a deal is structurally elevated and should not be used as a performance signal for bid optimization decisions. PMP must clearly communicate this in all relevant metric displays.

**Why ACOS rises during a deal:**
1. The deal attracts incremental traffic that is browsing rather than buying — sessions increase faster than conversions
2. Ad spend tends to increase as more impressions and clicks flow to a discounted, high-CTR listing
3. The deal price is lower than regular price, so revenue per unit is reduced while ad spend may not change proportionally
4. Amazon's 14-day attribution window means some ad-attributed sales are from pre-deal days at regular price, creating distortion

**Correct Interpretation Framework:**

| Metric | During-Deal Interpretation |
|---|---|
| ACOS elevated 10–25pp above baseline | Normal and expected; do not optimize |
| ACOS elevated 25–50pp above baseline | Acceptable if unit lift is strong (>200%) |
| ACOS elevated >50pp above baseline | Investigate: ad spend may be overcorrecting; check if bids were manually raised too aggressively |
| TACOS (ad spend / total revenue) | More meaningful than ACOS during deals; use TACOS as the primary efficiency signal |
| ROAS | Monitor ROAS against deal ROAS target, not regular ROAS target |

**PMP Deal ACOS Annotation:**

On any chart or table showing ACOS for a date range that includes a deal period, PMP renders:
- A shaded band on the date range covering the deal
- A label: "Deal Active — ACOS elevated by design"
- The pre-deal ACOS baseline as a reference line on the chart
- Tooltip: "ACOS during deal periods is expected to be higher. Evaluate using TACOS and post-deal recovery metrics instead."

---

### 4.4.3 After a Deal: Measuring Lasting Organic Rank Impact

The post-deal window (7 days after `end_date`) is the most strategically important measurement period. A deal that generates no lasting rank improvement is pure margin erosion. A deal that lifts organic rank and sustains higher velocity creates compounding returns.

**Metrics to Monitor Post-Deal:**

**1. Velocity Retention**
`velocity_retained_pct = (post_avg_daily_units / during_avg_daily_units) × 100`

- >20%: Strong velocity retention; deal created momentum
- 10–20%: Moderate retention; typical for most deals
- <10%: Deal spike with no stickiness; review discount depth and deal type

**2. BSR Improvement Retention**
`bsr_improvement_post = pre_bsr_avg - post_bsr_avg`

- Positive value (e.g., +80) means BSR improved and held after the deal
- Negative value means BSR recovered to worse than pre-deal (unusual but possible if deal inventory depleted stock and caused suppression)
- Target: retain at least 30–50% of the BSR improvement seen during the deal

**3. Conversion Rate Lift Retention**
- Increased sales velocity leads to more reviews
- More reviews improve conversion rate for future organic visitors
- Track `post_avg_conversion` vs `pre_avg_conversion` — a retained lift here indicates a real product improvement in ranking signals

**4. Organic Keyword Rank**
- For the primary tracked keyword, check rank 7 days before vs. 7 days after
- BSR is a lagging signal; keyword rank (if tracked) is more directly actionable
- PMP surfaces this in the Rank Tracking tab of the Deal Performance Panel

**Post-Deal PPC Strategy:**

After a deal ends, ACOS should normalize within 2–4 days. If it does not:
- Check if bids were restored to pre-deal levels
- Check if increased traffic during deal period triggered budget increases that were not reverted
- Check if the deal attracted lower-quality traffic that is still generating clicks without converting

PMP post-deal recommendation logic:

```
IF post_avg_acos > (pre_avg_acos × 1.15) AND performance_date > (end_date + 4 days):
    → ALERT: "ACOS has not normalized post-deal. Review bid settings for B0XXXXXXXXXX."

IF post_bsr_avg < pre_bsr_avg (rank improved):
    → NOTE: "Organic rank improved post-deal. Consider maintaining elevated bids to consolidate position."

IF velocity_retained_pct < 10%:
    → NOTE: "Low velocity retention. Deal drove temporary spike only. Evaluate deal economics before repeating."
```

---

### 4.4.4 Deal Overlap Warnings

PMP must detect and warn when multiple deals are active simultaneously for the same product or across products that share PPC budgets.

**Same-Product Overlap:**
This is rare but possible (e.g., a Coupon running during a Lightning Deal). This scenario creates pricing complexity and attribution confusion.

Detection rule:
```sql
SELECT d1.deal_id, d2.deal_id
FROM deals d1
JOIN deals d2
    ON d1.product_id = d2.product_id
    AND d1.deal_id != d2.deal_id
    AND d1.start_date <= d2.end_date
    AND d1.end_date >= d2.start_date
    AND d1.status IN ('ACTIVE', 'SCHEDULED')
    AND d2.status IN ('ACTIVE', 'SCHEDULED');
```

PMP displays: "Warning: Two deals overlap for [Product] between [Date Range]. Attribution and ACOS reporting will be combined. Consider running deals sequentially for cleaner analysis."

**Cross-Product Budget Overlap:**
If three or more products across the same brand are running deals simultaneously, shared campaign budgets may throttle, reducing impression share for each.

Detection rule: flag when ≥3 ASINs within the same brand have `status = 'ACTIVE'` on the same date.

PMP displays: "3 DECOLURE products have active deals today. Shared campaign budgets may be under pressure. Review campaign-level budgets."

**Recommended Resolution:**
- Increase shared campaign daily budgets by 50–75% for the overlap window
- Or separate deal-period ASINs into isolated campaigns with dedicated budgets
- PMP surfaces a "[Adjust Budgets]" action button in the overlap warning that navigates to the campaign budget settings in the PPC module

---

## 4.5 Multi-Day Deal Handling

### 4.5.1 Deal Identity Across Days

For any deal where `duration_days > 1`, PMP treats the deal as a single continuous event with a consistent identity across all calendar days.

**Rules:**

1. The `deal_id` is consistent across all rows in `deal_daily_performance` for the entire deal period. There is no separate deal record per day.

2. On the Deal Calendar, a multi-day deal renders as a continuous color bar from `start_date` to `end_date`. The deal name appears on the first day of the bar, or centered within the bar if the deal spans more than 3 days.

3. In the Deal List View, multi-day deals appear as a single row. The Duration column shows "X days." The metrics columns show aggregate totals for the full deal period.

4. In the Tracking module's daily performance charts, a shaded region (semi-transparent, deal type color) covers the full date range of the deal.

---

### 4.5.2 Daily Breakdown Within Deal Period

Within the Deal Performance Panel, the Daily Breakdown tab shows one row per calendar day for the full analysis window: 7 pre-deal days + all deal days + 7 post-deal days.

**Day Labeling Convention:**

| Row Type | Label Format | Example |
|---|---|---|
| Pre-deal days | "Pre-7" through "Pre-1" | "Pre-3" = 3 days before deal start |
| Deal days | "Day 1" through "Day N" | "Day 1" = first day of deal |
| Post-deal days | "Post-1" through "Post-7" | "Post-4" = 4 days after deal ended |

**Deal Day vs. Pre-Deal Baseline Column:**

Each deal day row includes a `vs Pre-Deal` column comparing that day's performance to the 7-day pre-deal average:

```
vs Pre-Deal = ((deal_day_value - pre_avg_value) / pre_avg_value) × 100
```

This surfaces day-by-day decay within the deal — for example, a 7-Day Deal might show:
- Day 1: +600% vs pre-deal (launch surge)
- Day 2: +380% vs pre-deal
- Day 3: +210% vs pre-deal
- Day 4: +190% vs pre-deal
- Day 5: +150% vs pre-deal (fatigue setting in)
- Day 6: +120% vs pre-deal
- Day 7: +90% vs pre-deal

This day-over-day decay pattern informs optimal deal duration for future deals.

---

### 4.5.3 Aggregate Deal-Period Metrics

When displaying summary metrics for a multi-day deal, PMP distinguishes between:

**Totals** (meaningful to sum):
- Total units ordered during deal
- Total revenue during deal
- Total ad spend during deal
- Total ad clicks, impressions

**Averages** (meaningful to average):
- Average daily units
- Average ACOS
- Average conversion rate
- Average sessions per day
- Average BSR

**Best/Worst Within Period** (for rank metrics):
- Best BSR achieved during deal (lowest number = best rank)
- Worst BSR during deal
- Best conversion rate day
- Worst ACOS day

The Deal Performance Panel Summary tab shows all three categories clearly labeled to avoid misinterpretation (e.g., summing ACOS percentages across days would be meaningless).

---

### 4.5.4 Comparing Each Deal Day to Pre-Deal Baseline

For multi-day deals, PMP generates a day-indexed lift chart alongside the daily table.

**Chart Specification:**

- X-axis: Day index (Pre-7, Pre-6, ..., Pre-1, Day 1, Day 2, ..., Day N, Post-1, ..., Post-7)
- Y-axis: Units ordered (or any selected metric — switchable via dropdown)
- Reference line: Pre-deal 7-day average (horizontal dashed line)
- Shaded region: Deal window in deal type color
- Line series: Actual daily metric value
- Optional overlay: Ad spend line on secondary Y-axis

**Insight Annotations Rendered on Chart:**
- "Peak day: Day 1 (+600% vs baseline)" — marker at peak
- "Lowest deal day: Day 7 (+90% vs baseline)" — marker at trough
- "Post-deal recovery: +19% above baseline at Day +7" — annotation at end of post window

**Velocity Decay Model (optional display toggle):**

For deals with 3+ days of data, PMP can fit a simple exponential decay curve to the deal-day units:

```
Units(day) ≈ Units(Day 1) × e^(−λ × day_index)
```

This allows PMP to:
1. Estimate the "half-life" of deal momentum
2. Extrapolate what Day 8 and Day 9 would have looked like if the deal continued
3. Flag if a deal ended before its momentum had fully decayed (suggesting the deal duration was suboptimal)

This feature is surfaced as an optional chart overlay with a toggle: "Show demand decay model."

---

### 4.5.5 Multi-Day Deal Integrity Rules

```
Rule 1: Completeness Check
  IF any deal_day within deal window has no deal_daily_performance row:
      → Flag as DATA_GAP; attempt Reports API backfill; alert if unresolved after 48h

Rule 2: Price Consistency
  IF actual_price on any DEAL_DAY row differs from deals.deal_price by >$0.10:
      → Flag for review: "Deal price inconsistency detected on Day X"
      → Possible causes: deal suppressed mid-run; Amazon price adjustment

Rule 3: Status Auto-Update
  IF NOW() > deals.end_date AND deals.status = 'ACTIVE':
      → Auto-update deals.status = 'COMPLETED'
      → Trigger deal_impact_analysis computation job

Rule 4: Post-Period Completion
  IF NOW() >= (deals.end_date + 7 days) AND deal_impact_analysis.analysis_status = 'PENDING':
      → All post-deal data should be available; run full analysis
      → Update analysis_status = 'COMPLETE'
      → Notify user: "Deal analysis ready for [Deal Name]"

Rule 5: Partial Analysis
  IF deal has completed but post-period has not elapsed:
      → Set analysis_status = 'PARTIAL'
      → Show during-deal metrics and pre vs. during comparison
      → Disable post-deal stickiness metrics; show countdown: "Post-deal analysis available in X days"
```

---

*End of Part 4 — Deal Tracking Specification*