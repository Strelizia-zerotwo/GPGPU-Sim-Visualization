/* A workbench graph: node instances own settings, edges own executions. */
let canvasPickerKind = "benchmark", canvasConnecting = null, canvasPointer = null;
let canvasConnectMode = false, canvasContextEdge = null, canvasIgnoreClickUntil = 0;
let canvasJobFrame = null;
const copyCanvasValue = value => JSON.parse(JSON.stringify(value));
const canvasNode = (id, graph = state.canvas) => graph.nodes.find(n => n.id === id);
const canvasEdge = (id, graph = state.canvas) => graph.edges.find(e => e.id === id);

function canvasGpuProfile(node) {
  const p = node.settings;
  const base = state.info?.profiles.find(b => b.id === (p.custom ? p.baseProfileId : node.sourceId));
  return { ...p, id: p.custom ? node.sourceId : base?.id || node.sourceId, name: node.title,
    text: base?.text || "", supported: Boolean(base?.supported), capability: base?.capability };
}
function placeCanvasNode(kind) {
  const count = state.canvas.nodes.filter(n => n.kind === kind).length;
  return { x: (kind === "benchmark" ? 50 : 580) + Math.floor(count / 3) * 960, y: 50 + count % 3 * 224 };
}
function revealCanvasNode(node) {
  const rect = $("canvas-viewport").getBoundingClientRect(), v = state.canvas.viewport;
  const x = node.x * v.zoom + v.x, y = node.y * v.zoom + v.y;
  if (x < 12 || y < 12 || x + CanvasGraph.nodeWidth * v.zoom > rect.width - 12 || y + CanvasGraph.nodeHeight * v.zoom > rect.height - 12) {
    v.x = rect.width / 2 - (node.x + CanvasGraph.nodeWidth / 2) * v.zoom;
    v.y = rect.height / 2 - (node.y + CanvasGraph.nodeHeight / 2) * v.zoom;
  }
}
function addCanvasBenchmark(id) {
  const b = state.info?.benchmarks.find(b => b.id === id && b.available);
  if (!b) { toast("请先在程序商店下载这个测试程序。", true); return null; }
  const count = state.canvas.nodes.filter(n => n.kind === "benchmark" && n.sourceId === id).length;
  const node = { id: crypto.randomUUID(), kind: "benchmark", sourceId: id, title: b.name + (count ? ` · ${count + 1}` : ""),
    ...placeCanvasNode("benchmark"), settings: copyCanvasValue(state.benchmarkDrafts[id] || { sizes: $("sizes").value, parameters: {}, runtimeArgs: b.args || [] }) };
  state.canvas.nodes.push(node); revealCanvasNode(node); renderCanvas(); persistWorkbench(); return node;
}
function addCanvasGpu(id, customSettings) {
  const p = id ? allGpuModules().find(p => p.id === id) : null;
  if (id && !p) { toast("GPU 模板尚未加载。", true); return null; }
  const count = state.canvas.nodes.filter(n => n.kind === "gpu" && n.sourceId === id).length;
  const nodeId = crypto.randomUUID(), isCustom = !id || Boolean(p.custom);
  const settings = isCustom ? { custom: true, name: p?.name || "自定义 GPU", baseProfileId: p?.baseProfileId || "", values: p?.values || {}, templateText: p?.templateText || "", ...customSettings }
    : { custom: false, configText: state.drafts[id] || p.text };
  const node = { id: nodeId, kind: "gpu", sourceId: isCustom ? "custom-" + nodeId : id,
    title: isCustom ? settings.name : p.name + (count ? ` · ${count + 1}` : ""), ...placeCanvasNode("gpu"), settings: copyCanvasValue(settings) };
  state.canvas.nodes.push(node); revealCanvasNode(node); renderCanvas(); persistWorkbench(); return node;
}
function openCanvasNode(id) {
  const node = canvasNode(id); if (!node) return;
  closeCanvasContext(); state.canvasEditing = id;
  if (node.kind === "benchmark") {
    if (!state.info?.benchmarks.some(b => b.id === node.sourceId && b.available)) return toast("这个程序源码暂不可用，请到商店检查。", true);
    openBenchmarkEditor(node.sourceId);
    $("benchmark-title").textContent = node.title + " · 程序模块";
  } else openGpuEditor(node.sourceId);
}
function connectCanvasNodes(first, second) {
  try { CanvasGraph.connect(state.canvas, first, second, crypto.randomUUID()); canvasConnecting = null; canvasConnectMode = false; renderCanvas(); persistWorkbench(); }
  catch (error) { toast(error.message, true); }
}
function canvasEdgeJobs(edge) {
  return (edge.jobIds || []).map(id => state.jobs.find(j => j.id === id) || { id, status: "interrupted" });
}
function canvasEdgeStatus(edge) {
  if (edge.error && !(edge.jobIds || []).length) return { phase: "failed", label: "提交失败", busy: false, completed: 0, total: 0 };
  return CanvasGraph.aggregate(canvasEdgeJobs(edge), edge.submitting);
}
function canvasNodeStatus(node) {
  const edges = state.canvas.edges.filter(e => e.benchmarkNodeId === node.id || e.gpuNodeId === node.id);
  if (!edges.length) return { phase: "idle", label: "待连接", busy: false };
  const status = CanvasGraph.aggregate(edges.flatMap(canvasEdgeJobs), edges.some(e => e.submitting));
  if (!status.total && !status.busy) status.label = "已连接 · 可编辑";
  if (status.phase === "completed" && edges.some(e => !(e.jobIds || []).length)) { status.phase = "idle"; status.label = "部分已完成"; }
  return status;
}
function restoreCanvasJobLinks() {
  for (const graph of state.canvases) for (const edge of graph.edges) {
    edge.submitting = false;
    const jobs = state.jobs.filter(j => j.canvasEdgeId === edge.id);
    const latestBatch = jobs.at(-1)?.batchId;
    if (latestBatch) edge.jobIds = jobs.filter(j => j.batchId === latestBatch).map(j => j.id);
  }
}
function edgeSpec(edge, graph = state.canvas) {
  const benchmarkNode = canvasNode(edge.benchmarkNodeId, graph), gpuNode = canvasNode(edge.gpuNodeId, graph);
  if (!benchmarkNode || !gpuNode) throw new Error("连接缺少程序或 GPU 模块。");
  const benchmark = state.info?.benchmarks.find(b => b.id === benchmarkNode.sourceId && b.available);
  if (!benchmark) throw new Error("程序源码暂不可用。");
  const profile = canvasGpuProfile(gpuNode), errors = gpuErrors(profile);
  if (errors.length) throw new Error(errors[0]);
  const program = benchmarkSpec(benchmark, benchmarkNode.settings);
  if (!program.sizes.length) throw new Error("请设置有效的程序规模。");
  if (!Number.isInteger(edge.repeats) || edge.repeats < 1 || edge.repeats > 100 || program.sizes.length * edge.repeats > 100) throw new Error("每条连接最多运行 100 个任务，请减少规模或重复次数。");
  const gpu = { ...gpuSpec(profile), name: gpuNode.title };
  return { benchmarkModules: [program], gpuModules: [gpu], drafts: profile.custom ? {} : { [profile.id]: gpuNode.settings.configText || profile.text },
    repeats: edge.repeats, maxConcurrent: Number($("concurrency").value), bindCpu: $("bind-cpu").checked, wallMinutes: Number($("wall-minutes").value), maxCycles: Number($("max-cycles").value),
    canvas: { canvasId: graph.id, canvasName: graph.name, edgeId: edge.id, benchmarkNodeId: benchmarkNode.id, gpuNodeId: gpuNode.id } };
}
function edgeValidation(edge, graph = state.canvas) {
  if (!state.info?.ready) return "先完成环境检测";
  try { edgeSpec(edge, graph); return ""; } catch (error) { return error.message; }
}
function edgeSignature(edge, graph = state.canvas) {
  const a = canvasNode(edge.benchmarkNodeId, graph), b = canvasNode(edge.gpuNodeId, graph);
  return JSON.stringify([a?.sourceId, a?.settings, b?.sourceId, b?.settings, edge.repeats]);
}
async function submitCanvasEdges(graph, edges) {
  // Snapshot every request and reserve every edge before the first asynchronous submit.
  // A canvas switch or later edit cannot redirect the remaining requests.
  const requests = [], skipped = [];
  for (const edge of edges) {
    if (canvasEdgeStatus(edge).busy) { skipped.push("正在执行"); continue; }
    const error = edgeValidation(edge, graph);
    if (error) { skipped.push(error); continue; }
    requests.push({ edge, spec: copyCanvasValue(edgeSpec(edge, graph)), signature: edgeSignature(edge, graph) });
  }
  if (!requests.length) return toast(skipped[0] || "请先连接程序和 GPU。", true);
  for (const { edge, signature } of requests) {
    edge.submitting = true; edge.error = ""; edge.jobIds = []; edge.lastSignature = signature;
  }
  renderCanvas(); persistWorkbench();
  let submitted = 0, tasks = 0;
  for (const { edge, spec } of requests) {
    try { edge.jobIds = await window.studio.submit(spec); submitted++; tasks += edge.jobIds.length; }
    catch (error) { edge.error = error.message; }
    finally { edge.submitting = false; renderCanvas(); persistWorkbench(); }
  }
  const failures = requests.length - submitted;
  toast(`${graph.name}：已提交 ${submitted} 条连接 / ${tasks} 个任务${skipped.length ? `，跳过 ${skipped.length} 条忙碌或未就绪连接` : ""}${failures ? `，${failures} 条提交失败，请查看连线` : ""}。`, failures > 0);
}
async function runCanvasEdge(id) {
  const graph = state.canvas, edge = canvasEdge(id, graph);
  if (edge) await submitCanvasEdges(graph, [edge]);
}
async function runCanvasNode(id) {
  const graph = state.canvas;
  await submitCanvasEdges(graph, CanvasGraph.connectedEdges(graph, id));
}
async function runAllCanvasEdges() {
  const graph = state.canvas;
  await submitCanvasEdges(graph, [...graph.edges]);
}
function renderCanvasTabs() {
  $("canvas-tabs").innerHTML = state.canvases.map(graph => {
    const busy = graph.edges.some(e => canvasEdgeStatus(e).busy);
    const locked = busy || state.canvases.length < 2;
    const closeHint = busy ? "实验正在提交或执行，结束后可以关闭" : state.canvases.length < 2 ? "至少保留一张画布" : `关闭 ${graph.name}（移除模块和连线，保留历史实验）`;
    return `<div class="canvas-tab ${graph.id === state.activeCanvasId ? "active" : ""}" role="presentation"><button role="tab" aria-selected="${graph.id === state.activeCanvasId}" data-canvas-tab="${graph.id}" title="${escapeHTML(graph.name)} · 右键打开画布设置">${busy ? '<i class="run-spinner"></i>' : studioIcon('workspace')} <span>${escapeHTML(graph.name)}</span><small>${graph.edges.length}</small></button><button class="canvas-tab-close" data-close-canvas="${graph.id}" aria-label="关闭 ${escapeHTML(graph.name)}" title="${escapeHTML(closeHint)}" ${locked ? "disabled" : ""}>×</button></div>`;
  }).join("");
}
function switchCanvas(id) {
  const graph = state.canvases.find(c => c.id === id); if (!graph) return;
  closeCanvasContext(); releaseCanvasPointer(); canvasConnecting = null; canvasConnectMode = false;
  state.canvasEditing = null; state.canvas = graph; state.activeCanvasId = id;
  renderCanvas(); persistWorkbench();
}
function newCanvas() {
  let number = state.canvases.length + 1;
  while (state.canvases.some(c => c.name === `画布 ${number}`)) number++;
  $("new-canvas-name").value = `画布 ${number}`;
  $("new-canvas-dialog").showModal();
  $("new-canvas-name").focus(); $("new-canvas-name").select();
}
function createCanvas(name) {
  const graph = { ...CanvasGraph.empty(), id: crypto.randomUUID(), name: name.trim().slice(0, 60) };
  if (!graph.name) return;
  state.canvases.push(graph); switchCanvas(graph.id);
}
function closeCanvas(id) {
  const index = state.canvases.findIndex(c => c.id === id), graph = state.canvases[index];
  if (!graph || state.canvases.length < 2 || graph.edges.some(e => canvasEdgeStatus(e).busy)) return false;
  state.canvases.splice(index, 1);
  if (id === state.activeCanvasId) switchCanvas(state.canvases[Math.min(index, state.canvases.length - 1)].id);
  else { renderCanvas(); persistWorkbench(); }
  return true;
}
function openCanvasDetails() {
  $("canvas-name").value = state.canvas.name;
  const busy = state.canvas.edges.some(e => canvasEdgeStatus(e).busy);
  $("delete-canvas").disabled = state.canvases.length < 2 || busy;
  $("canvas-delete-hint").textContent = busy ? "当前画布有实验正在提交或执行，结束后可以删除。" : "删除会移除当前画布的模块和连线；历史实验记录保留。至少保留一张画布。";
  $("canvas-details").showModal();
}
function canvasStatusMarkup(status) {
  return `<span class="canvas-status ${status.phase}">${status.busy ? '<i class="run-spinner"></i>' : status.phase === "completed" ? "✓ " : ""}${escapeHTML(status.label)}</span>`;
}
function canvasNodeDescription(node) {
  if (node.kind === "benchmark") {
    const b = state.info?.benchmarks.find(b => b.id === node.sourceId);
    if (!b?.available) return "源码待准备";
    const spec = benchmarkSpec(b, node.settings), dims = (b.parameters || []).filter(p => p.group === "dimensions");
    return dims.some(p => spec.parameters[p.key] !== undefined) ? dims.map(p => `${p.key}=${spec.parameters[p.key] ?? spec.sizes[0]}`).join(" · ") : `规模 ${spec.sizes.join(" / ") || "待设置"}`;
  }
  const p = canvasGpuProfile(node), v = p.custom ? p.values : GpuModel.read(p.configText || p.text), m = GpuModel.metrics(v);
  return `${m.sms ?? "—"} SM · ${m.l2MB === null ? "—" : Number(m.l2MB.toFixed(2))} MiB L2`;
}
function renderCanvasNodes() {
  $("canvas-nodes").innerHTML = state.canvas.nodes.map(node => {
    const status = canvasNodeStatus(node);
    const edges = CanvasGraph.connectedEdges(state.canvas, node.id), ready = edges.filter(e => !canvasEdgeStatus(e).busy && !edgeValidation(e));
    return `<article class="canvas-node ${node.kind} ${status.phase} ${canvasConnecting === node.id ? "connecting" : ""}" data-node="${node.id}" style="left:${node.x}px;top:${node.y}px"><div class="canvas-node-header"><span class="node-kind-icon">${studioIcon(node.kind === "benchmark" ? "program" : "chip")}</span><span>${node.kind === "benchmark" ? "测试程序" : "GPU 配置"}</span><button data-remove-node="${node.id}" aria-label="删除 ${escapeHTML(node.title)}" ${status.busy ? "disabled" : ""}>${studioIcon("close")}</button></div><button class="canvas-node-edit" data-edit-node="${node.id}"><strong>${escapeHTML(node.title)}</strong><small>${escapeHTML(canvasNodeDescription(node))}</small><span>${node.kind === "benchmark" ? "点击调整规模与参数" : "点击展开 GPU 架构"} ↗</span></button><div class="canvas-node-footer">${canvasStatusMarkup(status)}<button class="node-run-all" data-run-node="${node.id}" ${ready.length ? "" : "disabled"} title="运行此模块连接的全部就绪实验；跳过正在执行的连接">${studioIcon("play")}<span>运行连接 (${ready.length}/${edges.length})</span></button></div><button class="node-port ${node.kind === "benchmark" ? "output" : "input"}" data-node-port="${node.id}" aria-label="连接 ${escapeHTML(node.title)}" title="点击或拖动圆点连接"></button></article>`;
  }).join("");
}
function canvasEdgeGeometry(edge) {
  const a = canvasNode(edge.benchmarkNodeId), b = canvasNode(edge.gpuNodeId);
  if (!a || !b) return null;
  const start = { x: a.x + CanvasGraph.nodeWidth, y: a.y + CanvasGraph.nodeHeight / 2 }, end = { x: b.x, y: b.y + CanvasGraph.nodeHeight / 2 };
  const bend = Math.max(70, Math.abs(end.x - start.x) * 0.48);
  const path = `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
  return { path, x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}
function renderCanvasEdges() {
  const actions = [], paths = [], occupied = [];
  for (const edge of state.canvas.edges) {
    const geometry = canvasEdgeGeometry(edge); if (!geometry) continue;
    const originalY = geometry.y;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (!occupied.some(p => Math.abs(p.x - geometry.x) < 190 && Math.abs(p.y - geometry.y) < 66)) break;
      const offset = Math.ceil((attempt + 1) / 2) * 68;
      geometry.y = originalY + (attempt % 2 === 0 ? offset : -offset);
    }
    occupied.push({ x: geometry.x, y: geometry.y });
    const status = canvasEdgeStatus(edge), error = edgeValidation(edge), dirty = edge.lastSignature && edge.lastSignature !== edgeSignature(edge);
    paths.push(`<path class="canvas-link ${status.phase}" d="${geometry.path}"/><path class="canvas-link-hit" d="${geometry.path}" data-edge-line="${edge.id}"/>`);
    if (geometry.y !== originalY) paths.push(`<path class="canvas-link preview" d="M ${geometry.x} ${originalY} L ${geometry.x} ${geometry.y}"/>`);
    const progress = status.total ? `${status.completed}/${status.total}` : `${edge.repeats} 次`;
    actions.push(`<div class="edge-control ${status.phase}" data-edge-control="${edge.id}" style="left:${geometry.x}px;top:${geometry.y}px"><div class="edge-run-row"><button class="edge-run-button" data-run-edge="${edge.id}" ${status.busy || error ? "disabled" : ""} title="${escapeHTML(error || "点击运行，右键设置次数")}">${status.busy ? '<i class="run-spinner"></i>' : status.phase === "completed" ? "✓" : "▶"}<span>${status.busy ? status.label : status.phase === "completed" ? "已完成 · 再次运行" : "开始实验"}</span></button><button class="edge-options" data-edge-options="${edge.id}" aria-label="设置运行次数">⋮</button></div><small>${escapeHTML(error || `${progress}${dirty ? " · 参数已修改" : ""}`)}</small></div>`);
  }
  $("canvas-lines").innerHTML = paths.join("") + '<path id="canvas-preview-line" class="canvas-link preview" d=""/>';
  $("canvas-edge-actions").innerHTML = actions.join("");
}
function updateCanvasTransform() {
  const v = state.canvas.viewport;
  $("canvas-scene").style.transform = `translate(${v.x}px,${v.y}px) scale(${v.zoom})`;
  $("canvas-zoom-value").textContent = Math.round(v.zoom * 100) + "%";
  $("canvas-viewport").style.backgroundPosition = `${v.x}px ${v.y}px`;
  $("canvas-viewport").style.backgroundSize = `${24 * v.zoom}px ${24 * v.zoom}px`;
}
function renderCanvasSummary() {
  $("canvas-active-name").textContent = state.canvas.name || "实验画布";
  const edges = state.canvas.edges;
  let count = 0, readyCount = 0;
  $("canvas-connection-list").hidden = !state.runPanelExpanded;
  $("toggle-run-panel").setAttribute("aria-expanded", String(state.runPanelExpanded));
  $("run-panel-toggle-label").textContent = state.runPanelExpanded ? "收起连接" : "展开连接";
  $("run-panel-chevron").textContent = state.runPanelExpanded ? "⌄" : "⌃";
  $("toggle-run-panel").title = state.runPanelExpanded ? "收起实验连接" : "展开实验连接";
  const statuses = edges.map(canvasEdgeStatus), running = statuses.filter(status => status.busy).length;
  $("floating-run-progress").textContent = running ? `${running} 条执行中` : "";
  $("canvas-connection-list").innerHTML = edges.map(edge => {
    const a = canvasNode(edge.benchmarkNodeId), b = canvasNode(edge.gpuNodeId), status = canvasEdgeStatus(edge), error = edgeValidation(edge);
    const benchmark = state.info?.benchmarks.find(p => p.id === a?.sourceId);
    const tasks = benchmark ? benchmarkSpec(benchmark, a.settings).sizes.length * edge.repeats : 0; count += tasks;
    if (!status.busy && !error) readyCount++;
    return `<div class="connection-row ${status.phase}"><button class="connection-label" data-focus-edge="${edge.id}"><strong>${escapeHTML(a?.title || "程序")}</strong><span>→ ${escapeHTML(b?.title || "GPU")}</span></button><div>${canvasStatusMarkup(status)}<button data-edge-options="${edge.id}">${edge.repeats} 次 ···</button></div>${error ? `<small class="connection-error">${escapeHTML(error)}</small>` : ""}${status.total ? `<small>${status.completed}/${status.total} 个任务通过检查</small>` : ""}${edge.error ? `<small class="connection-error">${escapeHTML(edge.error)}</small>` : ""}<button class="connection-run" data-run-edge="${edge.id}" ${status.busy || error ? "disabled" : ""}>${status.busy ? "正在执行" : status.phase === "completed" ? "再次运行" : "▶ 开始实验"}</button></div>`;
  }).join("") || '<div class="connection-empty">还没有实验连接。<br>添加程序和 GPU，再连接圆点。</div>';
  $("task-count").textContent = count;
  $("plan-formula").textContent = `${edges.length} 条连接 · ${readyCount} 条可运行 · 并发 ${$("concurrency").value}`;
  $("launch").disabled = !readyCount || !state.info?.ready;
  $("canvas-count").textContent = `${state.canvas.nodes.length} 个模块 · ${edges.length} 条连接`;
  $("canvas-connect").classList.toggle("selected", canvasConnectMode || Boolean(canvasConnecting));
  $("canvas-connect").setAttribute("aria-pressed", String(canvasConnectMode || Boolean(canvasConnecting)));
  $("canvas-mode-hint").textContent = canvasConnecting ? "点击另一类模块完成连接 · 点击空白或 Esc 取消" : canvasConnectMode ? "依次点击程序和 GPU · 点击空白取消" : "拖动方块 · 拖动空白平移 · 滚轮缩放";
}
function renderCanvas() {
  if (!$("canvas-viewport")) return;
  renderCanvasTabs(); renderWorkspaceActivity();
  state.canvas.viewport ||= CanvasGraph.empty().viewport;
  // A persisted submission is never resumed automatically after a crash.
  if (!canvasPointer) renderCanvasNodes();
  renderCanvasEdges(); renderCanvasSummary(); updateCanvasTransform();
  $("canvas-empty").hidden = state.canvas.nodes.length > 0;
}
function refreshCanvasJobs() {
  if (canvasJobFrame) return;
  canvasJobFrame = requestAnimationFrame(() => { canvasJobFrame = null; renderCanvas(); });
}
function showCanvasPicker(kind) {
  closeCanvasContext(); canvasPickerKind = kind;
  $("canvas-picker-title").textContent = kind === "benchmark" ? "添加测试程序" : "添加 GPU 配置";
  $("canvas-picker-search").value = ""; renderCanvasPicker(); $("canvas-picker").showModal(); $("canvas-picker-search").focus();
}
function renderCanvasPicker() {
  const search = $("canvas-picker-search").value.toLowerCase().trim();
  if (canvasPickerKind === "benchmark") {
    const list = (state.info?.benchmarks || state.fallbackBenchmarks).filter(p => `${p.name} ${p.description}`.toLowerCase().includes(search));
    $("canvas-picker-list").innerHTML = list.map(b => `<button class="picker-item" data-pick-benchmark="${escapeHTML(b.id)}" ${b.available ? "" : "disabled"}><span class="picker-icon program">${studioIcon("program")}</span><span><strong>${escapeHTML(b.name)}</strong><small>${escapeHTML(b.description)}</small></span><em>${b.available ? "＋ 添加" : "到商店下载"}</em></button>`).join("") || '<p class="helper">没有匹配的程序，可以到商店安装或添加自定义程序。</p>';
  } else {
    const list = allGpuModules().filter(p => `${p.name} ${p.id}`.toLowerCase().includes(search));
    $("canvas-picker-list").innerHTML = `<button class="picker-item custom-picker" data-pick-custom-gpu><span class="picker-icon">＋</span><span><strong>空白自定义 GPU</strong><small>添加空白架构模块，逐项配置</small></span><em>＋ 添加</em></button>` + list.map(p => `<button class="picker-item" data-pick-gpu="${escapeHTML(p.id)}" ${p.supported ? "" : "disabled"}><span class="picker-icon">${studioIcon("chip")}</span><span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.id)} · ${p.custom ? "自定义模板" : `${p.sms} SM`}</small></span><em>${p.supported ? "＋ 添加" : "CUDA 不兼容"}</em></button>`).join("");
  }
}
function closeCanvasContext() { $("canvas-context").hidden = true; canvasContextEdge = null; }
function openCanvasContext(id, x, y) {
  const edge = canvasEdge(id); if (!edge) return;
  canvasContextEdge = id;
  $("canvas-context-title").textContent = `${canvasNode(edge.benchmarkNodeId)?.title} → ${canvasNode(edge.gpuNodeId)?.title}`;
  $("edge-repeats").value = edge.repeats;
  const status = canvasEdgeStatus(edge);
  $("context-run-edge").disabled = status.busy || Boolean(edgeValidation(edge));
  $("context-stop-edge").hidden = !status.busy;
  $("context-result-edge").disabled = !(edge.jobIds || []).length;
  $("context-remove-edge").disabled = status.busy;
  $("canvas-context").hidden = false;
  const rect = $("canvas-context").getBoundingClientRect();
  $("canvas-context").style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 12)) + "px";
  $("canvas-context").style.top = Math.max(48, Math.min(y, window.innerHeight - rect.height - 12)) + "px";
}
function saveCanvasRepeat() {
  const edge = canvasEdge(canvasContextEdge), count = Number($("edge-repeats").value);
  if (!edge) return;
  if (!Number.isInteger(count) || count < 1 || count > 100) return toast("运行次数须为 1–100 的整数。", true);
  edge.repeats = count; renderCanvas(); persistWorkbench(); closeCanvasContext();
}
function focusCanvasEdge(id) {
  const edge = canvasEdge(id); if (!edge) return;
  const nodes = [canvasNode(edge.benchmarkNodeId), canvasNode(edge.gpuNodeId)].filter(Boolean);
  const rect = $("canvas-viewport").getBoundingClientRect();
  state.canvas.viewport = CanvasGraph.fit(nodes, rect.width, rect.height); renderCanvas(); persistWorkbench();
}
function pointerInCanvas(event) {
  const rect = $("canvas-viewport").getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function updatePreviewLine(event) {
  const node = canvasNode(canvasConnecting), line = $("canvas-preview-line"); if (!node || !line) return;
  const local = pointerInCanvas(event), end = CanvasGraph.worldPoint(state.canvas.viewport, local.x, local.y);
  const x = node.x + (node.kind === "benchmark" ? CanvasGraph.nodeWidth : 0), y = node.y + CanvasGraph.nodeHeight / 2;
  line.setAttribute("d", `M ${x} ${y} C ${x + (node.kind === "benchmark" ? 90 : -90)} ${y}, ${end.x - 80} ${end.y}, ${end.x} ${end.y}`);
}
function releaseCanvasPointer() {
  const previous = canvasPointer;
  canvasPointer = null;
  const viewport = $("canvas-viewport");
  viewport?.classList.remove("is-panning", "is-dragging-node");
  if (previous?.pointerId !== undefined && viewport?.hasPointerCapture(previous.pointerId)) viewport.releasePointerCapture(previous.pointerId);
  return previous;
}
function cancelCanvasGesture() {
  const previous = releaseCanvasPointer();
  canvasConnecting = null; canvasConnectMode = false;
  if (previous) canvasIgnoreClickUntil = Date.now() + 150;
  renderCanvas();
  if (previous) persistWorkbench();
}
function renderWorkspaceActivity() {
  const active = state.jobs.filter(j => ["preparing", "compiling", "running", "cancelling"].includes(j.status));
  const queued = state.jobs.filter(j => j.status === "queued").length;
  $("workspace-activity-count").textContent = `运行 ${active.length}`;
  $("workspace-active-jobs").innerHTML = active.map(job => {
    const name = job.benchmarkName || job.benchmark;
    const detail = `${name} · ${job.workloadLabel || `规模 ${job.size}`} → ${job.profileName} · ${job.canvasName || "实验"} · ${labels[job.status] || job.status}`;
    return `<button class="workspace-task" data-workspace-job="${escapeHTML(job.id)}" title="${escapeHTML(detail)}"><i class="run-spinner"></i><strong>${escapeHTML(name)}</strong><span>→ ${escapeHTML(job.profileName)}</span><em>${escapeHTML(labels[job.status] || job.status)}</em></button>`;
  }).join("") || '<span class="workspace-idle">暂无运行任务</span>';
  $("workspace-queue").hidden = !queued;
  $("workspace-queue").textContent = `排队 ${queued}`;
}
function setupCanvas() {
  if (!state.canvases.length) {
    state.canvases = CanvasGraph.restoreCanvases({ canvas: state.canvas }, () => crypto.randomUUID());
    state.canvas = state.canvases[0]; state.activeCanvasId = state.canvas.id;
  }
  $("new-canvas").onclick = newCanvas;
  $("cancel-new-canvas").onclick = () => $("new-canvas-dialog").close();
  $("new-canvas-form").onsubmit = event => {
    event.preventDefault(); const name = $("new-canvas-name").value.trim();
    if (!name) return toast("请填写画布名称。", true);
    $("new-canvas-dialog").close(); createCanvas(name);
  };
  $("toggle-run-panel").onclick = () => { state.runPanelExpanded = !state.runPanelExpanded; renderCanvasSummary(); persistWorkbench(); };
  $("workspace-active-jobs").onclick = event => { const job = event.target.closest("[data-workspace-job]"); if (job) openJob(job.dataset.workspaceJob); };
  $("workspace-queue").onclick = () => showView("results");
  $("workspace-environment").onclick = () => showView("environment");
  $("canvas-tabs").onclick = event => {
    const close = event.target.closest("[data-close-canvas]");
    if (close) { closeCanvas(close.dataset.closeCanvas); return; }
    const tab = event.target.closest("[data-canvas-tab]"); if (tab) switchCanvas(tab.dataset.canvasTab);
  };
  $("canvas-tabs").oncontextmenu = event => {
    const tab = event.target.closest(".canvas-tab")?.querySelector("[data-canvas-tab]");
    if (!tab) return;
    event.preventDefault(); switchCanvas(tab.dataset.canvasTab); openCanvasDetails();
  };
  $("canvas-details-button").onclick = openCanvasDetails;
  $("close-canvas-details").onclick = () => $("canvas-details").close();
  $("canvas-details-form").onsubmit = event => {
    event.preventDefault(); const name = $("canvas-name").value.trim();
    if (!name) return toast("请填写画布名称。", true);
    state.canvas.name = name.slice(0, 60); $("canvas-details").close(); renderCanvas(); persistWorkbench();
  };
  $("delete-canvas").onclick = () => {
    if (closeCanvas(state.activeCanvasId)) $("canvas-details").close();
  };
  $("add-benchmark-node").onclick = $("canvas-empty-add").onclick = () => showCanvasPicker("benchmark");
  $("add-gpu-node").onclick = () => showCanvasPicker("gpu");
  $("close-canvas-picker").onclick = () => $("canvas-picker").close();
  $("canvas-picker-search").oninput = renderCanvasPicker;
  $("canvas-picker-list").onclick = event => {
    const program = event.target.closest("[data-pick-benchmark]"), gpu = event.target.closest("[data-pick-gpu]"), custom = event.target.closest("[data-pick-custom-gpu]");
    if (program && !program.disabled) { addCanvasBenchmark(program.dataset.pickBenchmark); $("canvas-picker").close(); }
    if (gpu && !gpu.disabled) { addCanvasGpu(gpu.dataset.pickGpu); $("canvas-picker").close(); }
    if (custom) { $("canvas-picker").close(); const node = addCanvasGpu(null); openCanvasNode(node.id); }
  };
  initCpuSettings();
  $("canvas-settings-button").onclick = () => { renderCpuSettings(); $("canvas-settings").showModal(); };
  $("close-canvas-settings").onclick = $("save-canvas-settings").onclick = () => { $("canvas-settings").close(); renderCanvas(); persistWorkbench(); };
  $("canvas-connect").onclick = () => { canvasConnecting = null; canvasConnectMode = !canvasConnectMode; renderCanvas(); };
  $("canvas-fit").onclick = () => { const rect = $("canvas-viewport").getBoundingClientRect(); state.canvas.viewport = CanvasGraph.fit(state.canvas.nodes, rect.width, rect.height); renderCanvas(); persistWorkbench(); };
  function zoomCanvas(factor) { const rect = $("canvas-viewport").getBoundingClientRect(); state.canvas.viewport = CanvasGraph.zoomAt(state.canvas.viewport, rect.width / 2, rect.height / 2, state.canvas.viewport.zoom * factor); updateCanvasTransform(); persistWorkbench(); }
  $("canvas-zoom-in").onclick = () => zoomCanvas(1.15); $("canvas-zoom-out").onclick = () => zoomCanvas(1 / 1.15);
  const viewport = $("canvas-viewport");
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    if (event.target.closest("[data-canvas-ui]")) return;
    closeCanvasContext();
    const point = pointerInCanvas(event);
    state.canvas.viewport = CanvasGraph.zoomAt(state.canvas.viewport, point.x, point.y, state.canvas.viewport.zoom * Math.exp(-event.deltaY * 0.0012));
    updateCanvasTransform(); persistWorkbench();
  }, { passive: false });
  // Browser text/image dragging must never take ownership of a canvas gesture.
  viewport.addEventListener("dragstart", event => event.preventDefault());
  viewport.addEventListener("selectstart", event => event.preventDefault());
  viewport.onpointerdown = event => {
    if ((event.button !== 0 && event.button !== 1) || event.isPrimary === false) return;
    if (event.target.closest("[data-canvas-ui], [data-edge-control]")) return;
    closeCanvasContext();
    const port = event.target.closest("[data-node-port]");
    if (port) {
      event.preventDefault();
      if (canvasConnecting && canvasConnecting !== port.dataset.nodePort) {
        releaseCanvasPointer(); connectCanvasNodes(canvasConnecting, port.dataset.nodePort);
      } else {
        canvasConnecting = port.dataset.nodePort;
        canvasPointer = { kind: "link", pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        viewport.setPointerCapture(event.pointerId); renderCanvas();
      }
      return;
    }
    if (event.target.closest("button") && !event.target.closest(".canvas-node-edit")) return;
    const element = event.target.closest("[data-node]");
    if (element && (canvasConnectMode || canvasConnecting)) { event.preventDefault(); return; }
    if (element && event.button === 0) {
      const node = canvasNode(element.dataset.node);
      canvasPointer = { kind: "node", pointerId: event.pointerId, id: node.id, x: event.clientX, y: event.clientY, nodeX: node.x, nodeY: node.y, moved: false };
      viewport.classList.add("is-dragging-node");
    } else if (!element) {
      canvasPointer = { kind: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY, viewX: state.canvas.viewport.x, viewY: state.canvas.viewport.y, moved: false };
      viewport.classList.add("is-panning");
    } else return;
    event.preventDefault(); window.getSelection()?.removeAllRanges();
    viewport.setPointerCapture(event.pointerId);
  };
  window.addEventListener("pointermove", event => {
    if (canvasConnecting) updatePreviewLine(event);
    if (!canvasPointer || canvasPointer.pointerId !== event.pointerId) return;
    if (!event.buttons) { cancelCanvasGesture(); return; }
    const dx = event.clientX - canvasPointer.x, dy = event.clientY - canvasPointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) canvasPointer.moved = true;
    if (canvasPointer.kind === "link") return;
    if (canvasPointer.kind === "node") {
      const node = canvasNode(canvasPointer.id); if (!node) { cancelCanvasGesture(); return; }
      node.x = Math.round(canvasPointer.nodeX + dx / state.canvas.viewport.zoom); node.y = Math.round(canvasPointer.nodeY + dy / state.canvas.viewport.zoom);
      const element = document.querySelector(`[data-node="${node.id}"]`); if (element) { element.style.left = node.x + "px"; element.style.top = node.y + "px"; }
      renderCanvasEdges();
    } else { state.canvas.viewport.x = canvasPointer.viewX + dx; state.canvas.viewport.y = canvasPointer.viewY + dy; updateCanvasTransform(); }
  });
  window.addEventListener("pointerup", event => {
    if (!canvasPointer || canvasPointer.pointerId !== event.pointerId) return;
    const pointer = releaseCanvasPointer();
    const clickedNode = pointer.kind === "node" && !pointer.moved ? pointer.id : null;
    if (pointer.kind === "link" && pointer.moved) {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-node]");
      if (target && target.dataset.node !== canvasConnecting) connectCanvasNodes(canvasConnecting, target.dataset.node);
      else { canvasConnecting = null; canvasConnectMode = false; }
    }
    if (pointer.kind === "pan" && !pointer.moved) { canvasConnecting = null; canvasConnectMode = false; }
    if (pointer.moved || clickedNode) canvasIgnoreClickUntil = Date.now() + 150;
    renderCanvas(); persistWorkbench();
    if (clickedNode) openCanvasNode(clickedNode);
  });
  viewport.addEventListener("pointercancel", event => { if (canvasPointer?.pointerId === event.pointerId) cancelCanvasGesture(); });
  viewport.addEventListener("lostpointercapture", event => { if (canvasPointer?.pointerId === event.pointerId) cancelCanvasGesture(); });
  window.addEventListener("blur", () => { if (canvasPointer || canvasConnecting) cancelCanvasGesture(); });
  viewport.onclick = event => {
    if (Date.now() < canvasIgnoreClickUntil || event.target.closest("[data-node-port]")) return;
    const runNode = event.target.closest("[data-run-node]");
    if (runNode) { runCanvasNode(runNode.dataset.runNode); return; }
    const remove = event.target.closest("[data-remove-node]");
    if (remove) { const node = canvasNode(remove.dataset.removeNode); if (node && !canvasNodeStatus(node).busy) { CanvasGraph.remove(state.canvas, node.id); if (canvasConnecting === node.id) canvasConnecting = null; renderCanvas(); persistWorkbench(); } return; }
    const run = event.target.closest("[data-run-edge]"), options = event.target.closest("[data-edge-options]");
    if (run) { runCanvasEdge(run.dataset.runEdge); return; }
    if (options) { const rect = options.getBoundingClientRect(); openCanvasContext(options.dataset.edgeOptions, rect.left, rect.bottom + 4); return; }
    const node = event.target.closest("[data-node]");
    if (node) {
      if (canvasConnecting && canvasConnecting !== node.dataset.node) connectCanvasNodes(canvasConnecting, node.dataset.node);
      else if (canvasConnectMode) { canvasConnecting = node.dataset.node; renderCanvas(); }
      else openCanvasNode(node.dataset.node);
    } else if (!event.target.closest("[data-canvas-ui], [data-edge-control], [data-edge-line], button")) {
      canvasConnecting = null; canvasConnectMode = false; renderCanvas();
    }
  };
  function contextOnEdge(event) { const el = event.target.closest("[data-edge-control], [data-edge-line], [data-run-edge], [data-edge-options]"); if (!el) return; event.preventDefault(); openCanvasContext(el.dataset.edgeControl || el.dataset.edgeLine || el.dataset.runEdge || el.dataset.edgeOptions, event.clientX, event.clientY); }
  viewport.oncontextmenu = contextOnEdge;
  $("canvas-connection-list").oncontextmenu = contextOnEdge;
  $("canvas-connection-list").onclick = event => {
    const run = event.target.closest("[data-run-edge]"), options = event.target.closest("[data-edge-options]"), focus = event.target.closest("[data-focus-edge]");
    if (run) runCanvasEdge(run.dataset.runEdge);
    if (options) { const r = options.getBoundingClientRect(); openCanvasContext(options.dataset.edgeOptions, r.left, r.bottom); }
    if (focus) focusCanvasEdge(focus.dataset.focusEdge);
  };
  document.addEventListener("pointerdown", event => { if (!event.target.closest("#canvas-context") && !event.target.closest("[data-edge-options]")) closeCanvasContext(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { releaseCanvasPointer(); canvasConnecting = null; canvasConnectMode = false; closeCanvasContext(); renderCanvas(); } });
  $("save-edge-repeat").onclick = saveCanvasRepeat;
  document.querySelectorAll("[data-edge-repeat]").forEach(button => button.onclick = () => { $("edge-repeats").value = button.dataset.edgeRepeat; saveCanvasRepeat(); });
  $("context-run-edge").onclick = () => { const id = canvasContextEdge; saveCanvasRepeat(); if ($("canvas-context").hidden) runCanvasEdge(id); };
  $("context-stop-edge").onclick = () => { const edge = canvasEdge(canvasContextEdge); if (edge) for (const id of edge.jobIds || []) window.studio.cancel(id); closeCanvasContext(); };
  $("context-result-edge").onclick = () => { const edge = canvasEdge(canvasContextEdge); closeCanvasContext(); if (edge?.jobIds.length) { showView("results"); openJob(edge.jobIds[0]); } };
  $("context-remove-edge").onclick = () => { const edge = canvasEdge(canvasContextEdge); if (edge && !canvasEdgeStatus(edge).busy) { state.canvas.edges = state.canvas.edges.filter(e => e.id !== edge.id); renderCanvas(); persistWorkbench(); } closeCanvasContext(); };
  for (const id of ["wall-minutes", "max-cycles"]) $(id).oninput = () => { renderCanvas(); persistWorkbench(); };
  $("config-dialog").addEventListener("close", () => { if (!$("config-dialog").open) state.canvasEditing = null; });
  $("benchmark-dialog").addEventListener("close", () => { if (!$("benchmark-dialog").open) state.canvasEditing = null; });
}
