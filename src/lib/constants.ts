export interface NavItem {
  label: string;
  href: string;
  icon: string;
  disabled: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview", icon: "LayoutDashboard", disabled: false },
  { label: "Products", href: "/products", icon: "Package", disabled: false },
  { label: "Keywords", href: "/keywords", icon: "Search", disabled: false },
  { label: "Campaigns", href: "/campaigns", icon: "Megaphone", disabled: true },
  { label: "Sync", href: "/sync", icon: "RefreshCw", disabled: false },
  { label: "Credentials", href: "/credentials", icon: "Key", disabled: false },
  { label: "Activity", href: "/activity", icon: "Activity", disabled: false },
  { label: "Settings", href: "/settings", icon: "Settings", disabled: true },
];

export const DATE_RANGE_PRESETS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 14 days", value: "14d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 60 days", value: "60d" },
  { label: "Last 90 days", value: "90d" },
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
  { label: "This year", value: "this_year" },
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number]["value"];

export const MARKETPLACES = [
  { label: "United States", value: "US", domain: "amazon.com" },
  { label: "Canada", value: "CA", domain: "amazon.ca" },
  { label: "United Kingdom", value: "UK", domain: "amazon.co.uk" },
  { label: "Germany", value: "DE", domain: "amazon.de" },
  { label: "France", value: "FR", domain: "amazon.fr" },
  { label: "Italy", value: "IT", domain: "amazon.it" },
  { label: "Spain", value: "ES", domain: "amazon.es" },
  { label: "Japan", value: "JP", domain: "amazon.co.jp" },
  { label: "Australia", value: "AU", domain: "amazon.com.au" },
  { label: "India", value: "IN", domain: "amazon.in" },
] as const;

export const SYNC_REPORT_TYPES = [
  "SP_TRAFFIC",
  "SP_SEARCH_TERM",
  "SP_TARGETING",
  "SP_ADVERTISED_PRODUCT",
  "SALES_AND_TRAFFIC",
  "INVENTORY",
] as const;

export type SyncReportType = (typeof SYNC_REPORT_TYPES)[number];

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
