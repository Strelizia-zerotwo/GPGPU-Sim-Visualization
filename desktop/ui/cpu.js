/* CPU controls use the selected Linux environment, including its allowed CPU mask. */
function renderCpuSettings() {
  const cpu = state.info?.cpu;
  const toggle = $("bind-cpu");
  // A restored enabled preference must remain switchable off if the environment changes.
  toggle.disabled = !cpu?.bindingSupported && !toggle.checked;
  $("apply-cpu-recommendation").disabled = !cpu;
  $("cpu-summary").textContent = cpu
    ? `可用逻辑 CPU ${cpu.logicalCount} 个${cpu.visibleCoreCount == null ? " · 核心拓扑未识别" : ` · Linux 可见核心 ${cpu.visibleCoreCount} 个`} · 建议并发 ${cpu.recommendedConcurrency}`
    : "检测 Linux 环境后显示可用 CPU 和推荐并发数。";
  $("cpu-recommendation-note").textContent = cpu
    ? (cpu.recommendationBasis === "visible-cores" ? "建议每个可见核心运行一个实验，并预留一个核心（至少运行一个）；" : "核心拓扑未知，按可用逻辑 CPU 数的一半保守推荐；") + "最多推荐 32 个，内存占用较大时请降低并发数。"
    : "推荐值是起点，实际并发能力还取决于各实验的内存占用。";
  $("cpu-binding-note").textContent = cpu?.bindingSupported
    ? (toggle.checked ? "已开启：同时运行的绑定任务分配不同逻辑 CPU，优先使用不同可见核心；CPU 不足时排队。" : "已关闭：程序由系统自动调度。") +
      (cpu.isWSL ? " WSL 中绑定的是虚拟 CPU，不能保证固定到 Windows 物理核心。" : " 绑定限制运行位置，不独占 CPU。") +
      " 更改仅影响之后提交的任务。"
    : "当前环境尚不支持 CPU 绑定；请检测 Linux / WSL 环境。";
}

function initCpuSettings() {
  $("bind-cpu").onchange = () => { renderCpuSettings(); persistWorkbench(); };
  $("apply-cpu-recommendation").onclick = () => {
    if (!state.info?.cpu) return;
    $("concurrency").value = state.info.cpu.recommendedConcurrency;
    renderCanvas(); persistWorkbench();
  };
  $("refresh-cpu").onclick = async () => {
    const button = $("refresh-cpu"); button.disabled = true;
    try {
      const info = await window.studio.inspect(state.settings);
      applyEnvironment(info); renderCpuSettings();
      toast("CPU 和环境信息已更新");
    } catch (error) { toast("检测失败：" + error.message, true); }
    finally { button.disabled = false; }
  };
  renderCpuSettings();
}

function cpuJobLabel(job) {
  if (!job.bindCpu && !job.cpuAffinity?.enabled) return "CPU：系统调度";
  const cpu = job.cpuAffinity?.cpuId ?? job.cpuId;
  if (cpu == null) return "CPU：等待分配";
  return `逻辑 CPU ${cpu} · ${job.cpuAffinity?.verified ? "绑定已核验" : "已分配，待核验"}`;
}
