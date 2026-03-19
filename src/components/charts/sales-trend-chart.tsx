"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SalesTrendDataPoint {
  date: string;
  totalSales: number;
  ppcSales: number;
  organicSales: number;
  spend: number;
}

interface SalesTrendChartProps {
  data: SalesTrendDataPoint[];
  isLoading?: boolean;
}

function formatCurrencyShort(value: number): string {
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function SalesTrendChart({ data, isLoading }: SalesTrendChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="h-full w-full bg-muted/50 animate-pulse rounded" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="dateLabel"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                className="fill-muted-foreground"
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCurrencyShort}
                className="fill-muted-foreground"
              />
              <Tooltip
                formatter={(value) =>
                  `$${Number(value ?? 0).toFixed(2)}`
                }
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="totalSales"
                name="Total Sales"
                stroke="hsl(142, 76%, 36%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="ppcSales"
                name="PPC Sales"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="spend"
                name="Spend"
                stroke="hsl(0, 84%, 60%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
