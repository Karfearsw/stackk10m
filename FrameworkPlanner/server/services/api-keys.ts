/**
 * API Key authentication for programmatic CRM access.
 * Allows AI agents and external integrations to authenticate via
 * Bearer tokens instead of session cookies.
 */
import { createHash, randomBytes } from "crypto";
import { db } from "../db.js";
import { apiKeys } from "../shared-schema.js";
import { eq, and, isNull } from "drizzle-orm";

const KEY_PREFIX = "lxrm_";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new API key for a user.
 * Returns the plaintext key (shown once) and the stored record.
 */
export async function createApiKey(
  userId: number,
  name: string,
  scopes: string[] = [],
  expiresAt?: Date
): Promise<{ key: string; record: any }> {
  const rawKey = KEY_PREFIX + randomBytes(32).toString("hex");
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  const [record] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes,
      expiresAt: expiresAt || null,
    })
    .returning();

  return { key: rawKey, record };
}

/**
 * Validate an API key from a Bearer token.
 * Returns the user ID and key record if valid, null otherwise.
 */
export async function validateApiKey(
  bearerToken: string
): Promise<{ userId: number; keyId: number; scopes: string[] } | null> {
  if (!bearerToken || !bearerToken.startsWith(KEY_PREFIX)) {
    return null;
  }

  const keyHash = hashKey(bearerToken);
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);

  if (!key) return null;

  // Check expiration
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    return null;
  }

  // Update last used
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  return {
    userId: key.userId,
    keyId: key.id,
    scopes: key.scopes || [],
  };
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(keyId: number, userId: number): Promise<boolean> {
  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.userId, userId),
        isNull(apiKeys.revokedAt)
      )
    )
    .returning();

  return result.length > 0;
}

/**
 * List API keys for a user (without exposing hashes).
 */
export async function listApiKeys(userId: number): Promise<any[]> {
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));

  return keys;
}
