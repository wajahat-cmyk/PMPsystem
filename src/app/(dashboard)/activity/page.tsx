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
  History,
  Wrench,
  FileEdit,
  MessageSquare,
  Zap,
  Loader2,
  ChevronDown,
} from "lucide-react";

type CategoryFilter =
  | "all"
  | "ppc_change"
  | "listing_change"
  | "manual_input"
  | "system_action";

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All Activity" },
  { value: "ppc_change", label: "PPC Changes" },
  { value: "listing_change", label: "Listing Changes" },
  { value: "manual_input", label: "Manual Input" },
  { value: "system_action", label: "System Actions" },
];

function getCategoryIcon(eventCategory: string) {
  switch (eventCategory) {
    case "ppc":
    case "ppc_change":
      return Wrench;
    case "listing":
    case "listing_change":
      return FileEdit;
    case "manual_input":
      return MessageSquare;
    case "system":
    case "system_action":
      return Zap;
    default:
      return Zap;
  }
}

function getCategoryColor(eventCategory: string): string {
  switch (eventCategory) {
    case "ppc":
    case "ppc_change":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "listing":
    case "listing_change":
      return "bg-purple-500/15 text-purple-700 dark:text-purple-400";
    case "manual_input":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "system":
    case "system_action":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    default:
      return "bg-gray-500/15 text-gray-700 dark:text-gray-400";
  }
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (eventDate.getTime() === today.getTime()) {
    return `Today ${timeStr}`;
  }
  if (eventDate.getTime() === yesterday.getTime()) {
    return `Yesterday ${timeStr}`;
  }

  return `${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}, ${timeStr}`;
}

function getDateGroupLabel(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (eventDate.getTime() === today.getTime()) return "TODAY";
  if (eventDate.getTime() === yesterday.getTime()) return "YESTERDAY";

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();
}

function buildDescription(item: {
  eventType: string;
  eventAction: string;
  entityName?: string | null;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  changeDelta?: string | null;
  notes?: string | null;
}): string {
  const entity = item.entityName ? `'${item.entityName}'` : "";

  // If we have field change info, create a detailed description
  if (item.fieldChanged && item.oldValue && item.newValue) {
    const delta = item.changeDelta
      ? ` (${Number(item.changeDelta) > 0 ? "+" : ""}${Number(item.changeDelta).toFixed(1)}%)`
      : "";
    return `${item.fieldChanged} changed on ${entity} \u2014 ${item.oldValue} \u2192 ${item.newValue}${delta}`;
  }

  // Build from eventType and eventAction
  const action = item.eventAction.charAt(0).toUpperCase() + item.eventAction.slice(1);
  const type = item.eventType.replace(/_/g, " ");

  let desc = `${action}: ${type}`;
  if (entity) {
    desc += ` on ${entity}`;
  }

  if (item.notes) {
    desc += ` \u2014 ${item.notes}`;
  }

  return desc;
}

interface ActivityItem {
  id: number;
  timestamp: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  eventCategory: string;
  eventType: string;
  eventAction: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  productId: number | null;
  brandId: number | null;
  marketplaceId: string | null;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  changeDelta: string | null;
  source: string | null;
  notes: string | null;
}

function ActivityEventCard({ item }: { item: ActivityItem }) {
  const Icon = getCategoryIcon(item.eventCategory);
  const colorClass = getCategoryColor(item.eventCategory);

  return (
    <div className="flex items-start gap-3 py-3 px-4 hover:bg-muted/30 transition-colors rounded-lg">
      {/* Icon */}
      <div
        className={`mt-0.5 rounded-full p-1.5 shrink-0 ${colorClass}`}
      >
        <Icon className="size-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          {buildDescription(item)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(item.timestamp)}
          </span>
          <Badge
            variant="secondary"
            className="text-[10px] h-4 px-1.5"
          >
            {item.actorName ?? (item.actorType === "SYSTEM" ? "System" : item.actorType)}
          </Badge>
          {item.source && (
            <span className="text-[10px] text-muted-foreground">
              via {item.source}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityContent() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const queryInput = useMemo(
    () => ({
      page,
      pageSize,
      category,
    }),
    [page, category]
  );

  const { data, isLoading } = trpc.activity.list.useQuery(queryInput);

  const handleCategoryChange = useCallback((val: string | null) => {
    if (val) {
      setCategory(val as CategoryFilter);
      setPage(1);
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  const isEmpty = data && data.items.length === 0 && data.total === 0;
  const hasMore = data ? page * pageSize < data.total : false;

  // Group items by date
  const groupedItems = useMemo(() => {
    if (!data?.items) return [];

    const groups: { label: string; items: ActivityItem[] }[] = [];
    let currentLabel = "";

    for (const item of data.items) {
      const label = getDateGroupLabel(item.timestamp);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [] });
      }
      groups[groups.length - 1]!.items.push(item);
    }

    return groups;
  }, [data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Activity Log"
        description="Track all system events, syncs, and user actions."
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : isEmpty ? (
        <EmptyState
          icon={History}
          title="No activity recorded yet"
          description="System events and user actions will be logged here as you use the platform."
        />
      ) : (
        <div className="space-y-2">
          {groupedItems.map((group) => (
            <div key={group.label}>
              {/* Date group header */}
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
                <p className="text-xs font-semibold text-muted-foreground tracking-wider">
                  {group.label}
                </p>
              </div>

              {/* Events */}
              <Card>
                <CardContent className="p-0 divide-y">
                  {group.items.map((item) => (
                    <ActivityEventCard key={item.id} item={item} />
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-2 pb-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                className="gap-1.5"
              >
                <ChevronDown className="size-4" />
                Load More
              </Button>
            </div>
          )}

          {/* Summary */}
          {data && (
            <p className="text-center text-xs text-muted-foreground pb-2">
              Showing {Math.min(page * pageSize, data.total)} of {data.total}{" "}
              events
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ActivityContent />
    </Suspense>
  );
}
