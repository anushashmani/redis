// =============================================================
// lib/lock.ts — Production-Ready Distributed Mutex Lock
// =============================================================
//
// WHY DO WE NEED A DISTRIBUTED LOCK?
//   In serverless / multi-instance architectures (Vercel, AWS,
//   Docker containers), multiple requests execute in parallel.
//
//   If 100 users click "Buy" for the last 1 item in stock at the
//   same millisecond:
//     ❌ Without lock: All 100 read `stock = 1`, all 100 process
//        payment, and stock ends up at `-99` (Oversold disaster).
//     ✅ With lock: Only 1 instance acquires the lock at a time,
//        verifies stock, decrements it, and finishes before the
//        next instance can enter.
//
// WHY USE A LUA SCRIPT TO UNLOCK?
//   If process A holds a lock for 5s, but takes 6s to complete,
//   the lock auto-expires and process B acquires it.
//   If process A blindly runs `DEL lock:item`, it would delete
//   process B's lock!
//   The Lua script checks `if GET(key) == my_token then DEL(key)`
//   atomically in a single CPU cycle inside Redis.
// =============================================================

import { randomUUID } from "crypto";
import redis from "@/lib/redis";

// Lua script for atomic unlock verification:
// Only delete the lock if the value currently in Redis matches our unique token.
const SAFE_UNLOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

export interface LockAcquisitionResult {
  acquired: boolean;
  lockKey: string;
  lockToken: string;
  ttlSeconds: number;
}

/**
 * Attempts to acquire an exclusive distributed lock for a given resource.
 *
 * @param resourceId - Identifier for the resource (e.g. "inventory:item_123")
 * @param ttlSeconds - Time-to-live in seconds before the lock auto-expires (default: 5s)
 * @returns LockAcquisitionResult with acquired status and unique unlock token
 */
export async function acquireLock(
  resourceId: string,
  ttlSeconds = 5
): Promise<LockAcquisitionResult> {
  const lockKey = `lock:${resourceId}`;
  const lockToken = randomUUID(); // Unique ownership token for this process instance

  try {
    // Redis command: SET key token NX EX ttlSeconds
    //   • NX: Only set if the key does NOT already exist
    //   • EX: Set expiry time in seconds (safety net against crashed processes)
    const result = await redis.set(lockKey, lockToken, {
      nx: true,
      ex: ttlSeconds,
    });

    const acquired = result === "OK";

    if (acquired) {
      console.log(`🔒 Lock ACQUIRED: "${lockKey}" (Token: ${lockToken.slice(0, 8)}…, TTL: ${ttlSeconds}s)`);
    } else {
      console.log(`⛔ Lock CONTENTION: "${lockKey}" is currently held by another process.`);
    }

    return {
      acquired,
      lockKey,
      lockToken,
      ttlSeconds,
    };
  } catch (error) {
    console.error(`🔥 Failed to acquire lock for "${lockKey}":`, error);
    return {
      acquired: false,
      lockKey,
      lockToken,
      ttlSeconds,
    };
  }
}

/**
 * Safely releases a distributed lock using an atomic Lua script.
 * Verifies that the caller is still the legitimate owner of the lock.
 *
 * @param lockKey - The Redis lock key (e.g. "lock:inventory:item_123")
 * @param lockToken - The unique UUID token generated during acquisition
 * @returns boolean - true if the lock was legitimately released, false otherwise
 */
export async function releaseLock(
  lockKey: string,
  lockToken: string
): Promise<boolean> {
  try {
    // Execute atomic Lua script
    const result = await redis.eval(SAFE_UNLOCK_LUA, [lockKey], [lockToken]);
    const released = result === 1;

    if (released) {
      console.log(`🔓 Lock RELEASED: "${lockKey}" (Token: ${lockToken.slice(0, 8)}…)`);
    } else {
      console.warn(`⚠️  Lock Release Skipped for "${lockKey}": Token mismatch or lock already expired.`);
    }

    return released;
  } catch (error) {
    console.error(`🔥 Error releasing lock "${lockKey}":`, error);
    return false;
  }
}

/**
 * High-level helper: Executes a critical section with automatic lock
 * acquisition and guaranteed safe release in a finally block.
 */
export async function withLock<T>(
  resourceId: string,
  ttlSeconds: number,
  criticalSection: () => Promise<T>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const lock = await acquireLock(resourceId, ttlSeconds);

  if (!lock.acquired) {
    return {
      success: false,
      error: `Resource "${resourceId}" is locked by another operation. Please try again.`,
    };
  }

  try {
    const data = await criticalSection();
    return { success: true, data };
  } finally {
    // Guaranteed release even if criticalSection throws an exception
    await releaseLock(lock.lockKey, lock.lockToken);
  }
}
