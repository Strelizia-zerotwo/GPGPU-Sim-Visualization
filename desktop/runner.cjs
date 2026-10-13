const { EventEmitter } = require("node:events");
const { randomUUID } = require("node:crypto");
const Gpu = require("./ui/gpu-model.js");

const TERMINAL = new Set([
  "completed",
  "failed",
  "incorrect",
  "incomplete",
  "limited",
  "timed_out",
  "cancelled",
  "interrupted",
  "unverified",
]);

class JobManager extends EventEmitter {
  constructor(startWorker, jobs = []) {
    super();
    this.startWorker = startWorker;
    this.jobs = jobs.map((job) => ({
      ...job,
      status: TERMINAL.has(job.status) ? job.status : "interrupted",
    }));
    this.active = new Map();
    this.maxConcurrent = 1;
    this.paused = false;
  }

  snapshot() {
    return this.jobs.map((job) => ({ ...job }));
  }

  changed() {
    this.emit("change", this.snapshot());
  }

  submit(spec, environment, catalog) {
    const modules = spec.benchmarkModules || [...new Set(spec.benchmarks || [])].map(id => ({ id, sizes: spec.sizes || [] }));
    const gpuModules = spec.gpuModules || [...new Set(spec.profiles || [])].map(id => ({ id }));
    if (!Array.isArray(modules) || !Array.isArray(gpuModules) || !modules.length || !gpuModules.length)
      throw new Error("请选择 benchmark、规模和 GPU 配置。");
    const benchmarkPlans = modules.map(module => {
      const benchmark = catalog.benchmarks.find(b => b.id === module.id && b.available);
      if (!benchmark) throw new Error("所选 benchmark 源码尚未就绪。");
      const sizes = [...new Set(module.sizes || [])];
      if (!sizes.length || !sizes.every(n => Number.isInteger(n) && n >= (benchmark.minSize || 1) && n <= 4096))
        throw new Error(`${benchmark.name || module.id} 的规模须为 ${benchmark.minSize || 1}–4096 的整数。`);
      const parameters = module.parameters || {};
      if (typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("程序参数格式无效。");
      for (const [key, value] of Object.entries(parameters)) {
        const field = (benchmark.parameters || []).find(p => p.key === key);
        if (!field || !Number.isInteger(value) || value < field.min || value > field.max) throw new Error(`程序参数 ${key} 无效。`);
      }
      const blocks = {};
      for (const field of benchmark.parameters || []) {
        if (field.group !== "launch") continue;
        const prefix = field.key.replace(/_[XYZ]$/, "");
        blocks[prefix] = (blocks[prefix] || 1) * (parameters[field.key] ?? field.default);
      }
      if (Object.values(blocks).some(n => n > 1024)) throw new Error("线程块的线程总数不能超过 1024。");
      const runtimeArgs = module.runtimeArgs ?? benchmark.args ?? [];
      if (!Array.isArray(runtimeArgs) || runtimeArgs.length > 30 || runtimeArgs.some(a => typeof a !== "string" || a.length >= 500 || a.includes("\0")) || (benchmark.kind !== "custom" && runtimeArgs.length)) throw new Error("程序运行参数无效。");
      return { benchmark, sizes, parameters: { ...parameters }, runtimeArgs: [...runtimeArgs] };
    });
    const profilePlans = gpuModules.map(module => {
      const custom = module.id?.startsWith("custom-");
      const baseId = custom ? module.baseProfileId : module.id;
      const base = catalog.profiles.find(p => p.id === baseId && p.supported);
      if (!base) throw new Error("所选 GPU 配置与当前 CUDA 不兼容，或自定义 GPU 尚未选择模板。");
      let text = spec.drafts?.[module.id] || base.text;
      if (custom) {
        if (typeof module.name !== "string" || !module.name.trim() || module.name.length > 80) throw new Error("请填写自定义 GPU 名称（最多 80 字）。");
        const template = module.templateText || base.text;
        if (typeof template !== "string" || template.length > 200000) throw new Error("GPU 模板文本无效。");
        text = Gpu.build(template, module.values || {});
      }
      if (typeof text !== "string" || text.length > 200000) throw new Error("GPU 配置文本无效。");
      if (spec.drafts?.[module.id]) {
        const errors = Gpu.validate(Gpu.read(text), base.text);
        if (errors.length) throw new Error(errors.join("；"));
      }
      const name = typeof module.name === "string" && module.name.trim() && module.name.length <= 80 ? module.name.trim() : base.name;
      return { id: module.id, baseId, text, name: custom ? module.name.trim() : name + (text !== base.text ? " · 已修改" : "") };
    });
    const repeats = spec.repeats ?? 1;
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 100)
      throw new Error("每个组合的重复次数须为 1–100。");
    if (benchmarkPlans.reduce((n, b) => n + b.sizes.length, 0) * profilePlans.length * repeats > 100)
      throw new Error("单次最多提交 100 个实验。");
    const concurrency = Number(spec.maxConcurrent);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32)
      throw new Error("最大并发数须为 1–32。");
    if (
      !Number.isInteger(spec.maxCycles) ||
      spec.maxCycles < 0 ||
      spec.maxCycles > Number.MAX_SAFE_INTEGER
    )
      throw new Error("周期上限须为非负整数。");
    if (
      !Number.isFinite(spec.wallMinutes) ||
      spec.wallMinutes < 1 ||
      spec.wallMinutes > 10080
    )
      throw new Error("时间上限须为 1–10080 分钟。");
    this.maxConcurrent = concurrency;
    const batchId = randomUUID();
    const created = [];
    for (const plan of benchmarkPlans)
      for (const size of plan.sizes)
        for (const profile of profilePlans)
          for (let repeatIndex = 1; repeatIndex <= repeats; repeatIndex++) {
            const job = {
              id: randomUUID(),
              batchId,
              canvasEdgeId: typeof spec.canvas?.edgeId === "string" ? spec.canvas.edgeId.slice(0, 100) : null,
              benchmarkNodeId: typeof spec.canvas?.benchmarkNodeId === "string" ? spec.canvas.benchmarkNodeId.slice(0, 100) : null,
              gpuNodeId: typeof spec.canvas?.gpuNodeId === "string" ? spec.canvas.gpuNodeId.slice(0, 100) : null,
              benchmark: plan.benchmark.id,
              benchmarkName: plan.benchmark.name || plan.benchmark.id.toUpperCase(),
              size,
              parameters: { ...plan.parameters },
              runtimeArgs: [...plan.runtimeArgs],
              workloadLabel: Object.keys(plan.parameters).length ? Object.entries(plan.parameters).map(([k, v]) => `${k}=${v}`).join(" · ") + ` · 规模 ${size}` : `规模 ${size}`,
              repeatIndex,
              repeatCount: repeats,
              profileId: profile.id,
              baseProfileId: profile.baseId,
              profileName: profile.name,
              configText: profile.text,
              maxCycles: spec.maxCycles,
              wallMinutes: spec.wallMinutes,
              environment: { ...environment },
              status: "queued",
              createdAt: new Date().toISOString(),
              metrics: {},
              correctness: "unknown",
              elapsedSeconds: 0,
            };
            this.jobs.push(job);
            created.push(job.id);
          }
    this.changed();
    this.pump();
    return created;
  }

  pump() {
    if (this.paused) return;
    while (this.active.size < this.maxConcurrent) {
      const job = this.jobs.find((j) => j.status === "queued");
      if (!job) break;
      job.status = "preparing";
      job.startedAt = new Date().toISOString();
      // Register before launching so a synchronous worker cannot exceed the limit.
      const slot = { cancel: () => {} };
      this.active.set(job.id, slot);
      this.changed();
      const onEvent = (event) => {
        if (!this.active.has(job.id)) return;
        if (event.type === "stage") {
          if (job.status !== "cancelling") job.status = event.stage;
        } else if (event.type === "prepared") {
          job.workDir = event.workDir;
          job.manifest = event.manifest;
        } else if (event.type === "log") {
          this.emit("log", {
            jobId: job.id,
            channel: event.channel,
            text: event.text,
          });
          return;
        } else if (event.type === "done") {
          // Windows and WSL clocks can differ; UI timestamps share the host clock.
          Object.assign(job, event.result, {
            backendFinishedAt: event.result.finishedAt,
            finishedAt: new Date().toISOString(),
          });
          this.active.delete(job.id);
          this.changed();
          this.pump();
          return;
        } else if (event.type === "error") {
          Object.assign(job, {
            status: "failed",
            error: event.message,
            finishedAt: new Date().toISOString(),
          });
          this.active.delete(job.id);
          this.changed();
          this.pump();
          return;
        }
        this.changed();
      };
      try {
        slot.cancel = this.startWorker(job, onEvent).cancel;
      } catch (error) {
        onEvent({ type: "error", message: error.message });
      }
    }
  }

  cancel(id) {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || TERMINAL.has(job.status)) return;
    if (job.status === "queued") {
      job.status = "cancelled";
      job.finishedAt = new Date().toISOString();
    } else {
      job.status = "cancelling";
      this.active.get(id)?.cancel();
    }
    this.changed();
  }

  stopAll() {
    this.paused = true;
    for (const job of this.jobs) this.cancel(job.id);
  }
}

module.exports = { JobManager, TERMINAL };
