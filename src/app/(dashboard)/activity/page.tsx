import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { History } from "lucide-react";

export default function ActivityPage() {
  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Track all system events, syncs, and user actions."
      />
      <EmptyState
        icon={History}
        title="No Activity Yet"
        description="System events and user actions will be logged here as you use the platform."
      />
    </div>
  );
}
