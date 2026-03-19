"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950">
      {/* Sidebar - fixed height */}
      <Sidebar />

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0 h-full">
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-zinc-950">
          {children}
        </main>
      </div>
    </div>
  );
}
