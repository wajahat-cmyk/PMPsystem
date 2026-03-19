import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";

const startTime = Date.now();

export async function GET() {
  let dbConnected = false;

  try {
    await db.execute(sql`SELECT 1`);
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  const uptimeMs = Date.now() - startTime;
  const uptimeSeconds = Math.floor(uptimeMs / 1000);

  return NextResponse.json({
    status: dbConnected ? "ok" : "degraded",
    uptime: uptimeSeconds,
    dbConnected,
    timestamp: new Date().toISOString(),
  });
}
