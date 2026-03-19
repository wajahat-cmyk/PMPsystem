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

interface AcosTrendDataPoint {
  date: string;
  acos: number;
  tacos: number;
}

interface AcosTrendChartProps {
  data: AcosTrendDataPoint[];
  isLoading?: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AcosTrendChart({ data, isLoading }: AcosTrendChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    dateLabel: formatDate(d.date),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>ACOS / TACOS Trend</CardTitle>
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
                tickFormatter={(value: number) => `${value.toFixed(0)}%`}
                className="fill-muted-foreground"
              />
              <Tooltip
                formatter={(value) =>
                  `${Number(value ?? 0).toFixed(2)}%`
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
                dataKey="acos"
                name="ACOS"
                stroke="hsl(25, 95%, 53%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="tacos"
                name="TACOS"
                stroke="hsl(280, 67%, 51%)"
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
