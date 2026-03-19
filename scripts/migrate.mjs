#!/usr/bin/env node
/**
 * Railway start script: runs drizzle-kit push, then starts Next.js
 * This ensures DB tables exist before the app starts serving traffic.
 */
import { execSync } from "child_process";

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL) {
  console.log("[PMP] Running database migration...");
  try {
    execSync("npx drizzle-kit push --force", { stdio: "inherit" });
    console.log("[PMP] Database migration complete.");
  } catch (err) {
    console.error("[PMP] Migration failed:", err.message);
    console.log("[PMP] Starting app anyway — tables may need manual setup.");
  }
} else {
  console.log("[PMP] No DATABASE_URL — skipping migration.");
}

console.log("[PMP] Starting Next.js server...");
execSync("npm run start", { stdio: "inherit" });
