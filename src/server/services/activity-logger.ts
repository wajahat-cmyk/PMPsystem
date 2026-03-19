import { db } from "@/server/db";
import { activityLog } from "@/server/db/schema";

export async function logActivity(params: {
  actorType: "user" | "system" | "automation";
  actorName?: string;
  eventCategory:
    | "ppc"
    | "listing"
    | "manual_input"
    | "system";
  eventType: string;
  eventAction: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  productId?: number;
  brandId?: number;
  marketplaceId?: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  changeDelta?: string;
  source?: string;
  notes?: string;
}) {
  await db.insert(activityLog).values({
    timestamp: new Date(),
    actorType: params.actorType.toUpperCase(),
    actorName: params.actorName ?? null,
    eventCategory: params.eventCategory,
    eventType: params.eventType,
    eventAction: params.eventAction,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    entityName: params.entityName ?? null,
    productId: params.productId ?? null,
    brandId: params.brandId ?? null,
    marketplaceId: params.marketplaceId ?? null,
    fieldChanged: params.fieldChanged ?? null,
    oldValue: params.oldValue ?? null,
    newValue: params.newValue ?? null,
    changeDelta: params.changeDelta ?? null,
    source: params.source ?? null,
    notes: params.notes ?? null,
  });
}
