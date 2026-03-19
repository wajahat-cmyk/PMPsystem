"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard, MetricCardSkeleton } from "@/components/charts/metric-card";
import { SalesTrendChart } from "@/components/charts/sales-trend-chart";
import { AcosTrendChart } from "@/components/charts/acos-trend-chart";
import { ProductTable } from "@/components/overview/product-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/calculations";
import {
  DollarSign,
  ShoppingCart,
  Target,
  TrendingUp,
  Eye,
  MousePointerClick,
  BarChart3,
  Percent,
  Zap,
  PieChart,
  LayoutDashboard,
} from "lucide-react";

const DATE_RANGES = [
  { label: "7 Days", days: 7 },
  { label: "14 Days", days: 14 },
  { label: "30 Days", days: 30 },
  { label: "60 Days", days: 60 },
] as const;

export default function OverviewPage() {
  const [days, setDays] = useState(7);

  const metricsQuery = trpc.overview.getMetricCards.useQuery({ days });
  const trendQuery = trpc.overview.getSalesTrend.useQuery({ days });
  const productsQuery = trpc.overview.getProductBreakdown.useQuery({ days });

  const m = metricsQuery.data;
  const hasData =
    m !== undefined &&
    (m.totalSales > 0 || m.totalSpend > 0 || m.totalOrders > 0);

  return (
    <div>
      <PageHeader
        title="Executive Control Panel"
        description="Real-time overview of PPC performance across all brands and marketplaces."
        action={
          <div className="flex items-center gap-1">
            {DATE_RANGES.map((range) => (
              <Button
                key={range.days}
                variant={days === range.days ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(range.days)}
              >
                {range.label}
              </Button>
            ))}
          </div>
        }
      />

      {/* Loading state */}
      {metricsQuery.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!metricsQuery.isLoading && !hasData && (
        <EmptyState
          icon={LayoutDashboard}
          title="No data yet"
          description="Import a CSV or connect your Amazon Advertising API to populate the dashboard with live data."
          actionLabel="Go to Settings"
        />
      )}

      {/* Data state */}
      {!metricsQuery.isLoading && hasData && m && (
        <div className="space-y-6">
          {/* Section 1: Metric Cards Grid - 3 rows x 4 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Row 1 */}
            <MetricCard
              label="Total Sales"
              value={formatCurrency(m.totalSales)}
              icon={<DollarSign className="h-4 w-4" />}
              variant="success"
            />
            <MetricCard
              label="PPC Sales"
              value={formatCurrency(m.ppcSales)}
              icon={<Target className="h-4 w-4" />}
            />
            <MetricCard
              label="Total Spend"
              value={formatCurrency(m.totalSpend)}
              icon={<ShoppingCart className="h-4 w-4" />}
              variant={m.totalSpend > m.totalSales * 0.5 ? "danger" : "default"}
            />
            <MetricCard
              label="ACOS"
              value={formatPercent(m.acos)}
              icon={<Percent className="h-4 w-4" />}
              variant={m.acos > 50 ? "danger" : m.acos > 25 ? "warning" : "success"}
            />

            {/* Row 2 */}
            <MetricCard
              label="Total Orders"
              value={formatNumber(m.totalOrders)}
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <MetricCard
              label="Avg AOV"
              value={formatCurrency(m.avgAov)}
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <MetricCard
              label="PPC Impressions"
              value={formatNumber(m.ppcImpressions)}
              icon={<Eye className="h-4 w-4" />}
            />
            <MetricCard
              label="PPC CTR"
              value={formatPercent(m.ppcCtr)}
              icon={<MousePointerClick className="h-4 w-4" />}
            />

            {/* Row 3 */}
            <MetricCard
              label="Organic Order %"
              value={formatPercent(m.organicOrderPct)}
              icon={<PieChart className="h-4 w-4" />}
            />
            <MetricCard
              label="PPC Order %"
              value={formatPercent(m.ppcOrderPct)}
              icon={<PieChart className="h-4 w-4" />}
            />
            <MetricCard
              label="WAS %"
              value={formatPercent(m.wasPct)}
              icon={<Zap className="h-4 w-4" />}
              variant={m.wasPct > 40 ? "danger" : m.wasPct > 20 ? "warning" : "success"}
            />
            <MetricCard
              label="Sales Velocity"
              value={`${formatCurrency(m.dailySalesVelocity)}/d`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          {/* Section 2: Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesTrendChart
              data={trendQuery.data ?? []}
              isLoading={trendQuery.isLoading}
            />
            <AcosTrendChart
              data={trendQuery.data ?? []}
              isLoading={trendQuery.isLoading}
            />
          </div>

          {/* Section 3: Product Breakdown Table */}
          <ProductTable
            data={productsQuery.data ?? []}
            isLoading={productsQuery.isLoading}
          />
        </div>
      )}
    </div>
  );
}
