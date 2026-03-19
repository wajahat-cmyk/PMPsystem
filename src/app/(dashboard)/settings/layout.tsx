"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Credentials", href: "/settings/credentials" },
  { label: "Products", href: "/settings/products" },
  { label: "Sync", href: "/settings/sync" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Settings
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Manage API credentials, products, and sync configuration.
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border-color)",
          marginBottom: 32,
        }}
      >
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 600,
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                textDecoration: "none",
                transition: "all 0.2s ease",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
