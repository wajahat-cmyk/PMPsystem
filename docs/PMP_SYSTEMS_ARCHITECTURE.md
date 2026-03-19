# PMP SYSTEMS — Complete Architecture Document
## PPC Operating System for High-Performance Amazon Brands

---

# TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [System Architecture](#2-system-architecture)
3. [Data Model](#3-data-model)
4. [Syntax Engine — Core Logic](#4-syntax-engine)
5. [Calculation Engine](#5-calculation-engine)
6. [Module Design — All 7 Modules](#6-module-design)
7. [API Strategy — Fixing the 70% Error Rate](#7-api-strategy)
8. [UI/UX Specification](#8-uiux-specification)
9. [Deployment on Railway](#9-deployment-on-railway)
10. [Build Plan — 3 Phases](#10-build-plan)
11. [Gaps & Questions](#11-gaps-and-questions)

---

# 1. SYSTEM OVERVIEW

## What PMP Systems Is

PMP Systems is an **internal PPC operating system** — not a dashboard, not a reporting tool.

It replaces:
- Your current 18-sheet Google Sheets workbook (with its fragile IMPORTRANGE chains)
- Manual syntax classification via Excel LET() formulas
- Scattered data across Jungle Scout, DataDive, DataRover, ASIN Insight
- Manual cross-referencing of SQP data with PPC performance

It consolidates into ONE system:
- Automated data ingestion from Amazon APIs + external tools
- Real-time syntax-level analysis (the core of your PPC strategy)
- Variation attribution tracking (targeted SKU vs purchased SKU)
- Executive-level and operator-level views with drill-down

## Current State (What We're Replacing)

Based on your reporting workbook:
- **13 products** across 3 brands (DECOLURE, SLEEPHORIA, SLEEP SANCTUARY)
- **67 columns per product sheet** — the exact metrics we must replicate
- **25 weeks of historical data** (Sep 2025 – Mar 2026)
- **External Google Sheet dependencies** via IMPORTRANGE (fragile, slow)
- **Manual syntax classification** via Excel LET() formulas per product line

## Products Currently Tracked

| # | Product | Brand | ASIN | Price |
|---|---------|-------|------|-------|
| 1 | Bamboo Sheets | DECOLURE | B08KQKPKWC | $75.99 |
| 2 | Bamboo Sheets 6PCS | DECOLURE | B0D952H31F | $89.99 |
| 3 | Satin Sheets | DECOLURE | B0CRVZ1TTS | $29.95 |
| 4 | Satin Sheets 6 Pcs | DECOLURE | B0CRF7S2TH | $29.95 |
| 5 | Satin Fitted Sheet | DECOLURE | B0DZ17NCJ4 | $17.95 |
| 6 | Silk Pillow Case | DECOLURE | B0DQQQWYPT | $44.95 |
| 7 | Cooling Sheets | SLEEPHORIA | B0FTSWF3M7 | $64.99 |
| 8 | Cooling Pillowcase | SLEEPHORIA | B0FTSVDG77 | $17.99 |
| 9 | Cooling Comforter | SLEEPHORIA | B0FTG1NNKG | $69.99 |
| 10 | Satin 4PCs | SLEEP SANCTUARY | B0F2G983W3 | $35.95 |
| 11 | Bamboo 6PCS | SLEEP SANCTUARY | B0F55Y1P53 | $69.99 |
| 12 | Hanging Closet | DECOLURE | B0FGZGFRL2 | $41.95 |

---

# 2. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │Executive │ │ Keyword  │ │  Root    │ │  Syntax  │       │
│  │ Control  │ │  Engine  │ │  Engine  │ │  Engine  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │Variation │ │ Tracking │ │ Settings │                    │
│  │ Analysis │ │  Module  │ │  Module  │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
│                    TanStack Table + Recharts                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (tRPC)
┌──────────────────────────┴──────────────────────────────────┐
│                    BACKEND (Node.js / Fastify)               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API LAYER (tRPC Routers)                 │   │
│  │  executive | keyword | root | syntax | variation      │   │
│  │  tracking  | settings | sync                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           CALCULATION ENGINE (Core Logic)             │   │
│  │  SyntaxClassifier | RootAggregator | MetricsCalc      │   │
│  │  VariationAttributor | TargetCalculator               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           ETL LAYER (Data Pipeline)                   │   │
│  │  Ingestion → Cleaning → Classification → Aggregation  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         AMAZON API CLIENT (Rate-Limited)              │   │
│  │  Ads API | SP-API | SQP | Business Reports            │   │
│  │  RetryManager | RateLimiter | BatchProcessor          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         BACKGROUND JOBS (BullMQ + Redis)              │   │
│  │  DataSyncJob | AggregationJob | ClassificationJob     │   │
│  │  HealthCheckJob | CleanupJob                          │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                    DATA LAYER                                │
│  ┌───────────────────┐  ┌───────────────────┐               │
│  │   PostgreSQL       │  │      Redis        │               │
│  │   (Primary DB)     │  │   (Cache + Queue) │               │
│  │                    │  │                    │               │
│  │  Raw tables        │  │  API response cache│               │
│  │  Clean tables      │  │  Session data      │               │
│  │  Aggregation tables│  │  Rate limit state  │               │
│  │  Mapping tables    │  │  Job queue (BullMQ)│               │
│  │  Syntax tables     │  │                    │               │
│  └───────────────────┘  └───────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack (Justified)

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | **Next.js 14 (App Router)** | Server components for fast initial load, API routes co-located |
| Tables | **TanStack Table v8** | The only table lib that handles 67+ columns with virtual scrolling without dying |
| Charts | **Recharts** | Lightweight, composable, good for time-series (your weekly data pattern) |
| Backend | **tRPC** | End-to-end type safety. When you have 67 metrics per product, types save you |
| Runtime | **Node.js + Fastify** | Fast, low overhead, native async for API calls |
| Database | **PostgreSQL 16** | JSONB for flexible raw data, window functions for time-series, mature |
| Cache/Queue | **Redis** | API response caching + BullMQ job queue in one service |
| ORM | **Drizzle ORM** | Type-safe, SQL-close, no magic. You see the queries |
| Jobs | **BullMQ** | Reliable job scheduling with retry, backoff, concurrency control |
| Auth | **Simple API key** (internal tool) | No need for OAuth complexity for internal use |

---

# 3. DATA MODEL

## 3.1 Core Entity Relationships

```
Brand (1) ──→ (N) Product
Product (1) ──→ (N) Variation (SKU/child ASIN)
Product (1) ──→ (N) RootMapping
RootMapping (1) ──→ (N) SyntaxMapping
SyntaxMapping (1) ──→ (N) Keyword

Keyword (N) ──→ (1) SyntaxGroup
SyntaxGroup (N) ──→ (1) Root
Root (N) ──→ (1) Product

Weekly data flows:
Product ──→ ProductWeeklyMetrics (your 67-column sheet, automated)
Keyword ──→ KeywordDailyMetrics
SyntaxGroup ──→ SyntaxWeeklyMetrics (aggregated from keyword data + SQP)
Root ──→ RootWeeklyMetrics (aggregated from syntax data)
Variation ──→ VariationAttributionLog
```

## 3.2 Raw Tables (Ingestion Layer)

These store data EXACTLY as received from APIs. No transformation. Append-only.

```sql
-- Raw Sponsored Products campaign report data
CREATE TABLE raw_sp_campaign_report (
    id BIGSERIAL PRIMARY KEY,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_date DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    profile_id VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,  -- Full API response, untouched
    source VARCHAR(50) NOT NULL DEFAULT 'ads_api',
    report_type VARCHAR(50) NOT NULL,  -- 'spCampaigns', 'spTargeting', 'spSearchTerm', etc.
    UNIQUE(report_date, marketplace_id, report_type, profile_id)
);

-- Raw SP-API Business Reports
CREATE TABLE raw_business_report (
    id BIGSERIAL PRIMARY KEY,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_date DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    asin VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'sp_api'
);

-- Raw SQP data (from Amazon SQP API or Jungle Scout export)
CREATE TABLE raw_sqp_data (
    id BIGSERIAL PRIMARY KEY,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_date DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    search_query TEXT NOT NULL,
    asin VARCHAR(20),
    payload JSONB NOT NULL,
    source VARCHAR(50) NOT NULL  -- 'sqp_api', 'jungle_scout', 'manual_upload'
);

-- Raw external tool data (DataDive, DataRover, ASIN Insight)
CREATE TABLE raw_external_data (
    id BIGSERIAL PRIMARY KEY,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    report_date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,  -- 'datadive', 'datarover', 'asin_insight'
    data_type VARCHAR(50) NOT NULL,  -- 'keyword_rank', 'search_volume', etc.
    payload JSONB NOT NULL
);

-- Indexes for raw tables
CREATE INDEX idx_raw_sp_date ON raw_sp_campaign_report(report_date);
CREATE INDEX idx_raw_br_date_asin ON raw_business_report(report_date, asin);
CREATE INDEX idx_raw_sqp_date_query ON raw_sqp_data(report_date, search_query);
```

## 3.3 Core Entity Tables

```sql
-- Brands
CREATE TABLE brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,  -- 'DECOLURE', 'SLEEPHORIA', 'SLEEP SANCTUARY'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products (parent ASIN level)
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    brand_id INT NOT NULL REFERENCES brands(id),
    parent_asin VARCHAR(20) NOT NULL,
    name VARCHAR(500) NOT NULL,
    category VARCHAR(200),
    product_line VARCHAR(100),  -- 'bamboo_sheets', 'satin_sheets', 'cooling_sheets'
    base_price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_asin)
);

-- Variations (child ASINs / SKUs)
CREATE TABLE variations (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id),
    child_asin VARCHAR(20) NOT NULL,
    sku VARCHAR(100),
    variation_attributes JSONB,  -- {"size": "Queen", "color": "White"}
    price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(child_asin)
);

-- Portfolios (Amazon Ads portfolios)
CREATE TABLE portfolios (
    id SERIAL PRIMARY KEY,
    amazon_portfolio_id VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    budget DECIMAL(10,2),
    UNIQUE(amazon_portfolio_id, marketplace_id)
);

-- Product-Portfolio mapping
CREATE TABLE product_portfolios (
    product_id INT NOT NULL REFERENCES products(id),
    portfolio_id INT NOT NULL REFERENCES portfolios(id),
    PRIMARY KEY (product_id, portfolio_id)
);

-- Marketplaces
CREATE TABLE marketplaces (
    id VARCHAR(20) PRIMARY KEY,  -- 'ATVPDKIKX0DER' for US, etc.
    name VARCHAR(50) NOT NULL,   -- 'US', 'CA', 'UK'
    currency VARCHAR(3) NOT NULL
);
```

## 3.4 Root & Syntax Mapping Tables (THE CRITICAL LAYER)

```sql
-- Roots: the top-level keyword cluster
CREATE TABLE roots (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id),
    root_term VARCHAR(200) NOT NULL,  -- 'bamboo', 'satin', 'cooling', 'silk'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, root_term)
);

-- Syntax Groups: sub-root clustering
-- This is the CORE of the system
CREATE TABLE syntax_groups (
    id SERIAL PRIMARY KEY,
    root_id INT NOT NULL REFERENCES roots(id),
    product_id INT NOT NULL REFERENCES products(id),
    syntax_label VARCHAR(200) NOT NULL,  -- 'Bamboo|Queen', 'Cooling|King', 'Satin|Full'
    material_term VARCHAR(100),          -- 'bamboo', 'cooling', 'satin', 'silk'
    size_term VARCHAR(50),               -- 'queen', 'king', 'full', 'twin', 'california king', NULL
    classification VARCHAR(50) NOT NULL, -- 'branded', 'competitor_branded', 'material_size', 'generic', 'irrelevant'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, syntax_label)
);

-- Syntax classification rules (replaces your Excel LET() formulas)
CREATE TABLE syntax_classification_rules (
    id SERIAL PRIMARY KEY,
    product_line VARCHAR(100) NOT NULL,  -- 'satin_sheets_decolure', 'bamboo_sheets', etc.
    rule_priority INT NOT NULL,          -- Lower = higher priority (branded=1, competitor=2, irrelevant=3, etc.)
    classification VARCHAR(50) NOT NULL, -- Output classification
    match_type VARCHAR(20) NOT NULL,     -- 'contains_any', 'contains_all', 'exact', 'regex'
    terms TEXT[] NOT NULL,               -- Array of terms to match
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(product_line, rule_priority)
);

-- Keyword → Syntax mapping
CREATE TABLE keyword_syntax_map (
    id SERIAL PRIMARY KEY,
    keyword_text TEXT NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    syntax_group_id INT REFERENCES syntax_groups(id),
    root_id INT REFERENCES roots(id),
    classification VARCHAR(50) NOT NULL,
    classified_at TIMESTAMPTZ DEFAULT NOW(),
    classification_method VARCHAR(20) DEFAULT 'rule',  -- 'rule', 'manual', 'ml'
    UNIQUE(keyword_text, product_id)
);

-- Competitor brand terms (shared across products)
CREATE TABLE competitor_terms (
    id SERIAL PRIMARY KEY,
    product_line VARCHAR(100) NOT NULL,
    term VARCHAR(200) NOT NULL,
    UNIQUE(product_line, term)
);

-- Irrelevant terms (shared across products)
CREATE TABLE irrelevant_terms (
    id SERIAL PRIMARY KEY,
    product_line VARCHAR(100) NOT NULL,
    term VARCHAR(200) NOT NULL,
    UNIQUE(product_line, term)
);
```

## 3.5 Cleaned / Transformed Tables

```sql
-- Cleaned keyword-level daily metrics (from Ads API search term reports)
CREATE TABLE keyword_daily_metrics (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    campaign_id VARCHAR(50) NOT NULL,
    campaign_name VARCHAR(500),
    ad_group_id VARCHAR(50),
    ad_group_name VARCHAR(500),
    keyword_text TEXT NOT NULL,
    match_type VARCHAR(20) NOT NULL,     -- 'EXACT', 'PHRASE', 'BROAD'
    targeting_type VARCHAR(20),          -- 'KEYWORD', 'PRODUCT', 'AUTO'
    targeted_asin VARCHAR(20),           -- The ASIN being advertised
    impressions INT NOT NULL DEFAULT 0,
    clicks INT NOT NULL DEFAULT 0,
    spend DECIMAL(10,2) NOT NULL DEFAULT 0,
    sales DECIMAL(10,2) NOT NULL DEFAULT 0,
    orders INT NOT NULL DEFAULT 0,
    units INT NOT NULL DEFAULT 0,
    -- Purchased ASIN tracking (for variation analysis)
    purchased_asin VARCHAR(20),
    -- Pre-calculated metrics
    ctr DECIMAL(8,4),        -- clicks / impressions
    cvr DECIMAL(8,4),        -- orders / clicks
    cpc DECIMAL(8,4),        -- spend / clicks
    acos DECIMAL(8,4),       -- spend / sales
    roas DECIMAL(8,4),       -- sales / spend
    -- Classification (populated by syntax engine)
    syntax_group_id INT REFERENCES syntax_groups(id),
    root_id INT REFERENCES roots(id),
    classification VARCHAR(50),

    UNIQUE(date, campaign_id, ad_group_id, keyword_text, match_type, targeted_asin)
);

-- Cleaned product-level daily metrics (from Business Reports / SP-API)
CREATE TABLE product_daily_metrics (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    parent_asin VARCHAR(20) NOT NULL,
    -- Traffic
    sessions INT DEFAULT 0,
    page_views INT DEFAULT 0,
    -- Sales
    units_ordered INT DEFAULT 0,
    total_sales DECIMAL(10,2) DEFAULT 0,
    total_orders INT DEFAULT 0,
    b2b_sales DECIMAL(10,2) DEFAULT 0,
    -- PPC (aggregated from keyword_daily_metrics)
    ppc_impressions INT DEFAULT 0,
    ppc_clicks INT DEFAULT 0,
    ppc_spend DECIMAL(10,2) DEFAULT 0,
    ppc_sales DECIMAL(10,2) DEFAULT 0,
    ppc_orders INT DEFAULT 0,
    -- Organic (derived)
    organic_orders INT DEFAULT 0,
    -- Listing
    price DECIMAL(10,2),
    bsr_main INT,
    bsr_sub INT,
    reviews INT,
    ratings DECIMAL(3,2),
    -- FBA
    fba_fees DECIMAL(10,2),

    UNIQUE(date, marketplace_id, parent_asin)
);

-- SQP metrics (cleaned from raw SQP data)
CREATE TABLE sqp_metrics (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,           -- Week start date
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    search_query TEXT NOT NULL,
    -- Search volume
    search_volume INT DEFAULT 0,
    -- Brand metrics (YOUR product)
    brand_impressions INT DEFAULT 0,
    brand_clicks INT DEFAULT 0,
    brand_cart_adds INT DEFAULT 0,
    brand_purchases INT DEFAULT 0,
    -- Total market metrics
    total_impressions INT DEFAULT 0,
    total_clicks INT DEFAULT 0,
    total_cart_adds INT DEFAULT 0,
    total_purchases INT DEFAULT 0,
    -- Share metrics
    impression_share DECIMAL(8,4),
    click_share DECIMAL(8,4),
    market_share DECIMAL(8,4),
    -- Classification
    syntax_group_id INT REFERENCES syntax_groups(id),
    root_id INT REFERENCES roots(id),

    UNIQUE(date, marketplace_id, product_id, search_query)
);

-- Targeting report data (Top of Search IS, etc.)
CREATE TABLE targeting_metrics (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    campaign_id VARCHAR(50) NOT NULL,
    keyword_text TEXT,
    targeted_asin VARCHAR(20),
    -- Placement data
    top_of_search_impression_share DECIMAL(8,4),
    top_of_search_bid_adjustment DECIMAL(8,4),
    rest_of_search_impression_share DECIMAL(8,4),
    product_page_impression_share DECIMAL(8,4),

    UNIQUE(date, campaign_id, keyword_text)
);

-- Indexes for query performance
CREATE INDEX idx_kw_daily_date_product ON keyword_daily_metrics(date, product_id);
CREATE INDEX idx_kw_daily_syntax ON keyword_daily_metrics(syntax_group_id);
CREATE INDEX idx_kw_daily_root ON keyword_daily_metrics(root_id);
CREATE INDEX idx_kw_daily_keyword ON keyword_daily_metrics(keyword_text);
CREATE INDEX idx_prod_daily_date ON product_daily_metrics(date, product_id);
CREATE INDEX idx_sqp_date_product ON sqp_metrics(date, product_id);
CREATE INDEX idx_sqp_syntax ON sqp_metrics(syntax_group_id);
```

## 3.6 Aggregation Tables

```sql
-- ============================================================
-- PRODUCT WEEKLY METRICS
-- This is the direct replacement for your 67-column product sheets
-- ============================================================
CREATE TABLE product_weekly_metrics (
    id SERIAL PRIMARY KEY,
    week_number INT NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),

    -- Product Info (cols 1-8 in your sheet)
    price DECIMAL(10,2),
    reviews INT,
    ratings DECIMAL(3,2),
    review_rate DECIMAL(6,4),          -- review_rate %
    bsr_main INT,
    bsr_sub INT,

    -- Traffic / Search (cols 9-11)
    sqp_total_search_volume INT,
    total_sessions INT,
    cost_per_session DECIMAL(8,4),     -- ppc_spend / sessions

    -- Sales (cols 12-21)
    units_ordered INT,
    total_sales DECIMAL(12,2),
    total_orders INT,
    b2b_sales DECIMAL(12,2),
    b2b_sales_pct DECIMAL(6,4),
    fba_fees DECIMAL(10,2),
    fba_fees_pct DECIMAL(6,4),
    daily_sales_velocity DECIMAL(8,2), -- units_ordered / 7
    session_clicks_ratio DECIMAL(8,4), -- sessions / ppc_clicks
    target_daily_sv DECIMAL(8,2),

    -- PPC Performance (cols 22-29)
    ppc_impressions INT,
    ppc_clicks INT,
    ppc_ctr DECIMAL(8,6),
    sqp_brand_ctr DECIMAL(8,6),
    sqp_market_ctr DECIMAL(8,6),
    target_ctr DECIMAL(8,6),           -- market_ctr * 1.10
    ppc_cpc DECIMAL(8,4),
    ppc_spend DECIMAL(12,2),
    ppc_sales DECIMAL(12,2),

    -- Order Split (cols 30-33)
    organic_orders INT,
    ppc_orders INT,
    organic_order_pct DECIMAL(6,4),
    ppc_order_pct DECIMAL(6,4),

    -- Conversion (cols 34-40)
    listing_cvr DECIMAL(8,6),          -- total_orders / sessions
    unit_session_pct DECIMAL(8,6),     -- units_ordered / sessions
    ppc_cvr DECIMAL(8,6),             -- ppc_orders / ppc_clicks
    breakeven_cvr DECIMAL(8,6),
    sqp_brand_cvr DECIMAL(8,6),
    sqp_market_cvr DECIMAL(8,6),
    target_cvr DECIMAL(8,6),           -- market_cvr * 3

    -- Ad Efficiency (cols 41-55)
    spend_with_sales DECIMAL(12,2),
    spend_without_sales DECIMAL(12,2),
    acos DECIMAL(8,6),
    breakeven_acos DECIMAL(8,6),
    real_acos DECIMAL(8,6),
    tacos DECIMAL(8,6),
    real_tacos DECIMAL(8,6),
    target_tacos DECIMAL(8,6),
    was_pct DECIMAL(8,6),              -- Wasted Ad Spend %
    was_exact DECIMAL(8,6),
    was_phrase DECIMAL(8,6),
    was_broad DECIMAL(8,6),
    was_1click_0order DECIMAL(8,6),
    was_1click_1order DECIMAL(8,6),

    -- Profitability (cols 56-59)
    blended_cpa DECIMAL(8,4),
    unit_profit DECIMAL(8,4),
    profit_after_cpa DECIMAL(8,4),
    cm3 DECIMAL(8,4),

    -- Market Position (cols 60-64)
    sqp_impression_share DECIMAL(8,6),
    sqp_click_share DECIMAL(8,6),
    sqp_market_share DECIMAL(8,6),
    top_4_12_rank_dominance DECIMAL(8,4),
    p1_dominance DECIMAL(8,4),

    -- Action (cols 65-67)
    weekly_action_plan TEXT,
    comment TEXT,

    UNIQUE(week_number, marketplace_id, product_id)
);

-- ============================================================
-- SYNTAX WEEKLY METRICS — THE CORE ANALYSIS TABLE
-- ============================================================
CREATE TABLE syntax_weekly_metrics (
    id SERIAL PRIMARY KEY,
    week_number INT NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    syntax_group_id INT NOT NULL REFERENCES syntax_groups(id),
    root_id INT NOT NULL REFERENCES roots(id),

    -- Syntax label for display
    syntax_label VARCHAR(200) NOT NULL,  -- 'Bamboo|Queen', 'Cooling|King'
    classification VARCHAR(50) NOT NULL,

    -- PPC Metrics (aggregated from keyword_daily_metrics)
    ppc_impressions INT DEFAULT 0,
    ppc_clicks INT DEFAULT 0,
    ppc_spend DECIMAL(12,2) DEFAULT 0,
    ppc_sales DECIMAL(12,2) DEFAULT 0,
    ppc_orders INT DEFAULT 0,
    units INT DEFAULT 0,
    ppc_ctr DECIMAL(8,6),
    ppc_cvr DECIMAL(8,6),
    ppc_cpc DECIMAL(8,4),
    acos DECIMAL(8,6),

    -- SQP Metrics (aggregated from sqp_metrics)
    search_volume INT DEFAULT 0,
    brand_ctr DECIMAL(8,6),            -- SQP Brand CTR
    brand_cvr DECIMAL(8,6),            -- SQP Brand CVR
    market_ctr DECIMAL(8,6),           -- SQP Market CTR
    market_cvr DECIMAL(8,6),           -- SQP Market CVR
    target_ctr DECIMAL(8,6),           -- market_ctr * 1.10
    target_cvr DECIMAL(8,6),           -- market_cvr * 3.00

    -- Revenue & Units (from PPC + organic attribution)
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_units INT DEFAULT 0,

    -- Share Metrics
    impression_share DECIMAL(8,6),
    click_share DECIMAL(8,6),
    market_share DECIMAL(8,6),
    top_of_search_is DECIMAL(8,6),

    -- Gap Analysis (calculated)
    ctr_gap DECIMAL(8,6),              -- brand_ctr - target_ctr
    cvr_gap DECIMAL(8,6),              -- brand_cvr - target_cvr
    is_underperforming BOOLEAN DEFAULT FALSE,

    -- WAS
    spend_with_sales DECIMAL(12,2) DEFAULT 0,
    spend_without_sales DECIMAL(12,2) DEFAULT 0,
    was_pct DECIMAL(8,6),

    UNIQUE(week_number, marketplace_id, product_id, syntax_group_id)
);

-- ============================================================
-- ROOT WEEKLY METRICS
-- ============================================================
CREATE TABLE root_weekly_metrics (
    id SERIAL PRIMARY KEY,
    week_number INT NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    root_id INT NOT NULL REFERENCES roots(id),
    root_term VARCHAR(200) NOT NULL,

    -- Aggregated from syntax_weekly_metrics
    total_keywords INT DEFAULT 0,
    total_syntax_groups INT DEFAULT 0,
    ppc_impressions INT DEFAULT 0,
    ppc_clicks INT DEFAULT 0,
    ppc_spend DECIMAL(12,2) DEFAULT 0,
    ppc_sales DECIMAL(12,2) DEFAULT 0,
    ppc_orders INT DEFAULT 0,
    units INT DEFAULT 0,
    ppc_ctr DECIMAL(8,6),
    ppc_cvr DECIMAL(8,6),
    acos DECIMAL(8,6),
    search_volume INT DEFAULT 0,
    impression_share DECIMAL(8,6),
    was_pct DECIMAL(8,6),

    -- Trend (WoW)
    spend_wow_change DECIMAL(8,4),
    sales_wow_change DECIMAL(8,4),
    acos_wow_change DECIMAL(8,4),

    UNIQUE(week_number, marketplace_id, product_id, root_id)
);

-- ============================================================
-- ACCOUNT WEEKLY METRICS
-- Replaces your Account Overview sheet
-- ============================================================
CREATE TABLE account_weekly_metrics (
    id SERIAL PRIMARY KEY,
    week_number INT NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,

    total_sales DECIMAL(14,2),
    amazon_withdraw DECIMAL(14,2),     -- total_sales * 0.20
    total_orders INT,
    avg_aov DECIMAL(10,2),
    ppc_impressions BIGINT,
    ppc_clicks INT,
    ppc_ctr DECIMAL(8,6),
    ppc_cpc DECIMAL(8,4),
    ppc_cvr DECIMAL(8,6),
    ppc_spend DECIMAL(12,2),
    spend_with_sales DECIMAL(12,2),
    spend_without_sales DECIMAL(12,2),
    ppc_sales DECIMAL(12,2),
    organic_orders INT,
    ppc_orders INT,
    organic_order_pct DECIMAL(8,6),
    ppc_order_pct DECIMAL(8,6),
    was_pct DECIMAL(8,6),
    acos DECIMAL(8,6),
    real_acos DECIMAL(8,6),
    tacos DECIMAL(8,6),
    real_tacos DECIMAL(8,6),

    UNIQUE(week_number, marketplace_id)
);

-- ============================================================
-- VARIATION ATTRIBUTION TABLE
-- ============================================================
CREATE TABLE variation_attribution (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    campaign_id VARCHAR(50) NOT NULL,
    keyword_text TEXT,

    -- The ASIN being advertised (targeted)
    targeted_asin VARCHAR(20) NOT NULL,
    targeted_sku VARCHAR(100),

    -- The ASIN that actually got the sale
    purchased_asin VARCHAR(20) NOT NULL,
    purchased_sku VARCHAR(100),

    -- Metrics
    spend DECIMAL(10,2) DEFAULT 0,
    sales DECIMAL(10,2) DEFAULT 0,
    orders INT DEFAULT 0,
    units INT DEFAULT 0,

    -- Flags
    is_cross_variation BOOLEAN NOT NULL, -- targeted_asin != purchased_asin

    UNIQUE(date, campaign_id, keyword_text, targeted_asin, purchased_asin)
);

-- Variation attribution weekly summary
CREATE TABLE variation_attribution_weekly (
    id SERIAL PRIMARY KEY,
    week_number INT NOT NULL,
    week_start DATE NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,
    product_id INT NOT NULL REFERENCES products(id),
    targeted_asin VARCHAR(20) NOT NULL,
    purchased_asin VARCHAR(20) NOT NULL,

    total_spend DECIMAL(12,2) DEFAULT 0,
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_orders INT DEFAULT 0,
    total_units INT DEFAULT 0,
    is_cross_variation BOOLEAN NOT NULL,
    cross_variation_pct DECIMAL(8,4),  -- % of total sales for this targeted ASIN that went elsewhere

    UNIQUE(week_number, marketplace_id, targeted_asin, purchased_asin)
);

-- Aggregation indexes
CREATE INDEX idx_syntax_weekly_product ON syntax_weekly_metrics(product_id, week_number);
CREATE INDEX idx_syntax_weekly_root ON syntax_weekly_metrics(root_id, week_number);
CREATE INDEX idx_root_weekly_product ON root_weekly_metrics(product_id, week_number);
CREATE INDEX idx_variation_weekly ON variation_attribution_weekly(product_id, week_number);
CREATE INDEX idx_product_weekly ON product_weekly_metrics(product_id, week_number);
```

## 3.7 Settings & System Tables

```sql
-- API Credentials (encrypted at application level)
CREATE TABLE api_credentials (
    id SERIAL PRIMARY KEY,
    credential_type VARCHAR(50) NOT NULL,  -- 'amazon_ads', 'sp_api'
    marketplace_id VARCHAR(20),
    profile_id VARCHAR(50),               -- Ads API profile
    client_id VARCHAR(200),               -- Encrypted
    client_secret TEXT,                    -- Encrypted
    refresh_token TEXT,                    -- Encrypted
    access_token TEXT,                     -- Encrypted (cached)
    access_token_expires_at TIMESTAMPTZ,
    last_tested_at TIMESTAMPTZ,
    last_test_status VARCHAR(20),         -- 'success', 'failed'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync configuration
CREATE TABLE sync_config (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,       -- 'ppc_search_term', 'business_report', 'sqp', etc.
    frequency_minutes INT NOT NULL,        -- How often to sync
    last_sync_at TIMESTAMPTZ,
    last_sync_status VARCHAR(20),
    next_sync_at TIMESTAMPTZ,
    is_enabled BOOLEAN DEFAULT TRUE,
    config JSONB                           -- Additional config per sync type
);

-- Sync log
CREATE TABLE sync_log (
    id BIGSERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,          -- 'running', 'success', 'failed', 'partial'
    records_fetched INT DEFAULT 0,
    records_processed INT DEFAULT 0,
    error_message TEXT,
    api_calls_made INT DEFAULT 0,
    retry_count INT DEFAULT 0
);

-- API call log (for monitoring rate limits and errors)
CREATE TABLE api_call_log (
    id BIGSERIAL PRIMARY KEY,
    called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    api_type VARCHAR(50) NOT NULL,        -- 'ads_api', 'sp_api'
    endpoint VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INT,
    response_time_ms INT,
    error_type VARCHAR(100),
    error_message TEXT,
    retry_attempt INT DEFAULT 0,
    marketplace_id VARCHAR(20)
);

-- For monitoring error rates
CREATE INDEX idx_api_log_time ON api_call_log(called_at);
CREATE INDEX idx_api_log_status ON api_call_log(status_code);
```

---

# 4. SYNTAX ENGINE — CORE LOGIC

## 4.1 What Your Excel Formulas Do (Translated to System Logic)

Your Excel LET() formulas classify keywords using this priority chain:

```
Priority 1: Branded         → contains your brand name
Priority 2: Competitor       → contains any competitor brand name
Priority 3: Irrelevant       → contains material/term mismatches
Priority 4: Material|Size    → material term + size detection
Priority 5: Generic          → general bedding terms
Priority 6: Irrelevant       → fallthrough default
```

For **DECOLURE Satin Sheets**, the syntax outputs are:
- `Branded` (contains "decolure")
- `Competitor Branded` (matches 250+ competitor terms)
- `Irrelevant` (contains bamboo, cotton, flannel, etc.)
- `Silk|Queen`, `Silk|King`, `Silk|Full`, `Silk|Twin`, `Silk` (no size)
- `Satin|Queen`, `Satin|King`, `Satin|Full`, `Satin|Twin`, `Satin` (no size)
- `Generic`

For **Bamboo Sheets**, the syntax outputs are:
- `Branded`
- `Competitor Branded` (60+ bamboo-specific competitors)
- `Irrelevant` (contains silk, satin, cotton, etc.)
- `Cooling|California King`, `Cooling|Queen`, `Cooling|King`, `Cooling|Full`, `Cooling|Twin`, `Cooling`
- `Bamboo|California King`, `Bamboo|Queen`, `Bamboo|King`, `Bamboo|Full`, `Bamboo|Twin`, `Bamboo`
- `Generic`

## 4.2 Syntax Classification Engine (Code Architecture)

```typescript
// src/engine/syntax-classifier.ts

interface ClassificationRule {
  priority: number;
  classification: string;
  matchType: 'contains_any' | 'contains_all' | 'exact' | 'regex';
  terms: string[];
  // For Material|Size rules
  materialTerms?: string[];
  sizeTerms?: string[];
  generateSizeVariants?: boolean;
}

interface ClassificationResult {
  syntaxLabel: string;       // 'Bamboo|Queen', 'Branded', 'Generic'
  classification: string;    // 'branded', 'competitor_branded', 'material_size', etc.
  materialTerm?: string;     // 'bamboo', 'satin', etc.
  sizeTerm?: string;         // 'queen', 'king', etc.
  rootTerm?: string;         // Derived root
  confidence: number;        // 1.0 for rule-based, lower for fuzzy
}

// Product line configurations (replaces your Excel arrays)
const SATIN_SHEETS_DECOLURE: ClassificationRule[] = [
  {
    priority: 1,
    classification: 'branded',
    matchType: 'contains_any',
    terms: ['decolure']
  },
  {
    priority: 2,
    classification: 'competitor_branded',
    matchType: 'contains_any',
    terms: [
      // Your 250+ competitor terms from the docx
      'bedsure', 'cgk unlimited', 'duz cho', 'elegant comfort',
      'juicy couture', 'lanest housing', 'love\'s cabin', 'mk home',
      'more precious', 'silky satin', 'vonty', 'yastouay',
      // ... full list loaded from competitor_terms table
    ]
  },
  {
    priority: 3,
    classification: 'irrelevant',
    matchType: 'contains_any',
    terms: [
      'bamboo', 'cotton', 'flannel', 'jersey', 'linen', 'microfiber',
      'muslin', 'percale', 'polyester', 'tencel', 'velvet',
      'xl twin', 'twin xl', 'split king',
      // ... full list from irrelevant_terms table
    ]
  },
  {
    priority: 4,
    classification: 'material_size',
    matchType: 'contains_any',
    materialTerms: [
      'silk', 'silks', 'silky', 'mulberry', 'mulberry silk',
      '100 silk', '100% silk', 'charmeuse', 'pure silk',
      'real silk', 'natural silk', 'genuine silk', 'silk satin'
    ],
    sizeTerms: ['queen', 'king', 'full', 'twin'],
    terms: [], // Populated from materialTerms
    generateSizeVariants: true
    // Generates: Silk|Queen, Silk|King, Silk|Full, Silk|Twin, Silk
  },
  {
    priority: 5,
    classification: 'material_size',
    matchType: 'contains_any',
    materialTerms: [
      'satin', 'satins', 'sateen', 'charmeuse',
      'silky soft', 'silky smooth', 'glossy', 'luxury soft',
      'smooth', 'shiny', 'lustrous'
    ],
    sizeTerms: ['queen', 'king', 'full', 'twin'],
    terms: [],
    generateSizeVariants: true
    // Generates: Satin|Queen, Satin|King, Satin|Full, Satin|Twin, Satin
  },
  {
    priority: 6,
    classification: 'generic',
    matchType: 'contains_any',
    terms: [
      'sheet', 'sheets', 'bedding', 'bed sheet', 'bed sheets',
      'fitted sheet', 'flat sheet', 'pillow', 'pillowcase',
      // ... 180+ generic terms
    ]
  },
  {
    priority: 99,
    classification: 'irrelevant',
    matchType: 'contains_any',
    terms: ['*']  // Default fallthrough
  }
];

// The classifier function
function classifyKeyword(
  keyword: string,
  rules: ClassificationRule[]
): ClassificationResult {
  const lowerKeyword = keyword.toLowerCase().trim();

  // Sort rules by priority
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (rule.generateSizeVariants && rule.materialTerms) {
      // Check material match first
      const hasMaterial = rule.materialTerms.some(term =>
        lowerKeyword.includes(term.toLowerCase())
      );

      if (hasMaterial) {
        // Find which material matched
        const matchedMaterial = rule.materialTerms.find(term =>
          lowerKeyword.includes(term.toLowerCase())
        );

        // Check for size
        const matchedSize = rule.sizeTerms?.find(size =>
          lowerKeyword.includes(size.toLowerCase())
        );

        // Determine the canonical material label
        const materialLabel = getMaterialLabel(matchedMaterial!, rule);

        return {
          syntaxLabel: matchedSize
            ? `${materialLabel}|${capitalize(matchedSize)}`
            : materialLabel,
          classification: rule.classification,
          materialTerm: materialLabel.toLowerCase(),
          sizeTerm: matchedSize?.toLowerCase(),
          rootTerm: materialLabel.toLowerCase(),
          confidence: 1.0
        };
      }
    } else {
      // Simple contains_any check
      const matches = rule.terms.some(term =>
        term === '*' || lowerKeyword.includes(term.toLowerCase())
      );

      if (matches && rule.terms[0] !== '*') {
        return {
          syntaxLabel: capitalize(rule.classification.replace('_', ' ')),
          classification: rule.classification,
          confidence: 1.0
        };
      }
    }
  }

  // Default fallthrough
  return {
    syntaxLabel: 'Irrelevant',
    classification: 'irrelevant',
    confidence: 0.5
  };
}
```

## 4.3 Syntax Aggregation Logic

```typescript
// src/engine/syntax-aggregator.ts

// How syntax_weekly_metrics gets populated:
async function aggregateSyntaxWeekly(
  weekStart: Date,
  weekEnd: Date,
  productId: number
): Promise<SyntaxWeeklyMetric[]> {

  // Step 1: Get all keyword daily metrics for the week, grouped by syntax
  const ppcBySyntax = await db.query(`
    SELECT
      kdm.syntax_group_id,
      sg.syntax_label,
      sg.classification,
      sg.root_id,
      SUM(kdm.impressions) as ppc_impressions,
      SUM(kdm.clicks) as ppc_clicks,
      SUM(kdm.spend) as ppc_spend,
      SUM(kdm.sales) as ppc_sales,
      SUM(kdm.orders) as ppc_orders,
      SUM(kdm.units) as units,
      -- Spend with/without sales
      SUM(CASE WHEN kdm.sales > 0 THEN kdm.spend ELSE 0 END) as spend_with_sales,
      SUM(CASE WHEN kdm.sales = 0 THEN kdm.spend ELSE 0 END) as spend_without_sales
    FROM keyword_daily_metrics kdm
    JOIN syntax_groups sg ON kdm.syntax_group_id = sg.id
    WHERE kdm.product_id = $1
      AND kdm.date BETWEEN $2 AND $3
    GROUP BY kdm.syntax_group_id, sg.syntax_label, sg.classification, sg.root_id
  `, [productId, weekStart, weekEnd]);

  // Step 2: Get SQP data for the same syntax groups
  const sqpBySyntax = await db.query(`
    SELECT
      sqp.syntax_group_id,
      SUM(sqp.search_volume) as search_volume,
      -- Brand metrics
      SUM(sqp.brand_clicks)::FLOAT / NULLIF(SUM(sqp.brand_impressions), 0) as brand_ctr,
      SUM(sqp.brand_purchases)::FLOAT / NULLIF(SUM(sqp.brand_clicks), 0) as brand_cvr,
      -- Market metrics
      SUM(sqp.total_clicks)::FLOAT / NULLIF(SUM(sqp.total_impressions), 0) as market_ctr,
      SUM(sqp.total_purchases)::FLOAT / NULLIF(SUM(sqp.total_clicks), 0) as market_cvr,
      -- Share
      SUM(sqp.brand_impressions)::FLOAT / NULLIF(SUM(sqp.total_impressions), 0) as impression_share,
      SUM(sqp.brand_clicks)::FLOAT / NULLIF(SUM(sqp.total_clicks), 0) as click_share,
      SUM(sqp.brand_purchases)::FLOAT / NULLIF(SUM(sqp.total_purchases), 0) as market_share
    FROM sqp_metrics sqp
    WHERE sqp.product_id = $1
      AND sqp.date BETWEEN $2 AND $3
      AND sqp.syntax_group_id IS NOT NULL
    GROUP BY sqp.syntax_group_id
  `, [productId, weekStart, weekEnd]);

  // Step 3: Merge PPC + SQP and calculate targets
  return ppcBySyntax.map(ppc => {
    const sqp = sqpBySyntax.find(s => s.syntax_group_id === ppc.syntax_group_id);

    const brand_ctr = sqp?.brand_ctr || 0;
    const brand_cvr = sqp?.brand_cvr || 0;
    const market_ctr = sqp?.market_ctr || 0;
    const market_cvr = sqp?.market_cvr || 0;
    const target_ctr = market_ctr * 1.10;  // YOUR FORMULA
    const target_cvr = market_cvr * 3.00;  // YOUR FORMULA

    return {
      week_number: getWeekNumber(weekStart),
      week_start: weekStart,
      week_end: weekEnd,
      product_id: productId,
      syntax_group_id: ppc.syntax_group_id,
      root_id: ppc.root_id,
      syntax_label: ppc.syntax_label,
      classification: ppc.classification,

      // PPC
      ppc_impressions: ppc.ppc_impressions,
      ppc_clicks: ppc.ppc_clicks,
      ppc_spend: ppc.ppc_spend,
      ppc_sales: ppc.ppc_sales,
      ppc_orders: ppc.ppc_orders,
      units: ppc.units,
      ppc_ctr: ppc.ppc_clicks / (ppc.ppc_impressions || 1),
      ppc_cvr: ppc.ppc_orders / (ppc.ppc_clicks || 1),
      ppc_cpc: ppc.ppc_spend / (ppc.ppc_clicks || 1),
      acos: ppc.ppc_spend / (ppc.ppc_sales || 1),

      // SQP
      search_volume: sqp?.search_volume || 0,
      brand_ctr,
      brand_cvr,
      market_ctr,
      market_cvr,
      target_ctr,
      target_cvr,

      // Share
      impression_share: sqp?.impression_share || 0,
      click_share: sqp?.click_share || 0,
      market_share: sqp?.market_share || 0,

      // Gap Analysis
      ctr_gap: brand_ctr - target_ctr,
      cvr_gap: brand_cvr - target_cvr,
      is_underperforming: brand_ctr < target_ctr || brand_cvr < target_cvr,

      // WAS
      spend_with_sales: ppc.spend_with_sales,
      spend_without_sales: ppc.spend_without_sales,
      was_pct: ppc.spend_without_sales / (ppc.ppc_spend || 1),
    };
  });
}
```

## 4.4 Syntax Rule Management

The Settings module allows operators to manage syntax rules without code changes:

```typescript
// API: POST /api/syntax-rules
// Body: { productLine, rules: ClassificationRule[] }
// This replaces editing Excel formulas

// API: POST /api/syntax-rules/test
// Body: { productLine, testKeywords: string[] }
// Returns: classification results for each keyword
// Used to validate rules before saving

// API: POST /api/syntax-rules/reclassify
// Body: { productId }
// Triggers re-classification of all keywords for a product
// Runs as background job
```

---

# 5. CALCULATION ENGINE

## 5.1 Core Metric Formulas

All formulas aligned with your existing 67-column product sheets:

```typescript
// src/engine/calculations.ts

// ===== TRAFFIC =====
const costPerSession = (ppcSpend: number, sessions: number) =>
  sessions > 0 ? ppcSpend / sessions : 0;

const sessionClicksRatio = (sessions: number, ppcClicks: number) =>
  ppcClicks > 0 ? sessions / ppcClicks : 0;

// ===== SALES =====
const dailySalesVelocity = (unitsOrdered: number, days: number = 7) =>
  unitsOrdered / days;

const b2bSalesPct = (b2bSales: number, totalSales: number) =>
  totalSales > 0 ? b2bSales / totalSales : 0;

const fbaFeesPct = (fbaFees: number, totalSales: number) =>
  totalSales > 0 ? fbaFees / totalSales : 0;

// ===== PPC PERFORMANCE =====
const ppcCtr = (clicks: number, impressions: number) =>
  impressions > 0 ? clicks / impressions : 0;

const ppcCpc = (spend: number, clicks: number) =>
  clicks > 0 ? spend / clicks : 0;

const ppcCvr = (orders: number, clicks: number) =>
  clicks > 0 ? orders / clicks : 0;

// ===== TARGET METRICS (YOUR SPECIFIC FORMULAS) =====
const targetCtr = (marketCtr: number) => marketCtr * 1.10;
const targetCvr = (marketCvr: number) => marketCvr * 3.00;

// ===== CONVERSION =====
const listingCvr = (totalOrders: number, sessions: number) =>
  sessions > 0 ? totalOrders / sessions : 0;

const unitSessionPct = (unitsOrdered: number, sessions: number) =>
  sessions > 0 ? unitsOrdered / sessions : 0;

const breakevenCvr = (cpc: number, price: number, profitMargin: number) =>
  // CVR needed to break even: CPC / (Price * Margin)
  (price * profitMargin) > 0 ? cpc / (price * profitMargin) : 0;

// ===== AD EFFICIENCY =====
const acos = (spend: number, ppcSales: number) =>
  ppcSales > 0 ? spend / ppcSales : 0;

const realAcos = (spend: number, ppcSales: number) => {
  // Real ACOS accounts for spend without sales
  return ppcSales > 0 ? spend / ppcSales : spend > 0 ? Infinity : 0;
};

const tacos = (ppcSpend: number, totalSales: number) =>
  totalSales > 0 ? ppcSpend / totalSales : 0;

const realTacos = (ppcSpend: number, totalSales: number) =>
  totalSales > 0 ? ppcSpend / totalSales : 0;

const breakevenAcos = (profitMargin: number) => profitMargin;
  // If margin is 30%, breakeven ACOS is 30%

const wasPct = (spendWithoutSales: number, totalSpend: number) =>
  totalSpend > 0 ? spendWithoutSales / totalSpend : 0;

// WAS by match type
const wasExact = (exactSpendNoSales: number, exactTotalSpend: number) =>
  exactTotalSpend > 0 ? exactSpendNoSales / exactTotalSpend : 0;

// ===== ORDER SPLIT =====
const organicOrders = (totalOrders: number, ppcOrders: number) =>
  Math.max(0, totalOrders - ppcOrders);

const organicOrderPct = (organicOrders: number, totalOrders: number) =>
  totalOrders > 0 ? organicOrders / totalOrders : 0;

const ppcOrderPct = (ppcOrders: number, totalOrders: number) =>
  totalOrders > 0 ? ppcOrders / totalOrders : 0;

// ===== PROFITABILITY =====
const blendedCpa = (ppcSpend: number, totalOrders: number) =>
  totalOrders > 0 ? ppcSpend / totalOrders : 0;

const unitProfit = (price: number, cogs: number, fbaFees: number) =>
  price - cogs - fbaFees;

const profitAfterCpa = (unitProfit: number, blendedCpa: number) =>
  unitProfit - blendedCpa;

const cm3 = (profitAfterCpa: number, price: number) =>
  price > 0 ? profitAfterCpa / price : 0;

// ===== MARKET POSITION =====
const impressionShare = (brandImpressions: number, totalImpressions: number) =>
  totalImpressions > 0 ? brandImpressions / totalImpressions : 0;

const clickShare = (brandClicks: number, totalClicks: number) =>
  totalClicks > 0 ? brandClicks / totalClicks : 0;

const marketShare = (brandPurchases: number, totalPurchases: number) =>
  totalPurchases > 0 ? brandPurchases / totalPurchases : 0;

// ===== ACCOUNT LEVEL =====
const amazonWithdraw = (totalSales: number) => totalSales * 0.20;

const avgAov = (totalSales: number, totalOrders: number) =>
  totalOrders > 0 ? totalSales / totalOrders : 0;
```

## 5.2 Variation Attribution Logic

```typescript
// src/engine/variation-attributor.ts

interface VariationAttribution {
  targetedAsin: string;
  purchasedAsin: string;
  spend: number;
  sales: number;
  orders: number;
  isCrossVariation: boolean;
}

// From the Ads API Purchased Product report:
// campaignId → targetedAsin → purchasedAsin → spend/sales
// When targetedAsin !== purchasedAsin → cross-variation conversion

function analyzeVariationMismatch(
  attributions: VariationAttribution[]
): VariationAnalysis {
  const byTargeted = groupBy(attributions, 'targetedAsin');

  return Object.entries(byTargeted).map(([targetedAsin, records]) => {
    const totalSpend = sum(records, 'spend');
    const totalSales = sum(records, 'sales');
    const totalOrders = sum(records, 'orders');

    const crossVariation = records.filter(r => r.isCrossVariation);
    const crossSpend = sum(crossVariation, 'spend');
    const crossSales = sum(crossVariation, 'sales');
    const crossOrders = sum(crossVariation, 'orders');

    return {
      targetedAsin,
      totalSpend,
      totalSales,
      totalOrders,
      sameVariationSales: totalSales - crossSales,
      crossVariationSales: crossSales,
      crossVariationPct: totalSales > 0 ? crossSales / totalSales : 0,
      crossVariationOrders: crossOrders,
      // Where did the money actually go?
      purchaseBreakdown: groupBy(records, 'purchasedAsin').map(([asin, recs]) => ({
        purchasedAsin: asin,
        sales: sum(recs, 'sales'),
        orders: sum(recs, 'orders'),
        pctOfTargetedSpend: sum(recs, 'sales') / totalSales,
      })),
      // Flag: is spend being wasted on the wrong variation?
      spendMismatchFlag: crossSales / totalSales > 0.30, // >30% cross-variation = red flag
    };
  });
}
```

---

# 6. MODULE DESIGN — ALL 7 MODULES

## Module 1: EXECUTIVE CONTROL PANEL

**Purpose**: Account-level health at a glance. Replaces your Dashboard sheet.

### Key Metrics (Top Cards)
| Metric | Source | Period Selector |
|--------|--------|----------------|
| Total Sales | product_daily_metrics (SUM) | Daily / Weekly / Monthly / Quarterly |
| Amazon Withdraw | total_sales * 0.20 | Same |
| Total Orders | product_daily_metrics (SUM) | Same |
| AVG AOV | total_sales / total_orders | Same |
| PPC Spend | keyword_daily_metrics (SUM) | Same |
| PPC Sales | keyword_daily_metrics (SUM) | Same |
| ACOS % | spend / ppc_sales | Same |
| TACOS % | spend / total_sales | Same |
| Organic Order % | (total_orders - ppc_orders) / total_orders | Same |
| PPC Order % | ppc_orders / total_orders | Same |
| WAS % | spend_without_sales / spend | Same |
| Daily Sales Velocity | units / days | Same |

### Charts
1. **Sales Trend** — Line chart: Total Sales + PPC Sales + Organic Sales (weekly, matches your Account Overview)
2. **ACOS / TACOS Trend** — Dual line: ACOS% and TACOS% over time
3. **Spend Efficiency** — Stacked bar: Spend with Sales vs Spend without Sales
4. **Order Split Trend** — Stacked area: Organic vs PPC orders
5. **Velocity Trend** — Line chart: daily sales velocity per product

### Product Breakdown Table
Replaces your Dashboard's per-product section:

| Column | Metric |
|--------|--------|
| Product Name | — |
| ASIN | — |
| Price | Current |
| Reviews | Current |
| BSR | Current |
| Weekly Sales | $ |
| Units | # |
| PPC Spend | $ |
| ACOS | % |
| TACOS | % |
| Organic % | % |
| Sales Velocity | units/day |
| WoW Change | % (color coded) |

### Filters
- Marketplace (US, CA, UK, etc.)
- Date Range (preset: This Week, Last Week, Last 4 Weeks, Last 13 Weeks, Custom)
- Brand (DECOLURE, SLEEPHORIA, SLEEP SANCTUARY, All)
- Portfolio

### User Actions
- Click any product row → drill into Product Detail view
- Click any metric card → expand trend chart
- Export current view as CSV

---

## Module 2: KEYWORD ENGINE

**Purpose**: Keyword-level performance analysis. The operator's daily workbench.

### Primary Table (Full-Width, Sortable, Filterable)

| Column | Source |
|--------|--------|
| Keyword | keyword_daily_metrics.keyword_text |
| Match Type | EXACT / PHRASE / BROAD |
| Campaign | campaign_name |
| Syntax | syntax_groups.syntax_label |
| Root | roots.root_term |
| Classification | branded / competitor / material_size / generic / irrelevant |
| Impressions | SUM |
| Clicks | SUM |
| CTR | clicks / impressions |
| CPC | spend / clicks |
| Spend | SUM |
| Sales | SUM |
| Orders | SUM |
| CVR | orders / clicks |
| ACOS | spend / sales |
| ROAS | sales / spend |
| Spend W/O Sales | SUM where sales = 0 |
| WAS % | spend_without_sales / total_spend |

### Filters
- Product (dropdown)
- Date Range
- Match Type (checkboxes: Exact, Phrase, Broad)
- Classification (checkboxes: Branded, Material|Size, Generic, Competitor, Irrelevant)
- Syntax Group (dropdown)
- Root (dropdown)
- Min/Max Spend
- Min/Max ACOS

### Key Features
1. **Sort by any column** — critical for finding top spenders, worst ACOS, etc.
2. **Inline classification override** — operator can manually reclassify a keyword
3. **Bulk actions** — select multiple keywords → bulk reclassify, add to negative list
4. **Keyword detail panel** — click a keyword → see daily trend, which campaigns it's in, which variations got sales

---

## Module 3: ROOT ENGINE

**Purpose**: Root-level aggregated view. See how entire keyword clusters perform.

### Primary Table

| Column | Calculation |
|--------|------------|
| Root | roots.root_term |
| # Keywords | COUNT(keyword_syntax_map) |
| # Syntax Groups | COUNT(DISTINCT syntax_groups) |
| Search Volume | SUM(sqp) |
| Impressions | SUM |
| Clicks | SUM |
| CTR | clicks / impressions |
| Spend | SUM |
| Sales | SUM |
| Orders | SUM |
| Units | SUM |
| CVR | orders / clicks |
| ACOS | spend / sales |
| Impression Share | SQP avg |
| WAS % | spend_without_sales / spend |
| WoW Spend Δ | % change |
| WoW Sales Δ | % change |
| WoW ACOS Δ | % change |

### Drill-Down
Click any root → expands to show all syntax groups under that root → click syntax → see keywords.

### Chart
- Root Performance Bubble Chart: X = Spend, Y = ACOS, Bubble Size = Sales, Color = Root
- Root Trend Lines: select 1-3 roots, overlay their ACOS/spend/sales trends

---

## Module 4: SYNTAX ENGINE (CORE MODULE)

**Purpose**: The primary analysis layer. This is where PPC decisions happen.

### Primary Table — Syntax Performance

| Column | Source | Importance |
|--------|--------|-----------|
| Syntax Label | `Bamboo\|Queen`, `Cooling\|King` | — |
| Root | Parent root | — |
| Classification | branded / material_size / etc. | — |
| **Brand CTR** | SQP brand_clicks / brand_impressions | CRITICAL |
| **Market CTR** | SQP total_clicks / total_impressions | CRITICAL |
| **Target CTR** | Market CTR × 1.10 | CRITICAL |
| **CTR Gap** | Brand CTR − Target CTR | CRITICAL (red if negative) |
| **Brand CVR** | SQP brand_purchases / brand_clicks | CRITICAL |
| **Market CVR** | SQP total_purchases / total_clicks | CRITICAL |
| **Target CVR** | Market CVR × 3.00 | CRITICAL |
| **CVR Gap** | Brand CVR − Target CVR | CRITICAL (red if negative) |
| Revenue | PPC sales | — |
| Units | SUM | — |
| Spend | SUM | — |
| ACOS | spend / sales | — |
| Search Volume | SQP | — |
| **Impression Share %** | SQP | HIGH |
| **Top of Search IS** | targeting_metrics | HIGH |
| Click Share % | SQP | — |
| Market Share % | SQP | — |
| WAS % | spend_without_sales / spend | — |

### Color Coding Rules
```
CTR Gap:
  - Green: Brand CTR >= Target CTR (outperforming market by 10%+)
  - Yellow: Brand CTR >= Market CTR but < Target CTR
  - Red: Brand CTR < Market CTR

CVR Gap:
  - Green: Brand CVR >= Target CVR (3x market)
  - Yellow: Brand CVR >= Market CVR but < Target CVR
  - Red: Brand CVR < Market CVR

Impression Share:
  - Green: > 15%
  - Yellow: 5-15%
  - Red: < 5%
```

### Syntax Trend View
Select any syntax group → see weekly trend of:
- Brand CTR vs Market CTR vs Target CTR (triple line)
- Brand CVR vs Market CVR vs Target CVR (triple line)
- Impression Share % (area chart)
- Spend vs Sales (dual bar)

### Gap Analysis View
**THIS IS THE DECISION-MAKING VIEW.**

Table sorted by worst-performing syntax groups:

```
Underperformers (CTR below Target):
┌─────────────────┬───────────┬───────────┬───────────┬──────────┐
│ Syntax           │ Brand CTR │ Target CTR│ Gap       │ Action   │
├─────────────────┼───────────┼───────────┼───────────┼──────────┤
│ Bamboo|Twin      │ 1.2%      │ 2.5%      │ -1.3%     │ Optimize │
│ Cooling|Full     │ 0.8%      │ 1.9%      │ -1.1%     │ Review   │
│ Satin|King       │ 2.1%      │ 3.0%      │ -0.9%     │ Watch    │
└─────────────────┴───────────┴───────────┴───────────┴──────────┘

Underperformers (CVR below Target):
┌─────────────────┬───────────┬───────────┬───────────┬──────────┐
│ Syntax           │ Brand CVR │ Target CVR│ Gap       │ Action   │
├─────────────────┼───────────┼───────────┼───────────┼──────────┤
│ Cooling|Queen    │ 5.2%      │ 18.0%     │ -12.8%    │ Listing  │
│ Bamboo|CK        │ 3.1%      │ 12.0%     │ -8.9%     │ Price    │
└─────────────────┴───────────┴───────────┴───────────┴──────────┘
```

### Filters
- Product
- Root
- Classification (exclude irrelevant by default)
- Date Range
- Min Search Volume (to ignore low-volume noise)
- Show Only Underperformers (toggle)

---

## Module 5: VARIATION ANALYSIS ENGINE

**Purpose**: Track where spend goes vs where sales happen across child ASINs.

### Primary Table — Cross-Variation Matrix

| Targeted SKU | Targeted ASIN | Total Spend | Same-SKU Sales | Cross-SKU Sales | Cross % | Top Purchased ASIN |
|-------------|---------------|-------------|---------------|----------------|---------|-------------------|
| Bamboo Queen White | B08KQ... | $1,200 | $3,400 | $890 | 20.7% | B0D95... (King) |
| Bamboo King Gray | B0D95... | $800 | $2,100 | $1,200 | 36.4% | B08KQ... (Queen) |

### Sankey Diagram
Visual flow: Spend on Targeted ASIN → flows to → Purchased ASINs
- Width of flow = dollar amount
- Red flows = cross-variation (money leaking)

### Alerts
```
🔴 HIGH: B0D952H31F (Bamboo 6PCS) has 36.4% cross-variation rate
   → $1,200/week spent advertising this SKU, but sales go to B08KQKPKWC
   → Consider: adjust targeting or review listing quality
```

### Filters
- Product (parent level)
- Date Range
- Min Cross-Variation % threshold

---

## Module 6: TRACKING MODULE

**Purpose**: Week-over-week tracking aligned with your existing weekly reporting cadence.

### Weekly Scorecard
Replicates your 67-column product sheet view, but automated:

One row per product per week, showing ALL metrics from your existing sheets:
- Product Info | Traffic | Sales | PPC Performance | Order Split | Conversion | Ad Efficiency | Profitability | Market Position

### Color coding for WoW changes:
- Green: improved >5%
- Gray: flat (±5%)
- Red: declined >5%

### Period Comparison
Select any two periods → side-by-side comparison with delta columns.

### Weekly Action Log
- Operator enters weekly action plan (replaces your "Weekly Meeting Action Plan" column)
- Persisted per product per week
- Searchable history

---

## Module 7: SETTINGS

### API Credentials
```
┌─ Amazon Ads API ────────────────────────────┐
│ Client ID:     [••••••••••••••]  [Show]      │
│ Client Secret: [••••••••••••••]  [Show]      │
│ Refresh Token: [••••••••••••••]  [Show]      │
│ Profile ID:    [••••••••••••••]              │
│ Marketplace:   [US ▼]                        │
│                                              │
│ Status: ✅ Connected (tested 2h ago)         │
│ [Test Connection]  [Save]                    │
└──────────────────────────────────────────────┘

┌─ SP-API ────────────────────────────────────┐
│ Client ID:     [••••••••••••••]              │
│ Client Secret: [••••••••••••••]              │
│ Refresh Token: [••••••••••••••]              │
│ AWS Access Key: [••••••••••••••]             │
│ AWS Secret Key: [••••••••••••••]             │
│ Role ARN:      [••••••••••••••]              │
│ Marketplace:   [US ▼]                        │
│                                              │
│ Status: ✅ Connected                         │
│ [Test Connection]  [Save]                    │
└──────────────────────────────────────────────┘
```

### Sync Configuration
| Sync Type | Frequency | Last Run | Status | Next Run | Enabled |
|-----------|-----------|----------|--------|----------|---------|
| PPC Search Term Report | Every 6h | 2h ago | ✅ | 4h | ☑ |
| PPC Campaign Report | Every 6h | 2h ago | ✅ | 4h | ☑ |
| Business Report | Every 12h | 8h ago | ✅ | 4h | ☑ |
| SQP Data | Daily (2am) | 22h ago | ✅ | 2h | ☑ |
| Targeting Report | Every 12h | 8h ago | ✅ | 4h | ☑ |

### Product Management
- Add/edit/deactivate products
- Map child ASINs to parent products
- Set product line (for syntax rule assignment)

### Syntax Rule Editor
- View/edit classification rules per product line
- Test keywords against rules inline
- Trigger bulk reclassification

### Sync Health Dashboard
- Last 24h API call success rate
- Error breakdown by type (rate limit, auth, server error)
- Avg response time

---

# 7. API STRATEGY — FIXING THE 70% ERROR RATE

## 7.1 Why You Have 70% Errors

Most likely causes (in order of probability):
1. **Rate limiting** — hitting Amazon's throttle limits
2. **Token expiration** — not refreshing access tokens properly
3. **Report polling too aggressively** — requesting report status before it's ready
4. **Concurrent requests** — too many parallel calls
5. **Missing error handling** — not distinguishing retryable vs permanent errors

## 7.2 Amazon API Rate Limits (Real Numbers)

### Ads API
- **Reports**: 1 report request per second, max 100 pending reports per profile
- **Entities** (campaigns, ad groups): 10 requests/second burst, sustained 5/second
- **Snapshots**: 1 per second
- Rate limit response: HTTP 429 with `Retry-After` header

### SP-API
- **Reports**: createReport = 60/hour per marketplace
- **Business Reports**: varies by report type
- **Catalog Items**: 10/second burst, 5/second sustained
- Rate limit response: HTTP 429 with `x-amzn-RateLimit-Limit` header

## 7.3 The Fix: Disciplined API Client Architecture

```typescript
// src/api/amazon-api-client.ts

class AmazonAPIClient {
  private rateLimiter: RateLimiter;
  private retryManager: RetryManager;
  private tokenManager: TokenManager;
  private cache: RedisCache;

  constructor(config: APIConfig) {
    // Separate rate limiters per API type
    this.rateLimiter = new RateLimiter({
      adsReports: { maxPerSecond: 1, maxPending: 50 },     // Conservative: 50% of limit
      adsEntities: { maxPerSecond: 3, burstLimit: 5 },      // Conservative: 60% of limit
      spApiReports: { maxPerHour: 30, perMarketplace: true }, // Conservative: 50% of limit
      spApiCatalog: { maxPerSecond: 3, burstLimit: 5 },
    });

    this.retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 2000,        // 2 seconds base
      maxDelay: 60000,        // 60 seconds max
      backoffMultiplier: 2,   // Exponential: 2s → 4s → 8s
      retryableStatuses: [429, 500, 502, 503, 504],
      // NEVER retry: 400 (bad request), 401 (auth), 403 (forbidden), 404
    });

    this.tokenManager = new TokenManager({
      refreshBufferMs: 300000,  // Refresh 5 min before expiry
      maxTokenAge: 3600000,     // Force refresh every hour
    });
  }

  async makeRequest(config: RequestConfig): Promise<APIResponse> {
    // Step 1: Check cache first
    const cacheKey = this.buildCacheKey(config);
    const cached = await this.cache.get(cacheKey);
    if (cached && !config.skipCache) return cached;

    // Step 2: Ensure token is fresh
    const token = await this.tokenManager.getValidToken(config.apiType);

    // Step 3: Wait for rate limit slot
    await this.rateLimiter.acquire(config.apiType);

    // Step 4: Make request with retry
    const response = await this.retryManager.execute(async (attempt) => {
      const startTime = Date.now();

      try {
        const result = await fetch(config.url, {
          method: config.method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Amazon-Advertising-API-ClientId': config.clientId,
            'Amazon-Advertising-API-Scope': config.profileId,
            ...config.headers,
          },
          body: config.body ? JSON.stringify(config.body) : undefined,
        });

        // Log the call
        await this.logApiCall({
          apiType: config.apiType,
          endpoint: config.url,
          method: config.method,
          statusCode: result.status,
          responseTimeMs: Date.now() - startTime,
          retryAttempt: attempt,
        });

        if (result.status === 429) {
          const retryAfter = parseInt(result.headers.get('Retry-After') || '5');
          throw new RateLimitError(retryAfter * 1000);
        }

        if (!result.ok) {
          throw new APIError(result.status, await result.text());
        }

        return await result.json();
      } catch (error) {
        // Log errors
        await this.logApiCall({
          apiType: config.apiType,
          endpoint: config.url,
          method: config.method,
          statusCode: error.statusCode,
          responseTimeMs: Date.now() - startTime,
          retryAttempt: attempt,
          errorType: error.constructor.name,
          errorMessage: error.message,
        });
        throw error;
      }
    });

    // Step 5: Cache successful response
    if (config.cacheTtlSeconds) {
      await this.cache.set(cacheKey, response, config.cacheTtlSeconds);
    }

    return response;
  }
}
```

## 7.4 Report Polling Strategy (Critical for Ads API)

The Ads API reports are **asynchronous**. You request a report → poll for status → download when ready.

```typescript
// src/api/report-poller.ts

class ReportPoller {
  // WRONG: Poll every second (this is what causes 70% errors)
  // RIGHT: Graduated polling with exponential backoff

  async waitForReport(reportId: string): Promise<ReportData> {
    const pollSchedule = [
      // Wait time before each check
      30000,   // 30 seconds — reports rarely ready before this
      30000,   // 1 minute total
      60000,   // 2 minutes total
      60000,   // 3 minutes total
      120000,  // 5 minutes total
      120000,  // 7 minutes total
      300000,  // 12 minutes total
      300000,  // 17 minutes total — most reports done by now
      600000,  // 27 minutes total
      600000,  // 37 minutes total — give up after this
    ];

    for (let i = 0; i < pollSchedule.length; i++) {
      await sleep(pollSchedule[i]);

      const status = await this.checkReportStatus(reportId);

      if (status === 'COMPLETED') {
        return await this.downloadReport(reportId);
      }

      if (status === 'FAILED') {
        throw new ReportFailedError(reportId);
      }

      // 'IN_PROGRESS' → continue polling
    }

    throw new ReportTimeoutError(reportId);
  }
}
```

## 7.5 Sync Schedule Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY SYNC SCHEDULE (UTC)                      │
├──────────┬──────────────────────────────────────────────────────┤
│ 02:00    │ Request PPC Search Term Report (yesterday)            │
│ 02:05    │ Request PPC Campaign Report (yesterday)               │
│ 02:10    │ Request PPC Targeting Report (yesterday)              │
│ 02:30    │ Poll report statuses (batch)                          │
│ 03:00    │ Download completed reports → raw tables               │
│ 03:15    │ Request Business Report (yesterday)                   │
│ 03:30    │ Request SQP Report (yesterday)                        │
│ 04:00    │ Poll + download remaining reports                     │
│ 04:30    │ ETL: Clean raw → transformed tables                   │
│ 05:00    │ ETL: Classify new keywords (syntax engine)            │
│ 05:30    │ ETL: Aggregate daily → weekly metrics                 │
│ 06:00    │ ETL: Calculate variation attribution                  │
│ 06:15    │ ETL: Update account-level aggregates                  │
│ 06:30    │ ✅ All data ready for morning review                  │
├──────────┼──────────────────────────────────────────────────────┤
│ 14:00    │ Mid-day refresh: PPC data only (search term + camp)   │
│ 14:30    │ Poll + download                                       │
│ 15:00    │ ETL: incremental update                               │
└──────────┴──────────────────────────────────────────────────────┘

Weekly (Sunday night):
- Full SQP pull (7-day aggregate)
- Full weekly aggregation job
- Product info refresh (price, reviews, BSR)
```

## 7.6 Caching Strategy

```typescript
const CACHE_TTL = {
  // Frequently accessed, rarely changes
  productInfo: 6 * 3600,         // 6 hours
  campaignStructure: 3600,       // 1 hour
  syntaxRules: 3600,             // 1 hour

  // API responses
  reportStatus: 30,              // 30 seconds
  reportData: 24 * 3600,        // 24 hours (reports are immutable once generated)

  // Aggregated data
  weeklyMetrics: 3600,          // 1 hour (invalidated on new data)
  dailyMetrics: 1800,           // 30 min

  // Dashboard queries
  executiveSummary: 300,         // 5 minutes
  syntaxAnalysis: 600,          // 10 minutes
};
```

## 7.7 Expected Error Rate After Fix

| Before | After | How |
|--------|-------|-----|
| ~70% errors | <2% errors | Rate limiting + backoff |
| Token expiration failures | 0% | Proactive token refresh |
| Report polling spam | Efficient polling | Graduated schedule |
| Redundant API calls | Minimal calls | Caching layer |
| No visibility into issues | Full observability | API call logging |

---

# 8. UI/UX SPECIFICATION

## 8.1 Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│ PMP Systems                          [DECOLURE ▼] [US ▼]    │
├──────┬───────────────────────────────────────────────────────┤
│      │ ┌─ GLOBAL FILTERS ──────────────────────────────────┐ │
│ NAV  │ │ Product: [All ▼] Date: [Last 4 Weeks ▼]          │ │
│      │ │ Root: [All ▼] Syntax: [All ▼]                     │ │
│ Over │ └───────────────────────────────────────────────────┘ │
│ view │                                                       │
│      │ ┌─ CONTENT AREA ───────────────────────────────────┐ │
│ Repo │ │                                                   │ │
│ rting│ │  Metric Cards / Tables / Charts                   │ │
│      │ │                                                   │ │
│ Track│ │  (changes based on active module)                 │ │
│ ing  │ │                                                   │ │
│      │ │                                                   │ │
│ Key  │ │                                                   │ │
│ word │ │                                                   │ │
│      │ │                                                   │ │
│ Root │ │                                                   │ │
│      │ │                                                   │ │
│Syntax│ │                                                   │ │
│      │ │                                                   │ │
│ Var  │ │                                                   │ │
│      │ │                                                   │ │
│ Set  │ │                                                   │ │
│ tings│ │                                                   │ │
│      │ └───────────────────────────────────────────────────┘ │
└──────┴───────────────────────────────────────────────────────┘
```

## 8.2 Design Principles

1. **Monospace numbers** — all metrics use tabular figures for alignment
2. **Right-aligned numbers** — standard for financial data
3. **Conditional coloring** — red/yellow/green based on thresholds, not decoration
4. **Sticky headers** — table headers pin on scroll (67 columns = horizontal scroll)
5. **Column groups** — collapsible column groups (Product Info | Traffic | Sales | PPC | etc.)
6. **Keyboard shortcuts** — `1-7` to switch modules, `F` for filters, `E` for export
7. **No loading spinners on cached data** — show stale data immediately, refresh in background
8. **Compact density** — default to dense tables (operators want data density, not whitespace)

## 8.3 Component Library

Using **shadcn/ui** (Tailwind-based, composable, no bloat):
- `<DataTable>` — TanStack Table wrapper with sorting, filtering, column visibility
- `<MetricCard>` — single metric with trend indicator
- `<TrendChart>` — Recharts wrapper for time-series
- `<FilterBar>` — global filter context
- `<GapIndicator>` — colored bar showing performance vs target

---

# 9. DEPLOYMENT ON RAILWAY

## 9.1 Project Structure

```
pmp-systems/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/           # App Router pages
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── overview/
│   │   │   │   │   ├── reporting/
│   │   │   │   │   ├── tracking/
│   │   │   │   │   ├── keywords/
│   │   │   │   │   ├── roots/
│   │   │   │   │   ├── syntax/
│   │   │   │   │   ├── variations/
│   │   │   │   │   └── settings/
│   │   │   │   ├── api/       # tRPC API routes
│   │   │   │   └── layout.tsx
│   │   │   ├── components/    # UI components
│   │   │   ├── lib/           # Client utilities
│   │   │   └── hooks/         # Custom hooks
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── worker/                 # Background job worker
│       ├── src/
│       │   ├── jobs/
│       │   │   ├── sync-ppc-reports.ts
│       │   │   ├── sync-business-reports.ts
│       │   │   ├── sync-sqp.ts
│       │   │   ├── sync-targeting.ts
│       │   │   ├── etl-clean.ts
│       │   │   ├── etl-classify.ts
│       │   │   ├── etl-aggregate.ts
│       │   │   ├── etl-variation.ts
│       │   │   └── health-check.ts
│       │   ├── scheduler.ts    # Cron-like job scheduler
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── db/                     # Drizzle ORM schema + migrations
│   │   ├── schema/
│   │   │   ├── raw-tables.ts
│   │   │   ├── core-entities.ts
│   │   │   ├── syntax-tables.ts
│   │   │   ├── metrics-tables.ts
│   │   │   ├── aggregation-tables.ts
│   │   │   ├── variation-tables.ts
│   │   │   └── settings-tables.ts
│   │   ├── migrations/
│   │   └── index.ts
│   │
│   ├── engine/                 # Calculation + classification engine
│   │   ├── syntax-classifier.ts
│   │   ├── syntax-aggregator.ts
│   │   ├── root-aggregator.ts
│   │   ├── variation-attributor.ts
│   │   ├── calculations.ts
│   │   └── index.ts
│   │
│   ├── amazon-client/          # Amazon API client
│   │   ├── ads-api.ts
│   │   ├── sp-api.ts
│   │   ├── rate-limiter.ts
│   │   ├── retry-manager.ts
│   │   ├── token-manager.ts
│   │   ├── report-poller.ts
│   │   └── index.ts
│   │
│   └── shared/                 # Shared types + utilities
│       ├── types.ts
│       ├── constants.ts
│       └── utils.ts
│
├── turbo.json                  # Turborepo config
├── package.json                # Root workspace
├── docker-compose.yml          # Local dev (Postgres + Redis)
└── railway.toml                # Railway deployment config
```

## 9.2 Railway Services

```
Railway Project: pmp-systems
├── Service: web (Next.js)
│   ├── Build: npm run build --filter=web
│   ├── Start: npm run start --filter=web
│   ├── Port: 3000
│   ├── Domain: pmp.yourdomain.com
│   └── Resources: 1GB RAM, 1 vCPU
│
├── Service: worker (Background jobs)
│   ├── Build: npm run build --filter=worker
│   ├── Start: npm run start --filter=worker
│   ├── Port: none (no HTTP, internal only)
│   └── Resources: 1GB RAM, 1 vCPU
│
├── Database: PostgreSQL
│   ├── Plugin: Railway Postgres
│   ├── Plan: Pro (for connection pooling)
│   └── Size: Start with 1GB, monitor growth
│
└── Database: Redis
    ├── Plugin: Railway Redis
    └── Size: 256MB (cache + queue)
```

## 9.3 Railway Configuration

```toml
# railway.toml (in apps/web/)
[build]
builder = "nixpacks"
buildCommand = "cd ../.. && npm run build --filter=web"

[deploy]
startCommand = "npm run start"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3

[service]
internalPort = 3000
```

```toml
# railway.toml (in apps/worker/)
[build]
builder = "nixpacks"
buildCommand = "cd ../.. && npm run build --filter=worker"

[deploy]
startCommand = "npm run start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5
# No port — this is a background worker
```

## 9.4 Environment Variables

```env
# Shared
DATABASE_URL=postgresql://user:pass@host:5432/pmp_systems
REDIS_URL=redis://user:pass@host:6379

# Amazon Ads API
AMAZON_ADS_CLIENT_ID=amzn1.application-oa2-client.xxx
AMAZON_ADS_CLIENT_SECRET=xxx
AMAZON_ADS_REFRESH_TOKEN=xxx
AMAZON_ADS_PROFILE_ID=xxx
AMAZON_ADS_REGION=NA  # NA, EU, FE

# Amazon SP-API
SP_API_CLIENT_ID=xxx
SP_API_CLIENT_SECRET=xxx
SP_API_REFRESH_TOKEN=xxx
SP_API_AWS_ACCESS_KEY=xxx
SP_API_AWS_SECRET_KEY=xxx
SP_API_ROLE_ARN=arn:aws:iam::xxx:role/xxx
SP_API_MARKETPLACE_ID=ATVPDKIKX0DER  # US

# Encryption
ENCRYPTION_KEY=xxx  # For encrypting stored credentials

# App
NODE_ENV=production
```

## 9.5 Database Migration Strategy

```bash
# Using Drizzle Kit
npx drizzle-kit generate:pg  # Generate migration SQL
npx drizzle-kit push:pg      # Apply to database

# Railway: Add to build command
# "npm run db:migrate && npm run build"
```

---

# 10. BUILD PLAN — 3 PHASES

## Phase 1: MVP (Weeks 1-6)
**Goal**: Replace the Google Sheets workbook. Get data flowing automatically.

### Week 1-2: Foundation
- [ ] Set up monorepo (Turborepo)
- [ ] Set up Railway: Postgres + Redis + Web service
- [ ] Drizzle ORM: core entity tables + raw tables
- [ ] Amazon API client: token management, rate limiting, retry logic
- [ ] Basic Next.js shell with navigation

### Week 3-4: Data Pipeline
- [ ] Ads API integration: Search Term Report, Campaign Report
- [ ] SP-API integration: Business Report
- [ ] Report polling with graduated backoff
- [ ] ETL: raw → cleaned tables
- [ ] Background worker: scheduled sync (BullMQ)
- [ ] Sync health monitoring

### Week 5-6: Core Modules
- [ ] Executive Control Panel (replaces Dashboard sheet)
- [ ] Keyword Engine (basic table with filters)
- [ ] Product Weekly Metrics (replaces your 67-column sheets)
- [ ] Settings: API credentials, sync config
- [ ] Historical data import (load your 25 weeks of existing data)

**Phase 1 Deliverable**: Working system that automatically pulls PPC + Business Report data, displays it in a usable interface, eliminates the Google Sheets dependency.

---

## Phase 2: Syntax + Analysis (Weeks 7-12)
**Goal**: The strategic advantage. Syntax engine + variation analysis.

### Week 7-8: Syntax Engine
- [ ] Syntax classification rules engine (replace Excel LET formulas)
- [ ] Port all 3 product line rules (Satin DECOLURE, Satin Sleep Sanctuary, Bamboo)
- [ ] Keyword → Syntax → Root mapping pipeline
- [ ] syntax_weekly_metrics aggregation
- [ ] root_weekly_metrics aggregation
- [ ] Syntax rule editor UI (Settings)

### Week 9-10: SQP Integration
- [ ] SQP data ingestion (Amazon API + Jungle Scout import)
- [ ] SQP → Syntax mapping
- [ ] Brand CTR/CVR vs Market CTR/CVR calculations
- [ ] Target CTR (Market × 1.10) and Target CVR (Market × 3.00)
- [ ] Gap analysis calculations
- [ ] Targeting report integration (Top of Search IS)

### Week 11-12: Advanced Modules
- [ ] Syntax Engine UI (full module with gap analysis)
- [ ] Root Engine UI
- [ ] Variation Analysis Engine (purchased product report integration)
- [ ] Variation attribution weekly summary
- [ ] Tracking module (week-over-week scorecard)

**Phase 2 Deliverable**: Full syntax-level analysis operational. Gap identification automated. Variation attribution visible. Operators can make data-driven PPC decisions from the system.

---

## Phase 3: Scaling + Intelligence (Weeks 13-18)
**Goal**: Optimization, speed, and operational intelligence.

### Week 13-14: Performance + UX Polish
- [ ] Virtual scrolling for large tables (TanStack Virtual)
- [ ] Column group toggling (collapse/expand Product Info, Traffic, etc.)
- [ ] Keyboard shortcuts
- [ ] Bulk actions on keywords
- [ ] Export functionality (CSV, copy to clipboard)
- [ ] Saved filter presets

### Week 15-16: External Data Integration
- [ ] Jungle Scout import (parent-level SQP consolidation)
- [ ] DataDive integration (manual upload or API if available)
- [ ] DataRover integration
- [ ] ASIN Insight integration
- [ ] Competitor tracking layer

### Week 17-18: Operational Intelligence
- [ ] Automated alerts (syntax underperformance, high WAS, cross-variation)
- [ ] Weekly auto-generated summary (replaces manual "Summary" column)
- [ ] Historical comparison (any week vs any week)
- [ ] Multi-marketplace support (if needed: US, CA, UK)
- [ ] User access controls (if team expands)

**Phase 3 Deliverable**: Production-grade operating system. External data integrated. Alerts active. Operators spend zero time on data collection and 100% on decision-making.

---

# 11. GAPS & QUESTIONS — WHAT I STILL NEED FROM YOU

## CRITICAL (Blocking Phase 1)

### 1. Amazon API Credentials Status
- Do you already have an **Amazon Ads API** developer account approved?
- Do you already have **SP-API** credentials (LWA client + AWS IAM role)?
- If not: this is a 2-4 week approval process from Amazon. We need to start NOW.

### 2. Marketplace Scope
- Your data shows US marketplace only. Do we need CA, UK, etc. from day 1?
- Or US-only for MVP?

### 3. Historical Data Import
- Can you export your current Google Sheets data as CSV?
- I need the raw data from your external Google Sheets (the IMPORTRANGE sources):
  - `1LCe93Aa4tw...` (Xray, Child BR, Inventory Management)
  - `1OIk1IRNP...` (Risk, Outstanding Shipments)
- This lets us backfill 25 weeks of historical data into the system.

### 4. Railway Account
- Do you have a Railway account? Free tier won't be enough (need Postgres + Redis).
- **Pro plan** ($20/month) recommended. Database alone will cost ~$5-10/month.

## IMPORTANT (Blocking Phase 2)

### 5. SQP Data Access
- Amazon's SQP API (Brand Analytics) — do you have access?
- Or are you exclusively using Jungle Scout for parent-level SQP?
- If Jungle Scout: what export format? CSV? Can we automate the pull?

### 6. Syntax Rules — Complete Terms Lists
- The docx has 3 product lines. You have 13 products. I need syntax rules for:
  - SLEEPHORIA Cooling Sheets
  - SLEEPHORIA Cooling Pillowcase
  - SLEEPHORIA Cooling Comforter
  - SLEEP SANCTUARY Bamboo 6PCS
  - Silk Pillow Case
  - Hanging Closet Organizer
  - Satin Fitted Sheet
- Are these using the same rules as their parent product line? Or separate?

### 7. Competitor Terms — Maintenance
- Your competitor lists have 250+ terms for satin, 60+ for bamboo.
- How often do these change? Weekly? Monthly?
- Do you want a UI to manage these, or is bulk CSV upload sufficient?

### 8. Purchased Product Report Access
- The Variation Analysis module requires the **Ads API Purchased Product Report**.
- Confirm: are you running Sponsored Products campaigns with product targeting?
- This report is only available for SP campaigns. Not SB or SD.

### 9. Profitability Data
- Your sheets have Unit Profit, Profit After CPA, CM3.
- Where does COGS come from? Manual input per product?
- Do FBA fees come from SP-API or manual entry?

## NICE TO HAVE (Phase 3)

### 10. DataDive / DataRover / ASIN Insight
- What data do you extract from each? Specific exports?
- Do any of them have APIs, or all manual CSV export?
- What's the cadence? Daily? Weekly?

### 11. Team Size
- How many operators will use PMP Systems?
- Single user? Or do we need user accounts with different access levels?

### 12. Target TACOS
- Your sheets have a "Target TACOS" column. Is this manually set per product?
- Same question for "Target Daily Sales Velocity" — manual or calculated?

### 13. Inventory Integration
- Your workbook has Downstream + Inventory Management sheets.
- Should PMP Systems include inventory tracking? Or keep that separate?
- If included: this adds significant scope to Phase 3.

---

# APPENDIX: Data Flow Diagram

```
                           AMAZON ECOSYSTEM
                    ┌──────────────────────────┐
                    │  Ads API                  │
                    │  ├─ Search Term Report     │──┐
                    │  ├─ Campaign Report        │  │
                    │  ├─ Targeting Report       │  │
                    │  └─ Purchased Product Rep  │  │
                    │                            │  │
                    │  SP-API                    │  │
                    │  ├─ Business Report        │──┼──→ RAW TABLES
                    │  ├─ Catalog Items          │  │     (JSONB, append-only)
                    │  └─ FBA Inventory          │  │         │
                    │                            │  │         │
                    │  SQP / Brand Analytics     │──┘         │
                    └──────────────────────────┘              │
                                                              ▼
                    ┌──────────────────────────┐      ┌──────────────┐
                    │  EXTERNAL TOOLS           │      │  ETL: CLEAN   │
                    │  ├─ Jungle Scout (SQP)    │──→   │  Parse JSONB  │
                    │  ├─ DataDive              │      │  Validate     │
                    │  ├─ DataRover             │      │  Deduplicate  │
                    │  └─ ASIN Insight          │      └──────┬───────┘
                    └──────────────────────────┘              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │  ETL: CLASSIFY    │
                                                     │  Syntax Engine    │
                                                     │  keyword → syntax │
                                                     │  keyword → root   │
                                                     └──────┬───────────┘
                                                              │
                                                              ▼
                                                     ┌──────────────────┐
                                                     │  ETL: AGGREGATE   │
                                                     │  Daily → Weekly   │
                                                     │  Keyword → Syntax │
                                                     │  Syntax → Root    │
                                                     │  Product → Account│
                                                     │  Variation attrib │
                                                     └──────┬───────────┘
                                                              │
                                                              ▼
                                              ┌───────────────────────────┐
                                              │   AGGREGATION TABLES       │
                                              │   ├─ product_weekly_metrics │
                                              │   ├─ syntax_weekly_metrics  │
                                              │   ├─ root_weekly_metrics    │
                                              │   ├─ account_weekly_metrics │
                                              │   └─ variation_attribution  │
                                              └───────────────┬───────────┘
                                                              │
                                                              ▼
                                              ┌───────────────────────────┐
                                              │   FRONTEND MODULES         │
                                              │   ├─ Executive Control     │
                                              │   ├─ Keyword Engine        │
                                              │   ├─ Root Engine           │
                                              │   ├─ Syntax Engine         │
                                              │   ├─ Variation Analysis    │
                                              │   ├─ Tracking              │
                                              │   └─ Settings              │
                                              └───────────────────────────┘
```

---

**END OF PMP SYSTEMS ARCHITECTURE DOCUMENT**

*This document is the technical foundation. Every table, every calculation, every module is aligned with the actual reporting structure from your existing workbook and the syntax classification logic from your Excel formulas. Nothing is invented. Everything is traceable back to your data.*
