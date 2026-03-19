import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LayoutDashboard } from "lucide-react";

export default function OverviewPage() {
  return (
    <div>
      <PageHeader
        title="Executive Control Panel"
        description="Real-time overview of PPC performance across all brands and marketplaces."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Data Pipeline Setup Required"
        description="Connect your Amazon Advertising API credentials and configure product sync to populate the dashboard with live data."
        actionLabel="Go to Settings"
      />
    </div>
  );
}
