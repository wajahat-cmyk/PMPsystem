# PMP SYSTEMS — GATE LOGIC & DIAGNOSTIC ACTION MAPPING
## PART 3: Gate Logic Implementation | PART 4: Diagnostic-to-Action Mapping

Reference documents:
- PMP_SYSTEMS_ARCHITECTURE.md (data model, calculation engine)
- OPTIMIZATION_MODULE_SPEC.md (120-column optimization workbook)
- EXTENDED_MODULES_SPEC.md (inventory module)

---

# PART 3 — GATE LOGIC IMPLEMENTATION

Gates are hard checkpoints that run BEFORE any optimization action is generated. A gate failure overrides all diagnostic recommendations. Gates are evaluated per-product, per-week, at the start of every optimization cycle.

---

## 3.1 Profitability Gate

### Purpose
Prevent scaling campaigns that are spending beyond the point of profitability. If current ACOS exceeds the break-even threshold, the product cannot absorb more ad spend without losing money on every sale.

### Formula

```
BE_ACOS = (Price - COGS - Amazon_Fees) / Price
```

Where:
- `Price` = current selling price (from `product_daily_metrics.price` via SP-API Catalog Items or Pricing API; use 7-day average to smooth coupon/deal fluctuations)
- `COGS` = cost of goods sold (from `product_settings.cogs`, manual input by operator in Settings module)
- `Amazon_Fees` = FBA fulfillment fee + referral fee (from `product_daily_metrics.fba_fees` via SP-API FBA Fee Estimate, or manual input as fallback)

### Data Sources

| Component | Primary Source | Fallback | Update Frequency |
|-----------|---------------|----------|-----------------|
| Price | SP-API Catalog Items API (`buyBoxPrice`) | `product_daily_metrics.price` | Daily |
| COGS | `product_settings.cogs` (manual input) | None -- required field | On change |
| Amazon Fees | SP-API GetMyFeesEstimate | `product_settings.fba_fee_override` (manual) | Weekly or on price change |

### Comparison Metric

```
current_acos = product 7-day rolling ACOS from keyword_daily_metrics
             = SUM(spend_7d) / SUM(sales_7d) across all campaigns for this product
```

Use 7-day rolling to avoid daily noise. For newly launched products with <7 days of data, use available days but flag as LOW_CONFIDENCE.

### Gate States

| State | Condition | Meaning |
|-------|-----------|---------|
| **PASS** | `current_acos_7d < (BE_ACOS - 0.05)` | Profitable with margin. All actions allowed. |
| **WARN** | `current_acos_7d >= (BE_ACOS - 0.05) AND current_acos_7d <= BE_ACOS` | Within 5 percentage points of break-even. Maintenance only. |
| **FAIL** | `current_acos_7d > BE_ACOS` | Unprofitable. Block all scaling. |

### Allowed Actions by State

**PASS:**
- All actions permitted: bid increases, budget scaling, placement boosts, match type expansion, new keyword launches

**WARN:**
- ALLOWED: bid adjustments (up or down), placement optimization, negative mining, budget reallocation (not increase), pause low performers
- BLOCKED: budget increases >10%, aggressive TOS boosting, new match type expansion, new keyword launches

**FAIL:**
- ALLOWED: bid reduction, placement optimization (shift spend to more efficient placements), negative mining, pause underperformers, status change to paused
- BLOCKED: any bid increase, any budget increase, TOS modifier increases, new keyword launches, match type expansion

### Edge Cases

1. **No COGS entered**: Gate returns `UNKNOWN`. System blocks all scaling and displays alert: "COGS required for profitability analysis. Enter in Settings > Product Financials."
2. **Price = $0 or missing**: Gate returns `ERROR`. Block all actions. Flag to operator.
3. **No sales data (new product)**: Use `target_acos` from product_settings as proxy. If no target set, default gate to WARN.
4. **Deal/coupon active**: Use effective deal price (discounted price) for BE_ACOS calculation. This makes the gate tighter during promotions, which is correct behavior.

### Implementation (pseudocode)

```typescript
function evaluateProfitabilityGate(productId: string, period: '7d'): GateResult {
  const price = getAvgPrice(productId, period);     // SP-API or product_daily_metrics
  const cogs = getProductSetting(productId, 'cogs'); // product_settings table
  const fees = getFbaFees(productId);                // SP-API or manual override

  if (!cogs) return { state: 'UNKNOWN', reason: 'COGS not configured' };
  if (!price || price <= 0) return { state: 'ERROR', reason: 'Price missing or zero' };

  const beAcos = (price - cogs - fees) / price;
  const currentAcos = getProductAcos(productId, period);

  if (currentAcos === null) return { state: 'WARN', reason: 'Insufficient sales data', confidence: 'LOW' };

  if (currentAcos > beAcos) {
    return { state: 'FAIL', beAcos, currentAcos, gap: currentAcos - beAcos };
  } else if (currentAcos >= beAcos - 0.05) {
    return { state: 'WARN', beAcos, currentAcos, gap: currentAcos - beAcos };
  } else {
    return { state: 'PASS', beAcos, currentAcos, headroom: beAcos - currentAcos };
  }
}
```

---

## 3.2 Inventory Gate

### Purpose
Prevent scaling ad spend when inventory cannot support increased demand. Stockouts destroy organic rank, waste ad spend on out-of-stock clicks, and trigger Amazon's suppression algorithms.

### Critical Rule: Hero SKU Check
The gate checks the **hero SKU** (highest-volume variation) individually, not just the product average. A product can have 60 days of average DOS but if the Queen/White variation (which drives 70% of sales) has 10 days, scaling will cause a stockout on the primary revenue driver.

### Data Sources

| Metric | Source | Table | Update Frequency |
|--------|--------|-------|-----------------|
| Current inventory (units) | SP-API FBA Inventory (`inventoryDetails.fulfillableQuantity`) | `sku_inventory_current` | Daily |
| Daily sales velocity (DSV) | `units_ordered / period_days` from Business Report | `product_daily_metrics` | Daily |
| Hero SKU identification | Highest `units_ordered` variation over last 30 days | `variation_daily_metrics` | Weekly recalculation |
| Inbound shipments | SP-API Inbound Shipments | `sku_inventory_inbound` | Daily |
| OOS status | `fulfillableQuantity = 0` | `sku_inventory_current` | Daily |

### Days of Supply Calculation

```
DOS = fulfillable_quantity / daily_sales_velocity_14d
```

Where:
- `fulfillable_quantity` = current FBA fulfillable units (excludes reserved, inbound, unfulfillable)
- `daily_sales_velocity_14d` = total units sold in last 14 days / 14

Use 14-day velocity (not 7-day) to smooth weekly fluctuations. Exception: if product is in Launch stage (<60 days live), use 7-day velocity since 14-day would include pre-launch zeros.

### Hero SKU Identification

```sql
SELECT variation_id, child_asin, sku,
       SUM(units_ordered) as units_30d
FROM variation_daily_metrics
WHERE product_id = :product_id
  AND date >= CURRENT_DATE - 30
GROUP BY variation_id, child_asin, sku
ORDER BY units_30d DESC
LIMIT 1;
```

The hero SKU is recalculated weekly. If the hero SKU changes, log the transition but use the NEW hero for gate evaluation.

### Gate States

| State | Condition | Meaning |
|-------|-----------|---------|
| **PASS** | Hero DOS > 30 AND overall product DOS > 60 | Sufficient runway. All actions allowed. |
| **WARN** | (Hero DOS 14-30) OR (overall DOS 30-60) | Limited runway. Optimization OK, no ranking pushes. |
| **FAIL** | (Hero DOS < 14) OR (overall DOS < 30) OR (any targeted SKU is OOS) | Critical. Maintenance only or reduce. |

### Additional OOS Check

For every variation that is actively targeted in PPC campaigns (i.e., has `targeted_asin` in `keyword_daily_metrics` within last 7 days):
- If `fulfillable_quantity = 0` for that variation, gate = FAIL regardless of other DOS values
- This prevents spending on ads that land on out-of-stock child ASINs

### Allowed Actions by State

**PASS:**
- All actions permitted: budget scaling, bid increases, ranking pushes, TOS boosting, new keyword launches

**WARN:**
- ALLOWED: bid adjustments, placement optimization, negative mining, budget reallocation, efficiency improvements
- BLOCKED: budget increases >20%, aggressive ranking pushes, new broad/phrase match launches, TOS modifier increases >30%
- ADDITIONAL: system generates "Inventory Alert" flag on all action recommendations

**FAIL:**
- ALLOWED: bid reductions, pause low performers, negative mining
- BLOCKED: any bid increase, any budget increase, any TOS modifier increase, any new launches
- ADDITIONAL: if any targeted SKU is OOS, REDUCE spend immediately (cut bids 30%, reduce budgets 30%)
- ADDITIONAL: system generates "INVENTORY CRITICAL" alert with restock urgency calculation

### Inbound Shipment Consideration

If `sku_inventory_inbound` shows a shipment with status `RECEIVING` or `IN_TRANSIT` with ETA within DOS runway:
- Append note to gate result: "Inbound shipment of X units expected by [date]. Adjusted DOS with inbound: Y days."
- Gate state does NOT change -- the operator can manually override with this context. Inbound is not guaranteed until checked in.

### Implementation (pseudocode)

```typescript
function evaluateInventoryGate(productId: string): GateResult {
  const heroSku = getHeroSku(productId);              // highest volume variation, 30d
  const heroDos = calculateDOS(heroSku.variationId);   // fulfillable / DSV_14d
  const overallDos = calculateProductDOS(productId);    // sum(fulfillable) / sum(DSV_14d)
  const oosVariations = getOOSTargetedVariations(productId); // targeted + qty=0

  if (oosVariations.length > 0) {
    return {
      state: 'FAIL',
      reason: `OOS on targeted variation(s): ${oosVariations.map(v => v.sku).join(', ')}`,
      action: 'REDUCE_IMMEDIATELY',
      heroDos, overallDos
    };
  }

  if (heroDos < 14 || overallDos < 30) {
    return {
      state: 'FAIL',
      reason: heroDos < 14
        ? `Hero SKU ${heroSku.sku} at ${heroDos} days supply`
        : `Overall product DOS at ${overallDos} days`,
      action: 'MAINTENANCE_ONLY',
      heroDos, overallDos
    };
  }

  if (heroDos <= 30 || overallDos <= 60) {
    const inbound = getInboundShipments(heroSku.variationId);
    return {
      state: 'WARN',
      reason: `Hero DOS: ${heroDos}d, Overall DOS: ${overallDos}d`,
      inboundContext: inbound,
      heroDos, overallDos
    };
  }

  return { state: 'PASS', heroDos, overallDos };
}
```

---

## 3.3 Combined Gate Matrix

The combined gate is the intersection of Profitability and Inventory gates. The MORE RESTRICTIVE gate wins for each dimension.

### 3x3 Matrix

| | **Inventory PASS** | **Inventory WARN** | **Inventory FAIL** |
|---|---|---|---|
| **Profitability PASS** | **FULL GREEN** | **OPTIMIZE ONLY** | **HOLD / REDUCE** |
| **Profitability WARN** | **OPTIMIZE ONLY** | **MAINTENANCE** | **REDUCE** |
| **Profitability FAIL** | **EFFICIENCY ONLY** | **EFFICIENCY ONLY** | **EMERGENCY REDUCE** |

### Detailed Action Permissions per Cell

#### FULL GREEN (Prof PASS + Inv PASS)
Combined state: `GREEN`
- Bid increases: YES
- Budget increases: YES (up to 3x for STRONG quadrant)
- TOS modifier increases: YES
- New keyword launches: YES
- Match type expansion: YES
- Ranking pushes: YES
- Negative mining: YES
- Pause/reduce: YES

#### OPTIMIZE ONLY (Prof PASS + Inv WARN, or Prof WARN + Inv PASS)
Combined state: `YELLOW`
- Bid increases: YES, incremental only (max +$0.10 per cycle)
- Budget increases: YES, max +20%
- TOS modifier increases: YES, max +30%
- New keyword launches: NO (Prof WARN) or YES with caution (Inv WARN)
- Match type expansion: NO
- Ranking pushes: NO
- Negative mining: YES
- Pause/reduce: YES

#### MAINTENANCE (Prof WARN + Inv WARN)
Combined state: `ORANGE`
- Bid increases: NO (only bid adjustments to improve efficiency)
- Budget increases: NO
- TOS modifier increases: NO
- New keyword launches: NO
- Match type expansion: NO
- Ranking pushes: NO
- Negative mining: YES
- Pause/reduce: YES
- Placement rebalancing: YES (shift spend, not increase)

#### EFFICIENCY ONLY (Prof FAIL + Inv PASS, or Prof FAIL + Inv WARN)
Combined state: `RED_EFFICIENCY`
- Bid reductions: YES
- Budget reductions: YES
- Placement optimization: YES (lower base bid, shift to higher-CVR placements)
- Negative mining: YES (aggressive)
- Pause underperformers: YES
- Bid increases: NO
- Budget increases: NO
- TOS modifier increases: NO
- New launches: NO

#### HOLD / REDUCE (Prof PASS + Inv FAIL)
Combined state: `RED_INVENTORY`
- Bid reductions: YES
- Budget reductions: YES (reduce 30% if hero SKU OOS)
- Negative mining: YES
- Pause: YES
- Bid increases: NO
- Budget increases: NO
- TOS increases: NO
- New launches: NO
- SPECIAL: if targeted variation is OOS, auto-generate REDUCE action

#### REDUCE (Prof WARN + Inv FAIL)
Combined state: `RED_REDUCE`
- Bid reductions: YES (cut 20-30%)
- Budget reductions: YES (cut 30-50%)
- Pause low performers: YES
- Negative mining: YES
- ALL other actions: NO

#### EMERGENCY REDUCE (Prof FAIL + Inv FAIL)
Combined state: `RED_EMERGENCY`
- Pause all non-defensive campaigns: YES
- Defensive campaigns: maintain at minimum bid
- Bid reductions: YES (cut 50%)
- Budget reductions: YES (cut to daily minimum)
- ALL other actions: NO
- ALERT: generate urgent flag to operator with "Product unprofitable AND low inventory. Pause all non-essential PPC."

### Implementation (pseudocode)

```typescript
type CombinedGateState =
  | 'GREEN'
  | 'YELLOW'
  | 'ORANGE'
  | 'RED_EFFICIENCY'
  | 'RED_INVENTORY'
  | 'RED_REDUCE'
  | 'RED_EMERGENCY';

function evaluateCombinedGate(
  profGate: GateResult,
  invGate: GateResult
): { state: CombinedGateState; allowedActions: ActionPermissions } {

  const matrix: Record<string, Record<string, CombinedGateState>> = {
    PASS:  { PASS: 'GREEN',          WARN: 'YELLOW',         FAIL: 'RED_INVENTORY' },
    WARN:  { PASS: 'YELLOW',         WARN: 'ORANGE',         FAIL: 'RED_REDUCE' },
    FAIL:  { PASS: 'RED_EFFICIENCY', WARN: 'RED_EFFICIENCY', FAIL: 'RED_EMERGENCY' },
  };

  const state = matrix[profGate.state][invGate.state];
  const allowedActions = getActionPermissions(state);

  return { state, allowedActions, profGate, invGate };
}
```

---

## 3.4 Gate Override Rules

Gates are absolute. No diagnostic recommendation, quadrant classification, or campaign objective overrides a gate failure.

### Override Hierarchy

```
1. Combined Gate State (highest authority)
2. Campaign Objective constraints (Ranking/Discovery/Defensive/etc.)
3. Quadrant recommendation (STRONG/VISIBILITY/CONVERSION/BOTH_FAILING)
4. Root cause diagnosis (lever selection)
5. Product stage modifier (Launch/Growth/Maintenance)
```

### Override Examples

| Diagnostic Recommendation | Gate State | Override Result |
|--------------------------|-----------|----------------|
| STRONG quadrant -> SCALE (budget 1.5-3x) | Inventory FAIL | Override to MAINTAIN. Protect existing rank, do not increase spend. Flag: "Scaling blocked -- hero SKU at X days supply." |
| STRONG quadrant -> SCALE | Profitability FAIL | Override to EFFICIENCY ONLY. Reduce bids to improve ACOS. Flag: "Scaling blocked -- ACOS X% exceeds break-even Y%." |
| VISIBILITY -> BOOST TOS +50-200% | Profitability FAIL | Override to EFFICIENCY ONLY. Lower base bid to shift organic placement mix. No TOS modifier increase. |
| VISIBILITY -> BOOST TOS | Inventory WARN | Override to CAUTIOUS BOOST. Allow TOS increase max +30% (not +50-200%). No budget increase. |
| CONVERSION -> REDUCE + FLAG | Any gate state | No override needed -- REDUCE is always allowed. Gate failures reinforce the reduce action. |
| BOTH FAILING -> PAUSE + FLAG | Any gate state | No override needed -- PAUSE is always allowed. Gate failures reinforce urgency. |
| Root cause = Under-Investment -> increase spend | Profitability WARN | Override: allow incremental bid increase only ($0.05 steps), block budget increase. |
| Root cause = Under-Investment -> increase spend | Inventory FAIL | Override: BLOCK spend increase entirely. Flag: "Cannot invest more -- inventory constraint." |
| Ranking campaign -> push TOS aggressively | Combined ORANGE | Override: allow TOS optimization (rebalance) but not increase. No budget increase. |

### Gate Override in Action Output

Every generated action carries the gate context:

```typescript
interface OptimizationAction {
  actionType: 'BID_INCREASE' | 'BID_DECREASE' | 'BUDGET_INCREASE' | 'BUDGET_DECREASE'
    | 'TOS_MODIFIER_INCREASE' | 'TOS_MODIFIER_DECREASE' | 'NEGATE' | 'PAUSE'
    | 'PLACEMENT_REBALANCE' | 'FLAG_LISTING' | 'FLAG_INVENTORY';
  entityId: string;          // campaign_id, keyword_id, etc.
  entityType: 'campaign' | 'keyword' | 'placement';
  recommendedValue: number;
  currentValue: number;
  reason: string;            // diagnostic chain that led here
  quadrant: string;          // STRONG | VISIBILITY | CONVERSION | BOTH_FAILING
  gateState: CombinedGateState;
  gateOverrideApplied: boolean;
  originalRecommendation?: string;  // what would have been recommended without gate
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

---

# PART 4 — DIAGNOSTIC TO ACTION MAPPING

This section defines the exact actions generated for every combination of quadrant classification, product stage, gate status, and campaign objective.

---

## 4.1 Four-Quadrant Action Map (Per Syntax)

Each syntax group receives a quadrant classification based on CTR and CVR performance vs. targets. The quadrant determines the primary action direction; the product stage, gate status, and campaign objective refine the specific actions.

---

### STRONG Quadrant (CTR >= Target, CVR >= Target)

This syntax is performing well on both click-through and conversion. The default direction is SCALE -- increase investment to capture more volume from a proven performer.

#### Gate PASS (GREEN/YELLOW) + Launch Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. Increase budget 2-3x. 2. Increase TOS modifier to 50-100% (protect top-of-search position). 3. If clicks < 15/7d, increase bid $0.10. 4. Expand to phrase match if only exact exists. 5. Monitor organic rank -- if improving, maintain pressure. |
| **Market Share** | 1. Increase budget 1.5-2x. 2. Set TOS modifier to 30-50%. 3. If impression share < 10%, increase bid to compete. 4. Track click share trend -- target week-over-week growth. |
| **Discovery** | 1. Increase budget 1.5x. 2. If WAS% < 40%, continue harvesting. 3. If any search term has >= 2 orders/14d, graduate to exact match in Ranking or Market Share campaign. 4. Do NOT increase TOS -- discovery stays broad. |
| **Conversions** | 1. Maintain current bid (already performing). 2. Increase budget 1.5x if utilization > 80%. 3. If WAS% < 10%, this is efficient -- consider transitioning to Market Share objective. |
| **Defensive** | 1. Maintain current bid. 2. Ensure organic rank < 5 is holding. 3. If competitor is increasing impression share on this term, increase TOS modifier to defend position. |

#### Gate PASS (GREEN/YELLOW) + Growth Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. Increase budget 1.5-2x. 2. TOS modifier +20-30% if TOS% < 30%. 3. If organic rank at or below target, begin tapering: reduce bid 5-10% per week. 4. Transition to maintenance bid strategy when organic rank holds for 3+ weeks. |
| **Market Share** | 1. Increase budget 1.5x. 2. TOS modifier to 20-30%. 3. Focus on impression share growth -- target IS% > 5%. 4. If ACOS within 5pp of max allowed, hold budget and optimize bids. |
| **Discovery** | 1. Budget +20-30% if utilization > 80%. 2. Harvest converting terms aggressively -- graduate anything with >= 2 orders/14d. 3. Negate terms with >= 25 clicks and 0 orders. |
| **Conversions** | 1. Maintain bid. 2. Budget +20% if utilization > 80%. 3. Focus on efficiency -- this is the profit engine. |
| **Defensive** | 1. Maintain current position. 2. Only increase spend if competitor encroachment detected (IS% declining on branded terms). |

#### Gate PASS (GREEN/YELLOW) + Maintenance Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. Maintain current bid and budget. 2. If organic rank drifts above target, increase bid 5%. 3. If organic rank stable below target for 4+ weeks, reduce bid 10% (test organic resilience). |
| **Market Share** | 1. Maintain budget. 2. Optimize bids to blended placement CPC. 3. If ACOS trending up, check for new competitors and adjust. |
| **Discovery** | 1. Maintain or slightly reduce budget. 2. Continue harvesting at lower intensity. 3. Negate aggressively -- maintenance means fewer new terms needed. |
| **Conversions** | 1. Maintain. 2. Reduce bid 5% if ACOS has headroom and volume is stable. |
| **Defensive** | 1. Maintain minimum competitive bid. 2. Reduce budget if no competitor pressure detected. |

#### Gate WARN (YELLOW/ORANGE) + Any Stage

All objectives follow the same constraint pattern:

| Action | Allowed? | Constraint |
|--------|----------|-----------|
| Bid increase | YES, max $0.10/cycle | Only if clicks < 15 and diagnostic confirms under-investment |
| Budget increase | YES, max +20% | Only if utilization > 90% and efficiency metrics are strong |
| TOS modifier increase | YES, max +30% | Only for Ranking objective with organic rank above target |
| New keyword launch | NO | -- |
| Match type expansion | NO | -- |
| Negative mining | YES | Normal rules apply |
| Pause | YES | Normal rules apply |

#### Gate FAIL (RED_*) + Any Stage

| Action | Allowed? |
|--------|----------|
| Bid decrease | YES -- reduce 10-20% |
| Budget decrease | YES -- reduce 20-30% |
| TOS modifier | HOLD or DECREASE |
| Negative mining | YES -- aggressive |
| Pause underperformers | YES |
| All increases | NO |

Flag message: "STRONG performer [syntax] blocked from scaling. Gate: [PROFITABILITY/INVENTORY] FAIL. [specific reason]."

---

### VISIBILITY Quadrant (CTR < Target, CVR >= Target)

This syntax converts when clicked but is not getting enough visibility (low click-through rate). The product listing converts -- the issue is capturing attention in search results. Default direction is BOOST visibility, primarily through TOS placement optimization.

#### Gate PASS (GREEN/YELLOW) + Launch Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. Increase TOS modifier +50-100% (aggressive -- launch needs top placement to build rank). 2. Lower base bid below PDP CPC to prevent PDP bleed. 3. Increase budget 1.5x to absorb TOS cost. 4. If IS% < 3%, increase bid $0.10 -- insufficient traffic. 5. If IS% OK but click share < 3%, placement capture issue -- TOS boost is correct action. |
| **Market Share** | 1. Increase TOS modifier +50-80%. 2. Lower base bid to shift spend from PDP to TOS. 3. Budget +20-30%. 4. Check SQP click share -- if growing, strategy is working. |
| **Discovery** | 1. TOS modifier +30-50% (moderate -- discovery is broad). 2. Check if low CTR is keyword relevance issue first. If BA top-clicked products for this keyword do not include your ASIN, this may be a relevancy problem, not a placement problem. 3. If relevant, boost TOS. If not relevant, reduce investment on this keyword root. |
| **Conversions** | 1. TOS modifier +30%. 2. Lower base bid slightly. 3. Do NOT increase budget aggressively -- conversions objective is efficiency-focused. |
| **Defensive** | 1. TOS modifier +30-50% (must be visible on branded terms). 2. If organic rank < 5, TOS presence is critical for brand protection. 3. Do not reduce bid even though CTR is low -- defensive must maintain presence. |

#### Gate PASS (GREEN/YELLOW) + Growth Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. TOS modifier +50-80%. 2. Lower base bid below PDP CPC threshold. 3. Budget +20%. 4. Review main image and title -- if TOS CTR consistently low, this becomes a listing issue. Flag after 2 weeks of boost without CTR improvement. |
| **Market Share** | 1. TOS modifier +30-50%. 2. Budget +20% if utilization > 80%. 3. Track impression share trend. |
| **Discovery** | 1. TOS modifier +20-30%. 2. Review relevancy before investing more. |
| **Conversions** | 1. TOS modifier +20%. 2. Maintain budget. |
| **Defensive** | 1. TOS modifier +30%. 2. Maintain position. |

#### Gate PASS (GREEN/YELLOW) + Maintenance Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **All objectives** | 1. TOS modifier +20-30% (conservative). 2. Do NOT increase budget. 3. If CTR does not improve after 2 cycles of TOS boosting, flag as listing issue (main image, title, or price problem). 4. Review SQP data for competitive pressure -- new entrants may be stealing clicks. |

#### Gate WARN (YELLOW/ORANGE) + Any Stage

| Action | Allowed? | Constraint |
|--------|----------|-----------|
| TOS modifier increase | YES, max +30% | Primary action for this quadrant, allowed even under WARN |
| Base bid decrease | YES | Lower base bid to shift placement mix away from PDP |
| Budget increase | NO | -- |
| Bid increase | Only if IS% < 3% (insufficient traffic) | Max $0.05/cycle |
| Negative mining | YES | Normal rules |

#### Gate FAIL (RED_*) + Any Stage

| Action | Allowed? |
|--------|----------|
| Lower base bid | YES -- reduce to shift away from PDP spend |
| Placement rebalance | YES -- optimize within existing spend |
| TOS modifier increase | NO |
| Budget increase | NO |
| Bid increase | NO |
| Negative mining | YES |
| Pause | YES (if persistently unprofitable) |

Flag message: "VISIBILITY issue on [syntax] but gate prevents TOS boosting. [PROFITABILITY/INVENTORY] constraint. Optimize within existing spend only."

---

### CONVERSION Quadrant (CTR >= Target, CVR < Target)

This syntax gets clicks but does not convert. The product is visible and attracts attention, but something breaks at the purchase decision point. CRITICAL: PPC cannot fix conversion problems. This quadrant generates REDUCE + FLAG actions.

The conversion issue is almost always one of:
1. Wrong traffic source (PDP clicks with low purchase intent)
2. Listing problem (price, reviews, images, A+ content)
3. Relevancy mismatch (keyword attracts wrong audience)

#### Gate PASS (GREEN/YELLOW) + Launch Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. Check placement mix: if PDP spend > 40%, lower base bid below PDP CPC and increase TOS modifier +20%. 2. If PDP is not the issue (TOS-heavy already), reduce spend 30%. 3. FLAG to Launch/Brand Management: "CVR below target on [syntax]. Review listing: [price/reviews/images/A+]." 4. Set 1-week timer: if CVR does not improve after placement fix, reduce spend additional 20%. |
| **Market Share** | 1. Same placement check as Ranking. 2. Reduce budget 30%. 3. FLAG: listing issue probable. 4. Do not increase investment until CVR recovers. |
| **Discovery** | 1. Check WAS%: if > 40%, negate aggressively FIRST. 2. Check individual search terms: negate terms with >= 25 clicks, 0 orders. 3. Reduce budget 20%. 4. FLAG if WAS% is fine and CVR is still low -- listing or relevancy issue. |
| **Conversions** | 1. Reduce bid 20%. 2. Reduce budget 30%. 3. FLAG urgently -- this campaign type depends on CVR. |
| **Defensive** | 1. Maintain minimum presence (do not pause defensive terms). 2. Reduce bid 10%. 3. FLAG: "Branded/defensive term converting poorly. Check listing, pricing, competitor offers." |

#### Gate PASS (GREEN/YELLOW) + Growth Stage

Same as Launch but with tighter timelines:
- Placement fix window: 1 week (not 2)
- If no improvement after 1 week: reduce additional 30%
- FLAG becomes URGENT after 2 weeks of low CVR

#### Gate PASS (GREEN/YELLOW) + Maintenance Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **All objectives** | 1. Reduce spend 30-50% immediately. 2. Check placement mix and rebalance. 3. FLAG to listing team. 4. If CVR has been declining for 3+ weeks, check for: new competitor at lower price, review count/rating decline, listing suppression, category changes. |

#### Gate WARN or FAIL + Any Stage

Gate restrictions reinforce the REDUCE direction. No conflict possible -- the quadrant already says reduce.

| Action | Allowed? |
|--------|----------|
| Bid decrease | YES -- reduce 20-30% |
| Budget decrease | YES -- reduce 30-50% |
| Negative mining | YES -- aggressive |
| Pause | YES (non-defensive campaigns) |
| FLAG to other teams | YES -- always allowed regardless of gate |
| All increases | NO |

---

### BOTH FAILING Quadrant (CTR < Target, CVR < Target)

This syntax is failing on all fronts. Neither visible nor converting. This is the most severe classification. Default action is PAUSE + FLAG.

#### Gate PASS (GREEN/YELLOW) + Launch Stage

Launch products get slightly more tolerance because data may be insufficient.

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. Check if clicks >= 15 (minimum data threshold). If < 15, this may be insufficient data -- increase bid $0.05 and wait one more cycle before classifying. 2. If clicks >= 15 and still BOTH_FAILING: reduce spend 50%. 3. FLAG urgently to Launch team: "Keyword root [X] failing on CTR and CVR. Evaluate relevancy, listing quality, and keyword-product fit." 4. Do NOT pause during first 4 weeks of launch -- give listing time to accumulate reviews. |
| **Market Share** | 1. Reduce spend 50%. 2. If this keyword root is core to the product, FLAG but maintain minimum presence. 3. If peripheral keyword root, PAUSE. |
| **Discovery** | 1. PAUSE this targeting immediately. 2. Reallocate budget to STRONG/VISIBILITY syntaxes. 3. Negate the worst-performing search terms. |
| **Conversions** | 1. PAUSE. 2. Reallocate. |
| **Defensive** | 1. Do NOT pause (branded terms must maintain presence). 2. Reduce to minimum bid. 3. FLAG: "Branded term failing on both CTR and CVR. Urgent listing/pricing review needed." |

#### Gate PASS (GREEN/YELLOW) + Growth Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **Ranking** | 1. Reduce spend 50%. 2. FLAG: "Root [X] not responding to investment. Evaluate relevancy." 3. If no improvement after 2 weeks, PAUSE. |
| **Market Share** | 1. PAUSE. 2. Reallocate to performing roots. |
| **Discovery** | 1. PAUSE immediately. |
| **Conversions** | 1. PAUSE immediately. |
| **Defensive** | 1. Reduce to minimum bid. 2. FLAG. |

#### Gate PASS (GREEN/YELLOW) + Maintenance Stage

| Campaign Objective | Actions |
|-------------------|---------|
| **All non-defensive** | 1. PAUSE immediately. 2. Reallocate budget to performing syntaxes. 3. FLAG: investigate if this was previously a performer (seasonal decline? competitor entry? listing change?). |
| **Defensive** | 1. Reduce to minimum bid. 2. FLAG. |

#### Gate WARN or FAIL + Any Stage

| Action | Allowed? |
|--------|----------|
| PAUSE all non-defensive | YES -- immediate |
| Defensive: reduce to minimum | YES |
| Reallocate budget | YES |
| FLAG | YES -- urgent |
| All increases | NO |
| Gate FAIL amplifies urgency | Generate "EMERGENCY" flag: "BOTH_FAILING + Gate FAIL. Stop all non-essential spend on [product]." |

---

## 4.2 Root Cause to Action Mapping

Root cause analysis runs SEQUENTIALLY. Evaluate Root 1 first. Only proceed to Root 2 if Root 1 does not explain the issue. This prevents misdiagnosis -- the most common error in PPC optimization is jumping to "increase bids" when the problem is placement bleed.

---

### Root 1: Conversion & Placement

**When to check:** CVR is below target for this syntax.

**Check:** `placement_spend_pct` for TOS vs ROS vs PDP

```sql
SELECT
  placement_type,
  SUM(spend) as placement_spend,
  SUM(spend) / NULLIF(SUM(SUM(spend)) OVER (), 0) as spend_pct,
  SUM(clicks) as clicks,
  SUM(orders) as orders,
  CASE WHEN SUM(clicks) > 0 THEN SUM(orders)::decimal / SUM(clicks) ELSE 0 END as cvr,
  CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc
FROM placement_daily_metrics
WHERE campaign_id = :campaign_id
  AND date >= CURRENT_DATE - 7
GROUP BY placement_type;
```

**Decision tree:**

| Condition | Diagnosis | Action |
|-----------|-----------|--------|
| PDP spend > 50% of total AND PDP CVR < TOS CVR | PDP bleed -- low-intent product page clicks are dragging down overall CVR | 1. Calculate PDP CPC. 2. Lower base bid to below PDP CPC. 3. Increase TOS modifier +20-30%. 4. Expected result: PDP impressions drop, TOS share increases, overall CVR improves. |
| PDP spend > 50% AND PDP CVR >= TOS CVR | PDP is actually converting. CVR issue is elsewhere. | Proceed to Root 2. |
| TOS spend dominant but CVR still low | Placement is not the problem. | Proceed to Root 2. |
| ROS spend high (> 30%) | Rest-of-search bleed | 1. If campaign bidding strategy allows, reduce ROS modifier. 2. Increase TOS modifier to shift spend. |

**Timeline:** After placement fix, wait 7 days. If CVR does not improve by at least 15% relative, escalate:
- FLAG to Launch/Brand Management team: "Placement optimized but CVR still below target. Listing review needed."
- Reduce spend immediately by 20%.

---

### Root 2: Relevancy

**When to check:** Root 1 did not explain the issue (placement mix is fine or has been addressed).

**Check:** Brand Analytics / SQP top-clicked products for this keyword.

**Data source:** `sqp_metrics` table -- look at `brand_clicks` / `total_clicks` (click share) for this keyword.

**Decision tree:**

| Condition | Diagnosis | Action |
|-----------|-----------|--------|
| Your ASIN is NOT in top 3 clicked products for this keyword | Keyword may not be relevant to your product -- shoppers see your listing but choose competitors | 1. Reduce investment on this keyword root by 30-50%. 2. Reallocate budget to roots where your ASIN IS in top 3 clicked. 3. Do NOT negate (the keyword might still be worth maintaining at lower spend). |
| Your ASIN IS in top 3 clicked but click share is declining week-over-week | Competitive pressure -- relevant keyword but losing ground | Proceed to Root 3 (check indexing). Also: review competitor listings for price, reviews, imagery advantages. |
| Your ASIN IS in top 3 clicked AND click share is stable/growing | Relevancy is fine | Proceed to Root 3. |
| No SQP data available for this keyword | Cannot evaluate relevancy | Log as data gap. Proceed to Root 3. Use search volume and organic rank as proxy signals. |

---

### Root 3: Indexing

**When to check:** Root 2 confirmed relevancy (or could not be evaluated).

**Check:** Average organic rank for the keyword root.

**Data source:** `keyword_rank_data` (from DataDive/DataRover external data) or `product_daily_metrics.organic_rank` if tracked per keyword.

**Decision tree:**

| Condition | Diagnosis | Action |
|-----------|-----------|--------|
| Organic rank > 20 despite consistent PPC spend over 4+ weeks | Product may not be properly indexed for this keyword. Amazon's algorithm is not associating this keyword with the listing. | 1. FLAG to listing team: "Add keyword root [X] to title or first bullet point. Current organic rank: [Y]. PPC spend last 30d: $[Z] with no rank movement." 2. Maintain PPC at current level (do not increase -- throwing money at an indexing problem does not work). 3. Re-evaluate 2 weeks after listing update. |
| Organic rank 10-20 | Indexed but not ranking well | Proceed to Root 4 -- may need more investment to push through. |
| Organic rank < 10 | Well indexed | Proceed to Root 4. |
| Organic rank 1-5 AND keyword is in Ranking campaign | At or near target -- may be ready to transition | Transition to maintenance bid strategy. Reduce PPC spend 20% and monitor if organic rank holds. |

---

### Root 4: Under-Investment

**When to check:** Roots 1-3 did not explain the issue. Placement is balanced, keyword is relevant, product is indexed.

**Check:** IS% (impression share) + impression rank + CVR

**Data source:** `sqp_metrics.impression_share`, `targeting_metrics.top_of_search_impression_share`

**Decision tree:**

| Condition | Diagnosis | Action |
|-----------|-----------|--------|
| IS% < 3% AND impression rank > 4 AND CVR is strong (at target) | Genuine under-investment -- good product-keyword fit but not enough bid/budget to compete | 1. Increase bid incrementally (+$0.05 per cycle, max 3 consecutive increases before re-evaluation). 2. If budget utilization > 80%, increase budget +20-30%. 3. Monitor IS% weekly -- target 3-5% minimum. |
| IS% < 3% AND impression rank > 4 AND CVR is weak | Under-investment AND conversion issue | Do NOT increase spend. Address CVR first (loop back to Root 1). Increasing spend on a low-CVR keyword wastes money. |
| IS% >= 3% AND impression rank <= 4 | NOT an investment issue -- already visible | Loop back to Root 1 with fresh analysis. The problem is deeper: possible listing issue, pricing issue, or market fit issue. FLAG for manual review. |
| IS% >= 3% AND impression rank > 4 | Getting impressions but not prominent placement | This is a placement quality issue, not volume. Increase TOS modifier +20%. Do NOT increase base bid. |

### Root Cause Loop Termination

If all four roots have been evaluated and no clear action emerges:
1. FLAG for manual operator review: "Automated diagnosis inconclusive for [syntax]. All root causes checked. Recommend manual analysis of: listing quality, competitive landscape, keyword-product fit."
2. HOLD current spend -- do not increase or decrease.
3. Re-evaluate next cycle with fresh data.

---

## 4.3 Campaign-Objective-Specific Thresholds

These thresholds define the exact trigger points for actions within each campaign objective. They are evaluated AFTER gate checks and quadrant classification.

---

### Ranking Campaigns

| Metric | Threshold | Action When Triggered |
|--------|-----------|----------------------|
| Clicks (7d) | < 15 | Increase bid +$0.05. Insufficient data for any other decision. |
| Clicks (7d) | >= 15 | Proceed to full diagnostic. Use blended placement CPC for bid optimization. |
| TOS% | < 30% | Increase TOS modifier +20-30%. Ranking depends on TOS presence. |
| TOS% | >= 30% | TOS is healthy. Focus on bid and budget optimization. |
| ACOS (7d) | > 80% AND clicks >= 15 | Trigger ACOS diagnostic chain (Section 4.4). Do NOT reduce bids as default. |
| ACOS (7d) | 50-80% AND ranking improving | Acceptable during ranking push. Monitor weekly. |
| ACOS (7d) | < 50% | Efficient. Consider increasing investment if organic rank still above target. |
| Organic rank | At or below target | Begin transition: reduce bid 5-10% per week. If rank holds for 3 weeks, switch to maintenance. |
| Organic rank | Improving (down week-over-week) | Maintain current investment. Momentum is positive. |
| Organic rank | Deteriorating despite spend | FLAG: check for competitor activity, listing changes, or algorithm shifts. |
| SV (search volume) | < 500 | Low volume keyword for ranking. Consider whether this root is worth ranking investment. FLAG for strategy review. |
| Spend% (of total product spend) | > 55% | This ranking campaign is consuming too much budget. Review if other objectives are underfunded. |

### Market Share Campaigns

| Metric | Threshold | Action When Triggered |
|--------|-----------|----------------------|
| Clicks (7d) | < 15 | Increase bid +$0.05. |
| TOS% | < 30% | Increase TOS modifier +20%. |
| ACOS (7d) | > 50% | Trigger ACOS diagnostic. For market share, max tolerable ACOS is lower than ranking. |
| ACOS (7d) | 25-50% | Acceptable range. Optimize incrementally. |
| ACOS (7d) | < 25% | Highly efficient. Increase budget to capture more share. |
| IS% (impression share) | < 5% | Under-represented. Increase bid and budget if gate allows. |
| IS% | 5-15% | Growing. Maintain investment. |
| IS% | > 15% | Strong share. Shift to efficiency -- can you maintain share at lower cost? |
| SV | < 1000 | Low volume for market share. Review if better allocated to ranking or conversions. |
| Spend% | > 20% | Over-allocated. Review portfolio balance. |

### Defensive Campaigns

| Metric | Threshold | Action When Triggered |
|--------|-----------|----------------------|
| Clicks (7d) | < 10 | Minimum threshold is lower for defensive. Increase bid +$0.03 if needed. |
| Organic rank | >= 5 | Organic position slipping on branded/defensive term. URGENT FLAG. |
| Organic rank | < 5 | Healthy. Maintain minimum competitive bid. |
| WAS% | >= 10% | Too much wasted spend on defensive -- negate irrelevant terms leaking in. |
| ACOS (7d) | > 15% | High for defensive. Check: are competitor ASINs stealing clicks on your branded terms? |
| ACOS (7d) | <= 15% | Normal range. Maintain. |
| Spend% | > 5% | Over-allocated for defensive. Reduce unless competitor pressure detected. |

### Conversions Campaigns

| Metric | Threshold | Action When Triggered |
|--------|-----------|----------------------|
| Orders (7d) | < 7 | Insufficient conversions. Review targeting. If clicks are high but orders low, CVR issue. If clicks are also low, traffic issue. |
| WAS% | >= 10% | Negate terms that spend without converting. Conversions campaigns must be tight. |
| ACOS (7d) | > 25% | Above efficiency threshold. Reduce bid 10%. Check placement mix. |
| ACOS (7d) | 15-25% | Acceptable. Optimize incrementally. |
| ACOS (7d) | < 15% | Highly efficient. Maintain or increase budget if gate allows. |
| Spend% | > 5% | Review -- conversions campaigns should be lean. |

### Discovery Campaigns

| Metric | Threshold | Action When Triggered |
|--------|-----------|----------------------|
| Clicks (7d) | < 15 | Increase bid +$0.05. Discovery needs traffic to find winners. |
| Orders (7d) | < 7 | Low harvest rate. Review targeting breadth. If too narrow, expand. If too broad, tighten. |
| WAS% | > 40% | **NEGATE FIRST.** Before any bid or budget change, identify and negate search terms with >= 25 clicks and 0 orders. This is the single most impactful action for discovery campaigns. |
| WAS% | 20-40% | Moderate waste. Negate terms with >= 25 clicks and 0 orders, then review targeting. |
| WAS% | < 20% | Healthy. Continue harvesting. |
| ACOS (7d) | > 30% | Run ACOS diagnostic, but check WAS% first. Often high ACOS in discovery is driven by waste, not bid issues. |
| Harvest rate | < 2 orders per search term per 14d | Review targeting. If broad match, consider adding phrase match negatives to refine. |
| Min clicks before negating | < 25 | Do NOT negate a search term until it has at least 25 clicks. Statistical significance requires minimum data. |
| Spend% | > 20% | Discovery consuming too much budget. Tighten targeting or reduce budget. |

---

## 4.4 ACOS Diagnostic Chain

This is the most critical diagnostic in the system. The default human instinct when ACOS is high is to reduce bids. This is frequently WRONG. The ACOS diagnostic chain identifies the TRUE root cause before any action is taken.

### Decision Tree

```
HIGH ACOS DETECTED (ACOS > max threshold for campaign objective)
│
├── STEP 1: Check CTR vs Target
│   │
│   ├── CTR BELOW TARGET
│   │   │
│   │   ├── STEP 2a: Check SQP Impression Share (IS%)
│   │   │   │
│   │   │   ├── IS% < 3-5%
│   │   │   │   │
│   │   │   │   └── DIAGNOSIS: Insufficient Traffic
│   │   │   │       ACTION: INCREASE bids (+$0.05 per cycle)
│   │   │   │       RATIONALE: Low IS% means you are not even showing up.
│   │   │   │       You cannot diagnose CTR if shoppers never see you.
│   │   │   │       Increasing bids gets you into the auction.
│   │   │   │
│   │   │   └── IS% >= 3-5% (getting impressions)
│   │   │       │
│   │   │       ├── STEP 2b: Check SQP Click Share (CS%)
│   │   │       │   │
│   │   │       │   ├── CS% < 3-5%
│   │   │       │   │   │
│   │   │       │   │   └── DIAGNOSIS: Click Capture Issue
│   │   │       │   │       ACTION: Review placements. Boost TOS modifier +20-30%.
│   │   │       │   │       RATIONALE: You are showing up (IS% OK) but not
│   │   │       │   │       getting clicked. Likely appearing in low-CTR
│   │   │       │   │       placements (PDP, ROS). Move spend to TOS.
│   │   │       │   │
│   │   │       │   └── CS% >= 3-5%
│   │   │       │       │
│   │   │       │       └── DIAGNOSIS: Listing CTR Issue
│   │   │       │           ACTION: FLAG to listing team.
│   │   │       │           RATIONALE: You are visible AND in decent
│   │   │       │           placements, but shoppers choose not to click.
│   │   │       │           Problem is main image, title, price, or
│   │   │       │           review count. PPC cannot fix this.
│   │   │       │           ADDITIONAL: Reduce spend 20% while listing
│   │   │       │           is being improved.
│   │   │
│   │   └── NO SQP DATA AVAILABLE
│   │       │
│   │       ├── STEP 2c: Check Impression Rank (proxy for IS%)
│   │       │   │
│   │       │   ├── Impression rank > 4
│   │       │   │   └── Likely insufficient traffic. Treat as IS% < 3%.
│   │       │   │       ACTION: Increase bid +$0.05.
│   │       │   │
│   │       │   └── Impression rank <= 4
│   │       │       └── Getting impressions but CTR is low.
│   │       │           ACTION: Review placements + FLAG listing team.
│   │
│   └── CTR AT OR ABOVE TARGET
│       │
│       ├── STEP 3: Is this a Discovery campaign?
│       │   │
│       │   ├── YES (Discovery)
│       │   │   │
│       │   │   ├── STEP 3a: Check WAS%
│       │   │   │   │
│       │   │   │   ├── WAS% > 40%
│       │   │   │   │   │
│       │   │   │   │   └── DIAGNOSIS: Waste-Driven ACOS
│       │   │   │   │       ACTION: NEGATE aggressively FIRST.
│       │   │   │   │       Identify search terms with >= 25 clicks, 0 orders.
│       │   │   │   │       Negate them. Re-evaluate ACOS after 7 days.
│       │   │   │   │       Do NOT touch bids or budget until negation
│       │   │   │   │       impact is measured.
│       │   │   │   │
│       │   │   │   └── WAS% <= 40%
│       │   │   │       └── Proceed to STEP 4 (normal bid optimization).
│       │   │
│       │   └── NO (not Discovery)
│       │       │
│       │       ├── STEP 4: Check CVR vs Target
│       │       │   │
│       │       │   ├── CVR BELOW TARGET
│       │       │   │   │
│       │       │   │   ├── STEP 4a: Check Placement Mix
│       │       │   │   │   │
│       │       │   │   │   ├── PDP spend > 50% of total
│       │       │   │   │   │   │
│       │       │   │   │   │   └── DIAGNOSIS: PDP Bleed
│       │       │   │   │   │       ACTION: Lower base bid below PDP CPC.
│       │       │   │   │   │       Increase TOS modifier +20-30%.
│       │       │   │   │   │       RATIONALE: PDP clicks are low-intent
│       │       │   │   │   │       comparison shoppers. High CPC + low CVR
│       │       │   │   │   │       from PDP inflates ACOS. Shifting to TOS
│       │       │   │   │   │       gets higher-intent shoppers.
│       │       │   │   │   │
│       │       │   │   │   └── PDP spend <= 50%
│       │       │   │   │       │
│       │       │   │   │       └── DIAGNOSIS: Listing Conversion Issue
│       │       │   │   │           ACTION: FLAG to listing/brand team.
│       │       │   │   │           RATIONALE: Placement is fine, CTR is fine,
│       │       │   │   │           but shoppers visit and do not buy.
│       │       │   │   │           Problem is on the listing page: price,
│       │       │   │   │           reviews, A+ content, competitor comparison.
│       │       │   │   │           ADDITIONAL: Reduce spend 20-30%.
│       │       │   │
│       │       │   └── CVR AT OR ABOVE TARGET
│       │       │       │
│       │       │       └── DIAGNOSIS: CPC-Driven ACOS
│       │       │           ACTION: Optimize bids.
│       │       │           CTR is good, CVR is good, but CPC is too high.
│       │       │           1. Calculate blended placement CPC target:
│       │       │              target_cpc = target_acos * avg_sale_value * cvr
│       │       │           2. If current CPC > target_cpc, reduce bid
│       │       │              by the difference (max -$0.15 per cycle).
│       │       │           3. Review if bidding strategy (dynamic bids up/down)
│       │       │              is inflating CPCs -- consider switching to
│       │       │              fixed bids with placement modifiers.
```

### ACOS Diagnostic Implementation (pseudocode)

```typescript
interface AcosDiagnosisResult {
  diagnosis: string;
  actions: OptimizationAction[];
  flags: FlagAction[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  dataGaps: string[];
}

function runAcosDiagnostic(
  syntaxId: string,
  campaignObjective: CampaignObjective,
  metrics: SyntaxMetrics,
  sqpData: SqpMetrics | null,
  placementData: PlacementMetrics
): AcosDiagnosisResult {

  const ctrTarget = metrics.targetCtr;
  const cvrTarget = metrics.targetCvr;

  // STEP 1: CTR check
  if (metrics.ctr < ctrTarget) {

    // STEP 2a: SQP impression share
    if (sqpData) {
      if (sqpData.impressionShare < 0.035) {
        return {
          diagnosis: 'INSUFFICIENT_TRAFFIC',
          actions: [{ actionType: 'BID_INCREASE', delta: 0.05,
            reason: 'IS% below 3.5% -- not enough auction participation' }],
          flags: [],
          confidence: 'HIGH',
          dataGaps: []
        };
      }

      // STEP 2b: Click share
      if (sqpData.clickShare < 0.035) {
        return {
          diagnosis: 'CLICK_CAPTURE_ISSUE',
          actions: [
            { actionType: 'TOS_MODIFIER_INCREASE', delta: 25,
              reason: 'IS% OK but click share < 3.5% -- placement quality issue' },
            { actionType: 'BID_DECREASE', target: 'below_pdp_cpc',
              reason: 'Lower base bid to reduce PDP impressions' }
          ],
          flags: [],
          confidence: 'HIGH',
          dataGaps: []
        };
      }

      // IS% OK, CS% OK, but CTR still low
      return {
        diagnosis: 'LISTING_CTR_ISSUE',
        actions: [{ actionType: 'BID_DECREASE', pct: 20,
          reason: 'Reduce spend while listing is improved' }],
        flags: [{ type: 'LISTING_REVIEW', urgency: 'HIGH',
          message: 'CTR below target despite good visibility. Review main image, title, price.' }],
        confidence: 'HIGH',
        dataGaps: []
      };

    } else {
      // No SQP data -- use impression rank as proxy
      if (metrics.impressionRank > 4) {
        return {
          diagnosis: 'LIKELY_INSUFFICIENT_TRAFFIC',
          actions: [{ actionType: 'BID_INCREASE', delta: 0.05,
            reason: 'No SQP data, impression rank > 4 suggests low visibility' }],
          flags: [],
          confidence: 'MEDIUM',
          dataGaps: ['SQP data unavailable for this keyword']
        };
      } else {
        return {
          diagnosis: 'PLACEMENT_OR_LISTING_ISSUE',
          actions: [{ actionType: 'TOS_MODIFIER_INCREASE', delta: 20,
            reason: 'Getting impressions (rank <= 4) but CTR low -- review placements' }],
          flags: [{ type: 'LISTING_REVIEW', urgency: 'MEDIUM',
            message: 'CTR below target. May be listing or placement issue.' }],
          confidence: 'LOW',
          dataGaps: ['SQP data unavailable']
        };
      }
    }
  }

  // CTR is at or above target
  // STEP 3: Discovery campaign WAS% check
  if (campaignObjective === 'DISCOVERY') {
    if (metrics.wasPercent > 0.40) {
      return {
        diagnosis: 'WASTE_DRIVEN_ACOS',
        actions: [{ actionType: 'NEGATE', criteria: 'clicks >= 25 AND orders = 0',
          reason: 'WAS% > 40% -- negate non-converting terms BEFORE any bid changes' }],
        flags: [],
        confidence: 'HIGH',
        dataGaps: []
      };
    }
    // WAS% acceptable, fall through to normal CVR check
  }

  // STEP 4: CVR check
  if (metrics.cvr < cvrTarget) {
    // STEP 4a: Placement mix
    if (placementData.pdpSpendPct > 0.50) {
      const pdpCpc = placementData.pdpSpend / placementData.pdpClicks;
      return {
        diagnosis: 'PDP_BLEED',
        actions: [
          { actionType: 'BID_DECREASE', target: pdpCpc * 0.9,
            reason: `Lower base bid below PDP CPC ($${pdpCpc.toFixed(2)}) to reduce PDP traffic` },
          { actionType: 'TOS_MODIFIER_INCREASE', delta: 25,
            reason: 'Boost TOS to shift spend to higher-intent placement' }
        ],
        flags: [],
        confidence: 'HIGH',
        dataGaps: []
      };
    }

    // Placement is fine but CVR is low
    return {
      diagnosis: 'LISTING_CONVERSION_ISSUE',
      actions: [{ actionType: 'BID_DECREASE', pct: 25,
        reason: 'CTR healthy but CVR below target with balanced placement -- listing issue' }],
      flags: [{ type: 'LISTING_REVIEW', urgency: 'HIGH',
        message: 'Conversion rate below target. Placement mix is healthy. Review listing page: price, reviews, A+ content, competitor offers.' }],
      confidence: 'HIGH',
      dataGaps: []
    };
  }

  // CTR OK, CVR OK -- ACOS is CPC-driven
  const targetCpc = metrics.targetAcos * metrics.avgSaleValue * metrics.cvr;
  return {
    diagnosis: 'CPC_DRIVEN_ACOS',
    actions: [{
      actionType: 'BID_DECREASE',
      target: targetCpc,
      reason: `CTR and CVR at target. CPC too high. Target CPC: $${targetCpc.toFixed(2)} based on ACOS target.`
    }],
    flags: [],
    confidence: 'HIGH',
    dataGaps: []
  };
}
```

### ACOS Diagnostic Summary Table

| # | CTR | IS% | CS% | CVR | PDP% | WAS% | Diagnosis | Primary Action |
|---|-----|-----|-----|-----|------|------|-----------|---------------|
| 1 | Low | Low | -- | -- | -- | -- | Insufficient traffic | INCREASE bid |
| 2 | Low | OK | Low | -- | -- | -- | Click capture issue | BOOST TOS, lower base bid |
| 3 | Low | OK | OK | -- | -- | -- | Listing CTR issue | FLAG listing team, reduce spend |
| 4 | OK | -- | -- | -- | -- | High (>40%) | Waste-driven (Discovery) | NEGATE first |
| 5 | OK | -- | -- | Low | High (>50%) | -- | PDP bleed | Lower base bid, boost TOS |
| 6 | OK | -- | -- | Low | Normal | -- | Listing conversion issue | FLAG listing team, reduce spend |
| 7 | OK | -- | -- | OK | -- | -- | CPC-driven ACOS | Optimize bids to target CPC |

### Lever Application Order (Post-Diagnosis)

After the ACOS diagnostic identifies the root cause, levers are applied in this strict order:

```
1. BIDS      → Only if diagnosis is "insufficient traffic" or "CPC-driven"
2. PLACEMENTS → If diagnosis is "click capture" or "PDP bleed"
3. BUDGET    → Only AFTER confirming bids and placements are optimized
                AND performance is strong (not as a fix for poor performance)
4. NEGATING  → When search terms spend without converting
                AND minimum click threshold met (25 clicks)
                AND confirmed not an insufficient traffic issue
5. PAUSE     → Last resort. Only after ALL other levers exhausted
                AND syntax is BOTH_FAILING for 3+ consecutive weeks
```

Never apply multiple levers simultaneously in the same optimization cycle. Change one variable at a time, wait 7 days, measure impact, then decide on next lever. The only exception is the PDP bleed fix, which requires BOTH lowering base bid AND increasing TOS modifier in the same action (they are mechanically linked).

---

## Summary: Action Generation Pipeline

```
For each product:
  1. Evaluate Profitability Gate → PASS / WARN / FAIL
  2. Evaluate Inventory Gate → PASS / WARN / FAIL
  3. Compute Combined Gate State → GREEN through RED_EMERGENCY
  │
  For each syntax group within the product:
    4. Classify quadrant → STRONG / VISIBILITY / CONVERSION / BOTH_FAILING
    5. Identify campaign objective → Ranking / Market Share / Defensive / Conversions / Discovery
    6. Identify product stage → Launch / Growth / Maintenance
    7. Look up action set from 4.1 (quadrant × objective × stage)
    8. Apply gate override from 3.4 (restrict actions based on combined gate)
    │
    If action involves ACOS concern:
      9. Run ACOS Diagnostic Chain (4.4) → specific diagnosis
      10. Map diagnosis to lever (4.2 root cause or 4.4 lever order)
    │
    11. Check campaign-objective thresholds (4.3) → validate/refine action parameters
    12. Generate final OptimizationAction with full context
    13. Queue for operator review
```

Every generated action includes: the diagnostic chain that produced it, the gate state at evaluation time, whether an override was applied, and a confidence score. The operator sees the full reasoning and can approve, modify, or reject each action.
