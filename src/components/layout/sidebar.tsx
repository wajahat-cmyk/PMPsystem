"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
  ChevronLeft,
  ChevronRight,
  Upload,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
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
      { label: "Action Plan", href: "/action-plan", icon: Target },
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
      { label: "Root Analysis", href: "/roots", icon: TreePine },
      { label: "Syntax Analysis", href: "/syntax", icon: Code },
      { label: "Variation Analysis", href: "/variations", icon: GitBranch, disabled: true },
      { label: "Marketplace", href: "/marketplace", icon: Globe, disabled: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Optimization", href: "/optimization", icon: Sliders, disabled: true },
      { label: "Agents", href: "/agents", icon: Bot, disabled: true },
      { label: "Inventory", href: "/inventory", icon: Package },
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
    <aside
      style={{ width: collapsed ? 64 : 240, minWidth: collapsed ? 64 : 240 }}
      className="flex flex-col h-full border-r border-zinc-800 bg-zinc-950 transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-zinc-800 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">P</span>
            </div>
            <span className="text-sm font-bold text-white tracking-wide">PMP Systems</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation - scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <nav>
          {navigation.map((section, sectionIdx) => (
            <div key={section.title} className={sectionIdx > 0 ? "mt-4" : ""}>
              {/* Section Title */}
              {!collapsed && (
                <div className="px-4 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    {section.title}
                  </span>
                </div>
              )}
              {collapsed && sectionIdx > 0 && (
                <div className="mx-3 mb-2 border-t border-zinc-800" />
              )}

              {/* Section Items */}
              <div className="space-y-0.5 px-2">
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
                          "flex items-center gap-3 h-9 rounded-md cursor-not-allowed opacity-40",
                          collapsed ? "justify-center px-0" : "px-3"
                        )}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon size={18} className="shrink-0 text-zinc-500" />
                        {!collapsed && (
                          <span className="text-sm text-zinc-500 truncate flex-1">
                            {item.label}
                          </span>
                        )}
                        {!collapsed && (
                          <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-600 bg-zinc-800/80 px-1.5 py-0.5 rounded">
                            Soon
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 h-9 rounded-md transition-all duration-150",
                        collapsed ? "justify-center px-0" : "px-3",
                        isActive
                          ? "bg-blue-600/15 text-blue-400"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon
                        size={18}
                        className={cn(
                          "shrink-0",
                          isActive ? "text-blue-400" : ""
                        )}
                      />
                      {!collapsed && (
                        <span
                          className={cn(
                            "text-sm truncate",
                            isActive ? "font-medium text-blue-400" : ""
                          )}
                        >
                          {item.label}
                        </span>
                      )}
                      {isActive && !collapsed && (
                        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-zinc-800 p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">WS</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Wajahat</p>
              <p className="text-[11px] text-zinc-500 truncate">Admin</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">WS</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
