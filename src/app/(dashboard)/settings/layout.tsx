"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

const settingsTabs = [
  { label: "Credentials", href: "/settings/credentials" },
  { label: "Products", href: "/settings/products" },
  { label: "Sync", href: "/settings/sync" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage API credentials, products, and sync configuration."
      />
      <div className="mb-6 border-b border-zinc-800">
        <nav className="flex gap-6">
          {settingsTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "pb-3 text-sm font-medium transition-colors border-b-2",
                pathname === tab.href
                  ? "border-blue-500 text-white"
                  : "border-transparent text-zinc-400 hover:text-white"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
