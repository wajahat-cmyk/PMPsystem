import { initTRPC, TRPCError } from "@trpc/server";
import { type FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "@/server/db";
import { cookies } from "next/headers";
import { verifyToken } from "@/server/services/auth";
import type { TokenPayload } from "@/server/services/auth";


export async function createContext(opts: FetchCreateContextFnOptions) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;

  let user: TokenPayload | null = null;

  if (token) {
    try {
      user = verifyToken(token);
    } catch {
      // Invalid or expired token — treat as unauthenticated
    }
  }

  return { db, user };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
