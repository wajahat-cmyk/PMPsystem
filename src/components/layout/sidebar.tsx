"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  TrendingUp as TrendingUpIcon,
  Activity,
  Search,
  GitBranch as GitBranchIcon,
  Zap,
  RefreshCw,
  Wrench,
  BarChart3,
  Bot,
  Package,
  FileText,
  Settings as SettingsIcon,
  Terminal,
  ArrowUpRight,
  Shield,
  Upload,
  Crosshair,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  disabled?: boolean;
}

interface NavSection {
  title: string;
  icon: React.ElementType;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "Command Center",
    icon: Terminal,
    items: [
      { label: "Overview", href: "/overview", icon: LayoutDashboard },
      { label: "Action Plan", href: "/action-plan", icon: Target },
    ],
  },
  {
    title: "Analytics",
    icon: ArrowUpRight,
    items: [
      { label: "Reporting", href: "/reporting", icon: TrendingUpIcon, disabled: true },
      { label: "Tracking", href: "/tracking", icon: Crosshair, disabled: true },
    ],
  },
  {
    title: "Intelligence",
    icon: Zap,
    items: [
      { label: "Keyword Engine", href: "/keywords", icon: Search },
      { label: "Root Analysis", href: "/roots", icon: GitBranchIcon },
      { label: "Syntax Analysis", href: "/syntax", icon: Zap },
      { label: "Variation Analysis", href: "/variations", icon: RefreshCw, disabled: true },
    ],
  },
  {
    title: "Operations",
    icon: SettingsIcon,
    items: [
      { label: "Optimization", href: "/optimization", icon: Wrench, disabled: true },
      { label: "SKU Optimization", href: "/sku-optimization", icon: BarChart3, disabled: true },
      { label: "Agents", href: "/agents", icon: Bot, disabled: true },
      { label: "Inventory", href: "/inventory", icon: Package },
    ],
  },
  {
    title: "System",
    icon: Shield,
    items: [
      { label: "Activity Log", href: "/activity", icon: FileText },
      { label: "Data Import", href: "/import", icon: Upload },
      { label: "Settings", href: "/settings", icon: SettingsIcon },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        width: 280,
        minWidth: 280,
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "relative",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SettingsIcon size={20} color="white" />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
            PMP Systems
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>v2.1.4</div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}>
        {navigation.map((section) => {
          const SectionIcon = section.icon;
          return (
            <div key={section.title} style={{ marginBottom: 24 }}>
              {/* Section Title */}
              <div
                style={{
                  padding: "0 24px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <SectionIcon size={16} />
                {section.title}
              </div>

              {/* Items */}
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                const Icon = item.icon;

                if (item.disabled) {
                  return (
                    <div
                      key={item.href}
                      style={{
                        padding: "12px 24px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        cursor: "not-allowed",
                        color: "var(--text-secondary)",
                        opacity: 0.4,
                        borderLeft: "3px solid transparent",
                        fontSize: 14,
                      }}
                    >
                      <Icon size={18} style={{ width: 24, textAlign: "center" }} />
                      <span>{item.label}</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      padding: "12px 24px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      color: isActive ? "var(--accent)" : "var(--text-secondary)",
                      borderLeft: isActive
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                      backgroundColor: isActive ? "var(--bg-tertiary)" : "transparent",
                      fontSize: 14,
                      textDecoration: "none",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }
                    }}
                  >
                    <Icon size={18} style={{ width: 24, textAlign: "center" }} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
