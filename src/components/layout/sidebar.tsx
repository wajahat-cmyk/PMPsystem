"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Target,
  FileText,
  Activity,
  Search,
  TreePine,
  Code,
  GitBranch,
  Globe,
  Sliders,
  Bot,
  Package,
  History,
  TrendingUp,
  Settings,
  Menu,
  X,
  Upload,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "Command Center",
    items: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
      { label: "Action Plan", href: "/action-plan", icon: Target, disabled: true, badge: "Phase 2" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reporting", href: "/reporting", icon: FileText, disabled: true },
      { label: "Tracking", href: "/tracking", icon: Activity, disabled: true },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Keyword Engine", href: "/keywords", icon: Search },
      { label: "Root Analysis", href: "/root-analysis", icon: TreePine, disabled: true },
      { label: "Syntax Analysis", href: "/syntax-analysis", icon: Code, disabled: true },
      { label: "Variation Analysis", href: "/variation-analysis", icon: GitBranch, disabled: true },
      { label: "Marketplace Tracking", href: "/marketplace-tracking", icon: Globe, disabled: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Optimization", href: "/optimization", icon: Sliders, disabled: true },
      { label: "Agents", href: "/agents", icon: Bot, disabled: true },
      { label: "Inventory", href: "/inventory", icon: Package, disabled: true },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Activity Log", href: "/activity", icon: History },
      { label: "Data Import", href: "/import", icon: Upload },
      { label: "Forecasting", href: "/forecasting", icon: TrendingUp, disabled: true },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-zinc-800">
        {!collapsed && (
          <span className="text-sm font-bold tracking-wide text-white">
            PMP Systems
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        {navigation.map((section) => (
          <div key={section.title} className="mb-2">
            {!collapsed && (
              <div className="px-4 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {section.title}
                </span>
              </div>
            )}
            {section.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              const Icon = item.icon;

              if (item.disabled) {
                return (
                  <div
                    key={item.href}
                    className={cn(
                      "group flex items-center gap-3 px-4 h-9 text-zinc-600 cursor-not-allowed",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="text-sm truncate">{item.label}</span>
                        <Badge
                          variant="secondary"
                          className="ml-auto h-5 bg-zinc-800 text-zinc-500 text-[10px] px-1.5 font-normal"
                        >
                          {item.badge || "Soon"}
                        </Badge>
                      </>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 px-4 h-9 transition-colors",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "border-l-2 border-blue-500 bg-zinc-900/50 text-white font-medium"
                      : "border-l-2 border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/30"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-blue-400")} />
                  {!collapsed && (
                    <span className="text-sm truncate">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
