"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

/* ============================================
   KPI Card Component
   ============================================ */
function KpiCard({
  label,
  value,
  change,
  changeType,
}: {
  label: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
}) {
  return (
    <div
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: 8,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        transition: "all 0.3s ease",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
        e.currentTarget.style.borderColor = "var(--border-color)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)" }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color:
            changeType === "positive"
              ? "var(--success)"
              : changeType === "negative"
              ? "var(--danger)"
              : "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {changeType === "positive" ? "▲" : changeType === "negative" ? "▼" : "→"} {change}
      </div>
    </div>
  );
}

/* ============================================
   Segment Card Component
   ============================================ */
function SegmentCard({
  title,
  count,
  products,
  gradient,
}: {
  title: string;
  count: number;
  products: string[];
  gradient: string;
}) {
  return (
    <div
      style={{
        borderRadius: 8,
        padding: 24,
        color: "white",
        transition: "all 0.3s ease",
        cursor: "pointer",
        background: gradient,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "var(--shadow)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.9, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>{count}</div>
      <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.6 }}>
        {products.slice(0, 2).map((p) => (
          <div key={p}>• {p}</div>
        ))}
        {products.length > 2 && <div>+ {products.length - 2} more</div>}
      </div>
    </div>
  );
}

/* ============================================
   Product Table Row
   ============================================ */
function BadgeStatus({ label, type }: { label: string; type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    critical: { bg: "rgba(239, 68, 68, 0.2)", color: "#fca5a5" },
    optimization: { bg: "rgba(245, 158, 11, 0.2)", color: "#fcd34d" },
    scale: { bg: "rgba(16, 185, 129, 0.2)", color: "#86efac" },
    launch: { bg: "rgba(59, 130, 246, 0.2)", color: "#93c5fd" },
    growth: { bg: "rgba(16, 185, 129, 0.2)", color: "#86efac" },
    maintenance: { bg: "rgba(245, 158, 11, 0.2)", color: "#fcd34d" },
    pass: { bg: "rgba(16, 185, 129, 0.2)", color: "#86efac" },
    fail: { bg: "rgba(239, 68, 68, 0.2)", color: "#fca5a5" },
  };
  const c = colors[type] || { bg: "rgba(99, 102, 241, 0.2)", color: "#c7d2fe" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        backgroundColor: c.bg,
        color: c.color,
      }}
    >
      {label}
    </span>
  );
}

/* ============================================
   Overview Page
   ============================================ */
export default function OverviewPage() {
  const [days, setDays] = useState(7);
  const metricsQuery = trpc.overview.getMetricCards.useQuery({ days });
  const productsQuery = trpc.overview.getProductBreakdown.useQuery({ days });

  const m = metricsQuery.data;
  const hasData = m !== undefined && (m.totalSales > 0 || m.totalSpend > 0 || m.totalOrders > 0);

  // Sample data for display when no real data yet
  const sampleKpis = [
    { label: "Total Spend", value: "$0", change: "0% WoW", changeType: "neutral" as const },
    { label: "Total Sales", value: "$0", change: "0% WoW", changeType: "neutral" as const },
    { label: "Portfolio ACOS", value: "0%", change: "0% WoW", changeType: "neutral" as const },
    { label: "Total Orders", value: "0", change: "0% WoW", changeType: "neutral" as const },
    { label: "WAS%", value: "0%", change: "0% WoW", changeType: "neutral" as const },
    { label: "Active Campaigns", value: "0", change: "0 WoW", changeType: "neutral" as const },
  ];

  const kpis = hasData
    ? [
        {
          label: "Total Spend",
          value: `$${Number(m.totalSpend).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          change: "WoW",
          changeType: "neutral" as const,
        },
        {
          label: "Total Sales",
          value: `$${Number(m.totalSales).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          change: "WoW",
          changeType: "positive" as const,
        },
        {
          label: "Portfolio ACOS",
          value: `${(Number(m.acos) || 0).toFixed(1)}%`,
          change: "WoW",
          changeType: "neutral" as const,
        },
        {
          label: "Total Orders",
          value: Number(m.totalOrders).toLocaleString(),
          change: "WoW",
          changeType: "positive" as const,
        },
        {
          label: "TACOS",
          value: `${(Number(m.tacos) || 0).toFixed(1)}%`,
          change: "WoW",
          changeType: "neutral" as const,
        },
        {
          label: "WAS%",
          value: `${(Number(m.wasPct) || 0).toFixed(1)}%`,
          change: "WoW",
          changeType: "neutral" as const,
        },
      ]
    : sampleKpis;

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
          Executive Overview
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Real-time performance metrics and portfolio health status
        </div>
      </div>

      {/* Date Range Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[7, 14, 30, 60].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              backgroundColor: days === d ? "var(--accent)" : "transparent",
              color: days === d ? "white" : "var(--text-primary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              transition: "all 0.2s ease",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {d} Days
          </button>
        ))}
      </div>

      {/* KPI Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Segment Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <SegmentCard
          title="CRITICAL"
          count={2}
          products={["Satin Sheets 6 Pcs", "Hanging Closet"]}
          gradient="linear-gradient(135deg, #ef4444, #dc2626)"
        />
        <SegmentCard
          title="OPTIMIZATION"
          count={6}
          products={["Bamboo Sheets", "Satin Sheets 2PCs", "Cooling Pillowcase", "Silk Pillow Case"]}
          gradient="linear-gradient(135deg, #f59e0b, #d97706)"
        />
        <SegmentCard
          title="SCALE"
          count={4}
          products={["Bamboo 6PCS", "Cooling Sheets", "Satin 4PCs", "Cooling Comforter"]}
          gradient="linear-gradient(135deg, #10b981, #059669)"
        />
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 16,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Weekly Spend vs Sales
          </div>
          <div
            style={{
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            {hasData ? "Chart will render with data" : "Import data to see trends"}
          </div>
        </div>
        <div
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 16,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            ACOS Trend
          </div>
          <div
            style={{
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            {hasData ? "Chart will render with data" : "Import data to see trends"}
          </div>
        </div>
      </div>

      {/* Product Performance Table */}
      <div
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
            Product Performance
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ backgroundColor: "var(--bg-tertiary)" }}>
              <tr>
                {["Product", "Brand", "Stage", "ACOS", "Spend", "Sales", "Orders", "WAS%", "Gate", "Segment"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        fontSize: 11,
                        borderBottom: "1px solid var(--border-color)",
                        cursor: "pointer",
                        userSelect: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Bamboo Sheets", brand: "DECOLURE", stage: "growth", acos: "22.4%", spend: "$2,180", sales: "$9,732", orders: "128", was: "28.1%", gate: "pass", segment: "optimization" },
                { name: "Bamboo 6PCS", brand: "DECOLURE", stage: "growth", acos: "15.2%", spend: "$1,890", sales: "$12,434", orders: "138", was: "18.4%", gate: "pass", segment: "scale" },
                { name: "Satin Sheets", brand: "DECOLURE", stage: "maintenance", acos: "19.8%", spend: "$890", sales: "$4,495", orders: "150", was: "24.2%", gate: "pass", segment: "optimization" },
                { name: "Satin Sheets 6 Pcs", brand: "DECOLURE", stage: "maintenance", acos: "38.5%", spend: "$1,420", sales: "$3,688", orders: "123", was: "42.1%", gate: "fail", segment: "critical" },
                { name: "Cooling Sheets", brand: "SLEEPHORIA", stage: "launch", acos: "16.1%", spend: "$2,540", sales: "$15,776", orders: "243", was: "21.3%", gate: "pass", segment: "scale" },
                { name: "Cooling Pillowcase", brand: "SLEEPHORIA", stage: "launch", acos: "24.7%", spend: "$680", sales: "$2,753", orders: "153", was: "30.8%", gate: "pass", segment: "optimization" },
                { name: "Hanging Closet", brand: "DECOLURE", stage: "launch", acos: "45.2%", spend: "$520", sales: "$1,150", orders: "27", was: "52.4%", gate: "fail", segment: "critical" },
                { name: "Satin 4PCs", brand: "SLEEP SANCTUARY", stage: "launch", acos: "14.8%", spend: "$1,240", sales: "$8,378", orders: "233", was: "19.2%", gate: "pass", segment: "scale" },
              ].map((row) => (
                <tr
                  key={row.name}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)", fontWeight: 600 }}>
                    {row.name}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    {row.brand}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)" }}>
                    <BadgeStatus label={row.stage} type={row.stage} />
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    {row.acos}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    {row.spend}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    {row.sales}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    {row.orders}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)", color: "var(--text-primary)" }}>
                    {row.was}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)" }}>
                    <BadgeStatus label={row.gate} type={row.gate} />
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-color)" }}>
                    <BadgeStatus label={row.segment} type={row.segment} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
