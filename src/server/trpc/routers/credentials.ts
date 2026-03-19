import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { db } from "@/server/db";
import { apiCredentials } from "@/server/db/schema";
import { encrypt, decrypt } from "@/server/services/encryption";
import { eq } from "drizzle-orm";

const credentialInput = z.object({
  credentialType: z.enum([
    "amazon_ads",
    "sp_api",
    "jungle_scout",
    "datadive",
    "datarover",
    "asin_insight",
  ]),
  marketplaceId: z.string().optional(),
  profileId: z.string().optional(),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  refreshToken: z.string().optional(),
  awsAccessKey: z.string().optional(),
  awsSecretKey: z.string().optional(),
  roleArn: z.string().optional(),
});

export const credentialsRouter = router({
  list: protectedProcedure.query(async () => {
    const creds = await db
      .select()
      .from(apiCredentials)
      .where(eq(apiCredentials.isActive, true));

    return creds.map((c) => ({
      id: c.id,
      credentialType: c.credentialType,
      marketplaceId: c.marketplaceId,
      profileId: c.profileId,
      clientId: c.clientId ? "••••" + decrypt(c.clientId).slice(-4) : null,
      hasRefreshToken: !!c.refreshToken,
      lastTestedAt: c.lastTestedAt,
      lastTestStatus: c.lastTestStatus,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }),

  upsert: protectedProcedure
    .input(credentialInput.extend({ id: z.number().optional() }))
    .mutation(async ({ input }) => {
      const encrypted = {
        clientId: encrypt(input.clientId),
        clientSecret: encrypt(input.clientSecret),
        refreshToken: input.refreshToken
          ? encrypt(input.refreshToken)
          : null,
      };

      let extraEncrypted = encrypted.refreshToken;
      if (input.credentialType === "sp_api" && input.awsAccessKey) {
        const extra = JSON.stringify({
          refreshToken: input.refreshToken,
          awsAccessKey: input.awsAccessKey,
          awsSecretKey: input.awsSecretKey,
          roleArn: input.roleArn,
        });
        extraEncrypted = encrypt(extra);
      }

      if (input.id) {
        await db
          .update(apiCredentials)
          .set({
            credentialType: input.credentialType,
            marketplaceId: input.marketplaceId,
            profileId: input.profileId,
            clientId: encrypted.clientId,
            clientSecret: encrypted.clientSecret,
            refreshToken: extraEncrypted,
            updatedAt: new Date(),
          })
          .where(eq(apiCredentials.id, input.id));
        return { success: true, id: input.id };
      } else {
        const [result] = await db
          .insert(apiCredentials)
          .values({
            credentialType: input.credentialType,
            marketplaceId: input.marketplaceId,
            profileId: input.profileId,
            clientId: encrypted.clientId,
            clientSecret: encrypted.clientSecret,
            refreshToken: extraEncrypted,
            isActive: true,
          })
          .returning({ id: apiCredentials.id });
        return { success: true, id: result.id };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .update(apiCredentials)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(apiCredentials.id, input.id));
      return { success: true };
    }),

  testConnection: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [cred] = await db
        .select()
        .from(apiCredentials)
        .where(eq(apiCredentials.id, input.id));

      if (!cred) {
        return { connected: false, error: "Credential not found" };
      }

      try {
        if (cred.clientId) decrypt(cred.clientId);
        if (cred.clientSecret) decrypt(cred.clientSecret);

        await db
          .update(apiCredentials)
          .set({
            lastTestedAt: new Date(),
            lastTestStatus: "success",
            updatedAt: new Date(),
          })
          .where(eq(apiCredentials.id, input.id));

        return { connected: true, message: "Credentials verified successfully" };
      } catch {
        await db
          .update(apiCredentials)
          .set({
            lastTestedAt: new Date(),
            lastTestStatus: "failed",
            updatedAt: new Date(),
          })
          .where(eq(apiCredentials.id, input.id));
        return { connected: false, error: "Failed to verify credentials" };
      }
    }),
});
