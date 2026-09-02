"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Play,
  PlusCircle,
  RotateCcw,
  CheckCircle2,
  Clock,
  Video,
  FileText,
  Mail,
  RefreshCw,
  Cpu,
  AlertCircle,
} from "lucide-react";
import { JobType } from "@/lib/queue";

export default function QueueSection() {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<JobType>("GENERATE_PDF_INVOICE");
  const [isAutoWorkerRunning, setIsAutoWorkerRunning] = useState(false);
  const autoWorkerRef = useRef<any>(null);

  // ---------------------------------------------------------
  // React Query: Fetch Queue Snapshot (GET /api/queue/jobs)
  // ---------------------------------------------------------
  const { data: queueData, isFetching } = useQuery({
    queryKey: ["queue-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/queue/jobs");
      return res.json();
    },
    refetchInterval: 1500, // 1.5s live polling
  });

  // ---------------------------------------------------------
  // React Query: Enqueue Job (POST /api/queue/enqueue)
  // ---------------------------------------------------------
  const enqueueMutation = useMutation({
    mutationFn: async (type: JobType) => {
      const res = await fetch("/api/queue/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          payload: {
            orderId: Math.floor(Math.random() * 90000 + 10000),
            email: "customer@example.com",
            videoTitle: "Summer_Conference_2026_4K.mp4",
          },
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue-jobs"] });
    },
  });

  // ---------------------------------------------------------
  // React Query: Worker Process Job (POST /api/queue/process)
  // ---------------------------------------------------------
  const workerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/queue/process", { method: "POST" });
      if (res.status === 204) return { processed: false, message: "Queue is empty." };
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue-jobs"] });
    },
  });

  // ---------------------------------------------------------
  // React Query: Clear Queue (POST /api/queue/reset)
  // ---------------------------------------------------------
  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/queue/reset", { method: "POST" });
      return res.json();
    },
    onSuccess: () => {
      setIsAutoWorkerRunning(false);
      queryClient.invalidateQueries({ queryKey: ["queue-jobs"] });
    },
  });

  // Batch dispatch 5 jobs
  const dispatchBatchJobs = async () => {
    const types: JobType[] = [
      "TRANSCODE_VIDEO_4K",
      "GENERATE_PDF_INVOICE",
      "SEND_WELCOME_EMAIL",
      "SYNC_INVENTORY_ERP",
      "GENERATE_PDF_INVOICE",
    ];
    for (const t of types) {
      await enqueueMutation.mutateAsync(t);
    }
  };

  // Auto Worker Loop
  useEffect(() => {
    if (isAutoWorkerRunning) {
      autoWorkerRef.current = setInterval(async () => {
        await workerMutation.mutateAsync();
      }, 1000);
    } else {
      if (autoWorkerRef.current) clearInterval(autoWorkerRef.current);
    }
    return () => {
      if (autoWorkerRef.current) clearInterval(autoWorkerRef.current);
    };
  }, [isAutoWorkerRunning]);

  const jobs = queueData?.jobs || [];
  const pendingJobs = jobs.filter((j: any) => j.status === "pending");
  const processingJobs = jobs.filter((j: any) => j.status === "processing");
  const completedJobs = jobs.filter((j: any) => j.status === "completed");
  const failedJobs = jobs.filter((j: any) => j.status === "failed");

  const getJobIcon = (type: JobType) => {
    switch (type) {
      case "TRANSCODE_VIDEO_4K":
        return <Video size={16} color="var(--neon-cyan)" />;
      case "GENERATE_PDF_INVOICE":
        return <FileText size={16} color="var(--neon-amber)" />;
      case "SEND_WELCOME_EMAIL":
        return <Mail size={16} color="var(--neon-violet)" />;
      case "SYNC_INVENTORY_ERP":
        return <RefreshCw size={16} color="var(--neon-emerald)" />;
      default:
        return <Layers size={16} />;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Producer & Worker Controller */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "rgba(251, 191, 36, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers size={22} color="var(--neon-amber)" />
            </div>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: "800" }}>
                Redis Asynchronous Job Queue &amp; Background Worker
              </h2>
              <p style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>
                Decoupled Producer/Consumer pattern using Redis Lists (<code>LPUSH</code> / <code>RPOP</code>) &amp; Task State Machines.
              </p>
            </div>
          </div>

          <button onClick={() => clearMutation.mutate()} className="btn-neon-danger" disabled={clearMutation.isPending}>
            <RotateCcw size={14} />
            Purge All Queues
          </button>
        </div>

        {/* Action Controls Bar */}
        <div
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          {/* Producer Controls */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", color: "var(--text-dim)", fontWeight: "600" }}>Task Type:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as JobType)}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-white)",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
              }}
            >
              <option value="GENERATE_PDF_INVOICE">🧾 Generate PDF Invoice</option>
              <option value="TRANSCODE_VIDEO_4K">🎬 Transcode 4K Video</option>
              <option value="SEND_WELCOME_EMAIL">📧 Send Welcome Email</option>
              <option value="SYNC_INVENTORY_ERP">🔄 Sync ERP Inventory</option>
            </select>

            <button
              onClick={() => enqueueMutation.mutate(selectedType)}
              className="btn-neon-primary"
              disabled={enqueueMutation.isPending}
            >
              <PlusCircle size={15} />
              Enqueue Single Job
            </button>

            <button
              onClick={dispatchBatchJobs}
              className="btn-neon-secondary"
              disabled={enqueueMutation.isPending}
            >
              ⚡ Dispatch 5 Batch Jobs
            </button>
          </div>

          {/* Consumer / Worker Controls */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              onClick={() => workerMutation.mutate()}
              className="btn-neon-secondary"
              disabled={workerMutation.isPending || isAutoWorkerRunning}
            >
              <Play size={15} />
              {workerMutation.isPending ? "Worker Processing..." : "Process 1 Job (Worker)"}
            </button>

            <button
              onClick={() => setIsAutoWorkerRunning(!isAutoWorkerRunning)}
              className={isAutoWorkerRunning ? "btn-neon-danger" : "btn-neon-primary"}
            >
              <Cpu size={15} />
              {isAutoWorkerRunning ? "Stop Auto-Worker" : "Start Background Auto-Worker Loop"}
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Kanban Pipeline Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        {/* Column 1: Pending Queue */}
        <div className="glass-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Clock size={16} color="var(--neon-amber)" />
              <h3 style={{ fontSize: "15px", fontWeight: "700" }}>⏳ Pending Queue</h3>
            </div>
            <span className="chip chip-miss">{pendingJobs.length}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: "220px", maxHeight: "420px", overflowY: "auto" }}>
            {pendingJobs.map((job: any) => (
              <div
                key={job.id}
                style={{
                  background: "rgba(251, 191, 36, 0.06)",
                  border: "1px solid rgba(251, 191, 36, 0.25)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  {getJobIcon(job.type)}
                  <strong style={{ fontSize: "13px" }}>{job.type}</strong>
                </div>
                <code style={{ fontSize: "11px", color: "var(--text-dim)" }}>{job.id}</code>
              </div>
            ))}
            {pendingJobs.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                No pending jobs. Enqueue a task to begin!
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Active Processing */}
        <div className="glass-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Cpu size={16} color="var(--neon-cyan)" />
              <h3 style={{ fontSize: "15px", fontWeight: "700" }}>⚙️ Active Processing</h3>
            </div>
            <span className="chip chip-violet">{processingJobs.length}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: "220px", maxHeight: "420px", overflowY: "auto" }}>
            {processingJobs.map((job: any) => (
              <div
                key={job.id}
                style={{
                  background: "rgba(0, 242, 254, 0.08)",
                  border: "1px solid rgba(0, 242, 254, 0.35)",
                  borderRadius: "10px",
                  padding: "14px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span className="live-indicator"></span>
                  <strong style={{ fontSize: "13.5px" }}>{job.type}</strong>
                </div>
                <code style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "8px" }}>
                  {job.id}
                </code>
                {/* Progress Bar */}
                <div style={{ background: "rgba(255,255,255,0.08)", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: "60%",
                      background: "linear-gradient(90deg, #00f2fe, #38bdf8)",
                      animation: "shimmer 1.5s infinite",
                    }}
                  />
                </div>
              </div>
            ))}
            {processingJobs.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                Workers idle. Click "Process 1 Job" to consume tasks!
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Completed Jobs */}
        <div className="glass-card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={16} color="var(--neon-emerald)" />
              <h3 style={{ fontSize: "15px", fontWeight: "700" }}>✅ Completed Tasks</h3>
            </div>
            <span className="chip chip-hit">{completedJobs.length}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minHeight: "220px", maxHeight: "420px", overflowY: "auto" }}>
            {completedJobs.map((job: any) => (
              <div
                key={job.id}
                style={{
                  background: "rgba(16, 185, 129, 0.06)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {getJobIcon(job.type)}
                    <strong style={{ fontSize: "13px" }}>{job.type}</strong>
                  </div>
                  {job.durationMs && (
                    <span style={{ fontSize: "11.5px", fontFamily: "var(--font-mono)", color: "var(--neon-emerald)" }}>
                      {job.durationMs}ms
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-dim)", lineHeight: "1.4" }}>
                  {job.result}
                </p>
              </div>
            ))}
            {completedJobs.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                No completed tasks yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
