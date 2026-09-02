// =============================================================
// lib/queue.ts — Redis Asynchronous Job Queue & Background Worker
// =============================================================
//
// HOW A REDIS MESSAGE QUEUE WORKS UNDER THE HOOD:
//   1. Producer (Web Request):
//      - Generates a unique Job ID.
//      - Stores job metadata in "job:{id}".
//      - Pushes ID to the pending list: `LPUSH queue:jobs:pending <id>`.
//      - Returns 202 Accepted to the client immediately (<2ms)!
//
//   2. Consumer / Worker:
//      - Pops the oldest job from the queue: `RPOP queue:jobs:pending`.
//      - Moves ID to `queue:jobs:processing`.
//      - Executes heavy task (Transcoding, PDF generation, Email sending).
//      - Updates job state in "job:{id}" to 'completed' or 'failed'.
//      - If failed after retries, moves to Dead Letter Queue (DLQ).
// =============================================================

import redis from "@/lib/redis";

export type JobType =
  | "TRANSCODE_VIDEO_4K"
  | "GENERATE_PDF_INVOICE"
  | "SEND_WELCOME_EMAIL"
  | "SYNC_INVENTORY_ERP";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, any>;
  status: JobStatus;
  progress: number; // 0 to 100%
  result?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

/**
 * Enqueues a new background job into Redis (Producer).
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, any> = {},
  maxRetries = 3
): Promise<Job> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const job: Job = {
    id: jobId,
    type,
    payload,
    status: "pending",
    progress: 0,
    retryCount: 0,
    maxRetries,
    createdAt: Date.now(),
  };

  const pipeline = redis.pipeline();

  // 1. Store full job metadata
  pipeline.set(`job:${jobId}`, JSON.stringify(job), { ex: 86400 }); // 24h TTL

  // 2. Push job ID into FIFO Pending List (LPUSH)
  pipeline.lpush("queue:jobs:pending", jobId);

  // 3. Track in master job registry
  pipeline.sadd("queue:jobs:all", jobId);

  await pipeline.exec();
  console.log(`📦 [Producer] Enqueued job "${jobId}" (Type: ${type})`);

  return job;
}

/**
 * Simulates heavy worker execution for a specific job type.
 */
async function executeJobTask(job: Job): Promise<string> {
  switch (job.type) {
    case "TRANSCODE_VIDEO_4K":
      // Simulate multi-pass video encoding (1080p, 720p, 480p)
      await new Promise((r) => setTimeout(r, 600));
      return `Encoded 4K video to H.264 / AAC 1080p, 720p, 480p adaptive bitrate streams.`;

    case "GENERATE_PDF_INVOICE":
      // Simulate rendering HTML to PDF and uploading to S3
      await new Promise((r) => setTimeout(r, 400));
      return `Generated 5-page PDF invoice #INV-${job.payload.orderId || "9821"} with tax calculations.`;

    case "SEND_WELCOME_EMAIL":
      // Simulate SMTP connection and template compilation
      await new Promise((r) => setTimeout(r, 300));
      return `Delivered welcome email to ${job.payload.email || "customer@example.com"} via SendGrid.`;

    case "SYNC_INVENTORY_ERP":
      // Simulate batch syncing items
      await new Promise((r) => setTimeout(r, 500));
      return `Synchronized 450 SKU inventory balances with SAP / Oracle ERP.`;

    default:
      await new Promise((r) => setTimeout(r, 300));
      return `Task executed successfully.`;
  }
}

/**
 * Pops the next job from the queue and executes it (Worker / Consumer).
 */
export async function processNextJob(): Promise<{
  processed: boolean;
  job?: Job;
  message: string;
}> {
  // 1. Pop the oldest job from the tail of the pending list (FIFO)
  const jobId = await redis.rpop("queue:jobs:pending");

  if (!jobId || typeof jobId !== "string") {
    return { processed: false, message: "Queue is empty. No pending jobs to process." };
  }

  // 2. Fetch job metadata
  const rawJob = await redis.get(`job:${jobId}`);
  if (!rawJob) {
    return { processed: false, message: `Job ${jobId} not found in store.` };
  }

  const job: Job = typeof rawJob === "string" ? JSON.parse(rawJob) : (rawJob as Job);

  // 3. Update status to 'processing'
  job.status = "processing";
  job.startedAt = Date.now();
  job.progress = 25;
  await redis.set(`job:${jobId}`, JSON.stringify(job), { ex: 86400 });
  await redis.sadd("queue:jobs:processing", jobId);

  console.log(`⚙️ [Worker] Processing job "${jobId}" (${job.type})...`);

  // 4. Execute the task
  const start = performance.now();
  try {
    const result = await executeJobTask(job);
    const duration = Number((performance.now() - start).toFixed(0));

    job.status = "completed";
    job.progress = 100;
    job.result = result;
    job.completedAt = Date.now();
    job.durationMs = duration;

    // 5. Update state in Redis
    const pipeline = redis.pipeline();
    pipeline.set(`job:${jobId}`, JSON.stringify(job), { ex: 86400 });
    pipeline.srem("queue:jobs:processing", jobId);
    pipeline.lpush("queue:jobs:completed", jobId);
    pipeline.ltrim("queue:jobs:completed", 0, 49); // keep last 50
    await pipeline.exec();

    console.log(`✅ [Worker] Completed job "${jobId}" in ${duration}ms!`);
    return { processed: true, job, message: `Job ${jobId} completed successfully.` };
  } catch (error: any) {
    job.retryCount += 1;
    job.error = error.message || "Execution error";

    const pipeline = redis.pipeline();
    pipeline.srem("queue:jobs:processing", jobId);

    if (job.retryCount < job.maxRetries) {
      // Re-enqueue for retry
      job.status = "pending";
      pipeline.set(`job:${jobId}`, JSON.stringify(job), { ex: 86400 });
      pipeline.lpush("queue:jobs:pending", jobId);
      await pipeline.exec();
      return { processed: false, job, message: `Job ${jobId} failed, re-queued for retry.` };
    } else {
      // Move to Dead Letter Queue (DLQ)
      job.status = "failed";
      pipeline.set(`job:${jobId}`, JSON.stringify(job), { ex: 86400 });
      pipeline.lpush("queue:jobs:failed", jobId);
      await pipeline.exec();
      return { processed: false, job, message: `Job ${jobId} permanently failed after ${job.maxRetries} retries.` };
    }
  }
}

/**
 * Returns all jobs categorized by state (Pending, Processing, Completed, Failed).
 */
export async function getQueueSnapshot(): Promise<{
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  jobs: Job[];
}> {
  const allJobIds = await redis.smembers("queue:jobs:all");
  if (!Array.isArray(allJobIds) || allJobIds.length === 0) {
    return {
      pendingCount: 0,
      processingCount: 0,
      completedCount: 0,
      failedCount: 0,
      jobs: [],
    };
  }

  // Pipeline fetch all job JSON documents
  const pipeline = redis.pipeline();
  for (const id of allJobIds) {
    pipeline.get(`job:${id}`);
  }
  const rawDocs = await pipeline.exec();

  const jobs: Job[] = [];
  for (const raw of rawDocs) {
    if (raw) {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        jobs.push(parsed as Job);
      } catch {
        // ignore parse error
      }
    }
  }

  // Sort by newest first
  jobs.sort((a, b) => b.createdAt - a.createdAt);

  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const processingCount = jobs.filter((j) => j.status === "processing").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;

  return {
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
    jobs,
  };
}

/**
 * Clears all queues and job records for a clean test state.
 */
export async function clearQueue(): Promise<void> {
  const allJobIds = await redis.smembers("queue:jobs:all");
  const pipeline = redis.pipeline();

  for (const id of allJobIds) {
    pipeline.del(`job:${id}`);
  }

  pipeline.del("queue:jobs:pending");
  pipeline.del("queue:jobs:processing");
  pipeline.del("queue:jobs:completed");
  pipeline.del("queue:jobs:failed");
  pipeline.del("queue:jobs:all");

  await pipeline.exec();
  console.log("🧹 Cleared all Redis queue items.");
}
