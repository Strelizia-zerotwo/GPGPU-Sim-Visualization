/* Shared by the renderer and job manager: values refer to the simulator model. */
(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.GpuModel = model;
})(globalThis, function () {
  const groups = [
    { id: "compute", title: "SM 计算阵列", subtitle: "并行计算 · 每个 SM", icon: "▦" },
    { id: "l1", title: "L1 数据缓存", subtitle: "每个 SM 的一级数据缓存", icon: "▤" },
    { id: "shared", title: "Shared Memory", subtitle: "每个 SM 的共享存储", icon: "▥" },
    { id: "network", title: "片上互连", subtitle: "连接 SM 与内存分区", icon: "⇄" },
    { id: "l2", title: "L2 缓存", subtitle: "所有内存分区共享", icon: "▰" },
    { id: "memory", title: "显存控制器", subtitle: "内存通道 · DRAM 时钟", icon: "▧" },
  ];
  const fields = [
    ["sms", "compute", "SM 总数", null, "个", 1, 4096],
    ["cores", "compute", "每个 Cluster 的 SM", "-gpgpu_n_cores_per_cluster", "个", 1, 128],
    ["coreClock", "compute", "核心时钟", "-gpgpu_clock_domains", "MHz", 1, 10000, 0],
    ["threads", "compute", "每个 SM 最大线程数", "-gpgpu_shader_core_pipeline", "线程", 32, 8192, 0],
    ["registers", "compute", "每个 SM 寄存器数", "-gpgpu_shader_registers", "个", 1, 1048576],
    ["ctas", "compute", "每个 SM 最大线程块", "-gpgpu_shader_cta", "个", 1, 128],
    ["schedulers", "compute", "每个 SM Warp 调度器", "-gpgpu_num_sched_per_core", "个", 1, 32],
    ["scheduler", "compute", "Warp 调度策略", "-gpgpu_scheduler", "", 0, 0],
    ["l1Sets", "l1", "缓存组数", "-gpgpu_cache:dl1", "组", 1, 65536, 1],
    ["l1Line", "l1", "缓存行大小", "-gpgpu_cache:dl1", "B", 32, 512, 2],
    ["l1Ways", "l1", "相联度", "-gpgpu_cache:dl1", "路", 1, 1024, 3],
    ["l1Latency", "l1", "访问延迟", "-gpgpu_l1_latency", "周期", 1, 10000],
    ["adaptive", "l1", "L1 / Shared 自适应分配", "-gpgpu_adaptive_cache_config", "", 0, 1],
    ["unified", "l1", "统一 L1 / Shared 容量", "-gpgpu_unified_l1d_size", "KiB / SM", 1, 4096],
    ["sharedKB", "shared", "共享内存上限", "-gpgpu_shmem_size", "KiB / SM", 1, 4096],
    ["sharedBlockKB", "shared", "每个线程块共享内存上限", "-gpgpu_shmem_per_block", "KiB", 1, 4096],
    ["sharedBanks", "shared", "共享内存 Bank 数", "-gpgpu_shmem_num_banks", "个", 1, 256],
    ["sharedLatency", "shared", "访问延迟", "-gpgpu_smem_latency", "周期", 1, 10000],
    ["networkMode", "network", "互连模型", "-network_mode", "", 1, 2],
    ["icntClock", "network", "互连时钟", "-gpgpu_clock_domains", "MHz", 1, 10000, 1],
    ["flit", "network", "Flit 大小", "-icnt_flit_size", "B", 1, 1024],
    ["inputBuffer", "network", "输入缓冲深度", "-icnt_in_buffer_limit", "项", 1, 65536],
    ["outputBuffer", "network", "输出缓冲深度", "-icnt_out_buffer_limit", "项", 1, 65536],
    ["l2Sets", "l2", "每个子分区缓存组数", "-gpgpu_cache:dl2", "组", 1, 65536, 1],
    ["l2Line", "l2", "缓存行大小", "-gpgpu_cache:dl2", "B", 32, 512, 2],
    ["l2Ways", "l2", "相联度", "-gpgpu_cache:dl2", "路", 1, 1024, 3],
    ["l2Clock", "l2", "L2 时钟", "-gpgpu_clock_domains", "MHz", 1, 10000, 2],
    ["channels", "memory", "内存通道数", "-gpgpu_n_mem", "个", 1, 256],
    ["subPartitions", "memory", "每通道 L2 子分区数", "-gpgpu_n_sub_partition_per_mchannel", "个", 1, 16],
    ["busBytes", "memory", "每通道总线宽度", "-gpgpu_dram_buswidth", "B", 1, 256],
    ["dramClock", "memory", "DRAM 时钟", "-gpgpu_clock_domains", "MHz", 1, 10000, 3],
    ["dramLatency", "memory", "DRAM 固定延迟", "-dram_latency", "周期", 0, 10000],
  ].map(([id, group, label, key, unit, min, max, part]) => ({ id, group, label, key, unit, min, max, part }));
  const choices = {
    scheduler: [["lrr", "LRR · 轮转"], ["gto", "GTO · 贪心优先"], ["oldest", "Oldest · 最老优先"]],
    adaptive: [[0, "关闭 · 固定缓存几何"], [1, "开启 · 根据共享内存用量分配"]],
    networkMode: [[1, "BookSim · 模板拓扑"], [2, "Local Xbar · 本地交叉开关"]],
  };
  function get(text, key, fallback = "") {
    const matches = [...text.matchAll(new RegExp("^\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+([^#\\n]+)", "gm"))];
    return matches.length ? matches.at(-1)[1].trim() : fallback;
  }
  function set(text, key, value) {
    const regex = new RegExp("^\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+[^\\n]*", "gm");
    return regex.test(text) ? text.replace(regex, () => key + " " + value) : text.trimEnd() + "\n" + key + " " + value + "\n";
  }
  function read(text) {
    const result = {};
    for (const f of fields) {
      let value = f.id === "sms" ? Number(get(text, "-gpgpu_n_clusters")) * Number(get(text, "-gpgpu_n_cores_per_cluster", "1")) : get(text, f.key);
      if (f.part !== undefined) value = String(value).split(",")[0].split(":")[f.part];
      if (f.id === "sharedKB" || f.id === "sharedBlockKB") value = value ? Number(value) / 1024 : "";
      result[f.id] = value === undefined || value === "" || value === "none" || (f.id === "sms" && !value) ? null : f.id === "scheduler" ? value : Number(value);
      if (typeof result[f.id] === "number" && !Number.isFinite(result[f.id])) result[f.id] = null;
    }
    return result;
  }
  function validate(values, base) {
    const enabled = read(base), errors = [];
    for (const f of fields) {
      if (enabled[f.id] === null) continue;
      const v = values[f.id];
      if (v === "" || v === null || v === undefined) { errors.push("请填写“" + f.label + "”"); continue; }
      if (f.id === "scheduler") {
        if (!/^[a-zA-Z0-9_:.,-]{1,100}$/.test(v)) errors.push("调度策略格式无效");
      } else if (!Number.isFinite(Number(v)) || Number(v) < f.min || Number(v) > f.max || (!["coreClock", "icntClock", "l2Clock", "dramClock"].includes(f.id) && !Number.isInteger(Number(v)))) errors.push(f.label + "超出范围；容量与数量须为整数");
    }
    const v = Object.fromEntries(Object.entries(values).map(([k, value]) => [k, Number(value)]));
    if (v.sms % v.cores !== 0) errors.push("SM 总数须能被每个 Cluster 的 SM 数整除");
    const warp = Number(get(base, "-gpgpu_shader_core_pipeline").split(":")[1]);
    if (v.threads % warp !== 0) errors.push("最大线程数须为 Warp 大小的整数倍");
    for (const key of ["l1Sets", "l1Line", "l2Sets", "l2Line", "sharedBanks", "subPartitions"]) {
      if (enabled[key] !== null && (!v[key] || (v[key] & (v[key] - 1)) !== 0)) errors.push(fields.find(f => f.id === key).label + "须为 2 的幂");
    }
    for (const prefix of ["l1", "l2"]) {
      const key = prefix === "l1" ? "-gpgpu_cache:dl1" : "-gpgpu_cache:dl2";
      if (get(base, key).startsWith("S:") && v[prefix + "Line"] !== 128) errors.push("Sector 缓存的缓存行须为 128 B");
    }
    const geometry = v.l1Sets * v.l1Line * v.l1Ways;
    if (enabled.unified !== null && geometry && ((v.unified * 1024) % geometry !== 0)) errors.push("统一 L1 容量须为 L1 基础几何容量的整数倍");
    if (v.adaptive === 1 && v.sharedKB > v.unified) errors.push("共享内存上限不能超过统一 L1 / Shared 容量");
    if (v.sharedBlockKB > v.sharedKB) errors.push("线程块共享内存上限不能超过每个 SM 上限");
    if (enabled.networkMode !== null && ![1, 2].includes(v.networkMode)) errors.push("请选择有效的互连模型");
    if (v.networkMode !== enabled.networkMode) errors.push("切换互连模型需要另选相应模板以提供完整拓扑参数");
    return [...new Set(errors)];
  }
  function build(base, values) {
    const errors = validate(values, base);
    if (errors.length) throw new Error(errors.join("；"));
    const enabled = read(base);
    let text = base;
    for (const f of fields) {
      if (enabled[f.id] === null || f.id === "sms") continue;
      let value = values[f.id];
      if (f.id === "sharedKB" || f.id === "sharedBlockKB") value = Math.round(Number(value) * 1024);
      if (f.part !== undefined) {
        const components = get(text, f.key).split(","), parts = components[0].split(":");
        parts[f.part] = value;
        components[0] = parts.join(":");
        value = components.join(",");
      }
      text = set(text, f.key, value);
    }
    text = set(text, "-gpgpu_n_clusters", Number(values.sms) / Number(values.cores));
    if (enabled.sharedKB !== null && Number(values.sharedKB) !== enabled.sharedKB) {
      text = set(text, "-gpgpu_shmem_sizeDefault", Math.round(Number(values.sharedKB) * 1024));
      if (get(text, "-gpgpu_shmem_option")) {
        const options = get(text, "-gpgpu_shmem_option").split(",").map(Number).filter(n => n < Number(values.sharedKB));
        text = set(text, "-gpgpu_shmem_option", [...new Set([...options, Number(values.sharedKB)])].join(","));
      }
    }
    return text;
  }
  function metrics(v) {
    const capacity = p => v[p + "Sets"] && v[p + "Line"] && v[p + "Ways"] ? v[p + "Sets"] * v[p + "Line"] * v[p + "Ways"] / 1024 : null;
    return { sms: v.sms || null, l1KB: capacity("l1"), l2KB: capacity("l2"), l2MB: capacity("l2") && v.channels && v.subPartitions ? capacity("l2") * v.channels * v.subPartitions / 1024 : null };
  }
  return { groups, fields, choices, get, set, read, build, validate, metrics };
});
