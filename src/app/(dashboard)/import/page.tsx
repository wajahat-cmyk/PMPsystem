"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Data Import</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Import CSV exports from Amazon Seller Central
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PpcImportSection />
        <BusinessReportImportSection />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PPC Import Section
// ---------------------------------------------------------------------------

function PpcImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [productId, setProductId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const productsQuery = trpc.products.list.useQuery({
    page: 1,
    pageSize: 200,
    sortBy: "name",
    sortDir: "asc",
  });

  const importMutation = trpc.csvImport.importPpcData.useMutation();

  async function handleImport() {
    if (!file || !productId) return;

    const text = await file.text();
    importMutation.mutate({
      csvContent: text,
      productId: Number(productId),
    });
  }

  const productList = productsQuery.data?.items ?? [];

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <FileSpreadsheet className="h-5 w-5 text-blue-400" />
          Import PPC Data
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Upload a PPC Search Term or Keyword Report CSV from Amazon Seller
          Central
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Product Selector */}
        <div className="space-y-2">
          <Label className="text-zinc-300">Product</Label>
          <Select
            value={productId}
            onValueChange={(val) => setProductId(val ?? "")}
          >
            <SelectTrigger className="w-full border-zinc-700 bg-zinc-900 text-zinc-200">
              <SelectValue placeholder="Select a product..." />
            </SelectTrigger>
            <SelectContent>
              {productList.map((p: { id: number; name: string; parentAsin: string }) => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.name} ({p.parentAsin})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* File Input */}
        <div className="space-y-2">
          <Label className="text-zinc-300">CSV File</Label>
          <Input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="border-zinc-700 bg-zinc-900 text-zinc-300 file:text-zinc-300 file:bg-zinc-800 file:border-0 file:mr-3 file:px-3 file:py-1 file:rounded"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Upload Button */}
        <Button
          onClick={handleImport}
          disabled={!file || !productId || importMutation.isPending}
          className="w-full"
        >
          {importMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload &amp; Import
            </>
          )}
        </Button>

        {/* Results */}
        <ImportResults
          data={importMutation.data}
          error={importMutation.error}
          isPending={importMutation.isPending}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Business Report Import Section
// ---------------------------------------------------------------------------

function BusinessReportImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.csvImport.importBusinessReport.useMutation();

  async function handleImport() {
    if (!file) return;

    const text = await file.text();
    importMutation.mutate({
      csvContent: text,
    });
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <FileSpreadsheet className="h-5 w-5 text-emerald-400" />
          Import Business Report
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Upload a Business Report CSV from Amazon Seller Central. ASINs are
          matched to existing products automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Input */}
        <div className="space-y-2">
          <Label className="text-zinc-300">CSV File</Label>
          <Input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="border-zinc-700 bg-zinc-900 text-zinc-300 file:text-zinc-300 file:bg-zinc-800 file:border-0 file:mr-3 file:px-3 file:py-1 file:rounded"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Upload Button */}
        <Button
          onClick={handleImport}
          disabled={!file || importMutation.isPending}
          className="w-full"
        >
          {importMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload &amp; Import
            </>
          )}
        </Button>

        {/* Results */}
        <ImportResults
          data={importMutation.data}
          error={importMutation.error}
          isPending={importMutation.isPending}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared Results Component
// ---------------------------------------------------------------------------

interface ImportResultData {
  success: boolean;
  imported: number;
  errors: { row: number; message: string }[];
  totalRows: number;
  skippedAsins?: string[];
}

function ImportResults({
  data,
  error,
  isPending,
}: {
  data: ImportResultData | undefined;
  error: unknown;
  isPending: boolean;
}) {
  if (isPending || (!data && !error)) return null;

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Import failed</span>
        </div>
        <p className="mt-1 text-xs text-red-300">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      <Separator className="bg-zinc-800" />

      {/* Summary */}
      <div className="flex items-center gap-3">
        {data.success ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        ) : (
          <AlertCircle className="h-5 w-5 text-amber-400" />
        )}
        <div className="flex-1">
          <p className="text-sm text-zinc-200">
            <span className="font-medium">{data.imported}</span> rows imported
            out of <span className="font-medium">{data.totalRows}</span> total
          </p>
        </div>
        <Badge
          variant={data.success ? "default" : "secondary"}
          className={
            data.success
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-amber-500/20 text-amber-400 border-amber-500/30"
          }
        >
          {data.success ? "Success" : "Partial"}
        </Badge>
      </div>

      {/* Skipped ASINs */}
      {data.skippedAsins && data.skippedAsins.length > 0 && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs font-medium text-amber-400 mb-1">
            Skipped ASINs (not found in products):
          </p>
          <p className="text-xs text-amber-300/70">
            {data.skippedAsins.join(", ")}
          </p>
        </div>
      )}

      {/* Errors */}
      {data.errors.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          <p className="text-xs font-medium text-zinc-400">
            {data.errors.length} error(s):
          </p>
          {data.errors.map((err, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-red-400/80"
            >
              {err.row > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-zinc-800 text-zinc-500 text-[10px] px-1.5 shrink-0"
                >
                  Row {err.row}
                </Badge>
              )}
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
