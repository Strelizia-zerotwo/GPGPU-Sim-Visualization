/* Modular workbench and architecture editor. Loaded before app.js. */
function parseModuleSizes(value, minimum = 1) {
  const parts = String(value).split(/[,，\s]+/).filter(Boolean);
  if (!parts.length || parts.some(p => !/^\d+$/.test(p))) return [];
  const result = [...new Set(parts.map(Number))];
  return result.every(n => n >= minimum && n <= 4096) ? result : [];
}
function persistWorkbench() {
  try {
    localStorage.setItem("gpgpu-workbench-v4", JSON.stringify({
      canvas: state.canvas,
      canvases: state.canvases, activeCanvasId: state.activeCanvasId, runPanelExpanded: state.runPanelExpanded,
      selectedBenchmarks: [...state.selectedBenchmarks], selectedProfiles: [...state.selectedProfiles],
      drafts: state.drafts, customGPUs: state.customGPUs, benchmarkDrafts: state.benchmarkDrafts,
      sizes: $("sizes").value, concurrency: $("concurrency").value, repeats: $("repeats").value,
      wallMinutes: $("wall-minutes").value, maxCycles: $("max-cycles").value,
      bindCpu: $("bind-cpu").checked,
    }));
  } catch (error) { toast("工作台保存失败：" + error.message, true); }
}
function restoreWorkbench() {
  try {
    const saved = JSON.parse(localStorage.getItem("gpgpu-workbench-v4") || localStorage.getItem("gpgpu-workbench-v3") || "null");
    if (!saved) return;
    state.runPanelExpanded = saved.runPanelExpanded === true;
    state.selectedBenchmarks = new Set(saved.selectedBenchmarks || ["gemm"]);
    state.selectedProfiles = new Set(saved.selectedProfiles || ["SM80_A100"]);
    for (const key of ["drafts", "customGPUs", "benchmarkDrafts"]) state[key] = saved[key] || {};
    for (const key of ["sizes", "concurrency", "repeats"]) if (saved[key]) $(key).value = saved[key];
    if (saved.wallMinutes) $("wall-minutes").value = saved.wallMinutes;
    if (saved.maxCycles !== undefined) $("max-cycles").value = saved.maxCycles;
    $("bind-cpu").checked = saved.bindCpu === true;
    state.canvases = CanvasGraph.restoreCanvases(saved, () => crypto.randomUUID());
    state.canvas = state.canvases.find(c => c.id === saved.activeCanvasId) || state.canvases[0];
    state.activeCanvasId = state.canvas.id;
  } catch { /* A damaged local draft must not prevent environment detection. */ }
}
function allGpuModules() {
  const profiles = state.info?.profiles || [];
  return [...profiles, ...Object.values(state.customGPUs).map(p => {
    const base = profiles.find(b => b.id === p.baseProfileId);
    return { ...p, custom: true, supported: Boolean(base?.supported), capability: base?.capability, text: base?.text || "" };
  })].sort((a, b) => Number(state.selectedProfiles.has(b.id)) - Number(state.selectedProfiles.has(a.id)) || Number(b.supported) - Number(a.supported));
}
function gpuErrors(profile) {
  const base = state.info?.profiles.find(p => p.id === (profile.custom ? profile.baseProfileId : profile.id));
  if (!base?.supported) return ["请选择兼容的详细参数模板"];
  if (profile.custom && !profile.name?.trim()) return ["请填写 GPU 模块名称"];
  return GpuModel.validate(profile.custom ? profile.values : GpuModel.read(profile.configText || state.drafts[profile.id] || base.text), profile.templateText || base.text);
}
function gpuSpec(profile) {
  return profile.custom ? { id: profile.id, name: profile.name, baseProfileId: profile.baseProfileId, values: profile.values, templateText: profile.templateText } : { id: profile.id };
}
function benchmarkSpec(benchmark, override) {
  const draft = override && typeof override === "object" ? override : state.benchmarkDrafts[benchmark.id];
  return { id: benchmark.id, sizes: parseModuleSizes(draft?.sizes ?? $("sizes").value, benchmark.minSize || 1), parameters: draft?.parameters || {}, runtimeArgs: draft?.runtimeArgs ?? benchmark.args ?? [] };
}
function benchmarkLabel(benchmark) {
  const spec = benchmarkSpec(benchmark), dims = (benchmark.parameters || []).filter(p => p.group === "dimensions");
  if (dims.some(p => spec.parameters[p.key] !== undefined)) return dims.map(p => `${p.key}=${spec.parameters[p.key] ?? spec.sizes[0]}`).join(" · ");
  return spec.sizes.length ? `规模 ${spec.sizes.join(" / ")} · ${(benchmark.macros || []).join(" = ") || "运行参数"}` : "请设置有效规模";
}
function renderBenchmarkModules() {
  const benchmarks = (state.info?.benchmarks || []).filter(b => b.available);
  $("benchmark-list").innerHTML = benchmarks.map(b => `<article class="benchmark-card module-card ${state.selectedBenchmarks.has(b.id) ? "selected" : ""}"><input aria-label="选择 ${escapeHTML(b.name)}" type="checkbox" data-benchmark="${escapeHTML(b.id)}" ${state.selectedBenchmarks.has(b.id) ? "checked" : ""}><button class="module-open" data-edit-benchmark="${escapeHTML(b.id)}"><div class="module-topline"><span class="benchmark-symbol">${b.id === "gemm" ? "×" : b.kind === "custom" ? "＋" : "▦"}</span><span class="module-type">${b.kind === "custom" ? "CUSTOM CUDA" : escapeHTML(b.suite || "CUDA")}</span></div><strong>${escapeHTML(b.name)}</strong><small>${escapeHTML(b.description)}</small><div class="module-tags">${(b.macros || []).slice(0, 5).map(m => `<span>${escapeHTML(m)}</span>`).join("")}</div><div class="module-settings-line">${escapeHTML(benchmarkLabel(b))}</div><span class="module-cta">${state.benchmarkDrafts[b.id] ? "参数已设置" : "配置参数"} ↗</span></button></article>`).join("");
  if (!benchmarks.length) $("benchmark-list").innerHTML = '<div class="benchmark-empty">到 Benchmark 商店下载程序，即可添加测试模块。</div>';
}
function renderGpuModules() {
  const profiles = allGpuModules();
  $("profile-count").textContent = `${profiles.filter(p => !p.custom && p.supported).length} 个兼容模板 · ${Object.keys(state.customGPUs).length} 个自定义模块`;
  $("profile-list").innerHTML = profiles.map(p => {
    const values = p.custom ? p.values : GpuModel.read(state.drafts[p.id] || p.text);
    const m = GpuModel.metrics(values || {}), errors = p.custom ? gpuErrors(p) : [];
    return `<article class="profile-card module-card ${state.selectedProfiles.has(p.id) ? "selected" : ""} ${p.supported || p.custom ? "" : "unsupported"}"><input type="checkbox" aria-label="选择 ${escapeHTML(p.name)}" data-profile="${escapeHTML(p.id)}" ${state.selectedProfiles.has(p.id) ? "checked" : ""} ${p.supported || p.custom ? "" : "disabled"}><button class="module-open" data-edit="${escapeHTML(p.id)}"><div class="module-topline"><span class="chip-icon"><i></i><i></i><i></i><i></i></span><span class="module-type">${p.custom ? "CUSTOM ARCHITECTURE" : `GPU / SM ${p.capability}`}</span></div><strong>${escapeHTML(p.name)}</strong><small>${p.custom ? `模板：${escapeHTML(p.baseProfileId || "待选择")}` : "GPGPU-Sim 仓库配置"}</small><div class="chip-mini"><span>SM</span><span>L1 / Shared</span><span>互连</span><span>L2</span><span>DRAM</span></div><div class="gpu-card-metrics"><span><b>${m.sms ?? "—"}</b> SM</span><span><b>${m.l2MB === null ? "—" : Number(m.l2MB.toFixed(2))}</b> MiB L2</span></div><span class="module-cta ${errors.length ? "pending" : ""}">${p.custom && errors.length ? "待完善模块" : state.drafts[p.id] ? "架构已修改" : p.supported ? "打开架构" : "查看架构 · CUDA 不兼容"} ↗</span></button>${p.custom ? `<button class="remove-module" data-remove-gpu="${p.id}" aria-label="删除 ${escapeHTML(p.name)}">×</button>` : ""}</article>`;
  }).join("") || '<p class="helper">检测模拟器后加载 GPU 模板，再搭建你的架构。</p>';
  $("profile-list").scrollTop = 0;
}
function renderModulePlan() {
  const benchmarks = currentBenchmarks(), selectedIds = [...state.selectedProfiles];
  const profiles = allGpuModules().filter(p => selectedIds.includes(p.id));
  const repeats = Number($("repeats").value), validRepeats = Number.isInteger(repeats) && repeats >= 1 && repeats <= 100;
  const variants = benchmarks.reduce((n, b) => n + benchmarkSpec(b).sizes.length, 0);
  const count = variants * profiles.length * (validRepeats ? repeats : 0);
  const invalidGpu = profiles.find(p => gpuErrors(p).length);
  const invalidBenchmark = benchmarks.find(b => !benchmarkSpec(b).sizes.length);
  let error = invalidGpu ? `${invalidGpu.name}：${gpuErrors(invalidGpu)[0]}` : invalidBenchmark ? `${invalidBenchmark.name}：请设置有效规模` : count > 100 ? "每批最多 100 个实验，请减少组合" : !validRepeats ? "重复次数须为 1–100" : "";
  $("task-count").textContent = count;
  $("plan-formula").textContent = `${variants} 个程序规模组合 × ${profiles.length} 个 GPU × ${validRepeats ? repeats : 0} 次`;
  $("summary-bench").textContent = benchmarks.map(b => b.name).join("、") || "—";
  $("summary-size").textContent = benchmarks.map(b => `${b.name}：${benchmarkLabel(b)}`).join("；") || "—";
  $("summary-gpu").textContent = profiles.map(p => p.name).join("、") || "—";
  $("summary-concurrency").textContent = $("concurrency").value;
  $("plan-validation").hidden = !error;
  $("plan-validation").textContent = error;
  $("launch").disabled = !state.info?.ready || !count || Boolean(error);
}
function openGpuEditor(id) {
  const node = state.canvas.nodes.find(n => n.id === state.canvasEditing);
  const profile = node?.kind === "gpu" ? canvasGpuProfile(node) : allGpuModules().find(p => p.id === id);
  if (!profile) return;
  const base = state.info?.profiles.find(p => p.id === (profile.custom ? profile.baseProfileId : id));
  state.configId = id;
  state.gpuEditor = { id, custom: Boolean(profile.custom), baseId: profile.custom ? profile.baseProfileId || "" : id,
    text: profile.templateText || profile.configText || state.drafts[id] || base?.text || "", values: profile.custom ? { ...profile.values } : GpuModel.read(profile.configText || state.drafts[id] || profile.text), group: "compute", rawDirty: false };
  $("config-title").textContent = profile.name + " · GPU 架构";
  $("gpu-provenance").textContent = profile.custom ? "自定义模拟架构。选择模板后填写各模块，模板负责提供更详细的模拟器参数。" : `来源：configs/tested-cfgs/${id}。显示的是该模板的模拟参数，结构图为示意布局。`;
  $("custom-gpu-settings").hidden = !profile.custom;
  $("duplicate-gpu").hidden = profile.custom;
  $("gpu-name").value = profile.name;
  $("gpu-template").innerHTML = '<option value="">选择详细参数模板…</option>' + (state.info?.profiles || []).filter(p => p.supported).map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)} · ${p.id}</option>`).join("");
  $("gpu-template").value = profile.custom ? profile.baseProfileId || "" : id;
  $("gpu-advanced").open = false;
  $("gpu-advanced").hidden = profile.custom;
  $("config-text").value = state.gpuEditor.text;
  $("reset-config").textContent = profile.custom ? "清空所有模块" : "恢复模板参数";
  renderGpuFields(); updateGpuEditor();
  $("config-dialog").showModal();
}
function valueText(value, unit = "") { return value === null || value === undefined || value === "" ? "待设置" : `${Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : value}${unit}`; }
function gpuMemoryCapacityMarkup() {
  const memory = state.info?.memoryCapacity;
  const bytes = value => value == null ? "未识别" : `${Number((value / 2 ** 30).toFixed(2))} GiB（${value.toLocaleString()} 字节）`;
  return `<section class="gpu-capacity-note" id="gpu-memory-capacity"><b>GPU 主存（显存）容量</b><span>当前未开放容量设置</span><p>标准 GPGPU-Sim 模板没有总显存容量选项。下方通道、总线和时钟用于配置显存访问性能；L2 容量是缓存大小。</p><dl><dt>设备属性中的容量</dt><dd>${bytes(memory?.devicePropertiesBytes)}</dd><dt>内存查询中的总容量</dt><dd>${bytes(memory?.memGetInfoTotalBytes)}</dd></dl><small>以上数值仅从当前模拟器源码读取，尚未验证已编译运行库的返回值，也不代表已实施显存容量限制。修改容量或模拟显存不足需要模拟器支持。</small></section>`;
}
function updateGpuEditor() {
  const e = state.gpuEditor, v = e.values, m = GpuModel.metrics(v), empty = e.custom && !Object.values(v).some(x => x !== "" && x != null);
  const active = group => e.group === group ? "active" : "";
  $("gpu-diagram").innerHTML = `<div class="die-heading"><span>${empty ? "EMPTY ARCHITECTURE" : "GPU ARCHITECTURE"}</span><b>${valueText(v.sms, " SM")}</b></div><div class="compute-enclosure"><button class="arch-node compute-node ${active("compute")}" data-gpu-group="compute"><span class="arch-node-heading"><b>SM 计算阵列</b><small>${valueText(v.coreClock, " MHz")} · ${valueText(v.schedulers, " 调度器 / SM")}</small></span><span class="sm-grid">${Array.from({length: 8}, (_, i) => `<span class="sm-tile ${empty ? "empty" : ""}"><b>${empty ? "＋" : "SM"}</b><small>${empty ? "待配置" : i < 7 ? "SP · INT · DP" : "…重复阵列"}</small></span>`).join("")}</span></button><div class="local-memory-row"><button class="arch-node ${active("l1")}" data-gpu-group="l1"><b>L1 Cache</b><strong>${valueText(m.l1KB, " KiB")}</strong><small>${Number(v.adaptive) === 1 ? `自适应 · ${valueText(v.unified, " KiB 统一容量")}` : "固定几何容量 / SM"}</small></button><button class="arch-node ${active("shared")}" data-gpu-group="shared"><b>Shared Memory</b><strong>${valueText(v.sharedKB, " KiB")}</strong><small>每个 SM · 与 L1 并列</small></button></div><div class="enclosure-caption">${valueText(v.cores, " SM / Cluster")} · ${v.sms && v.cores ? Number(v.sms) / Number(v.cores) : "—"} Clusters · 以上模块按 SM 重复</div></div><div class="arch-connector">↓ &nbsp; 读写请求 &nbsp; ↑</div><button class="arch-node network-node ${active("network")}" data-gpu-group="network"><b>片上互连</b><span>${v.networkMode ? Number(v.networkMode) === 2 ? "Local Xbar" : "BookSim" : "待选择模型"}</span><small>${valueText(v.icntClock, " MHz")} · ${valueText(v.flit, " B / Flit")}</small></button><div class="arch-connector">↓ &nbsp; 内存分区 &nbsp; ↑</div><button class="arch-node l2-node ${active("l2")}" data-gpu-group="l2"><span><b>共享 L2 Cache</b><strong>${valueText(m.l2MB, " MiB 总容量")}</strong></span><span class="l2-segments"><i></i><i></i><i></i><i></i><i></i><i></i></span><small>${valueText(m.l2KB, " KiB / 子分区")} × ${v.channels && v.subPartitions ? v.channels * v.subPartitions : "—"} 子分区</small></button><div class="arch-connector">↓ &nbsp; DRAM 访问 &nbsp; ↑</div><button class="arch-node memory-node ${active("memory")}" data-gpu-group="memory"><b>GPU 主存 / DRAM</b><strong>${valueText(v.channels, " 个通道")} · ${valueText(v.dramClock, " MHz")}</strong><small>${valueText(v.busBytes, " B 总线 / 通道")} · 总容量暂不可配置</small></button><p class="diagram-caption">按数据流展示架构；图形数量为示意，实际数量以参数为准。</p>`;
  $("gpu-metrics").innerHTML = `<span><b>${valueText(m.sms)}</b> SM 总数</span><span><b>${valueText(m.l1KB, " KiB")}</b> L1 基础几何 / SM</span><span><b>${valueText(v.sharedKB, " KiB")}</b> Shared / SM</span><span><b>${valueText(m.l2MB, " MiB")}</b> L2 总容量</span>`;
  const errors = e.text ? GpuModel.validate(v, e.text) : ["选择详细参数模板，再配置架构模块"];
  $("gpu-validation").textContent = errors.length ? (e.custom ? `可保存草稿；运行前需完善：${errors[0]}` : errors.slice(0, 2).join("；")) : Number(v.adaptive) === 1 ? "配置检查通过。自适应 L1 的实际容量由 kernel 共享内存用量决定。" : "配置检查通过。参数将写入每个实验的独立配置。";
  $("gpu-validation").classList.toggle("valid", !errors.length);
  $("save-config").disabled = !e.custom && (errors.length > 0 || e.rawDirty);
  $("save-config").textContent = e.custom && errors.length ? "保存 GPU 草稿" : "保存 GPU 模块";
  $("fill-gpu-template").disabled = !e.baseId || !e.text;
  if (!errors.length && !e.rawDirty) $("config-text").value = GpuModel.build(e.text, v);
  else if (!$("config-text").value) $("config-text").value = e.text;
}
function renderGpuFields() {
  const e = state.gpuEditor, group = GpuModel.groups.find(g => g.id === e.group), enabled = GpuModel.read(e.text);
  $("gpu-module-title").textContent = group.title;
  $("gpu-module-description").textContent = group.subtitle;
  $("gpu-fields").innerHTML = GpuModel.fields.filter(f => f.group === group.id).map(f => {
    const disabled = !e.text || enabled[f.id] === null, value = e.values[f.id] ?? "";
    const options = GpuModel.choices[f.id];
    const input = options ? `<select data-gpu-field="${f.id}" ${disabled ? "disabled" : ""}><option value="">请选择…</option>${(options.some(o => String(o[0]) === String(value)) || !value ? options : [...options, [value, value]]).map(([v, label]) => `<option value="${escapeHTML(v)}" ${String(value) === String(v) ? "selected" : ""}>${escapeHTML(label)}</option>`).join("")}</select>` : `<div class="unit-input"><input type="number" data-gpu-field="${f.id}" id="gpu-${f.id}" value="${escapeHTML(value)}" placeholder="待设置" min="${f.min}" max="${f.max}" step="${["coreClock", "icntClock", "l2Clock", "dramClock"].includes(f.id) ? "any" : "1"}" ${disabled ? "disabled" : ""}><span>${f.unit}</span></div>`;
    return `<label class="gpu-field"><span>${f.label}</span>${input}${disabled ? `<small>${e.text ? "模板未提供此项；在完整配置中设置" : "先选择模板"}</small>` : ""}</label>`;
  }).join("");
  if (group.id === "memory") $("gpu-fields").insertAdjacentHTML("afterbegin", gpuMemoryCapacityMarkup());
}
function resetGpuEditor() {
  const e = state.gpuEditor;
  e.text = state.info?.profiles.find(p => p.id === e.baseId)?.text || "";
  e.values = e.custom ? {} : GpuModel.read(e.text);
  e.rawDirty = false; $("config-text").value = e.text;
  renderGpuFields(); updateGpuEditor();
}
function saveGpuEditor() {
  const e = state.gpuEditor;
  const node = state.canvas.nodes.find(n => n.id === state.canvasEditing);
  if (e.rawDirty) return toast("请先点击“应用文本到架构”。", true);
  if (e.custom) {
    const name = $("gpu-name").value.trim();
    if (!name) return toast("请填写自定义 GPU 名称。", true);
    const settings = { id: e.id, name, baseProfileId: e.baseId, values: { ...e.values }, templateText: e.text, custom: true };
    if (node) { node.settings = settings; node.title = name; }
    else state.customGPUs[e.id] = settings;
  } else {
    try {
      const text = GpuModel.build(e.text, e.values), base = state.info.profiles.find(p => p.id === e.id);
      if (node) node.settings.configText = text;
      else if (text === base.text) delete state.drafts[e.id]; else state.drafts[e.id] = text;
    } catch (error) { return toast(error.message, true); }
  }
  state.canvasEditing = null;
  $("config-dialog").close(); renderProfiles(); renderPlan(); persistWorkbench(); toast("GPU 模块已保存。");
}
function addCustomGpu(values = {}, baseId = "", templateText = "") {
  if (state.canvas) {
    const node = addCanvasGpu(null, { values, baseProfileId: baseId, templateText });
    openCanvasNode(node.id); return;
  }
  const id = "custom-" + crypto.randomUUID();
  state.customGPUs[id] = { id, name: `自定义 GPU ${Object.keys(state.customGPUs).length + 1}`, baseProfileId: baseId, values: { ...values }, templateText };
  state.selectedProfiles.add(id); renderProfiles(); renderPlan(); persistWorkbench(); openGpuEditor(id);
}
function openBenchmarkEditor(id) {
  const b = state.info.benchmarks.find(b => b.id === id);
  if (!b) return;
  state.benchmarkId = id;
  const node = state.canvas.nodes.find(n => n.id === state.canvasEditing);
  const draft = node?.kind === "benchmark" ? node.settings : state.benchmarkDrafts[id], spec = benchmarkSpec(b, draft);
  $("benchmark-title").textContent = b.name + " · 程序模块";
  $("benchmark-description").textContent = b.description + "。参数应用到实验源码副本，并记录在结果中。";
  $("benchmark-sizes").value = draft?.sizes ?? $("sizes").value;
  $("dimension-mode").value = Object.keys(spec.parameters).some(k => (b.macros || []).includes(k)) ? "independent" : "uniform";
  const dims = (b.parameters || []).filter(p => p.group === "dimensions");
  $("benchmark-dimension-mode").hidden = !dims.length;
  $("benchmark-parameters").innerHTML = ["dimensions", "launch"].map(group => {
    const fields = (b.parameters || []).filter(p => p.group === group);
    return fields.length ? `<section class="benchmark-param-section" data-parameter-group="${group}"><h3>${group === "dimensions" ? "数据维度" : "Kernel 启动参数"}</h3><div class="benchmark-parameter-fields">${fields.map(f => `<label>${escapeHTML(f.label)}<input type="number" data-benchmark-param="${escapeHTML(f.key)}" data-param-group="${group}" min="${f.min}" max="${f.max}" value="${spec.parameters[f.key] ?? f.default ?? spec.sizes[0] ?? 16}"><small>${escapeHTML(f.key)}</small></label>`).join("")}</div></section>` : "";
  }).join("");
  $("benchmark-args-row").hidden = b.kind !== "custom";
  $("benchmark-args").value = (spec.runtimeArgs || []).join("\n");
  $("benchmark-validation").textContent = "";
  syncBenchmarkEditor(); $("benchmark-dialog").showModal();
}
function syncBenchmarkEditor() {
  const b = state.info.benchmarks.find(b => b.id === state.benchmarkId);
  const independent = $("dimension-mode").value === "independent";
  const scales = parseModuleSizes($("benchmark-sizes").value, b.minSize || 1);
  document.querySelectorAll('[data-param-group="dimensions"]').forEach(input => {
    input.disabled = !independent;
    if (!independent && scales.length) input.value = scales[0];
  });
  const dim = key => independent ? Number(document.querySelector(`[data-benchmark-param="${key}"]`)?.value) : scales[0];
  $("benchmark-visual").innerHTML = b.id === "gemm" ? `<div class="matrix-flow"><div class="matrix-block"><span>A</span><small>${dim("NI") || "—"} × ${dim("NK") || "—"}</small></div><b>×</b><div class="matrix-block b"><span>B</span><small>${dim("NK") || "—"} × ${dim("NJ") || "—"}</small></div><b>→</b><div class="matrix-block c"><span>C</span><small>${dim("NI") || "—"} × ${dim("NJ") || "—"}</small></div><p>C = αAB + βC<br>CUDA kernel · float</p></div>` : `<div class="benchmark-scale-visual"><span>▦</span><div><b>${escapeHTML(b.name)}</b><small>${escapeHTML((b.macros || []).join(" = ") || "运行参数")} · ${scales.join(" / ") || "待设置规模"}</small></div><strong>${scales.length} 个规模组合</strong></div>`;
  $("benchmark-validation").textContent = independent && scales.length !== 1 ? "独立维度模式请填写一个规模；切换到统一维度可批量扫规模。" : !scales.length ? `规模须为 ${b.minSize || 1}–4096 的整数。` : "";
}
function saveBenchmarkEditor() {
  const b = state.info.benchmarks.find(b => b.id === state.benchmarkId);
  const scales = parseModuleSizes($("benchmark-sizes").value, b.minSize || 1), independent = $("dimension-mode").value === "independent";
  if (!scales.length || independent && scales.length !== 1) return toast("请检查模块规模与维度设置。", true);
  const parameters = {}, blocks = {};
  for (const f of b.parameters || []) {
    if (f.group === "dimensions" && !independent) continue;
    const n = Number(document.querySelector(`[data-benchmark-param="${f.key}"]`).value);
    if (!Number.isInteger(n) || n < f.min || n > f.max) return toast(`${f.label}须为 ${f.min}–${f.max} 的整数。`, true);
    parameters[f.key] = n;
    if (f.group === "launch") { const prefix = f.key.replace(/_[XYZ]$/, ""); blocks[prefix] = (blocks[prefix] || 1) * n; }
  }
  if (Object.values(blocks).some(n => n > 1024)) return toast("每个线程块的线程总数不能超过 1024。", true);
  const runtimeArgs = b.kind === "custom" ? $("benchmark-args").value.split("\n").filter(Boolean) : (b.args || []);
  if (runtimeArgs.length > 30 || runtimeArgs.some(a => a.length >= 500)) return toast("运行参数最多 30 项，每项少于 500 字符。", true);
  const draft = { sizes: scales.join(", "), parameters, runtimeArgs };
  const node = state.canvas.nodes.find(n => n.id === state.canvasEditing);
  if (node?.kind === "benchmark") node.settings = draft;
  else state.benchmarkDrafts[b.id] = draft;
  state.canvasEditing = null;
  $("benchmark-dialog").close(); renderBenchmarks(); renderPlan(); persistWorkbench(); toast("程序模块已保存。");
}
function setupModuleEditors() {
  $("add-gpu").onclick = () => addCustomGpu();
  $("benchmark-list").addEventListener("click", event => { const id = event.target.closest("[data-edit-benchmark]")?.dataset.editBenchmark; if (id) openBenchmarkEditor(id); });
  $("profile-list").addEventListener("click", event => {
    const id = event.target.closest("[data-remove-gpu]")?.dataset.removeGpu;
    if (id) { delete state.customGPUs[id]; state.selectedProfiles.delete(id); renderProfiles(); renderPlan(); persistWorkbench(); }
  });
  $("gpu-diagram").onclick = event => {
    const group = event.target.closest("[data-gpu-group]")?.dataset.gpuGroup;
    if (group) { state.gpuEditor.group = group; renderGpuFields(); updateGpuEditor(); }
  };
  $("gpu-fields").oninput = event => {
    const field = event.target.dataset.gpuField;
    if (!field) return;
    state.gpuEditor.values[field] = event.target.value === "" ? "" : field === "scheduler" ? event.target.value : Number(event.target.value);
    state.gpuEditor.rawDirty = false; updateGpuEditor();
  };
  $("gpu-template").onchange = () => {
    const e = state.gpuEditor;
    e.baseId = $("gpu-template").value;
    e.text = state.info.profiles.find(p => p.id === e.baseId)?.text || "";
    e.values = {}; renderGpuFields(); updateGpuEditor();
  };
  $("fill-gpu-template").onclick = () => { state.gpuEditor.values = GpuModel.read(state.gpuEditor.text); renderGpuFields(); updateGpuEditor(); };
  $("config-text").oninput = () => { state.gpuEditor.rawDirty = true; $("save-config").disabled = true; };
  $("apply-gpu-text").onclick = () => {
    state.gpuEditor.text = $("config-text").value;
    state.gpuEditor.values = GpuModel.read(state.gpuEditor.text);
    state.gpuEditor.rawDirty = false; renderGpuFields(); updateGpuEditor();
  };
  $("duplicate-gpu").onclick = () => {
    const e = state.gpuEditor;
    try { GpuModel.build(e.text, e.values); } catch (error) { return toast(error.message, true); }
    $("config-dialog").close(); addCustomGpu(e.values, e.baseId, e.text);
  };
  $("close-benchmark").onclick = () => { $("benchmark-dialog").close(); state.canvasEditing = null; };
  $("save-benchmark").onclick = saveBenchmarkEditor;
  $("benchmark-sizes").oninput = syncBenchmarkEditor;
  $("dimension-mode").onchange = syncBenchmarkEditor;
  $("benchmark-parameters").oninput = syncBenchmarkEditor;
  $("reset-benchmark").onclick = () => {
    const node = state.canvas.nodes.find(n => n.id === state.canvasEditing);
    if (node) node.settings = { sizes: $("sizes").value, parameters: {}, runtimeArgs: state.info.benchmarks.find(b => b.id === node.sourceId)?.args || [] };
    else delete state.benchmarkDrafts[state.benchmarkId];
    $("benchmark-dialog").close(); renderBenchmarks(); renderPlan(); persistWorkbench(); openBenchmarkEditor(state.benchmarkId);
  };
}
