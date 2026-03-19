"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  KeywordFilters,
  parseFiltersFromParams,
  type KeywordFilterValues,
} from "@/components/keywords/keyword-filters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";

type SortField =
  | "keywordText"
  | "matchType"
  | "campaignName"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "spend"
  | "sales"
  | "orders"
  | "cvr"
  | "acos"
  | "roas";

// Formatting helpers
function fmtCurrency(val: number): string {
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(val: number): string {
  return `${val.toFixed(2)}%`;
}

function fmtNumber(val: number): string {
  return val.toLocaleString("en-US");
}

function fmtRoas(val: number): string {
  return `${val.toFixed(2)}x`;
}

function acosColor(acos: number): string {
  if (acos < 25) return "text-emerald-600 dark:text-emerald-400";
  if (acos <= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function cvrColor(cvr: number): string {
  if (cvr > 10) return "text-emerald-600 dark:text-emerald-400";
  if (cvr >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function KeywordsContent() {
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<KeywordFilterValues>(() =>
    parseFiltersFromParams(searchParams)
  );

  const [sortBy, setSortBy] = useState<SortField>(
    (searchParams.get("sortBy") as SortField) || "spend"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    (searchParams.get("sortDir") as "asc" | "desc") || "desc"
  );
  const [page, setPage] = useState(
    Number(searchParams.get("page")) || 1
  );
  const pageSize = 25;

  const queryInput = useMemo(
    () => ({
      page,
      pageSize,
      sortBy,
      sortDir,
      search: filters.search || undefined,
      matchTypes:
        filters.matchTypes.length > 0 ? filters.matchTypes : undefined,
      minSpend: filters.minSpend,
      maxSpend: filters.maxSpend,
      minAcos: filters.minAcos,
      maxAcos: filters.maxAcos,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    }),
    [page, sortBy, sortDir, filters]
  );

  const { data, isLoading } = trpc.keywords.list.useQuery(queryInput);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortDir("desc");
      }
      setPage(1);
    },
    [sortBy]
  );

  const handleFiltersChange = useCallback((next: KeywordFilterValues) => {
    setFilters(next);
    setPage(1);
  }, []);

  const SortIcon = useCallback(
    ({ field }: { field: SortField }) => {
      if (sortBy !== field) {
        return <ArrowUpDown className="size-3 ml-1 opacity-30" />;
      }
      return sortDir === "asc" ? (
        <ArrowUp className="size-3 ml-1" />
      ) : (
        <ArrowDown className="size-3 ml-1" />
      );
    },
    [sortBy, sortDir]
  );

  const handleExportCSV = useCallback(() => {
    if (!data?.items?.length) return;

    const headers = [
      "Keyword",
      "Match Type",
      "Campaign",
      "Impressions",
      "Clicks",
      "CTR",
      "CPC",
      "Spend",
      "Sales",
      "Orders",
      "CVR",
      "ACOS",
      "ROAS",
    ];

    const rows = data.items.map((item) => [
      `"${item.keywordText.replace(/"/g, '""')}"`,
      item.matchType,
      `"${item.campaignName.replace(/"/g, '""')}"`,
      item.impressions,
      item.clicks,
      `${item.ctr}%`,
      `$${item.cpc}`,
      `$${item.spend}`,
      `$${item.sales}`,
      item.orders,
      `${item.cvr}%`,
      `${item.acos}%`,
      `${item.roas}x`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keywords-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;
  const hasData = data && data.items.length > 0;
  const isEmpty = data && data.items.length === 0 && data.total === 0;

  const columns: { field: SortField; label: string; align?: "right" }[] = [
    { field: "keywordText", label: "Keyword" },
    { field: "matchType", label: "Match Type" },
    { field: "campaignName", label: "Campaign" },
    { field: "impressions", label: "Impressions", align: "right" },
    { field: "clicks", label: "Clicks", align: "right" },
    { field: "ctr", label: "CTR", align: "right" },
    { field: "cpc", label: "CPC", align: "right" },
    { field: "spend", label: "Spend", align: "right" },
    { field: "sales", label: "Sales", align: "right" },
    { field: "orders", label: "Orders", align: "right" },
    { field: "cvr", label: "CVR", align: "right" },
    { field: "acos", label: "ACOS", align: "right" },
    { field: "roas", label: "ROAS", align: "right" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Keyword Engine"
        description="Discover, analyze, and manage keywords across all campaigns."
        action={
          hasData ? (
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="size-4 mr-1.5" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="pt-4">
          <KeywordFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <EmptyState
          icon={Search}
          title="No keyword data yet"
          description="Keywords will appear here once your data pipeline is configured and the first sync completes."
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((col) => (
                      <TableHead
                        key={col.field}
                        className={`cursor-pointer select-none hover:bg-muted/50 ${col.align === "right" ? "text-right" : ""}`}
                        onClick={() => handleSort(col.field)}
                      >
                        <span className="inline-flex items-center">
                          {col.label}
                          <SortIcon field={col.field} />
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((item, idx) => (
                    <TableRow key={`${item.keywordText}-${item.matchType}-${item.campaignName}-${idx}`}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {item.keywordText}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {item.matchType}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground">
                        {item.campaignName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNumber(item.impressions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNumber(item.clicks)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtPct(item.ctr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCurrency(item.cpc)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtCurrency(item.spend)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmtCurrency(item.sales)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtNumber(item.orders)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${cvrColor(item.cvr)}`}
                      >
                        {fmtPct(item.cvr)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${acosColor(item.acos)}`}
                      >
                        {fmtPct(item.acos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtRoas(item.roas)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, data?.total ?? 0)} of{" "}
                {data?.total ?? 0} keywords
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="size-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="size-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function KeywordsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <KeywordsContent />
    </Suspense>
  );
}
