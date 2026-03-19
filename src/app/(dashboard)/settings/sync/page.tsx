"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Play,
  Settings2,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";

// --- Helpers ---

const SYNC_TYPE_LABELS: Record<string, string> = {
  ppc_search_term: "PPC Search Term",
  ppc_campaign: "PPC Campaign",
  business_report: "Business Report",
  sqp_data: "SQP Data",
};

const FREQUENCY_OPTIONS = [
  { value: "60", label: "Every hour" },
  { value: "180", label: "Every 3 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
];

function formatSyncTypeLabel(syncType: string): string {
  return SYNC_TYPE_LABELS[syncType] ?? syncType;
}

function formatFrequency(minutes: number): string {
  if (minutes < 60) return `Every ${minutes} min`;
  if (minutes === 60) return "Every hour";
  if (minutes < 1440) return `Every ${minutes / 60} hours`;
  if (minutes === 1440) return "Daily at 2 AM";
  return `Every ${Math.round(minutes / 1440)} days`;
}

function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

function formatDuration(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined
): string {
  if (!start || !end) return "-";
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const diffMs = e.getTime() - s.getTime();
  if (diffMs < 1000) return `${diffMs}ms`;
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "never") {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        Never synced
      </Badge>
    );
  }
  switch (status) {
    case "success":
      return (
        <Badge variant="default" className="bg-emerald-500/15 text-emerald-600">
          Success
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          Failed
        </Badge>
      );
    case "running":
    case "queued":
      return (
        <Badge variant="secondary" className="bg-amber-500/15 text-amber-600">
          {status === "queued" ? "Queued" : "Running"}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          {status}
        </Badge>
      );
  }
}

function healthColor(successRate: number): string {
  if (successRate >= 95) return "text-emerald-600";
  if (successRate >= 80) return "text-amber-600";
  return "text-red-600";
}

function healthBorderColor(successRate: number): string {
  if (successRate >= 95) return "ring-emerald-500/20";
  if (successRate >= 80) return "ring-amber-500/20";
  return "ring-red-500/20";
}

// --- Main Page ---

export default function SyncPage() {
  const [editingConfig, setEditingConfig] = useState<{
    id: number;
    frequencyMinutes: number;
    isEnabled: boolean;
  } | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const configsQuery = trpc.sync.getConfigs.useQuery();
  const historyQuery = trpc.sync.getSyncHistory.useQuery({ page: 1, pageSize: 10 });
  const healthQuery = trpc.sync.getApiHealth.useQuery();

  const updateMutation = trpc.sync.updateConfig.useMutation({
    onSuccess: () => {
      configsQuery.refetch();
      setEditingConfig(null);
    },
  });

  const triggerMutation = trpc.sync.triggerManualSync.useMutation({
    onSuccess: () => {
      configsQuery.refetch();
      historyQuery.refetch();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Section 1: Sync Sources */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="size-5" />
                Sync Configuration
              </CardTitle>
              <CardDescription>
                Configure data sync schedules and monitor sync status across all
                data sources.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => configsQuery.refetch()}
              disabled={configsQuery.isRefetching}
            >
              {configsQuery.isRefetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !configsQuery.data?.length ? (
            <p className="py-8 text-center text-muted-foreground">
              No sync configurations found. Seed the database with initial sync config rows.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Sync</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configsQuery.data.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">
                      {formatSyncTypeLabel(config.syncType)}
                    </TableCell>
                    <TableCell>{formatFrequency(config.frequencyMinutes)}</TableCell>
                    <TableCell>{formatRelativeTime(config.lastSyncAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={config.lastSyncStatus} />
                    </TableCell>
                    <TableCell>
                      {config.nextSyncAt
                        ? formatRelativeTime(config.nextSyncAt)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.isEnabled ?? false}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                          config.isEnabled
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/25"
                        }`}
                        onClick={() => {
                          updateMutation.mutate({
                            id: config.id,
                            frequencyMinutes: config.frequencyMinutes,
                            isEnabled: !config.isEnabled,
                          });
                        }}
                      >
                        <span
                          className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                            config.isEnabled
                              ? "translate-x-4"
                              : "translate-x-0"
                          }`}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            triggerMutation.mutate({
                              syncType: config.syncType,
                            })
                          }
                          disabled={triggerMutation.isPending}
                        >
                          <Play className="size-3" />
                          Sync Now
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            setEditingConfig({
                              id: config.id,
                              frequencyMinutes: config.frequencyMinutes,
                              isEnabled: config.isEnabled ?? true,
                            })
                          }
                        >
                          <Settings2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 2: API Health Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" />
            API Health (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {healthQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : healthQuery.data ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card size="sm" className={healthBorderColor(healthQuery.data.successRate)}>
                  <CardContent className="flex flex-col gap-1 p-4">
                    <span className="text-xs text-muted-foreground">
                      Total API Calls
                    </span>
                    <span className="text-2xl font-bold">
                      {healthQuery.data.totalCalls.toLocaleString()}
                    </span>
                  </CardContent>
                </Card>
                <Card size="sm" className={healthBorderColor(healthQuery.data.successRate)}>
                  <CardContent className="flex flex-col gap-1 p-4">
                    <span className="text-xs text-muted-foreground">
                      Success Rate
                    </span>
                    <span
                      className={`text-2xl font-bold ${healthColor(healthQuery.data.successRate)}`}
                    >
                      {healthQuery.data.successRate}%
                    </span>
                  </CardContent>
                </Card>
                <Card size="sm" className={healthBorderColor(healthQuery.data.successRate)}>
                  <CardContent className="flex flex-col gap-1 p-4">
                    <span className="text-xs text-muted-foreground">
                      Error Rate
                    </span>
                    <span
                      className={`text-2xl font-bold ${
                        healthQuery.data.errorRate > 5
                          ? "text-red-600"
                          : healthQuery.data.errorRate > 0
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }`}
                    >
                      {healthQuery.data.errorRate}%
                    </span>
                  </CardContent>
                </Card>
                <Card size="sm" className={healthBorderColor(healthQuery.data.successRate)}>
                  <CardContent className="flex flex-col gap-1 p-4">
                    <span className="text-xs text-muted-foreground">
                      Avg Response Time
                    </span>
                    <span className="text-2xl font-bold">
                      {healthQuery.data.avgResponseTime}ms
                    </span>
                  </CardContent>
                </Card>
              </div>
              {healthQuery.data.breakdown.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Breakdown by API Type
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {healthQuery.data.breakdown.map((b) => (
                      <Badge key={b.apiType} variant="outline">
                        {b.apiType}: {b.totalCalls} calls
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No API call data available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Recent Sync History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5" />
            Recent Sync History
          </CardTitle>
          <CardDescription>Last 10 sync operations across all sources.</CardDescription>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !historyQuery.data?.items.length ? (
            <p className="py-8 text-center text-muted-foreground">
              No sync history available yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Type</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQuery.data.items.map((log) => (
                  <>
                    <TableRow
                      key={log.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedLogId(
                          expandedLogId === log.id ? null : log.id
                        )
                      }
                    >
                      <TableCell>
                        {expandedLogId === log.id ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatSyncTypeLabel(log.syncType)}
                      </TableCell>
                      <TableCell>{formatRelativeTime(log.startedAt)}</TableCell>
                      <TableCell>
                        {log.completedAt
                          ? formatRelativeTime(log.completedAt)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {formatDuration(log.startedAt, log.completedAt)}
                      </TableCell>
                      <TableCell>
                        {log.recordsProcessed ?? 0}/{log.recordsFetched ?? 0}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={log.status} />
                      </TableCell>
                      <TableCell>
                        {log.errorMessage ? (
                          <XCircle className="size-4 text-red-500" />
                        ) : (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedLogId === log.id && log.errorMessage && (
                      <TableRow key={`${log.id}-detail`}>
                        <TableCell />
                        <TableCell colSpan={7}>
                          <div className="rounded-md bg-red-500/5 p-3 text-xs text-red-600">
                            <p className="font-medium">Error Details</p>
                            <p className="mt-1">{log.errorMessage}</p>
                            {(log.retryCount ?? 0) > 0 && (
                              <p className="mt-1 text-muted-foreground">
                                Retry attempts: {log.retryCount}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
          {historyQuery.data && historyQuery.data.total > 10 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Showing 10 of {historyQuery.data.total} sync operations.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Config Dialog */}
      <Dialog
        open={editingConfig !== null}
        onOpenChange={(open) => {
          if (!open) setEditingConfig(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sync Configuration</DialogTitle>
            <DialogDescription>
              Update the sync frequency and enable/disable this sync source.
            </DialogDescription>
          </DialogHeader>
          {editingConfig && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="frequency">Sync Frequency</Label>
                <Select
                  value={String(editingConfig.frequencyMinutes)}
                  onValueChange={(val) =>
                    setEditingConfig((prev) =>
                      prev ? { ...prev, frequencyMinutes: Number(val) } : null
                    )
                  }
                >
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="enabled-toggle">Enabled</Label>
                <button
                  id="enabled-toggle"
                  type="button"
                  role="switch"
                  aria-checked={editingConfig.isEnabled}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                    editingConfig.isEnabled
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/25"
                  }`}
                  onClick={() =>
                    setEditingConfig((prev) =>
                      prev ? { ...prev, isEnabled: !prev.isEnabled } : null
                    )
                  }
                >
                  <span
                    className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                      editingConfig.isEnabled
                        ? "translate-x-4"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button
              onClick={() => {
                if (editingConfig) {
                  updateMutation.mutate(editingConfig);
                }
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
