"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

const variantStyles: Record<string, string> = {
  default: "",
  success: "ring-green-500/20",
  warning: "ring-yellow-500/20",
  danger: "ring-red-500/20",
};

const trendColors = {
  up: "text-green-600",
  down: "text-red-600",
  neutral: "text-muted-foreground",
};

export function MetricCard({
  label,
  value,
  trend,
  trendLabel,
  icon,
  variant = "default",
}: MetricCardProps) {
  const trendDirection =
    trend === undefined || trend === 0
      ? "neutral"
      : trend > 0
        ? "up"
        : "down";

  return (
    <Card size="sm" className={cn(variantStyles[variant])}>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          {icon && (
            <div className="text-muted-foreground">{icon}</div>
          )}
        </div>
        <div className="mt-2">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </div>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 mt-1 text-xs", trendColors[trendDirection])}>
            {trendDirection === "up" && <TrendingUp className="h-3 w-3" />}
            {trendDirection === "down" && <TrendingDown className="h-3 w-3" />}
            {trendDirection === "neutral" && <Minus className="h-3 w-3" />}
            <span>
              {trend > 0 ? "+" : ""}
              {trend.toFixed(1)}%
            </span>
            {trendLabel && (
              <span className="text-muted-foreground">{trendLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricCardSkeleton() {
  return (
    <Card size="sm">
      <CardContent className="pt-0">
        <div className="h-3 w-20 bg-muted animate-pulse rounded" />
        <div className="h-8 w-28 bg-muted animate-pulse rounded mt-2" />
        <div className="h-3 w-16 bg-muted animate-pulse rounded mt-2" />
      </CardContent>
    </Card>
  );
}
