"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatPercent } from "@/lib/calculations";
import { Target, AlertTriangle, TrendingUp, Zap, ExternalLink } from "lucide-react";
import Link from "next/link";

const DATE_RANGES = [
  { label: "7 Days", days: 7 },
  { label: "14 Days", days: 14 },
  { label: "30 Days", days: 30 },
] as const;

type Segment = "CRITICAL" | "OPTIMIZATION" | "SCALE";
type GateStatus = "PASS" | "WARN" | "FAIL";

const SEGMENT_CONFIG: Record<
  Segment,
  { label: string; color: string; border: string; bg: string; icon: string }
> = {
  CRITICAL: {
    label: "CRITICAL",
    color: "text-red-400",
    border: "border-red-500/50",
    bg: "bg-red-500/10",
    icon: "text-red-500",
  },
  OPTIMIZATION: {
    label: "OPTIMIZATION",
    color: "text-yellow-400",
    border: "border-yellow-500/50",
    bg: "bg-yellow-500/10",
    icon: "text-yellow-500",
  },
  SCALE: {
    label: "SCALE",
    color: "text-green-400",
    border: "border-green-500/50",
    bg: "bg-green-500/10",
    icon: "text-green-500",
  },
};

function GateIcon({ status }: { status: GateStatus }) {
  switch (status) {
    case "PASS":
      return <span className="text-green-400" title="Pass">&#10003;</span>;
    case "WARN":
      return <span className="text-yellow-400" title="Warning">&#9888;</span>;
    case "FAIL":
      return <span className="text-red-400" title="Fail">&#10007;</span>;
  }
}

function SegmentBadge({ segment }: { segment: Segment }) {
  const config = SEGMENT_CONFIG[segment];
  return (
    <Badge
      variant="outline"
      className={`${config.border} ${config.color} ${config.bg} text-xs font-semibold`}
    >
      {config.label}
    </Badge>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const colors: Record<string, string> = {
    launch: "border-blue-500/50 text-blue-400 bg-blue-500/10",
    growth: "border-purple-500/50 text-purple-400 bg-purple-500/10",
    maintenance: "border-zinc-500/50 text-zinc-400 bg-zinc-500/10",
  };
  return (
    <Badge variant="outline" className={`text-xs ${colors[stage] ?? colors.launch}`}>
      {stage.toUpperCase()}
    </Badge>
  );
}

export default function ActionPlanPage() {
  const [days, setDays] = useState(7);

  const { data: plans, isLoading } = trpc.actionPlan.getActionPlan.useQuery({
    days,
  });

  // Compute segment summaries
  const criticalPlans = plans?.filter((p) => p.segment === "CRITICAL") ?? [];
  const optimizationPlans = plans?.filter((p) => p.segment === "OPTIMIZATION") ?? [];
  const scalePlans = plans?.filter((p) => p.segment === "SCALE") ?? [];

  const criticalSpend = criticalPlans.reduce((s, p) => s + p.totalSpend, 0);
  const optimizationRevenue = optimizationPlans.reduce((s, p) => s + p.totalSales, 0);
  const scaleRevenue = scalePlans.reduce((s, p) => s + p.totalSales, 0);

  return (
    <div>
      <PageHeader
        title="Action Plan Engine"
        description="PPC Master Framework — products classified into CRITICAL, OPTIMIZATION, and SCALE segments with recommended actions."
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

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-semibold text-red-400">CRITICAL</span>
              </div>
              <div className="text-2xl font-bold text-red-400">
                {criticalPlans.length} products
              </div>
              <div className="text-xs text-red-400/70">
                {formatCurrency(criticalSpend)} burn ({days}d)
              </div>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-semibold text-yellow-400">OPTIMIZATION</span>
              </div>
              <div className="text-2xl font-bold text-yellow-400">
                {optimizationPlans.length} products
              </div>
              <div className="text-xs text-yellow-400/70">
                {formatCurrency(optimizationRevenue)} revenue ({days}d)
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm font-semibold text-green-400">SCALE</span>
              </div>
              <div className="text-2xl font-bold text-green-400">
                {scalePlans.length} products
              </div>
              <div className="text-xs text-green-400/70">
                {formatCurrency(scaleRevenue)} revenue ({days}d)
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product Cards */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !plans || plans.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No Action Plan Data"
          description="Import PPC data to generate product action plans. The engine classifies products into CRITICAL, OPTIMIZATION, and SCALE segments."
        />
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => {
            const config = SEGMENT_CONFIG[plan.segment];
            return (
              <Card
                key={plan.productId}
                className={`${config.border} border-l-4`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">
                        {plan.productName}
                      </CardTitle>
                      <StageBadge stage={plan.stage} />
                      <SegmentBadge segment={plan.segment} />
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {plan.parentAsin}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span>
                      Profitability <GateIcon status={plan.profitabilityGate} />
                    </span>
                    <span>
                      Inventory <GateIcon status={plan.inventoryGate} />
                    </span>
                    <span className="text-muted-foreground/60">
                      Brand: {plan.brand}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Metrics Row */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Sales</div>
                      <div className="font-semibold">
                        {formatCurrency(plan.totalSales)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Spend</div>
                      <div className="font-semibold">
                        {formatCurrency(plan.totalSpend)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">ACOS</div>
                      <div
                        className={`font-semibold ${
                          plan.acos > plan.breakevenAcos
                            ? "text-red-400"
                            : "text-green-400"
                        }`}
                      >
                        {formatPercent(plan.acos)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">TACOS</div>
                      <div
                        className={`font-semibold ${
                          plan.tacos > 25
                            ? "text-red-400"
                            : plan.tacos > 15
                              ? "text-yellow-400"
                              : "text-green-400"
                        }`}
                      >
                        {formatPercent(plan.tacos)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">
                        Organic
                      </div>
                      <div className="font-semibold">
                        {formatPercent(plan.organicOrderPct)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">WAS</div>
                      <div
                        className={`font-semibold ${
                          plan.wasPct > 50
                            ? "text-red-400"
                            : plan.wasPct > 30
                              ? "text-yellow-400"
                              : "text-green-400"
                        }`}
                      >
                        {formatPercent(plan.wasPct)}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Reasons */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Why this classification
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {plan.reasons.map((reason, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className={config.icon}>&#8226;</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Separator />

                  {/* Recommended Actions */}
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                      Recommended Actions
                    </div>
                    <div className="space-y-1">
                      {plan.actions.map((action, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-xs"
                        >
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 shrink-0 mt-0.5"
                          >
                            {action.priority}
                          </Badge>
                          <span className="text-muted-foreground">
                            {action.action}
                          </span>
                          <span className="text-muted-foreground/50 ml-auto shrink-0">
                            {action.sopReference}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    <Link href={`/keywords?productId=${plan.productId}`}>
                      <Button variant="outline" size="sm" className="text-xs h-7">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Keywords
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
