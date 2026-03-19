"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";

const MATCH_TYPES = [
  { value: "EXACT", label: "Exact" },
  { value: "PHRASE", label: "Phrase" },
  { value: "BROAD", label: "Broad" },
  { value: "AUTO", label: "Auto" },
] as const;

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
] as const;

export interface KeywordFilterValues {
  search: string;
  matchTypes: string[];
  minSpend: number | undefined;
  maxSpend: number | undefined;
  minAcos: number | undefined;
  maxAcos: number | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
}

export function parseFiltersFromParams(
  searchParams: URLSearchParams
): KeywordFilterValues {
  const matchTypesParam = searchParams.get("matchTypes");
  return {
    search: searchParams.get("search") ?? "",
    matchTypes: matchTypesParam ? matchTypesParam.split(",") : [],
    minSpend: searchParams.get("minSpend")
      ? Number(searchParams.get("minSpend"))
      : undefined,
    maxSpend: searchParams.get("maxSpend")
      ? Number(searchParams.get("maxSpend"))
      : undefined,
    minAcos: searchParams.get("minAcos")
      ? Number(searchParams.get("minAcos"))
      : undefined,
    maxAcos: searchParams.get("maxAcos")
      ? Number(searchParams.get("maxAcos"))
      : undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
  };
}

interface KeywordFiltersProps {
  filters: KeywordFilterValues;
  onFiltersChange: (filters: KeywordFilterValues) => void;
}

export function KeywordFilters({
  filters,
  onFiltersChange,
}: KeywordFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateURL = useCallback(
    (newFilters: KeywordFilterValues) => {
      const params = new URLSearchParams(searchParams.toString());

      // Update or remove each filter param
      if (newFilters.search) {
        params.set("search", newFilters.search);
      } else {
        params.delete("search");
      }

      if (newFilters.matchTypes.length > 0) {
        params.set("matchTypes", newFilters.matchTypes.join(","));
      } else {
        params.delete("matchTypes");
      }

      if (newFilters.minSpend !== undefined) {
        params.set("minSpend", String(newFilters.minSpend));
      } else {
        params.delete("minSpend");
      }

      if (newFilters.maxSpend !== undefined) {
        params.set("maxSpend", String(newFilters.maxSpend));
      } else {
        params.delete("maxSpend");
      }

      if (newFilters.minAcos !== undefined) {
        params.set("minAcos", String(newFilters.minAcos));
      } else {
        params.delete("minAcos");
      }

      if (newFilters.maxAcos !== undefined) {
        params.set("maxAcos", String(newFilters.maxAcos));
      } else {
        params.delete("maxAcos");
      }

      if (newFilters.dateFrom) {
        params.set("dateFrom", newFilters.dateFrom);
      } else {
        params.delete("dateFrom");
      }

      if (newFilters.dateTo) {
        params.set("dateTo", newFilters.dateTo);
      } else {
        params.delete("dateTo");
      }

      // Reset to page 1 when filters change
      params.delete("page");

      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const update = useCallback(
    (patch: Partial<KeywordFilterValues>) => {
      const next = { ...filters, ...patch };
      onFiltersChange(next);
      updateURL(next);
    },
    [filters, onFiltersChange, updateURL]
  );

  const toggleMatchType = useCallback(
    (mt: string) => {
      const current = filters.matchTypes;
      const next = current.includes(mt)
        ? current.filter((v) => v !== mt)
        : [...current, mt];
      update({ matchTypes: next });
    },
    [filters.matchTypes, update]
  );

  const setDateRange = useCallback(
    (days: number) => {
      const dateTo = new Date().toISOString().split("T")[0]!;
      const from = new Date();
      from.setDate(from.getDate() - days);
      const dateFrom = from.toISOString().split("T")[0]!;
      update({ dateFrom, dateTo });
    },
    [update]
  );

  const clearFilters = useCallback(() => {
    const cleared: KeywordFilterValues = {
      search: "",
      matchTypes: [],
      minSpend: undefined,
      maxSpend: undefined,
      minAcos: undefined,
      maxAcos: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    };
    onFiltersChange(cleared);
    updateURL(cleared);
  }, [onFiltersChange, updateURL]);

  const hasActiveFilters =
    filters.search ||
    filters.matchTypes.length > 0 ||
    filters.minSpend !== undefined ||
    filters.maxSpend !== undefined ||
    filters.minAcos !== undefined ||
    filters.maxAcos !== undefined ||
    filters.dateFrom !== undefined;

  // Determine active date range button
  const activeDateRange = (() => {
    if (!filters.dateFrom || !filters.dateTo) return null;
    for (const dr of DATE_RANGES) {
      const from = new Date();
      from.setDate(from.getDate() - dr.days);
      if (filters.dateFrom === from.toISOString().split("T")[0]) return dr.days;
    }
    return null;
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs text-muted-foreground mb-1 block">
            Search Keywords
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search keyword text..."
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
              className="pl-9 h-8"
            />
          </div>
        </div>

        {/* Match Type */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">
            Match Type
          </Label>
          <div className="flex gap-1">
            {MATCH_TYPES.map((mt) => (
              <Button
                key={mt.value}
                variant={
                  filters.matchTypes.includes(mt.value) ? "default" : "outline"
                }
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => toggleMatchType(mt.value)}
              >
                {mt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">
            Date Range
          </Label>
          <div className="flex gap-1">
            {DATE_RANGES.map((dr) => (
              <Button
                key={dr.days}
                variant={activeDateRange === dr.days ? "default" : "outline"}
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setDateRange(dr.days)}
              >
                {dr.label}
              </Button>
            ))}
          </div>
        </div>

        {/* ACOS Range */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">
            ACOS %
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              placeholder="Min"
              value={filters.minAcos ?? ""}
              onChange={(e) =>
                update({
                  minAcos: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-16 h-8 text-xs"
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxAcos ?? ""}
              onChange={(e) =>
                update({
                  maxAcos: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-16 h-8 text-xs"
            />
          </div>
        </div>

        {/* Spend Range */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">
            Spend $
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              placeholder="Min"
              value={filters.minSpend ?? ""}
              onChange={(e) =>
                update({
                  minSpend: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-16 h-8 text-xs"
            />
            <span className="text-muted-foreground text-xs">-</span>
            <Input
              type="number"
              placeholder="Max"
              value={filters.maxSpend ?? ""}
              onChange={(e) =>
                update({
                  maxSpend: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              className="w-16 h-8 text-xs"
            />
          </div>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={clearFilters}
          >
            <X className="size-3.5 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
