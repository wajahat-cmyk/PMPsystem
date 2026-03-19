/**
 * Click-Through Rate: clicks / impressions * 100
 */
export function ctr(clicks: number, impressions: number): number {
  if (impressions === 0) return 0;
  return (clicks / impressions) * 100;
}

/**
 * Conversion Rate: orders / clicks * 100
 */
export function cvr(orders: number, clicks: number): number {
  if (clicks === 0) return 0;
  return (orders / clicks) * 100;
}

/**
 * Advertising Cost of Sales: adSpend / adSales * 100
 */
export function acos(adSpend: number, adSales: number): number {
  if (adSales === 0) return 0;
  return (adSpend / adSales) * 100;
}

/**
 * Total Advertising Cost of Sales: adSpend / totalSales * 100
 */
export function tacos(adSpend: number, totalSales: number): number {
  if (totalSales === 0) return 0;
  return (adSpend / totalSales) * 100;
}

/**
 * Return on Ad Spend: adSales / adSpend
 */
export function roas(adSales: number, adSpend: number): number {
  if (adSpend === 0) return 0;
  return adSales / adSpend;
}

/**
 * Wasted Ad Spend Percentage: wastedSpend / totalSpend * 100
 * Wasted spend = spend on keywords with zero sales
 */
export function wasPct(wastedSpend: number, totalSpend: number): number {
  if (totalSpend === 0) return 0;
  return (wastedSpend / totalSpend) * 100;
}

/**
 * Organic Order Percentage: organicOrders / totalOrders * 100
 */
export function organicOrderPct(
  organicOrders: number,
  totalOrders: number
): number {
  if (totalOrders === 0) return 0;
  return (organicOrders / totalOrders) * 100;
}

/**
 * PPC Order Percentage: ppcOrders / totalOrders * 100
 */
export function ppcOrderPct(ppcOrders: number, totalOrders: number): number {
  if (totalOrders === 0) return 0;
  return (ppcOrders / totalOrders) * 100;
}

/**
 * Daily Sales Velocity: totalSales / numberOfDays
 */
export function dailySalesVelocity(
  totalSales: number,
  numberOfDays: number
): number {
  if (numberOfDays === 0) return 0;
  return totalSales / numberOfDays;
}

/**
 * Average Order Value: totalSales / totalOrders
 */
export function avgOrderValue(totalSales: number, totalOrders: number): number {
  if (totalOrders === 0) return 0;
  return totalSales / totalOrders;
}

/**
 * Organic Sales Percentage: (totalSales - adSales) / totalSales * 100
 */
export function organicSalesPct(
  totalSales: number,
  adSales: number
): number {
  if (totalSales === 0) return 0;
  return ((totalSales - adSales) / totalSales) * 100;
}

/**
 * Break-Even ACoS: profit margin percentage.
 * If your profit margin is 30%, your break-even ACoS is 30%.
 * breakEvenAcos = ((price - cogs) / price) * 100
 */
export function breakevenAcos(price: number, cogs: number): number {
  if (price === 0) return 0;
  return ((price - cogs) / price) * 100;
}

/**
 * Cost Per Click: adSpend / clicks
 */
export function cpc(adSpend: number, clicks: number): number {
  if (clicks === 0) return 0;
  return adSpend / clicks;
}

/**
 * Cost Per Acquisition: adSpend / orders
 */
export function cpa(adSpend: number, orders: number): number {
  if (orders === 0) return 0;
  return adSpend / orders;
}

/**
 * Impression Share estimate: impressions / estimatedTotalImpressions * 100
 */
export function impressionShare(
  impressions: number,
  estimatedTotal: number
): number {
  if (estimatedTotal === 0) return 0;
  return (impressions / estimatedTotal) * 100;
}

/**
 * Net Profit per unit: sellingPrice - cogs - adSpendPerUnit - fees
 */
export function netProfitPerUnit(
  sellingPrice: number,
  cogs: number,
  adSpendPerUnit: number,
  fees: number
): number {
  return sellingPrice - cogs - adSpendPerUnit - fees;
}

/**
 * Format a number as a currency string.
 */
export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a number as a percentage string.
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a large number with commas.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
