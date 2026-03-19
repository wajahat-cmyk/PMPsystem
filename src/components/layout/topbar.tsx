"use client";

import { usePathname } from "next/navigation";
import { Settings, Sun, Moon } from "lucide-react";
import { useState } from "react";

const routeLabels: Record<string, string> = {
  "/overview": "Executive Overview",
  "/action-plan": "Daily Action Plan",
  "/keywords": "Keyword Engine",
  "/roots": "Root Analysis",
  "/syntax": "Syntax Analysis",
  "/inventory": "Inventory Management",
  "/activity": "Activity Log",
  "/import": "Data Import",
  "/settings": "Settings",
  "/settings/credentials": "API Credentials",
  "/settings/products": "Product Management",
  "/settings/sync": "Sync Configuration",
};

function getPageTitle(pathname: string): string {
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
  const [isDark, setIsDark] = useState(true);

  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
        padding: "16px 32px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: 70,
        minHeight: 70,
      }}
    >
      {/* Left — App Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Settings size={24} color="var(--accent)" />
          <span>PMP Systems</span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            borderLeft: "1px solid var(--border-color)",
            paddingLeft: 24,
          }}
        >
          {getPageTitle(pathname)}
        </div>
      </div>

      {/* Right — Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 32,
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        {/* Theme Toggle */}
        <button
          onClick={() => setIsDark(!isDark)}
          style={{
            background: "none",
            border: "1px solid var(--border-color)",
            padding: "8px 10px",
            borderRadius: 6,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            transition: "all 0.2s ease",
          }}
          title="Toggle theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Date */}
        <span>{currentDate}</span>

        {/* Operator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Wajahat S.</span>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--accent), #ec4899)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "white",
            }}
          >
            WS
          </div>
        </div>
      </div>
    </div>
  );
}
