/**
 * CSV Parser Service
 *
 * Parses CSV exports from Amazon Seller Central (PPC Bulk Sheet, Business Reports)
 * and maps them to our internal schema for DB insertion.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParseResult<T> {
  success: boolean;
  rows: T[];
  errors: { row: number; message: string }[];
  totalRows: number;
  validRows: number;
}

export interface PpcRow {
  date: string;
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  keywordText: string;
  matchType: string;
  targetingType: string | null;
  targetedAsin: string | null;
  impressions: number;
  clicks: number;
  spend: string;
  sales: string;
  orders: number;
  units: number;
  ctr: string | null;
  cvr: string | null;
  cpc: string | null;
  acos: string | null;
  roas: string | null;
}

export interface BusinessReportRow {
  date: string;
  parentAsin: string;
  sessions: number;
  pageViews: number;
  unitsOrdered: number;
  totalSales: string;
  totalOrders: number;
}

// ---------------------------------------------------------------------------
// CSV Parsing Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a CSV line handling quoted fields (fields may contain commas or newlines
 * inside double-quotes). Returns an array of field values.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead — doubled quote means escaped literal quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parse a full CSV string into an array of header-keyed rows.
 */
function parseCsv(csvContent: string): { headers: string[]; rows: Record<string, string>[] } {
  // Normalise line-endings and split
  const lines = csvContent
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Strip dollar signs, commas, and whitespace from a currency string, returning
 * a plain numeric string. Returns "0" for empty / unparseable values.
 */
function cleanCurrency(raw: string): string {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

/**
 * Safe integer parse — returns 0 for non-numeric values.
 */
function safeInt(raw: string): number {
  const n = parseInt(raw.replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Safe division returning a string with 4 decimal places, or null if
 * the denominator is zero.
 */
function safeDivide(numerator: number, denominator: number): string | null {
  if (denominator === 0) return null;
  return (numerator / denominator).toFixed(4);
}

/**
 * Normalise an Amazon date string to YYYY-MM-DD.
 * Accepts "MM/DD/YYYY", "YYYY-MM-DD", "M/D/YYYY", etc.
 */
function normaliseDate(raw: string): string | null {
  const trimmed = raw.trim();

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // US format: M/D/YYYY or MM/DD/YYYY
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const month = parts[0].padStart(2, "0");
    const day = parts[1].padStart(2, "0");
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    return `${year}-${month}-${day}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Column name lookup helpers
// ---------------------------------------------------------------------------

/**
 * Find a header by checking several possible Amazon column names
 * (Amazon changes header names across report versions).
 */
function findColumn(headers: string[], ...candidates: string[]): string | null {
  const lower = candidates.map((c) => c.toLowerCase());
  for (const h of headers) {
    for (const c of lower) {
      if (h === c || h.includes(c)) {
        return h;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public Parsers
// ---------------------------------------------------------------------------

/**
 * Parse a PPC Search Term / Keyword Report CSV.
 */
export function parsePpcReport(csvContent: string): ParseResult<PpcRow> {
  const { headers, rows: rawRows } = parseCsv(csvContent);
  const errors: { row: number; message: string }[] = [];
  const rows: PpcRow[] = [];

  // Map header names
  const colDate = findColumn(headers, "date");
  const colCampaignName = findColumn(headers, "campaign name");
  const colCampaignId = findColumn(headers, "campaign id");
  const colAdGroupName = findColumn(headers, "ad group name");
  const colAdGroupId = findColumn(headers, "ad group id");
  const colKeyword = findColumn(headers, "targeting", "customer search term", "keyword");
  const colMatchType = findColumn(headers, "match type");
  const colImpressions = findColumn(headers, "impressions");
  const colClicks = findColumn(headers, "clicks");
  const colSpend = findColumn(headers, "spend", "cost");
  const colSales = findColumn(headers, "7 day total sales", "sales", "total sales");
  const colOrders = findColumn(headers, "7 day total orders", "orders", "total orders");
  const colUnits = findColumn(headers, "7 day total units", "units", "total units");
  const colTargetingType = findColumn(headers, "targeting type");
  const colTargetedAsin = findColumn(headers, "targeted asin", "targeted asin (product ads)");

  if (!colDate || !colKeyword || !colMatchType) {
    return {
      success: false,
      rows: [],
      errors: [{ row: 0, message: "Missing required columns: Date, Targeting/Keyword, Match Type" }],
      totalRows: rawRows.length,
      validRows: 0,
    };
  }

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const rowNum = i + 2; // 1-indexed, plus header row

    try {
      const date = normaliseDate(r[colDate] ?? "");
      if (!date) {
        errors.push({ row: rowNum, message: `Invalid date: "${r[colDate]}"` });
        continue;
      }

      const keywordText = r[colKeyword] ?? "";
      if (!keywordText) {
        errors.push({ row: rowNum, message: "Empty keyword/targeting text" });
        continue;
      }

      const matchType = (r[colMatchType] ?? "").toUpperCase();
      if (!matchType) {
        errors.push({ row: rowNum, message: "Empty match type" });
        continue;
      }

      const impressions = safeInt(r[colImpressions ?? ""] ?? "0");
      const clicks = safeInt(r[colClicks ?? ""] ?? "0");
      const spend = cleanCurrency(r[colSpend ?? ""] ?? "0");
      const sales = cleanCurrency(r[colSales ?? ""] ?? "0");
      const orders = safeInt(r[colOrders ?? ""] ?? "0");
      const units = safeInt(r[colUnits ?? ""] ?? "0");

      const spendNum = Number(spend);
      const salesNum = Number(sales);

      rows.push({
        date,
        campaignId: r[colCampaignId ?? ""] ?? "",
        campaignName: r[colCampaignName ?? ""] ?? "",
        adGroupId: r[colAdGroupId ?? ""] ?? "",
        adGroupName: r[colAdGroupName ?? ""] ?? "",
        keywordText,
        matchType,
        targetingType: r[colTargetingType ?? ""] ?? null,
        targetedAsin: r[colTargetedAsin ?? ""] ?? null,
        impressions,
        clicks,
        spend,
        sales,
        orders,
        units,
        ctr: safeDivide(clicks, impressions),
        cvr: safeDivide(orders, clicks),
        cpc: safeDivide(spendNum, clicks),
        acos: safeDivide(spendNum, salesNum),
        roas: safeDivide(salesNum, spendNum),
      });
    } catch (err) {
      errors.push({ row: rowNum, message: `Parse error: ${String(err)}` });
    }
  }

  return {
    success: errors.length === 0,
    rows,
    errors,
    totalRows: rawRows.length,
    validRows: rows.length,
  };
}

/**
 * Parse an Amazon Business Report CSV.
 */
export function parseBusinessReport(csvContent: string): ParseResult<BusinessReportRow> {
  const { headers, rows: rawRows } = parseCsv(csvContent);
  const errors: { row: number; message: string }[] = [];
  const rows: BusinessReportRow[] = [];

  const colDate = findColumn(headers, "date");
  const colParentAsin = findColumn(headers, "(parent) asin", "parent asin", "asin");
  const colSessions = findColumn(headers, "sessions");
  const colPageViews = findColumn(headers, "page views", "pageviews");
  const colUnitsOrdered = findColumn(headers, "units ordered");
  const colTotalSales = findColumn(headers, "ordered product sales", "total sales", "product sales");
  const colTotalOrders = findColumn(headers, "total order items", "total orders", "order items");

  if (!colDate || !colParentAsin) {
    return {
      success: false,
      rows: [],
      errors: [{ row: 0, message: "Missing required columns: Date, (Parent) ASIN" }],
      totalRows: rawRows.length,
      validRows: 0,
    };
  }

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const rowNum = i + 2;

    try {
      const date = normaliseDate(r[colDate] ?? "");
      if (!date) {
        errors.push({ row: rowNum, message: `Invalid date: "${r[colDate]}"` });
        continue;
      }

      const parentAsin = (r[colParentAsin] ?? "").trim();
      if (!parentAsin) {
        errors.push({ row: rowNum, message: "Empty ASIN" });
        continue;
      }

      rows.push({
        date,
        parentAsin,
        sessions: safeInt(r[colSessions ?? ""] ?? "0"),
        pageViews: safeInt(r[colPageViews ?? ""] ?? "0"),
        unitsOrdered: safeInt(r[colUnitsOrdered ?? ""] ?? "0"),
        totalSales: cleanCurrency(r[colTotalSales ?? ""] ?? "0"),
        totalOrders: safeInt(r[colTotalOrders ?? ""] ?? "0"),
      });
    } catch (err) {
      errors.push({ row: rowNum, message: `Parse error: ${String(err)}` });
    }
  }

  return {
    success: errors.length === 0,
    rows,
    errors,
    totalRows: rawRows.length,
    validRows: rows.length,
  };
}
