"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Code,
  Loader2,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// --- Formatting helpers ---
function fmtCurrency(val: number): string {
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(val: number): string {
  return `${val.toFixed(2)}%`;
}
function fmtNumber(val: number): string {
  return val.toLocaleString("en-US");
}
function acosColor(acos: number): string {
  if (acos === 0) return "text-muted-foreground";
  if (acos < 25) return "text-emerald-400";
  if (acos <= 50) return "text-amber-400";
  return "text-red-400";
}

const classificationColors: Record<string, string> = {
  material_size: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  branded: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  competitor: "bg-red-500/20 text-red-400 border-red-500/30",
  generic: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  irrelevant: "bg-zinc-800/50 text-zinc-500 border-zinc-700",
  unclassified: "bg-zinc-800/50 text-zinc-500 border-zinc-700",
};

function ClassificationBadge({ value }: { value: string }) {
  const colors = classificationColors[value] ?? classificationColors.unclassified;
  return (
    <Badge variant="outline" className={`text-[10px] ${colors}`}>
      {value.replace("_", " ")}
    </Badge>
  );
}

// --- Sortable column types ---
type SortField =
  | "syntaxLabel"
  | "rootTerm"
  | "classification"
  | "impressions"
  | "clicks"
  | "ctr"
  | "spend"
  | "sales"
  | "orders"
  | "cvr"
  | "acos"
  | "wasPct"
  | "keywordCount";

// --- Campaign sub-row ---
function CampaignRows({
  keywordText,
  productId,
  days,
}: {
  keywordText: string;
  productId?: number;
  days: number;
}) {
  const { data, isLoading } = trpc.syntax.getCampaigns.useQuery({
    keywordText,
    productId,
    days,
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="py-3 pl-20 text-muted-foreground">
          <Loader2 className="size-4 animate-spin inline mr-2" />
          Loading campaigns...
        </TableCell>
      </TableRow>
    );
  }

  if (!data?.items.length) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="py-3 pl-20 text-muted-foreground text-xs">
          No campaign data found.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow className="bg-zinc-900/30">
        <TableCell colSpan={2} className="pl-20 text-[10px] font-semibold uppercase text-zinc-500">
          Campaign
        </TableCell>
        <TableCell className="text-[10px] font-semibold uppercase text-zinc-500">Ad Group</TableCell>
        <TableCell className="text-[10px] font-semibold uppercase text-zinc-500">Match</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">Spend</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">Sales</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">ACOS</TableCell>
        <TableCell />
      </TableRow>
      {data.items.map((c, idx) => (
        <TableRow key={`${c.campaignName}-${c.adGroupName}-${idx}`} className="bg-zinc-900/20">
          <TableCell colSpan={2} className="pl-20 text-xs truncate max-w-[200px]">
            {c.campaignName}
          </TableCell>
          <TableCell className="text-xs truncate max-w-[150px] text-muted-foreground">
            {c.adGroupName}
          </TableCell>
          <TableCell>
            <Badge variant="outline" className="text-[10px]">{c.matchType}</Badge>
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">{fmtCurrency(c.spend)}</TableCell>
          <TableCell className="text-right tabular-nums text-xs">{fmtCurrency(c.sales)}</TableCell>
          <TableCell className={`text-right tabular-nums text-xs ${acosColor(c.acos)}`}>{fmtPct(c.acos)}</TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

// --- Keyword sub-row ---
function KeywordRows({
  syntaxGroupId,
  productId,
  days,
}: {
  syntaxGroupId: number;
  productId?: number;
  days: number;
}) {
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);
  const { data, isLoading } = trpc.syntax.getKeywords.useQuery({
    syntaxGroupId,
    productId,
    days,
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={13} className="py-3 pl-12 text-muted-foreground">
          <Loader2 className="size-4 animate-spin inline mr-2" />
          Loading keywords...
        </TableCell>
      </TableRow>
    );
  }

  if (!data?.items.length) {
    return (
      <TableRow>
        <TableCell colSpan={13} className="py-3 pl-12 text-muted-foreground text-xs">
          No keyword data found.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow className="bg-zinc-900/50">
        <TableCell className="pl-12 text-[10px] font-semibold uppercase text-zinc-500">Keyword</TableCell>
        <TableCell className="text-[10px] font-semibold uppercase text-zinc-500">Match</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">Campaigns</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">Impressions</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">Clicks</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">Spend</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">Sales</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">CTR</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">CVR</TableCell>
        <TableCell className="text-right text-[10px] font-semibold uppercase text-zinc-500">ACOS</TableCell>
        <TableCell colSpan={3} />
      </TableRow>
      {data.items.map((kw, idx) => {
        const kwKey = `${kw.keywordText}-${kw.matchType}`;
        const isExpanded = expandedKeyword === kwKey;
        return (
          <Fragment key={`${kwKey}-${idx}`}>
            <TableRow
              className="bg-zinc-900/30 cursor-pointer hover:bg-zinc-800/50"
              onClick={() => setExpandedKeyword(isExpanded ? null : kwKey)}
            >
              <TableCell className="pl-12 text-xs font-medium truncate max-w-[200px]">
                <span className="inline-flex items-center gap-1">
                  {isExpanded ? (
                    <ChevronDown className="size-3 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 text-zinc-500" />
                  )}
                  {kw.keywordText}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">{kw.matchType}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                {kw.campaignCount}
              </TableCell>
              <TableCell className="text-right tabular-nums text-xs">{fmtNumber(kw.impressions)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{fmtNumber(kw.clicks)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{fmtCurrency(kw.spend)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{fmtCurrency(kw.sales)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{fmtPct(kw.ctr)}</TableCell>
              <TableCell className="text-right tabular-nums text-xs">{fmtPct(kw.cvr)}</TableCell>
              <TableCell className={`text-right tabular-nums text-xs ${acosColor(kw.acos)}`}>{fmtPct(kw.acos)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
            {isExpanded && (
              <CampaignRows keywordText={kw.keywordText} productId={productId} days={days} />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

// Need Fragment import
import { Fragment } from "react";

// --- Main content ---
function SyntaxContent() {
  const [productId, setProductId] = useState<number | undefined>(undefined);
  const [days, setDays] = useState(7);
  const [classification, setClassification] = useState("all");
  const [expandedSyntax, setExpandedSyntax] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortField>("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: productsData } = trpc.products.list.useQuery({ pageSize: 100 });

  const { data, isLoading } = trpc.syntax.list.useQuery({
    productId,
    days,
    classification,
  });

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortDir("desc");
      }
    },
    [sortBy]
  );

  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    const items = [...data.items];
    items.sort((a, b) => {
      const aVal = a[sortBy as keyof typeof a];
      const bVal = b[sortBy as keyof typeof b];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = Number(aVal) || 0;
      const numB = Number(bVal) || 0;
      return sortDir === "asc" ? numA - numB : numB - numA;
    });
    return items;
  }, [data?.items, sortBy, sortDir]);

  // Summary cards
  const summary = useMemo(() => {
    if (!data?.items) return { syntaxes: 0, keywords: 0, spend: 0, acos: 0 };
    const totalSpend = data.items.reduce((s, i) => s + i.spend, 0);
    const totalSales = data.items.reduce((s, i) => s + i.sales, 0);
    return {
      syntaxes: data.items.length,
      keywords: data.items.reduce((s, i) => s + i.keywordCount, 0),
      spend: totalSpend,
      acos: totalSales > 0 ? (totalSpend / totalSales) * 100 : 0,
    };
  }, [data?.items]);

  const SortIcon = useCallback(
    ({ field }: { field: SortField }) => {
      if (sortBy !== field) return <ArrowUpDown className="size-3 ml-1 opacity-30" />;
      return sortDir === "asc" ? <ArrowUp className="size-3 ml-1" /> : <ArrowDown className="size-3 ml-1" />;
    },
    [sortBy, sortDir]
  );

  const isEmpty = data && data.items.length === 0;

  const columns: { field: SortField; label: string; align?: "right" }[] = [
    { field: "syntaxLabel", label: "Syntax Label" },
    { field: "rootTerm", label: "Root" },
    { field: "classification", label: "Classification" },
    { field: "impressions", label: "Impressions", align: "right" },
    { field: "clicks", label: "Clicks", align: "right" },
    { field: "ctr", label: "CTR", align: "right" },
    { field: "spend", label: "Spend", align: "right" },
    { field: "sales", label: "Sales", align: "right" },
    { field: "orders", label: "Orders", align: "right" },
    { field: "cvr", label: "CVR", align: "right" },
    { field: "acos", label: "ACOS", align: "right" },
    { field: "wasPct", label: "WAS%", align: "right" },
    { field: "keywordCount", label: "Keywords", align: "right" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Syntax Analysis"
        description="Analyze keyword syntax groups and their PPC performance metrics."
      />

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={productId?.toString() ?? "all"}
              onValueChange={(v) => {
                setProductId(v === "all" ? undefined : Number(v));
                setExpandedSyntax(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {productsData?.items.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={days.toString()} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
              </SelectContent>
            </Select>

            <Select value={classification} onValueChange={(v) => setClassification(v ?? "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classifications</SelectItem>
                <SelectItem value="material_size">Material | Size</SelectItem>
                <SelectItem value="branded">Branded</SelectItem>
                <SelectItem value="generic">Generic</SelectItem>
                <SelectItem value="competitor">Competitor</SelectItem>
                <SelectItem value="irrelevant">Irrelevant</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Syntaxes</p>
            <p className="text-2xl font-bold tabular-nums">{fmtNumber(summary.syntaxes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Keywords</p>
            <p className="text-2xl font-bold tabular-nums">{fmtNumber(summary.keywords)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Spend</p>
            <p className="text-2xl font-bold tabular-nums">{fmtCurrency(summary.spend)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Avg ACOS</p>
            <p className={`text-2xl font-bold tabular-nums ${acosColor(summary.acos)}`}>
              {fmtPct(summary.acos)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main table */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <EmptyState
          icon={Code}
          title="No syntax data yet"
          description="Syntax groups will appear here once keywords are classified and metrics are synced."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
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
                {sortedItems.map((item, idx) => {
                  const isExpanded = expandedSyntax === (item.syntaxGroupId ?? idx);
                  const rowKey = item.syntaxGroupId ?? idx;

                  return (
                    <Fragment key={rowKey}>
                      <TableRow
                        className="cursor-pointer hover:bg-zinc-900/50"
                        onClick={() =>
                          setExpandedSyntax(isExpanded ? null : (item.syntaxGroupId ?? idx))
                        }
                      >
                        <TableCell className="w-8 text-center">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-zinc-500" />
                          ) : (
                            <ChevronRight className="size-4 text-zinc-500" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium truncate max-w-[180px]">
                          {item.syntaxLabel}
                        </TableCell>
                        <TableCell className="text-muted-foreground truncate max-w-[120px]">
                          {item.rootTerm}
                        </TableCell>
                        <TableCell>
                          <ClassificationBadge value={item.classification} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNumber(item.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNumber(item.clicks)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(item.ctr)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtCurrency(item.spend)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtCurrency(item.sales)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNumber(item.orders)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(item.cvr)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${acosColor(item.acos)}`}>
                          {fmtPct(item.acos)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmtPct(item.wasPct)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNumber(item.keywordCount)}</TableCell>
                      </TableRow>
                      {isExpanded && item.syntaxGroupId != null && (
                        <KeywordRows
                          syntaxGroupId={item.syntaxGroupId}
                          productId={productId}
                          days={days}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SyntaxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SyntaxContent />
    </Suspense>
  );
}
