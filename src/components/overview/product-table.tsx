"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/calculations";

interface ProductRow {
  productId: number;
  productName: string;
  parentAsin: string;
  brandName: string;
  currentStage: string;
  basePrice: number | null;
  sales: number;
  spend: number;
  orders: number;
  acos: number;
  tacos: number;
  organicPct: number;
  velocity: number;
}

interface ProductTableProps {
  data: ProductRow[];
  isLoading?: boolean;
}

type SortKey = keyof ProductRow;
type SortDir = "asc" | "desc";

const stageVariant: Record<string, "default" | "secondary" | "outline"> = {
  launch: "default",
  growth: "secondary",
  maintenance: "outline",
};

function acosColor(acos: number): string {
  if (acos === 0) return "";
  if (acos < 25) return "text-green-600";
  if (acos < 50) return "text-yellow-600";
  return "text-red-600";
}

export function ProductTable({ data, isLoading }: ProductTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }
    const numA = Number(aVal);
    const numB = Number(bVal);
    return sortDir === "asc" ? numA - numB : numB - numA;
  });

  function SortableHead({
    label,
    column,
    className,
  }: {
    label: string;
    column: SortKey;
    className?: string;
  }) {
    return (
      <TableHead
        className={cn("cursor-pointer select-none", className)}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {label}
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
        </div>
      </TableHead>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 bg-muted animate-pulse rounded"
              />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No product data available
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Product" column="productName" />
                <TableHead>ASIN</TableHead>
                <SortableHead label="Brand" column="brandName" />
                <TableHead>Stage</TableHead>
                <SortableHead label="7d Sales" column="sales" className="text-right" />
                <SortableHead label="7d Spend" column="spend" className="text-right" />
                <SortableHead label="ACOS" column="acos" className="text-right" />
                <SortableHead label="TACOS" column="tacos" className="text-right" />
                <SortableHead label="Orders" column="orders" className="text-right" />
                <SortableHead label="Organic %" column="organicPct" className="text-right" />
                <SortableHead label="Velocity" column="velocity" className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {row.productName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.parentAsin}
                  </TableCell>
                  <TableCell>{row.brandName}</TableCell>
                  <TableCell>
                    <Badge variant={stageVariant[row.currentStage] ?? "outline"}>
                      {row.currentStage}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.sales)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.spend)}
                  </TableCell>
                  <TableCell className={cn("text-right font-medium", acosColor(row.acos))}>
                    {formatPercent(row.acos)}
                  </TableCell>
                  <TableCell className={cn("text-right", acosColor(row.tacos))}>
                    {formatPercent(row.tacos)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.orders)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(row.organicPct)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.velocity)}/d
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
