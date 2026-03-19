"use client";

import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ChevronDown, LogOut, User } from "lucide-react";
import { useState } from "react";

const brands = ["All", "DECOLURE", "SLEEPHORIA", "SLEEP SANCTUARY"] as const;
const marketplaces = ["US", "CA", "UK", "DE"] as const;

const routeLabels: Record<string, string> = {
  "/overview": "Overview",
  "/keywords": "Keyword Engine",
  "/activity": "Activity Log",
  "/settings": "Settings",
  "/settings/credentials": "API Credentials",
  "/settings/products": "Product Management",
  "/settings/sync": "Sync Configuration",
};

function getBreadcrumb(pathname: string): string {
  if (routeLabels[pathname]) return routeLabels[pathname];
  // Try matching partial paths
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

  return (
    <div className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/50 px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Dashboard</span>
        <span className="text-zinc-600">/</span>
        <span className="text-white font-medium">{getBreadcrumb(pathname)}</span>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-3">
        {/* Brand Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 h-8 text-sm font-medium text-foreground hover:bg-zinc-800 focus:outline-none">
            {selectedBrand}
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Brand</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {brands.map((brand) => (
              <DropdownMenuItem
                key={brand}
                onClick={() => setSelectedBrand(brand)}
                className={selectedBrand === brand ? "bg-zinc-800" : ""}
              >
                {brand}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Marketplace Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 h-8 text-sm font-medium text-foreground hover:bg-zinc-800 focus:outline-none">
            <Badge variant="secondary" className="h-5 px-1.5 bg-zinc-800 text-zinc-300 text-[10px]">
              {selectedMarketplace}
            </Badge>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuLabel>Marketplace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {marketplaces.map((mp) => (
              <DropdownMenuItem
                key={mp}
                onClick={() => setSelectedMarketplace(mp)}
                className={selectedMarketplace === mp ? "bg-zinc-800" : ""}
              >
                {mp}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-full h-8 w-8 hover:bg-zinc-800 focus:outline-none">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-blue-600 text-xs text-white">WS</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-400">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
