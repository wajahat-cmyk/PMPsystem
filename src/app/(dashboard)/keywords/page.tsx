import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Search } from "lucide-react";

export default function KeywordsPage() {
  return (
    <div>
      <PageHeader
        title="Keyword Engine"
        description="Discover, analyze, and manage keywords across all campaigns."
      />
      <EmptyState
        icon={Search}
        title="No Keywords Loaded"
        description="Keywords will appear here once your data pipeline is configured and the first sync completes."
      />
    </div>
  );
}
