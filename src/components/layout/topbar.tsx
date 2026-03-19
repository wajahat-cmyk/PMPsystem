"use client";

import { usePathname } from "next/navigation";
import { ChevronDown, Bell } from "lucide-react";
import { useState } from "react";

const brands = ["All", "DECOLURE", "SLEEPHORIA", "SLEEP SANCTUARY"] as const;
const marketplaces = ["US", "CA", "UK", "DE"] as const;

const routeLabels: Record<string, string> = {
  "/overview": "Overview",
  "/action-plan": "Action Plan",
  "/keywords": "Keyword Engine",
  "/roots": "Root Analysis",
  "/syntax": "Syntax Analysis",
  "/inventory": "Inventory",
  "/activity": "Activity Log",
  "/import": "Data Import",
  "/settings": "Settings",
  "/settings/credentials": "API Credentials",
  "/settings/products": "Products",
  "/settings/sync": "Sync Configuration",
};

function getBreadcrumb(pathname: string): string {
  if (routeLabels[pathname]) return routeLabels[pathname];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0) {
    return segments[segments.length - 1]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Dashboard";
}

export function Topbar() {
  const pathname = usePathname();
  const [selectedBrand, setSelectedBrand] = useState<string>("All");
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("US");
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showMpDropdown, setShowMpDropdown] = useState(false);

  return (
    <header className="flex items-center justify-between h-12 px-6 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Dashboard</span>
        <span className="text-zinc-700">/</span>
        <span className="text-white font-medium">{getBreadcrumb(pathname)}</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2">
        {/* Brand Selector */}
        <div className="relative">
          <button
            onClick={() => { setShowBrandDropdown(!showBrandDropdown); setShowMpDropdown(false); }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            {selectedBrand}
            <ChevronDown size={14} className="text-zinc-500" />
          </button>
          {showBrandDropdown && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-zinc-800 bg-zinc-900 shadow-xl z-50 py-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Brand</div>
              {brands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => { setSelectedBrand(brand); setShowBrandDropdown(false); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-800 transition-colors",
                    selectedBrand === brand ? "text-blue-400 bg-zinc-800/50" : "text-zinc-300"
                  )}
                >
                  {brand}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Marketplace Selector */}
        <div className="relative">
          <button
            onClick={() => { setShowMpDropdown(!showMpDropdown); setShowBrandDropdown(false); }}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-zinc-800 bg-zinc-900 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <span className="text-[10px] font-bold bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded">
              {selectedMarketplace}
            </span>
            <ChevronDown size={14} className="text-zinc-500" />
          </button>
          {showMpDropdown && (
            <div className="absolute right-0 top-full mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 shadow-xl z-50 py-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Region</div>
              {marketplaces.map((mp) => (
                <button
                  key={mp}
                  onClick={() => { setSelectedMarketplace(mp); setShowMpDropdown(false); }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-800 transition-colors",
                    selectedMarketplace === mp ? "text-blue-400 bg-zinc-800/50" : "text-zinc-300"
                  )}
                >
                  {mp}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <button className="flex items-center justify-center w-8 h-8 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
          <Bell size={16} />
        </button>
      </div>
    </header>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
