(function (root, factory) {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.CanvasGraph = model;
})(globalThis, function () {
  const nodeWidth = 242, nodeHeight = 174;
  function empty() { return { nodes: [], edges: [], viewport: { x: 36, y: 36, zoom: 1 } }; }
  function restoreCanvases(saved, newId) {
    const valid = c => c && Array.isArray(c.nodes) && Array.isArray(c.edges);
    const candidates = Array.isArray(saved?.canvases) ? saved.canvases.filter(valid) : [];
    if (!candidates.length) candidates.push(valid(saved?.canvas) ? saved.canvas : empty());
    const ids = new Set();
    return candidates.map((canvas, index) => {
      const id = typeof canvas.id === "string" && canvas.id && !ids.has(canvas.id) ? canvas.id : newId();
      ids.add(id);
      return { ...canvas, id, name: String(canvas.name || `画布 ${index + 1}`).slice(0, 60),
        viewport: canvas.viewport || empty().viewport, edges: canvas.edges.map(e => ({ ...e, submitting: false })) };
    });
  }
  function connectedEdges(graph, nodeId) {
    return graph.edges.filter(e => e.benchmarkNodeId === nodeId || e.gpuNodeId === nodeId);
  }
  function pair(graph, firstId, secondId) {
    const first = graph.nodes.find(n => n.id === firstId), second = graph.nodes.find(n => n.id === secondId);
    if (!first || !second || first.kind === second.kind) throw new Error("请连接一个测试程序和一个 GPU。");
    return { benchmarkNodeId: first.kind === "benchmark" ? first.id : second.id, gpuNodeId: first.kind === "gpu" ? first.id : second.id };
  }
  function connect(graph, firstId, secondId, id) {
    const endpoints = pair(graph, firstId, secondId);
    if (graph.edges.some(e => e.benchmarkNodeId === endpoints.benchmarkNodeId && e.gpuNodeId === endpoints.gpuNodeId)) throw new Error("这两个模块已经连接。");
    const edge = { id, ...endpoints, repeats: 1, jobIds: [], error: "" };
    graph.edges.push(edge); return edge;
  }
  function remove(graph, nodeId) {
    graph.nodes = graph.nodes.filter(n => n.id !== nodeId);
    graph.edges = graph.edges.filter(e => e.benchmarkNodeId !== nodeId && e.gpuNodeId !== nodeId);
  }
  function aggregate(jobs, submitting = false) {
    if (submitting) return { phase: "active", label: "正在提交", busy: true, completed: 0, total: jobs.length };
    if (!jobs.length) return { phase: "idle", label: "待运行", busy: false, completed: 0, total: 0 };
    const active = new Set(["queued", "preparing", "compiling", "running", "cancelling"]);
    const completed = jobs.filter(j => j.status === "completed").length, busy = jobs.some(j => active.has(j.status));
    if (busy) return { phase: "active", label: jobs.every(j => j.status === "queued") ? "排队中" : "运行中", busy, completed, total: jobs.length };
    if (completed === jobs.length) return { phase: "completed", label: "已完成", busy: false, completed, total: jobs.length };
    if (jobs.every(j => j.status === "cancelled")) return { phase: "cancelled", label: "已取消", busy: false, completed, total: jobs.length };
    if (jobs.every(j => j.status === "completed" || j.status === "unverified")) return { phase: "warning", label: "完成 · 未全部验证", busy: false, completed, total: jobs.length };
    return { phase: "failed", label: jobs.some(j => j.status === "interrupted") ? "运行已中断" : "需要查看结果", busy: false, completed, total: jobs.length };
  }
  function worldPoint(viewport, x, y) { return { x: (x - viewport.x) / viewport.zoom, y: (y - viewport.y) / viewport.zoom }; }
  function zoomAt(viewport, x, y, nextZoom) {
    const point = worldPoint(viewport, x, y), zoom = Math.max(0.3, Math.min(1.8, nextZoom));
    return { x: x - point.x * zoom, y: y - point.y * zoom, zoom };
  }
  function fit(nodes, width, height) {
    if (!nodes.length) return empty().viewport;
    const left = Math.min(...nodes.map(n => n.x)), top = Math.min(...nodes.map(n => n.y));
    const right = Math.max(...nodes.map(n => n.x + nodeWidth)), bottom = Math.max(...nodes.map(n => n.y + nodeHeight));
    const zoom = Math.min(1, Math.max(0.3, Math.min((width - 110) / (right - left), (height - 100) / (bottom - top))));
    return { x: (width - (right - left) * zoom) / 2 - left * zoom, y: (height - (bottom - top) * zoom) / 2 - top * zoom, zoom };
  }
  return { empty, restoreCanvases, connectedEdges, pair, connect, remove, aggregate, worldPoint, zoomAt, fit, nodeWidth, nodeHeight };
});
