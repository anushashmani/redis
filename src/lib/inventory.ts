// =============================================================
// lib/inventory.ts — Flash Sale Inventory & Order Processing
// =============================================================

import { randomUUID } from "crypto";
import redis from "@/lib/redis";
import { acquireLock, releaseLock } from "@/lib/lock";

export interface CheckoutResult {
  status: "SUCCESS" | "LOCKED" | "OUT_OF_STOCK" | "ERROR";
  message: string;
  orderId?: string;
  remainingStock?: number;
  userId?: string;
  itemId?: string;
  processingTimeMs?: number;
}

/**
 * Returns current real-time stock count for a flash-sale item.
 */
export async function getInventory(itemId: string): Promise<number> {
  const stockKey = `inventory:stock:${itemId}`;
  const stock = await redis.get<number>(stockKey);
  return stock !== null && stock !== undefined ? Number(stock) : 0;
}

/**
 * Resets inventory stock for testing flash sales.
 */
export async function resetInventory(
  itemId: string,
  initialStock = 5
): Promise<{ itemId: string; stock: number }> {
  const stockKey = `inventory:stock:${itemId}`;
  const ordersKey = `inventory:orders:${itemId}`;
  const lockKey = `lock:inventory:${itemId}`;

  await redis.set(stockKey, initialStock);
  await redis.del(ordersKey);
  await redis.del(lockKey);

  console.log(`🔄 Inventory Reset: "${itemId}" set to ${initialStock} units in stock.`);
  return { itemId, stock: initialStock };
}

/**
 * Attempts a concurrent flash-sale purchase protected by a distributed lock.
 *
 * CRITICAL SECTION:
 *   1. Acquire Lock ("inventory:{itemId}")
 *   2. Check remaining stock in Redis
 *   3. If stock >= quantity:
 *        • Decrement stock
 *        • Simulate payment latency (~100ms)
 *        • Record order
 *   4. Safely release lock using atomic Lua script
 */
export async function processFlashSaleCheckout(
  itemId: string,
  userId: string,
  quantity = 1,
  simulatePaymentLatencyMs = 100
): Promise<CheckoutResult> {
  const start = performance.now();
  const resourceId = `inventory:${itemId}`;
  const stockKey = `inventory:stock:${itemId}`;
  const ordersKey = `inventory:orders:${itemId}`;

  // ----------------------------------------------------------
  // STEP 1 — Acquire Distributed Lock
  // ----------------------------------------------------------
  // We set a 5-second TTL on the lock so it auto-expires if this
  // instance crashes, but under normal conditions we release it
  // immediately in the finally block.
  const lock = await acquireLock(resourceId, 5);

  if (!lock.acquired) {
    const elapsed = Math.round(performance.now() - start);
    return {
      status: "LOCKED",
      itemId,
      userId,
      message: "High traffic contention! Another customer is currently reserving this item. Please retry.",
      processingTimeMs: elapsed,
    };
  }

  try {
    // ----------------------------------------------------------
    // STEP 2 — Check Current Inventory Stock
    // ----------------------------------------------------------
    const currentStockRaw = await redis.get<number>(stockKey);
    const currentStock = currentStockRaw !== null ? Number(currentStockRaw) : 0;

    console.log(`📦 Stock Check for "${itemId}": ${currentStock} units available (Requested: ${quantity})`);

    if (currentStock < quantity) {
      const elapsed = Math.round(performance.now() - start);
      return {
        status: "OUT_OF_STOCK",
        itemId,
        userId,
        remainingStock: currentStock,
        message: `Flash sale item "${itemId}" is SOLD OUT. (0 remaining)`,
        processingTimeMs: elapsed,
      };
    }

    // ----------------------------------------------------------
    // STEP 3 — Atomically Decrement Inventory
    // ----------------------------------------------------------
    const updatedStock = await redis.decrby(stockKey, quantity);

    // Simulate payment gateway network roundtrip (e.g. Stripe charge)
    if (simulatePaymentLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulatePaymentLatencyMs));
    }

    // ----------------------------------------------------------
    // STEP 4 — Create Confirmed Order Record
    // ----------------------------------------------------------
    const orderId = `ord_${randomUUID().slice(0, 8)}`;
    const orderRecord = {
      orderId,
      itemId,
      userId,
      quantity,
      timestamp: new Date().toISOString(),
      remainingStock: updatedStock,
    };

    // Store in a Redis list of confirmed orders for this flash sale
    await redis.rpush(ordersKey, JSON.stringify(orderRecord));

    const elapsed = Math.round(performance.now() - start);
    console.log(`🎉 ORDER SUCCESS: ${orderId} by "${userId}"! Remaining stock: ${updatedStock}`);

    return {
      status: "SUCCESS",
      itemId,
      userId,
      orderId,
      remainingStock: updatedStock,
      message: `Order #${orderId} placed successfully!`,
      processingTimeMs: elapsed,
    };
  } catch (error) {
    console.error(`🔥 Checkout error during critical section:`, error);
    const elapsed = Math.round(performance.now() - start);
    return {
      status: "ERROR",
      itemId,
      userId,
      message: "Unexpected error during checkout.",
      processingTimeMs: elapsed,
    };
  } finally {
    // ----------------------------------------------------------
    // STEP 5 — Safe Distributed Unlock (Guaranteed via Lua script)
    // ----------------------------------------------------------
    await releaseLock(lock.lockKey, lock.lockToken);
  }
}
