"use client";

import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/calculations";
import { Package, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";

function StatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "in_stock":
      return (
        <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10 text-xs">
          In Stock
        </Badge>
      );
    case "out_of_stock":
      return (
        <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-500/10 text-xs">
          Out of Stock
        </Badge>
      );
    case "soon_oos":
      return (
        <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-500/10 text-xs">
          Soon OOS
        </Badge>
      );
    case "lif_soon_oos":
      return (
        <Badge variant="outline" className="border-orange-500/50 text-orange-400 bg-orange-500/10 text-xs">
          LIF Soon OOS
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          Unknown
        </Badge>
      );
  }
}

function getRowClass(daysOfStock: number | null, status: string | null): string {
  if (status === "out_of_stock") return "bg-red-500/5";
  if (daysOfStock !== null && daysOfStock < 14) return "bg-red-500/5";
  if (daysOfStock !== null && daysOfStock < 30) return "bg-orange-500/5";
  if (daysOfStock !== null && daysOfStock < 60) return "bg-yellow-500/5";
  return "";
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function InventoryPage() {
  const { data: stats, isLoading: statsLoading } =
    trpc.inventory.getStats.useQuery();
  const { data: items, isLoading: itemsLoading } =
    trpc.inventory.list.useQuery();

  const isLoading = statsLoading || itemsLoading;

  return (
    <div>
      <PageHeader
        title="Inventory Management"
        description="SKU-level inventory tracking with stock levels, coverage, and PPC integration."
      />

      {/* Summary Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <StatCard
            label="Total SKUs"
            value={stats.totalSkus}
            icon={Package}
            color="text-zinc-300"
          />
          <StatCard
            label="In Stock"
            value={stats.inStock}
            icon={CheckCircle}
            color="text-green-400"
          />
          <StatCard
            label="Out of Stock"
            value={stats.outOfStock}
            icon={XCircle}
            color="text-red-400"
          />
          <StatCard
            label="Soon OOS"
            value={stats.soonOos}
            icon={AlertTriangle}
            color="text-orange-400"
          />
          <StatCard
            label="Avg Days of Stock"
            value={`${stats.avgDaysOfStock}d`}
            icon={Clock}
            color="text-zinc-300"
          />
          <StatCard
            label="SKUs <30 Days"
            value={stats.skusUnder30d}
            icon={AlertTriangle}
            color="text-red-400"
          />
          <StatCard
            label="SKUs 30-60 Days"
            value={stats.skusUnder60d}
            icon={AlertTriangle}
            color="text-yellow-400"
          />
        </div>
      ) : null}

      {/* Inventory Table */}
      {itemsLoading ? (
        <Skeleton className="h-96" />
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No Inventory Data"
          description="Import inventory data via CSV or add SKU inventory records to track stock levels and coverage."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs">ASIN</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">
                      FBA Available
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      Days of Stock
                    </TableHead>
                    <TableHead className="text-xs text-center">
                      Targeting?
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      Campaigns
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      7d Sales
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      7d Spend
                    </TableHead>
                    <TableHead className="text-xs text-right">ACOS</TableHead>
                    <TableHead className="text-xs">Reorder Date</TableHead>
                    <TableHead className="text-xs">Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className={getRowClass(
                        item.daysOfStock,
                        item.inventoryStatus
                      )}
                    >
                      <TableCell className="text-xs font-mono">
                        {item.sku}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {item.asin ?? "-"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.inventoryStatus} />
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {item.fbaAvailable ?? 0}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        <span
                          className={
                            item.daysOfStock !== null && item.daysOfStock < 14
                              ? "text-red-400 font-semibold"
                              : item.daysOfStock !== null &&
                                  item.daysOfStock < 30
                                ? "text-orange-400 font-semibold"
                                : item.daysOfStock !== null &&
                                    item.daysOfStock < 60
                                  ? "text-yellow-400"
                                  : "text-green-400"
                          }
                        >
                          {item.daysOfStock ?? "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {item.currentlyTargeting ? (
                          <span className="text-green-400">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {item.campaignCount ?? 0}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {item.sales7d !== null
                          ? formatCurrency(item.sales7d)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {item.spend7d !== null
                          ? formatCurrency(item.spend7d)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {item.acos7d !== null
                          ? formatPercent(item.acos7d * 100)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.reorderDate
                          ? new Date(item.reorderDate).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {item.comment ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
