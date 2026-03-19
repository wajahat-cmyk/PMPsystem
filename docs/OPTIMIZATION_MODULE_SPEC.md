# PMP SYSTEMS — OPTIMIZATION MODULE SPECIFICATION
## Based on "Final Bulk" PPC Optimization Sheet Analysis

---

# PART 1 — FILE ANALYSIS

## 1.1 Purpose of the Sheet

This is a **PPC execution planning workbook**. It combines Amazon's standard bulk upload format (columns 1–43) with custom enrichment and decision-support columns (44–120) into a single optimization workspace.

The operator uses this sheet to:
1. See every campaign, keyword, product target, and placement adjustment in one view
2. Understand WHY each entity is performing the way it is (SQP data, rank data, scenario classification)
3. Decide WHAT to change (new bids, new budgets, new placement %)
4. Execute changes by populating Operation/Action columns and uploading back to Amazon

This is NOT a report. This is a **decision + execution workbook** — the operator's war table.

## 1.2 Data Structure

The sheet uses **Amazon's mixed-entity bulk file format**. Four entity types are interleaved, grouped by campaign:

| Entity Type | Row Count | % of Total | Purpose |
|-------------|-----------|-----------|---------|
| Bidding Adjustment | 3,363 | 50.7% | Placement bid modifiers (TOS, ROS, PDP) |
| Keyword | 1,296 | 19.5% | Keyword-level targeting + bids |
| Campaign | 1,121 | 16.9% | Campaign-level settings + budgets |
| Product Targeting | 852 | 12.9% | ASIN/auto-targeting + bids |

**Grouped by campaign hierarchy:**
```
Campaign Row (budget, bidding strategy, state)
  └─ Bidding Adjustment Row × 3 (TOS, ROS, PDP placements)
  └─ Keyword Row × N (each keyword with bid, metrics, syntax)
  └─ Product Targeting Row × N (each ASIN/auto target with bid, metrics)
```

**Products represented:**
- Satin Sheets (2,610 rows)
- Bamboo Sheets (2,103 rows)
- Bamboo Sheets - 6PCS (1,394 rows)
- SLEEP SANCTUARY - Satin 4PCs (525 rows)

## 1.3 Column Groups — Complete Structured Breakdown

### GROUP A: Amazon Bulk Identity Columns (Cols 1–12)

These are Amazon's standard bulk file columns used for entity identification:

| # | Column | Populated | Purpose | Type |
|---|--------|-----------|---------|------|
| 1 | Count | 6,632 | Row counter | Numeric |
| 2 | Product | 6,632 | Always "Sponsored Products" | Category |
| 3 | Entity | 6,632 | Row type: Campaign / Bidding Adjustment / Keyword / Product Targeting | Category |
| 4 | **Operation** | **0 (EMPTY)** | **WRITE column**: Create/Update/Enable/Pause/Archive for bulk upload | Action |
| 5 | Campaign ID | 6,632 | Amazon campaign ID | ID |
| 6 | Ad Group ID | 2,148 | Amazon ad group ID (null for campaign/bidding rows) | ID |
| 7 | Portfolio ID | 1,121 | Amazon portfolio ID (only on campaign rows) | ID |
| 8 | Ad ID | 0 | Not used for SP | — |
| 9 | Keyword ID | 1,296 | Only on keyword rows | ID |
| 10 | Product Targeting ID | 852 | Only on product targeting rows | ID |
| 11 | Campaign Name | 1,121 | Editable campaign name (only on campaign rows) | String |
| 12 | Ad Group Name | 0 | Not used in this sheet | — |

### GROUP B: Informational / Context Columns (Cols 13–22)

Read-only context columns — Amazon marks these as "(Informational only)":

| # | Column | Populated | Purpose |
|---|--------|-----------|---------|
| 13 | Campaign Name (Informational only) | 6,632 | Campaign name on ALL rows (for reference) |
| 14 | Campaign Objective | 5,256 | Custom tag: ASIN Targeting, Defensive, Discovery, Profitable Conversion, Ranking |
| 15 | Ad Group Name (Informational only) | 2,148 | Ad group context |
| 16 | Portfolio Name (Informational only) | 6,632 | Portfolio: Satin Sheets, Bamboo Sheets, etc. |
| 17 | Start Date | 1,121 | Campaign start date |
| 18 | End Date | 0 | Not used |
| 19 | Targeting Type | 1,121 | Auto / Manual (campaign-level) |
| 20 | State | 3,269 | Current state: enabled |
| 21 | Campaign State (Informational only) | 6,632 | Always enabled |
| 22 | Ad Group State (Informational only) | 2,148 | enabled / paused |

### GROUP C: Budget & Bidding Columns (Cols 23–37)

| # | Column | Populated | Purpose | Type |
|---|--------|-----------|---------|------|
| 23 | Daily Budget | 1,121 | Current campaign daily budget | Source |
| 24 | **New Budget** | **0 (EMPTY)** | **WRITE**: New budget to set | Action |
| 29 | Ad Group Default Bid | 0 | Not used | — |
| 30 | Ad Group Default Bid (Info) | 2,148 | Current ad group default bid | Source |
| 33 | Match Type | 1,296 | Exact / Phrase / Broad | Source |
| 34 | Bidding Strategy | 4,484 | Dynamic down / Dynamic up+down / Fixed bid | Source |
| 35 | Placement | 3,363 | Placement Top / Rest Of Search / Product Page | Source |
| 36 | Percentage | 3,363 | Current placement bid adjustment % | Source |
| 37 | **New Percentage** | **0 (EMPTY)** | **WRITE**: New placement % to set | Action |
| 58 | Bid | 2,068 | Current keyword/target bid | Source |
| 59 | **New Bids** | **1,743** | **WRITE**: New bid value OR "No Rev/Click" flag | Action |

**Critical finding on New Bids:**
- 165 rows have actual numeric bid values (operator decided on a new bid)
- 1,578 rows have "No Rev/Click" — meaning the operator flagged these as having no revenue per click data, so no bid recommendation can be made
- This tells us the system needs a `Rev/Click` metric to calculate suggested bids

### GROUP D: Targeting Expression Columns (Cols 38–47)

| # | Column | Populated | Purpose |
|---|--------|-----------|---------|
| 38 | Product Targeting Expression | 852 | asin="B08..." or close-match/loose-match/substitutes/complements |
| 39 | Resolved Product Targeting Expression (Info) | 852 | Same, resolved format |
| 44 | Advertised ASIN | 2,148 | The ASIN being advertised |
| 45 | Advertised SKU | 2,148 | The SKU being advertised |
| 46 | Keyword Text | 1,296 | The actual keyword |
| 47 | Customer Search Term | 512 | Search term that triggered the ad |

### GROUP E: Syntax & Classification (Col 48)

| # | Column | Populated | Purpose |
|---|--------|-----------|---------|
| 48 | Syntax | 1,296 | Syntax classification of keyword |

**26 unique syntax values present:**
- Material|Size: Bamboo|Queen, Bamboo|King, Bamboo|Full, Bamboo|Twin, Bamboo|California King, Satin|Queen, Satin|King, Satin|Full, Satin|Twin, Silk|Queen, Silk|King, Silk|Full, Silk|Twin, Cooling|Queen, Cooling|King, Cooling|Full, Cooling|Twin, Cooling|California King
- Material only: Bamboo, Cooling, Satin, Silk
- Category: Branded Keyword, Competitor Branded Keyword, Generic, Irrelevant

**This confirms perfect alignment with the Syntax Engine we already designed.**

### GROUP F: Search Volume & Rank Data (Cols 49–57)

External enrichment data — NOT from Amazon APIs directly:

| # | Column | Populated | Source | Purpose |
|---|--------|-----------|--------|---------|
| 49 | Targeted KW SV | 324 | DataDive/DataRover | Search volume of targeted keyword |
| 50 | Customer Search Term SV | 287 | DataDive/DataRover | Search volume of actual search term |
| 51 | Targeted KW Relevancy | 265 | DataDive/DataRover | Relevancy score |
| 52 | Customer Search Term Relevancy | 238 | DataDive/DataRover | Relevancy score |
| 53 | Targeted KW Organic Rank | 277 | DataDive/ASIN Insight | Current organic rank position |
| 54 | Customer Search Term Organic Rank | 241 | DataDive/ASIN Insight | Organic rank for search term |
| 55 | Targeted KW Sponsored Rank | 69 | DataDive/ASIN Insight | Current sponsored rank position |
| 56 | Customer Search Term Sponsored Rank | 73 | DataDive/ASIN Insight | Sponsored rank for search term |
| 57 | Target Rank | 324 | Manual/Calculated | Target rank position to achieve |

**Low fill rates (4-5% for sponsored rank)** — this data is expensive to get and not always available.

### GROUP G: Impression Share & Search Data (Cols 60–62)

| # | Column | Populated | Source |
|---|--------|-----------|--------|
| 60 | Search Term Impression Share | 348 | Amazon Ads API / Targeting Report |
| 61 | Search Term Impression Rank | 348 | Amazon Ads API / Targeting Report |
| 62 | Top-of-search Impression Share | 210 | Amazon Ads API / Targeting Report |

### GROUP H: Core PPC Metrics — Current Period (Cols 63–73)

These are the primary performance metrics (ALL 6,632 rows populated):

| # | Column | Purpose |
|---|--------|---------|
| 63 | Impressions | Total impressions |
| 64 | Clicks | Total clicks |
| 65 | Click-through Rate | CTR = clicks / impressions |
| 66 | Spend | Total ad spend |
| 67 | Sales | Total attributed sales |
| 68 | Orders | Total orders |
| 69 | Units | Total units sold |
| 70 | Conversion Rate | CVR = orders / clicks |
| 71 | ACOS | Ad cost of sales = spend / sales |
| 72 | CPC | Cost per click = spend / clicks |
| 73 | ROAS | Return on ad spend = sales / spend |

### GROUP I: Campaign Time in Budget (Col 74)

| # | Column | Populated | Notes |
|---|--------|-----------|-------|
| 74 | Avg. time in budget | 1,121 | Mixed: float values + strings like "Not enough data" |

### GROUP J: Last Week Metrics — Period Comparison (Cols 75–84)

Mirror of Group H but for last week specifically:

| # | Column |
|---|--------|
| 75 | LW Impressions |
| 76 | LW Clicks |
| 77 | LW CTR |
| 78 | LW CVR |
| 79 | LW CPC |
| 80 | LW Spend |
| 81 | LW Sales |
| 82 | LW Units |
| 83 | LW Orders |
| 84 | LW ACOS |

**All 6,632 rows populated** — allows WoW comparison at every entity level.

### GROUP K: SQP / Brand Analytics Data (Cols 85–99)

Only populated for ~268 rows (keywords with SQP data available):

| # | Column | Purpose |
|---|--------|---------|
| 85 | Traffic Distribution (Organic) | Organic traffic % |
| 86 | Traffic Distribution (Ad) | Ad traffic % |
| 87 | Market Click Through Rate | Market-wide CTR |
| 88 | Market Conversion Rate | Market-wide CVR |
| 89 | Brand Click Through Rate | YOUR brand's CTR |
| 90 | Brand Conversion Rate | YOUR brand's CVR |
| 91 | Market Impressions | Total market impressions |
| 92 | Brand Impressions | Your impressions |
| 93 | Market Clicks | Total market clicks |
| 94 | Brand Clicks | Your clicks |
| 95 | Market Purchases | Total market purchases |
| 96 | Brand Purchases | Your purchases |
| 97 | Impression Share | Your share of impressions |
| 98 | Click Share | Your share of clicks |
| 99 | Purchase Share | Your share of purchases |

### GROUP L: Target & Velocity Metrics (Cols 100–104)

| # | Column | Populated | Purpose |
|---|--------|-----------|---------|
| 100 | Target PPC CTR | 201 | Target CTR to beat (derived from Market CTR × multiplier) |
| 101 | Target PPC CVR | 382 | Target CVR to beat (derived from Market CVR × multiplier) |
| 102 | Daily Sales Velocity | 1,296 | Current daily sales velocity for this keyword |
| 103 | DSTR | 271 | Day Supply Through Rate (inventory context) |
| 104 | LW4 Sale | 355 | Last 4 weeks sales |

### GROUP M: Efficiency & Distribution Metrics (Cols 105–116)

| # | Column | Populated | Purpose |
|---|--------|-----------|---------|
| 105 | Spend w/ sales | 1,296 | Spend on keywords that generated sales |
| 106 | Spend w/o sales | 1,296 | Spend on keywords with zero sales (waste) |
| 107 | Rev/Click | 408 | Revenue per click = sales / clicks |
| 108 | CPA | 230 | Cost per acquisition = spend / orders |
| 109 | Real ACOS | 230 | ACOS using all spend (including wasted) |
| 110 | Wasted ads spend % | 408 | WAS% = spend_without_sales / total_spend |
| 111 | SV % | 304 | Search volume share % within syntax group |
| 112 | Sales % | 1,296 | This entity's sales as % of campaign total |
| 113 | Spend % | 1,296 | This entity's spend as % of campaign total |
| 114 | Clicks % | 1,296 | This entity's clicks as % of campaign total |
| 115 | Required Clicks | 185 | Clicks needed for statistical significance |
| 116 | Required Budget | 185 | Budget needed based on required clicks × CPC |

### GROUP N: Scenario Classification (Cols 117–118)

**THE MOST IMPORTANT DECISION-SUPPORT COLUMNS.**

| # | Column | Populated | Purpose |
|---|--------|-----------|---------|
| 117 | Scenario | 1,296 | Multi-factor classification of keyword/target state |
| 118 | Placement Scenario | 4,069 | Multi-factor classification of placement performance |

**Scenario column structure** (keyword/target level):

Two pattern types observed:

**Type 1 — Non-SQP Scenario:**
```
Clicks <15, ACOS <25%, WAS% 51-75%, Sales % 2.4%, Spend % 1.8%, Clicks % 2.1%, CPA $7.07, Real ACOS 23.19%
```

**Type 2 — SQP-Enriched Scenario:**
```
SQP STR, Clicks <15, Rank > Target, CVR = 0, IS% <12, ACOS = 0, TOS% <12, WAS% >75%+, SQP CTR > Market CTR
```

These encode:
- Click volume bucket: <15, 15-50, 50+
- ACOS range: <25%, 25-50%, 50-75%, >75%, = 0
- WAS% range: <25%, 25-50%, 51-75%, >75%
- Rank vs Target: Above/Below/= Target
- Impression Share range
- TOS% range
- SQP CTR vs Market CTR comparison
- CVR vs Target CVR comparison
- Sales/Spend/Clicks distribution %

**Placement Scenario column structure:**
```
PPC TOS 4%, ROS 63%, PDP 33%
SP% TOS 12%, ROS 41%, PDP 47%
CL% TOS 46%, ROS 15%, PDP 39%
SL% TOS 73%, ROS 18%, PDP 9%
ACOS TOS <25%, ROS 25-50%, PDP >75%
```

This breaks down placement distribution across:
- PPC traffic distribution by placement
- Spend % by placement
- Clicks % by placement
- Sales % by placement
- ACOS bucket by placement

### GROUP O: Action / Execution Columns (Cols 119–120)

| # | Column | Populated | Purpose |
|---|--------|-----------|---------|
| 119 | Action | **0 (EMPTY)** | Operator's decision: what to do with this entity |
| 120 | (no header) | **0 (EMPTY)** | Unused |

## 1.4 Column Classification Summary

### Source Data Columns (from Amazon APIs / external tools):
Cols 5-10 (IDs), 13-22 (entity info), 23 (budget), 30 (default bid), 33-36 (match/bidding/placement), 38-39 (targeting expr), 44-47 (ASIN/SKU/keyword/search term), 49-57 (SV/rank data), 58 (bid), 60-62 (impression share), 63-69 (core PPC metrics), 74 (time in budget), 75-84 (LW metrics), 85-99 (SQP data)

### Calculated Metrics (derived within the system):
Cols 65 (CTR), 70 (CVR), 71 (ACOS), 72 (CPC), 73 (ROAS), 77-78 (LW CTR/CVR), 79 (LW CPC), 84 (LW ACOS), 97-99 (shares), 100-101 (target CTR/CVR), 102 (DSV), 105-116 (efficiency metrics), 117-118 (scenario strings)

### Decision / Action Columns (operator writes):
Cols 4 (Operation), 24 (New Budget), 37 (New Percentage), 59 (New Bids), 119 (Action)

### Required for Bulk Upload to Amazon:
Cols 2-11 (entity identification), 4 (Operation), 11 (Campaign Name), 24 (New Budget), 33 (Match Type), 37 (New Percentage), 59 (New Bids)

### Analysis-Only Columns (not uploaded):
Cols 48-57, 60-118 — all enrichment, metrics, scenarios, and distribution columns

---

# PART 2 — WEB APPLICATION MODULE DESIGN

## 2.1 Layout Design

### Page Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│ PMP Systems  ›  Optimization                                         │
├──────────────────────────────────────────────────────────────────────┤
│ ┌─ FILTER BAR ─────────────────────────────────────────────────────┐ │
│ │ Portfolio: [All ▼]  Campaign Obj: [All ▼]  Match: [All ▼]       │ │
│ │ Syntax: [All ▼]  Entity: [All ▼]  Date: [Last 30d ▼]           │ │
│ │ [Show: Keywords only ▼]  [Hide Empty ☑]  [Underperformers ☐]   │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ SUMMARY CARDS ──────────────────────────────────────────────────┐ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │ │
│ │ │Total     │ │ Total    │ │ Avg      │ │ WAS %    │ │Pending │ │ │
│ │ │Spend     │ │ Sales    │ │ ACOS     │ │          │ │Actions │ │ │
│ │ │$12,450   │ │ $28,900  │ │ 43.1%    │ │ 31.2%    │ │ 47     │ │ │
│ │ │▲ 8% LW  │ │ ▲ 12% LW│ │ ▼ 5% LW │ │ ▼ 3% LW │ │        │ │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │ │
│ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │ │
│ │ │ Keywords │ │ Targets  │ │ Campaigns│ │ Avg CTR  │ │ Avg    │ │ │
│ │ │ w/ Bids  │ │ w/ Bids  │ │ Total    │ │          │ │ CVR    │ │ │
│ │ │ 165      │ │ 0        │ │ 1,121    │ │ 0.42%    │ │ 6.8%   │ │ │
│ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘ │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ VIEW TABS ──────────────────────────────────────────────────────┐ │
│ │ [Campaign Tree] [Keywords] [Product Targets] [Placements] [Bulk] │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ MAIN TABLE ─────────────────────────────────────────────────────┐ │
│ │ (Full-width, virtualized, grouped, with frozen columns)          │ │
│ │                                                                   │ │
│ │ Column groups:                                                    │ │
│ │ [Entity ▾] [Targeting ▾] [Bids ▾] [PPC Metrics ▾] [LW ▾]      │ │
│ │ [SQP ▾] [Rank ▾] [Efficiency ▾] [Scenario ▾] [Actions ▾]      │ │
│ │                                                                   │ │
│ │ ... table rows ...                                                │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ ┌─ DETAIL PANEL (slides in from right on row click) ───────────────┐ │
│ │ Keyword: "bamboo sheets queen"                                    │ │
│ │ ┌─ Placement Breakdown ─┐ ┌─ Trend (8 weeks) ─┐ ┌─ SQP ──────┐ │ │
│ │ │ TOS: ACOS 18%, 46% cl │ │ [line chart]       │ │ Brand CTR  │ │ │
│ │ │ ROS: ACOS 44%, 15% cl │ │                    │ │ Mkt CTR    │ │ │
│ │ │ PDP: ACOS 107%, 39% cl│ │                    │ │ IS%: 8.2%  │ │ │
│ │ └───────────────────────┘ └────────────────────┘ └────────────┘ │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Top Filters

| Filter | Options | Default |
|--------|---------|---------|
| Portfolio | All, Satin Sheets, Bamboo Sheets, Bamboo 6PCS, Sleep Sanctuary Satin | All |
| Campaign Objective | All, Ranking, Profitable Conversion, Discovery, Defensive, ASIN Targeting | All |
| Match Type | All, Exact, Phrase, Broad | All |
| Syntax | All, + all 26 syntax values | All |
| Entity Type | All, Campaign, Keyword, Product Targeting, Bidding Adjustment | All |
| Date Range | Last 7d, Last 14d, Last 30d, Last 60d, Custom | Last 30d |
| Quick Filters | Show Underperformers Only, Hide Irrelevant Syntax, Has SQP Data Only, Pending Actions Only | Off |

### Summary Cards

Row 1 — Performance:
- Total Spend (+ LW delta)
- Total Sales (+ LW delta)
- Avg ACOS (+ LW delta)
- WAS % (+ LW delta)
- Pending Actions count

Row 2 — Coverage:
- Keywords with New Bids (count)
- Targets with New Bids (count)
- Total Campaigns
- Avg CTR (filtered set)
- Avg CVR (filtered set)

## 2.2 Table Behavior

### Sorting
- Click any column header to sort ASC/DESC
- Multi-sort: hold Shift + click for secondary sort (e.g., sort by Syntax, then by ACOS within each syntax)
- Default sort: Entity type (Campaign first, then Bidding Adjustments, then Keywords, then Product Targets) — mirrors the bulk file grouping

### Filtering
- Column-level filters (click filter icon in header)
- Numeric columns: range filter (min/max)
- Text columns: search/contains
- Category columns: checkbox multi-select
- Scenario column: parse and filter by sub-components (e.g., "ACOS <25%", "WAS% >75%")

### Column Pinning / Freeze
**Frozen left (always visible):**
- Entity type icon
- Campaign Name (truncated)
- Keyword Text / Product Targeting Expression
- Syntax
- Current Bid
- New Bid (editable)

**Frozen right (always visible):**
- Scenario (with hover tooltip for full text)
- Action (editable dropdown)

### Column Groups (Collapsible)
| Group | Columns | Default |
|-------|---------|---------|
| Entity Info | Campaign, Ad Group, Portfolio, Objective, Targeting Type, State | Expanded |
| Targeting | Match Type, Keyword, Search Term, ASIN, SKU, Product Target | Expanded |
| Bids & Budget | Bid, New Bid, Budget, New Budget, Placement %, New %, Bidding Strategy | Expanded |
| PPC Metrics (Current) | Impressions, Clicks, CTR, CPC, Spend, Sales, Orders, Units, CVR, ACOS, ROAS | Expanded |
| PPC Metrics (Last Week) | LW Impressions through LW ACOS | Collapsed |
| Rank & Search Volume | Targeted KW SV, CST SV, Organic Rank, Sponsored Rank, Target Rank, Relevancy | Collapsed |
| Impression Share | Search Term IS, IS Rank, TOS IS | Collapsed |
| SQP / Brand Analytics | Market CTR/CVR, Brand CTR/CVR, Market/Brand Impr/Clicks/Purchases, IS/CS/PS | Collapsed |
| Targets | Target PPC CTR, Target PPC CVR, DSV, DSTR, LW4 Sale | Collapsed |
| Efficiency | Spend w/Sales, Spend w/o Sales, Rev/Click, CPA, Real ACOS, WAS%, Required Clicks, Required Budget | Collapsed |
| Distribution | SV%, Sales%, Spend%, Clicks% | Collapsed |
| Scenario | Scenario, Placement Scenario | Expanded |
| Actions | New Bid, New Budget, New Placement %, Operation, Action | Expanded |

### Search
- Global search: searches across Campaign Name, Keyword Text, Product Targeting Expression, Syntax
- Search highlights matching text in the table

### Pagination / Virtual Scrolling
- **Virtual scrolling** (NOT pagination) — 6,632 rows with TanStack Virtual
- Row height: 36px (dense mode)
- Visible rows: ~25-30 at a time
- Scroll performance target: 60fps

### Row Styling
- Campaign rows: **bold, light blue background** (visual separator)
- Bidding Adjustment rows: **light gray background, indented**
- Keyword rows: **white background, normal**
- Product Targeting rows: **white background, italic for auto-targets**
- Rows with pending actions: **left border indicator (orange)**
- Rows with "No Rev/Click": **muted text color**

## 2.3 Grouping Views

The Optimization module should support **5 view modes** via tabs:

### View 1: Campaign Tree (DEFAULT)
Mirrors the bulk file structure:
```
▸ SATIN-QUEEN-GREY SP AUTO CL 04112024 ZB          $155.00  $253.00  61.3%
    ├─ Placement Top           30%    $16.49   $119.10  13.9%
    ├─ Placement Rest of Search  0%    $57.74   $130.50  44.3%
    ├─ Placement Product Page    5%   $101.98    $94.85 107.5%
    ├─ KW: close-match         $0.76   $21.21    $91.45  23.2%
    └─ KW: loose-match         $0.70  $155.00   $253.00  61.3%
```
Expandable/collapsible tree. Campaign rows are parents. Children are bidding adjustments + keywords + targets.

### View 2: Keywords Only
Flat table, only Keyword entity rows (1,296 rows). All enrichment columns visible. Best for keyword-level bid optimization.

### View 3: Product Targets Only
Flat table, only Product Targeting rows (852 rows). Shows ASIN targeting + auto-targeting (close-match, loose-match, substitutes, complements).

### View 4: Placements Only
Flat table, only Bidding Adjustment rows (3,363 rows). Shows placement-level performance (TOS, ROS, PDP) with current % and new %.

### View 5: Bulk Review
Shows ONLY rows where operator has entered changes (New Bid, New Budget, New Percentage, or Action). This is the "review before export" view.

**Additional grouping toggles (within any view):**
- Group by Syntax
- Group by Root
- Group by Portfolio
- Group by Campaign Objective

## 2.4 Drilldowns

### Click a Keyword Row → Detail Panel (Right Slide-Out, 40% width)

**Section 1: Entity Info**
- Keyword text, Match Type, Campaign, Ad Group, Portfolio
- Syntax classification, Root
- Current Bid, Current State

**Section 2: Placement Breakdown**
Pulls from the Bidding Adjustment rows for the same campaign:
```
┌─ Placement Performance ──────────────────────────┐
│            │ TOS      │ ROS      │ PDP           │
│ Adjustment │ 30%      │ 0%       │ 5%            │
│ Impressions│ 425      │ 10,100   │ 177,728       │
│ Clicks     │ 19       │ 84       │ 144           │
│ Spend      │ $16.49   │ $57.74   │ $101.98       │
│ Sales      │ $119.10  │ $130.50  │ $94.85        │
│ ACOS       │ 13.9%    │ 44.3%    │ 107.5%        │
│ Spend %    │ 9.4%     │ 32.8%    │ 57.8%         │
│ Sales %    │ 34.6%    │ 37.9%    │ 27.5%         │
└──────────────────────────────────────────────────┘
```

**Section 3: SQP Data** (if available)
- Brand CTR vs Market CTR vs Target CTR (bar comparison)
- Brand CVR vs Market CVR vs Target CVR (bar comparison)
- Impression Share, Click Share, Purchase Share
- Traffic Distribution: Organic vs Ad

**Section 4: Rank Data** (if available)
- Organic Rank (current vs target)
- Sponsored Rank
- Search Volume
- Relevancy Score

**Section 5: Historical Trend** (from stored data)
- 8-week line chart: Spend, Sales, ACOS
- 8-week line chart: CTR, CVR
- 8-week line chart: Impression Share

**Section 6: Scenario Breakdown**
Parse the Scenario string into visual components:
```
┌─ Scenario Analysis ─────────────────────────────┐
│ Click Volume:    <15      (Low data)       🟡    │
│ ACOS:            <25%     (Profitable)     🟢    │
│ WAS%:            51-75%   (High waste)     🔴    │
│ Rank vs Target:  Above    (Needs work)     🟡    │
│ CVR vs Target:   Below    (Listing issue?) 🔴    │
│ IS%:             <12%     (Low visibility)  🟡    │
│ SQP CTR:         > Market (Good main img)  🟢    │
└──────────────────────────────────────────────────┘
```

**Section 7: Related Variation Data**
If this keyword has variation_attribution data:
- Targeted ASIN → Purchased ASIN breakdown
- Cross-variation %

**Section 8: Action Panel**
- Set New Bid (input field with suggested value based on Rev/Click)
- Set Action (dropdown: Increase Bid, Decrease Bid, Pause, Monitor, Negate)
- Add Note

### Click a Campaign Row → Campaign Detail Panel

Shows:
- All keywords + targets under this campaign (mini table)
- Placement breakdown (TOS/ROS/PDP split)
- Budget utilization (Avg time in budget)
- Campaign-level ACOS trend
- Total spend distribution across keywords

---

# PART 3 — COLUMN & METRIC MAPPING

## A) Entity Info

| Metric | Final Bulk Column | PMP Systems Field | Notes |
|--------|------------------|-------------------|-------|
| Campaign ID | Campaign ID | campaign_id | Amazon ID |
| Campaign Name | Campaign Name (Informational only) | campaign_name | Display name |
| Campaign Objective | Campaign Objective | campaign_objective | Custom tag: Ranking, Discovery, etc. |
| Ad Group ID | Ad Group ID | ad_group_id | Amazon ID |
| Ad Group Name | Ad Group Name (Informational only) | ad_group_name | |
| Portfolio Name | Portfolio Name (Informational only) | portfolio_name | Maps to products |
| Entity Type | Entity | entity_type | Campaign / Keyword / Product Targeting / Bidding Adjustment |
| Targeting Type | Targeting Type | targeting_type | Auto / Manual |
| State | State | state | enabled / paused / archived |
| Campaign State | Campaign State (Informational only) | campaign_state | |
| Ad Group State | Ad Group State (Informational only) | ad_group_state | |
| Match Type | Match Type | match_type | Exact / Phrase / Broad |
| Keyword Text | Keyword Text | keyword_text | |
| Customer Search Term | Customer Search Term | search_term | The actual query |
| Product Targeting Expression | Product Targeting Expression | targeting_expression | asin="..." or auto type |
| Advertised ASIN | Advertised ASIN | advertised_asin | |
| Advertised SKU | Advertised SKU | advertised_sku | |
| Placement | Placement | placement | Top / Rest Of Search / Product Page |
| Bidding Strategy | Bidding Strategy | bidding_strategy | Dynamic down / Dynamic up+down / Fixed |
| Syntax | Syntax | syntax_label | From syntax classification engine |
| Start Date | Start Date | start_date | Campaign start |

## B) Raw PPC Metrics

| Metric | Final Bulk Column | Period | Fill Rate |
|--------|------------------|--------|-----------|
| Impressions | Impressions | Current | 100% |
| Clicks | Clicks | Current | 100% |
| CTR | Click-through Rate | Current | 100% (calculated) |
| CPC | CPC | Current | 100% (calculated) |
| Spend | Spend | Current | 100% |
| Sales | Sales | Current | 100% |
| Orders | Orders | Current | 100% |
| Units | Units | Current | 100% |
| CVR | Conversion Rate | Current | 100% (calculated) |
| ACOS | ACOS | Current | 100% (calculated) |
| ROAS | ROAS | Current | 100% (calculated) |
| LW Impressions | LW Impressions | Last Week | 100% |
| LW Clicks | LW Clicks | Last Week | 100% |
| LW CTR | LW CTR | Last Week | 100% |
| LW CVR | LW CVR | Last Week | 100% |
| LW CPC | LW CPC | Last Week | 100% |
| LW Spend | LW Spend | Last Week | 100% |
| LW Sales | LW Sales | Last Week | 100% |
| LW Units | LW Units | Last Week | 100% |
| LW Orders | LW Orders | Last Week | 100% |
| LW ACOS | LW ACOS | Last Week | 100% |

## C) External / Advanced Metrics

### Rank & Search Volume

| Metric | Final Bulk Column | Fill Rate | Source |
|--------|------------------|-----------|--------|
| Targeted KW Search Volume | Targeted KW SV | 4.9% | DataDive / DataRover |
| Search Term Search Volume | Customer Search Term SV | 4.3% | DataDive / DataRover |
| Targeted KW Relevancy | Targeted KW Relevancy | 4.0% | DataDive / DataRover |
| Search Term Relevancy | Customer Search Term Relevancy | 3.6% | DataDive / DataRover |
| Targeted KW Organic Rank | Targeted KW Organic Rank | 4.2% | DataDive / ASIN Insight |
| Search Term Organic Rank | Customer Search Term Organic Rank | 3.6% | DataDive / ASIN Insight |
| Targeted KW Sponsored Rank | Targeted KW Sponsored Rank | 1.0% | DataDive / ASIN Insight |
| Search Term Sponsored Rank | Customer Search Term Sponsored Rank | 1.1% | DataDive / ASIN Insight |
| Target Rank | Target Rank | 4.9% | Manual / calculated |

### Impression Share

| Metric | Final Bulk Column | Fill Rate | Source |
|--------|------------------|-----------|--------|
| Search Term Impression Share | Search Term Impression Share | 5.2% | Amazon Ads API |
| Search Term Impression Rank | Search Term Impression Rank | 5.2% | Amazon Ads API |
| Top-of-search Impression Share | Top-of-search Impression Share | 3.2% | Amazon Ads API |

### SQP / Brand Analytics

| Metric | Final Bulk Column | Fill Rate | Source |
|--------|------------------|-----------|--------|
| Traffic Dist (Organic) | Traffic Distribution(Organic) | 3.7% | SQP / Jungle Scout |
| Traffic Dist (Ad) | Traffic Distribution(Ad) | 3.7% | SQP / Jungle Scout |
| Market CTR | Market Click Through Rate | 4.0% | SQP |
| Market CVR | Market Conversion Rate | 4.0% | SQP |
| Brand CTR | Brand Click Through Rate | 4.0% | SQP |
| Brand CVR | Brand Conversion Rate | 4.0% | SQP |
| Market Impressions | Market Impressions | 4.0% | SQP |
| Brand Impressions | Brand Impressions | 4.0% | SQP |
| Market Clicks | Market Clicks | 4.0% | SQP |
| Brand Clicks | Brand Clicks | 4.0% | SQP |
| Market Purchases | Market Purchases | 4.0% | SQP |
| Brand Purchases | Brand Purchases | 4.0% | SQP |
| Impression Share (SQP) | Impression Share | 4.0% | SQP |
| Click Share | Click Share | 4.0% | SQP |
| Purchase Share | Purchase Share | 4.0% | SQP |

### Targets & Velocity

| Metric | Final Bulk Column | Fill Rate | Source |
|--------|------------------|-----------|--------|
| Target PPC CTR | Target PPC CTR | 3.0% | Calculated: Market CTR × 1.10 |
| Target PPC CVR | Target PPC CVR | 5.8% | Calculated: Market CVR × 3.00 |
| Daily Sales Velocity | Daily Sales Velocity | 19.5% | Calculated from Business Report |
| DSTR | DSTR | 4.1% | Calculated: inventory / DSV |
| LW4 Sale | LW4 Sale | 5.4% | Calculated from historical data |

### Budget

| Metric | Final Bulk Column | Fill Rate | Source |
|--------|------------------|-----------|--------|
| Daily Budget | Daily Budget | 16.9% | Amazon Ads API |
| Avg Time in Budget | Avg. time in budget | 16.9% | Amazon Ads API |

## D) Optimization Action Fields

| Metric | Final Bulk Column | Fill Rate | Purpose |
|--------|------------------|-----------|---------|
| **Operation** | Operation | **0% (EMPTY)** | Bulk upload operation: Update, Create, etc. |
| **New Bid** | New Bids | 26.3% | New bid amount or "No Rev/Click" flag |
| **New Budget** | New Budget | **0% (EMPTY)** | New daily budget |
| **New Placement %** | New Percentage | **0% (EMPTY)** | New placement bid adjustment % |
| **Action** | Action | **0% (EMPTY)** | Operator decision (not yet used in this file) |
| **Scenario** | Scenario | 19.5% | Multi-factor state classification |
| **Placement Scenario** | Placement Scenario | 61.4% | Placement-level state classification |

## E) Efficiency & Distribution (Calculated)

| Metric | Final Bulk Column | Fill Rate | Formula |
|--------|------------------|-----------|---------|
| Spend w/ Sales | Spend w/ sales | 19.5% | SUM spend WHERE sales > 0 |
| Spend w/o Sales | Spend w/o sales | 19.5% | SUM spend WHERE sales = 0 |
| Rev/Click | Rev/Click | 6.2% | sales / clicks |
| CPA | CPA | 3.5% | spend / orders |
| Real ACOS | Real ACOS | 3.5% | spend / sales (including waste) |
| WAS % | Wasted ads spend % | 6.2% | spend_without_sales / total_spend |
| SV % | SV % | 4.6% | keyword_sv / total_syntax_sv |
| Sales % | Sales % | 19.5% | keyword_sales / campaign_total_sales |
| Spend % | Spend % | 19.5% | keyword_spend / campaign_total_spend |
| Clicks % | Clicks % | 19.5% | keyword_clicks / campaign_total_clicks |
| Required Clicks | Required Clicks | 2.8% | Statistical significance calc |
| Required Budget | Required Budget | 2.8% | required_clicks × CPC |

---

# PART 4 — DATA SOURCE STRATEGY

## 4.1 Source Mapping by Metric Group

### GROUP 1: Entity Structure + Bids + Budget
**Source: Amazon Ads API (Sponsored Products endpoints)**

| Data | API Endpoint | Difficulty | Method |
|------|-------------|-----------|--------|
| Campaign list + state + budget + bidding strategy | `GET /sp/campaigns` | Easy | Scheduled pull, every 6h |
| Ad Group list + state + default bid | `GET /sp/adGroups` | Easy | Scheduled pull, every 6h |
| Keywords + bid + match type + state | `GET /sp/keywords` | Easy | Scheduled pull, every 6h |
| Product Targets + bid + expression | `GET /sp/targets` | Easy | Scheduled pull, every 6h |
| Campaign Negative Keywords | `GET /sp/negativeKeywords` | Easy | Scheduled pull, daily |
| Portfolios | `GET /portfolios` | Easy | Scheduled pull, daily |

**Rate limit:** 10 req/sec burst. We call these entity endpoints infrequently (every 6h). No risk.

**Ingestion method:** Direct API → `raw_sp_entity_data` (JSONB) → `campaigns`, `ad_groups`, `keywords`, `product_targets` clean tables.

### GROUP 2: Core PPC Metrics (Impressions, Clicks, Spend, Sales, etc.)
**Source: Amazon Ads API (Reporting V3)**

| Report | Data Returned | Difficulty | Method |
|--------|--------------|-----------|--------|
| SP Campaigns Report | Campaign-level: impressions, clicks, spend, sales, orders | Medium | Request report → poll → download. Daily at 2am UTC |
| SP Targeting Report | Keyword/target-level: impressions, clicks, spend, sales, orders, ACOS | Medium | Same workflow |
| SP Search Term Report | Search term level: all PPC metrics + search term text | Medium | Same. This is the MOST critical report |
| SP Placement Report | Placement-level: TOS/ROS/PDP performance breakdown | Medium | Same |
| SP Purchased Product Report | Targeted ASIN → Purchased ASIN attribution | Medium | Same. For variation analysis |

**Rate limit:** 1 report request/second, max 100 pending. With our graduated polling strategy, this is safe.

**Ingestion method:** Report request → poll (30s, 30s, 60s, 60s, 120s...) → download GZIP → decompress → `raw_sp_campaign_report` (JSONB) → ETL to `keyword_daily_metrics`.

**Current period vs Last Week:** We store daily data. Current period and LW metrics are calculated at query time using date ranges.

### GROUP 3: Impression Share + TOS IS
**Source: Amazon Ads API (Targeting Report with search term impression share metrics)**

| Metric | Available From | Notes |
|--------|---------------|-------|
| Search Term Impression Share | SP Search Term Report (metric: `searchTermImpressionShare`) | Only available for keywords with sufficient data |
| Search Term Impression Rank | SP Search Term Report (metric: `searchTermImpressionRank`) | Same |
| Top-of-search IS | SP Targeting Report (metric: `topOfSearchImpressionShare`) | Campaign/keyword level |

**Difficulty:** Medium. These metrics have low fill rates by nature (Amazon only reports when data is sufficient). The 5% fill rate in your sheet is normal.

### GROUP 4: Placement Data (TOS %, ROS %, PDP %)
**Source: Amazon Ads API (Campaign Bidding Adjustments API + Placement Report)**

| Data | Source | Method |
|------|--------|--------|
| Current Placement % adjustments | `GET /sp/campaigns/{id}/bidding` | Direct API call |
| Placement performance (impressions, clicks, spend, sales by placement) | SP Placement Report | Reporting API |
| Placement Scenario string | **Calculated in our system** | Built from placement report data |

### GROUP 5: Search Volume + Relevancy + Rank
**Source: External tools (NOT available from Amazon APIs)**

| Metric | Primary Source | Backup Source | Ingestion |
|--------|---------------|---------------|-----------|
| Search Volume | DataDive | DataRover | CSV upload or API (if available) |
| Keyword Relevancy | DataDive | DataRover | CSV upload |
| Organic Rank | DataDive / ASIN Insight | DataRover | CSV upload |
| Sponsored Rank | DataDive / ASIN Insight | DataRover | CSV upload |
| Target Rank | **Manual entry** or calculated | — | UI input per keyword |

**Difficulty: HIGH.** These tools don't have public APIs (or have limited ones). Realistic options:
1. **CSV bulk upload** (most reliable) — operator exports from DataDive/DataRover, uploads to PMP
2. **Scheduled scraping** (fragile, not recommended)
3. **DataDive API** (if they offer one for your plan)

**Recommendation:** Build a clean CSV upload pipeline with column mapping. Operator uploads weekly. System matches on keyword text + ASIN.

### GROUP 6: SQP / Brand Analytics
**Source: Amazon SQP API (Brand Analytics) + Jungle Scout**

| Metric | Source | Availability |
|--------|--------|-------------|
| Market CTR/CVR | SQP API or Jungle Scout | Weekly, per search query |
| Brand CTR/CVR | SQP API or Jungle Scout | Weekly, per search query |
| Market/Brand Impressions/Clicks/Purchases | SQP API or Jungle Scout | Weekly |
| Impression Share / Click Share / Purchase Share | SQP API | Calculated from raw SQP |
| Traffic Distribution (Organic/Ad) | SQP API | Weekly |

**Difficulty:** Medium-High.
- Amazon SQP API gives child-ASIN level data. You need parent-level → Jungle Scout fills this gap.
- Match SQP search queries to your PPC keywords for enrichment.
- Only ~4% of keywords in your sheet have SQP data. This is normal — SQP only returns data for queries where your brand appeared.

**Ingestion:** SQP API daily pull → `raw_sqp_data` → match to keywords via text matching → populate SQP columns in optimization view.

### GROUP 7: Targets & Velocity
**Source: Calculated internally**

| Metric | Formula | Inputs |
|--------|---------|--------|
| Target PPC CTR | Market CTR × 1.10 | SQP Market CTR |
| Target PPC CVR | Market CVR × 3.00 | SQP Market CVR |
| Daily Sales Velocity | units_ordered / 7 | Business Report |
| DSTR | inventory_days / DSV | Inventory data + DSV |
| LW4 Sale | SUM(sales) for last 28 days | Historical keyword_daily_metrics |

### GROUP 8: Efficiency Metrics
**Source: Calculated internally from PPC data**

| Metric | Formula | Source Data |
|--------|---------|------------|
| Spend w/ Sales | SUM(spend) WHERE orders > 0 | keyword_daily_metrics |
| Spend w/o Sales | SUM(spend) WHERE orders = 0 | keyword_daily_metrics |
| Rev/Click | total_sales / total_clicks | keyword_daily_metrics |
| CPA | total_spend / total_orders | keyword_daily_metrics |
| Real ACOS | total_spend / total_sales (all) | keyword_daily_metrics |
| WAS % | spend_without_sales / total_spend | Derived |
| Sales % | keyword_sales / campaign_sales | Aggregation |
| Spend % | keyword_spend / campaign_spend | Aggregation |
| Clicks % | keyword_clicks / campaign_clicks | Aggregation |
| Required Clicks | 1 / target_CVR (for 1 order at confidence) | Target CVR |
| Required Budget | required_clicks × avg_CPC | Derived |

### GROUP 9: Scenario Classification
**Source: Calculated internally — rule engine**

The Scenario string is a **multi-factor classification** built from all the above data. This is the most complex calculation in the system.

```typescript
// Scenario Builder Logic
function buildScenario(keyword: KeywordOptData): string {
  const parts: string[] = [];

  // Has SQP data?
  if (keyword.hasSqpData) parts.push('SQP STR');

  // Click volume bucket
  if (keyword.clicks < 15) parts.push('Clicks <15');
  else if (keyword.clicks < 50) parts.push('Clicks 15-50');
  else parts.push('Clicks 50+');

  // Rank vs Target
  if (keyword.organicRank && keyword.targetRank) {
    if (keyword.organicRank > keyword.targetRank) parts.push('Rank > Target');
    else if (keyword.organicRank <= keyword.targetRank) parts.push('Rank <= Target');
  }

  // CVR status
  if (keyword.cvr === 0) parts.push('CVR = 0');
  else if (keyword.targetCvr && keyword.cvr < keyword.targetCvr) parts.push('CVR < Target');
  else if (keyword.targetCvr && keyword.cvr >= keyword.targetCvr) parts.push('CVR >= Target');

  // Impression Share bucket
  if (keyword.impressionShare < 0.12) parts.push('IS% <12');
  else if (keyword.impressionShare < 0.25) parts.push('IS% 12-25');
  else parts.push('IS% 25+');

  // ACOS bucket
  if (keyword.acos === 0) parts.push('ACOS = 0');
  else if (keyword.acos < 0.25) parts.push('ACOS <25%');
  else if (keyword.acos < 0.50) parts.push('ACOS 25-50%');
  else if (keyword.acos < 0.75) parts.push('ACOS 50-75%');
  else parts.push('ACOS >75%');

  // TOS Impression Share
  if (keyword.tosIS < 0.12) parts.push('TOS% <12');
  else if (keyword.tosIS < 0.25) parts.push('TOS% 12-25');
  else parts.push('TOS% 25+');

  // WAS bucket
  if (keyword.wasPct < 0.25) parts.push('WAS% <25%');
  else if (keyword.wasPct < 0.50) parts.push('WAS% 25-50%');
  else if (keyword.wasPct < 0.75) parts.push('WAS% 51-75%');
  else parts.push('WAS% >75%+');

  // SQP CTR comparison
  if (keyword.hasSqpData) {
    if (keyword.brandCtr > keyword.marketCtr) parts.push('SQP CTR > Market CTR');
    else parts.push('SQP CTR < Market CTR');
  }

  // Distribution %
  if (keyword.salesPct) parts.push(`Sales % ${(keyword.salesPct * 100).toFixed(1)}%`);
  if (keyword.spendPct) parts.push(`Spend % ${(keyword.spendPct * 100).toFixed(1)}%`);
  if (keyword.clicksPct) parts.push(`Clicks % ${(keyword.clicksPct * 100).toFixed(1)}%`);

  // CPA + Real ACOS
  if (keyword.cpa) parts.push(`CPA $${keyword.cpa.toFixed(2)}`);
  if (keyword.realAcos) parts.push(`Real ACOS ${(keyword.realAcos * 100).toFixed(2)}%`);

  return parts.join(', ');
}
```

**Placement Scenario** is similar but built from placement-level data:
```typescript
function buildPlacementScenario(campaign: CampaignPlacementData): string {
  const { tos, ros, pdp } = campaign;
  const totalSpend = tos.spend + ros.spend + pdp.spend;
  const totalClicks = tos.clicks + ros.clicks + pdp.clicks;
  const totalSales = tos.sales + ros.sales + pdp.sales;

  const lines = [
    `PPC TOS ${pct(tos.impressions, totalImpressions)}, ROS ${pct(ros.impressions, totalImpressions)}, PDP ${pct(pdp.impressions, totalImpressions)}`,
    `SP% TOS ${pct(tos.spend, totalSpend)}, ROS ${pct(ros.spend, totalSpend)}, PDP ${pct(pdp.spend, totalSpend)}`,
    `CL% TOS ${pct(tos.clicks, totalClicks)}, ROS ${pct(ros.clicks, totalClicks)}, PDP ${pct(pdp.clicks, totalClicks)}`,
    `SL% TOS ${pct(tos.sales, totalSales)}, ROS ${pct(ros.sales, totalSales)}, PDP ${pct(pdp.sales, totalSales)}`,
    `ACOS TOS ${acosBucket(tos.acos)}, ROS ${acosBucket(ros.acos)}, PDP ${acosBucket(pdp.acos)}`,
  ];

  return lines.join('\n');
}
```

## 4.2 Complete Source Matrix

| # | Metric Group | Primary Source | Difficulty | Ingestion | Frequency | Risk |
|---|-------------|---------------|-----------|-----------|-----------|------|
| 1 | Entity structure | Ads API entities | Low | API → DB | Every 6h | Low |
| 2 | Core PPC metrics | Ads API Reporting V3 | Medium | Report → Poll → Download → ETL | Daily | Rate limiting |
| 3 | Last Week metrics | Stored historical data | Low | Query with date offset | Derived | None |
| 4 | Placement performance | Ads API Placement Report | Medium | Report → ETL | Daily | Low |
| 5 | Placement adjustments | Ads API bidding endpoints | Low | API → DB | Every 6h | Low |
| 6 | Impression Share / TOS IS | Ads API Search Term Report | Medium | Report → ETL | Daily | Low fill rate (normal) |
| 7 | Search Volume | DataDive / DataRover | **High** | CSV upload | Weekly | Manual dependency |
| 8 | Keyword Relevancy | DataDive / DataRover | **High** | CSV upload | Weekly | Manual dependency |
| 9 | Organic / Sponsored Rank | DataDive / ASIN Insight | **High** | CSV upload | Weekly | Manual dependency |
| 10 | Target Rank | Manual / calculated | Low | UI input | Ad hoc | Operator overhead |
| 11 | SQP data (all) | SQP API + Jungle Scout | Medium-High | API + CSV import | Weekly | Parent-level gap |
| 12 | Target CTR / CVR | Calculated | Low | Internal calc | On SQP update | Depends on SQP |
| 13 | DSV / DSTR | Business Report + Inventory | Low | API + internal calc | Daily | None |
| 14 | LW4 Sale | Historical data | Low | Query aggregation | On demand | None |
| 15 | Efficiency metrics | Calculated | Low | Internal calc | On data update | None |
| 16 | Distribution % | Calculated | Low | Internal calc | On data update | None |
| 17 | Scenario strings | Rule engine | Medium | Internal calc | On data update | Rule maintenance |
| 18 | Placement Scenario | Rule engine | Medium | Internal calc | On data update | Rule maintenance |

---

# PART 5 — BUILD RECOMMENDATION

## 5.1 Phase Breakdown

### PHASE 1 (MVP) — Weeks 7-9 (after core PMP is live)
**"Read-only optimization table + all data that comes from Amazon APIs"**

What gets built:
- [ ] Optimization section in navigation (new module)
- [ ] Campaign Tree view (default) — grouped entity display
- [ ] Keywords view (flat table, keyword rows only)
- [ ] Product Targets view
- [ ] Placements view
- [ ] ALL Entity Info columns (Group A + B)
- [ ] ALL Core PPC Metrics columns (Group H) — current period
- [ ] ALL Last Week Metrics columns (Group J) — from stored history
- [ ] Budget & Bidding columns (Group C)
- [ ] Impression Share columns (Group G) — from Amazon API
- [ ] All calculated efficiency metrics (Group E) — WAS%, Rev/Click, CPA, Real ACOS, distribution %
- [ ] Column grouping with collapse/expand
- [ ] Frozen columns (entity + bid + new bid + scenario + action)
- [ ] Virtual scrolling for 6,600+ rows
- [ ] Summary cards at top
- [ ] Global filters (Portfolio, Campaign Objective, Match Type, Entity Type, Date Range)
- [ ] Sorting and column-level filtering
- [ ] CSV export of current view
- [ ] Scenario classification engine (rule-based string builder)
- [ ] Placement Scenario classification engine
- [ ] Syntax column — using existing Syntax Engine from earlier modules

**NOT in Phase 1:**
- No editable fields (New Bid, New Budget, New %)
- No action workflows
- No SQP data
- No rank data
- No external data import
- No drilldown panel

**Why this scope:** Operators can immediately see every keyword/target/placement with its scenario classification and decide what to optimize. They still make changes in the Amazon console or download CSV, but the ANALYSIS is now in PMP.

---

### PHASE 2 — Weeks 10-13
**"Editable optimization + SQP enrichment + external data import"**

What gets built:
- [ ] **Editable New Bid field** — inline edit in table
  - Auto-suggest bid based on Rev/Click formula
  - "No Rev/Click" flag when insufficient data
  - Validation: bid within campaign's bidding strategy limits
- [ ] **Editable New Budget field** — inline edit
- [ ] **Editable New Placement %** — inline edit
- [ ] **Action dropdown** — Increase Bid, Decrease Bid, Pause, Monitor, Negate, Custom
- [ ] **Bulk Review view** — shows only rows with pending changes
- [ ] **Drilldown panel** (right slide-out):
  - Placement breakdown
  - Historical trend (8 weeks)
  - Scenario breakdown (visual)
  - Related variation data
- [ ] **SQP data integration** — all Group K metrics
  - Brand CTR/CVR vs Market CTR/CVR
  - Target CTR/CVR
  - Share metrics
  - Traffic distribution
- [ ] **External data CSV import pipeline**:
  - Upload UI in Settings
  - Column mapping interface
  - Match keywords by text + ASIN
  - Support: DataDive, DataRover, ASIN Insight formats
- [ ] **Search Volume + Rank columns** populated from imports
- [ ] **Required Clicks + Required Budget** calculations
- [ ] **Group by Syntax / Root** toggles within views
- [ ] **Saved filter presets** (e.g., "High WAS Exact Keywords", "Ranking Campaign Optimization")

---

### PHASE 3 — Weeks 14-17
**"Bulk execution + automation + approval workflows"**

What gets built:
- [ ] **Bulk export to Amazon format**
  - Generate Amazon-compatible bulk upload file
  - Only include rows with pending changes
  - Auto-populate Operation column (Update)
  - Download as XLSX in exact Amazon format
- [ ] **Direct API execution** (alternative to bulk file)
  - Apply bid changes directly via Ads API
  - Apply budget changes via Ads API
  - Apply placement adjustment changes via Ads API
  - Confirm before execution
  - Rollback capability (store previous values)
- [ ] **Approval workflow**:
  - Operator enters changes → marked as "Pending Review"
  - Reviewer sees all pending changes → Approve / Reject / Modify
  - Approved changes → queued for execution
  - Execution log with before/after values
- [ ] **Bid suggestion engine** (automated):
  - Based on Rev/Click, target ACOS, target CVR
  - Factor in organic rank + target rank
  - Factor in impression share goals
  - Suggest optimal bid per keyword
  - Operators can accept/modify/reject
- [ ] **Automated alerts**:
  - Keywords spending >$X/day with 0 sales
  - ACOS spike >X% WoW
  - Impression share drop >X% WoW
  - Placement ACOS imbalance (TOS great, PDP terrible)
  - Keywords below target rank
- [ ] **Optimization history log**:
  - Every change tracked with timestamp, user, before/after values
  - Performance comparison: 7-day lookback after each change
  - "Did this change improve performance?" indicator
- [ ] **Bulk operations**:
  - Select multiple keywords → bulk bid adjustment (% or flat)
  - Select multiple keywords → bulk pause/enable
  - Select campaigns → bulk budget adjustment
  - Select placements → bulk placement % adjustment

## 5.2 User Roles

| Role | Can View | Can Edit | Can Execute | Can Approve |
|------|----------|----------|------------|-------------|
| **Operator** | All data | New Bid, New Budget, New %, Action | No | No |
| **Senior Optimizer** | All data | All editable fields | Submit for execution | No |
| **Manager** | All data | All editable fields | Execute directly | Yes |
| **Admin** | All data + Settings | All + rules + config | All | All |

For MVP (Phase 1-2): single role, no restrictions. Roles become relevant in Phase 3 when execution is possible.

## 5.3 Action Restrictions

| Action | Restriction | Reason |
|--------|------------|--------|
| Bid change > 100% increase | Warning + confirmation | Prevent cost spikes |
| Budget change > 50% increase | Warning + confirmation | Budget protection |
| Placement % > 200% | Warning + confirmation | Amazon limit awareness |
| Bulk pause > 10 keywords | Manager approval | Revenue protection |
| Direct API execution | 5-second confirmation countdown | Irreversible action safety |
| Bid set to $0 | Blocked | Invalid bid |
| Budget set to < $1 | Blocked | Amazon minimum |

## 5.4 Module Connections

### Optimization → Existing Modules

| Connection | How |
|-----------|-----|
| **Optimization → Syntax Engine** | Keywords in optimization table show syntax_label. Click syntax → opens Syntax Engine filtered to that syntax. Syntax gap analysis informs bid decisions. |
| **Optimization → Root Engine** | Group by Root in optimization table. Root-level ACOS/spend aggregation helps identify which root clusters need attention. |
| **Optimization → Keyword Engine** | Click keyword in optimization table → opens Keyword Engine drilldown with full historical data, all match types for that keyword across campaigns. |
| **Optimization → Variation Analysis** | Drilldown panel shows variation attribution. If a keyword drives cross-variation sales, this informs whether to keep spending. |
| **Optimization → Tracking** | After executing changes, tracking module shows WoW impact. Link optimization history to tracking data for cause-effect analysis. |
| **Optimization → Executive Control** | Optimization changes ripple up. Executive view shows portfolio-level impact of bid/budget changes over time. |
| **Optimization ← Settings** | Syntax rules, COGS, Target ACOS, Target TACOS, competitor terms — all configured in Settings, consumed in Optimization scenario logic. |

### Data Flow Into Optimization

```
Amazon Ads API ──→ keyword_daily_metrics ──→┐
                                             │
SP-API ──→ product_daily_metrics ──→         │
                                             ├──→ OPTIMIZATION TABLE
SQP API / Jungle Scout ──→ sqp_metrics ──→   │    (120 columns,
                                             │     enriched view)
DataDive/DataRover CSV ──→ external_data ──→ │
                                             │
Syntax Engine ──→ keyword_syntax_map ──→     │
                                             │
Calculation Engine ──→ scenarios ──→─────────┘
```

---

## APPENDIX: New Database Tables for Optimization Module

```sql
-- Optimization state: tracks pending changes per entity
CREATE TABLE optimization_changes (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    entity_type VARCHAR(30) NOT NULL,  -- 'keyword', 'product_target', 'campaign', 'bidding_adjustment'
    entity_id VARCHAR(50) NOT NULL,    -- Amazon entity ID
    campaign_id VARCHAR(50) NOT NULL,
    marketplace_id VARCHAR(20) NOT NULL,

    -- Current values (snapshot at time of change)
    current_bid DECIMAL(8,4),
    current_budget DECIMAL(10,2),
    current_placement_pct DECIMAL(8,4),

    -- Proposed changes
    new_bid DECIMAL(8,4),
    new_budget DECIMAL(10,2),
    new_placement_pct DECIMAL(8,4),
    operation VARCHAR(20),  -- 'Update', 'Pause', 'Enable', 'Archive'

    -- Decision context
    action_type VARCHAR(50),  -- 'increase_bid', 'decrease_bid', 'pause', 'monitor', 'negate'
    scenario_at_change TEXT,  -- Scenario string at time of decision
    notes TEXT,

    -- Workflow
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'approved', 'rejected', 'executed', 'rolled_back'
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    execution_result JSONB,  -- API response or bulk upload confirmation

    -- Performance tracking
    pre_change_7d_acos DECIMAL(8,6),
    pre_change_7d_spend DECIMAL(10,2),
    pre_change_7d_sales DECIMAL(10,2),
    post_change_7d_acos DECIMAL(8,6),
    post_change_7d_spend DECIMAL(10,2),
    post_change_7d_sales DECIMAL(10,2),
    performance_delta JSONB  -- Calculated 7 days after execution
);

-- External data uploads (DataDive, DataRover, ASIN Insight)
CREATE TABLE external_data_uploads (
    id SERIAL PRIMARY KEY,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_by VARCHAR(100),
    source VARCHAR(50) NOT NULL,     -- 'datadive', 'datarover', 'asin_insight'
    file_name VARCHAR(500),
    row_count INT,
    matched_count INT,               -- How many rows matched to existing keywords
    unmatched_count INT,
    status VARCHAR(20) DEFAULT 'processing',  -- 'processing', 'completed', 'failed'
    column_mapping JSONB             -- How uploaded columns map to our fields
);

-- External keyword enrichment (populated from uploads)
CREATE TABLE keyword_external_data (
    id BIGSERIAL PRIMARY KEY,
    keyword_text TEXT NOT NULL,
    product_id INT REFERENCES products(id),
    marketplace_id VARCHAR(20) NOT NULL,
    upload_id INT REFERENCES external_data_uploads(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Search Volume & Relevancy
    search_volume INT,
    relevancy_score DECIMAL(8,4),

    -- Rank Data
    organic_rank INT,
    sponsored_rank INT,
    target_rank INT,

    -- Source metadata
    source VARCHAR(50) NOT NULL,
    data_date DATE,

    UNIQUE(keyword_text, product_id, marketplace_id, source)
);

CREATE INDEX idx_kw_ext_keyword ON keyword_external_data(keyword_text, product_id);
CREATE INDEX idx_opt_changes_status ON optimization_changes(status);
CREATE INDEX idx_opt_changes_campaign ON optimization_changes(campaign_id);
```

---

**END OF OPTIMIZATION MODULE SPECIFICATION**
