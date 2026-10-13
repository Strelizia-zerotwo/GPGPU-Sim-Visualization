const test = require("node:test");
const assert = require("node:assert/strict");
const Graph = require("../desktop/ui/graph-model.js");
const { JobManager } = require("../desktop/runner.cjs");

test("a new workbench is empty and only explicitly connected instances form experiments", () => {
  const graph = Graph.empty(); assert.equal(graph.nodes.length, 0); assert.equal(graph.edges.length, 0);
  graph.nodes.push({ id: "gemm-1", kind: "benchmark" }, { id: "gemm-2", kind: "benchmark" }, { id: "a100-1", kind: "gpu" });
  Graph.connect(graph, "a100-1", "gemm-2", "edge-1");
  assert.deepEqual(graph.edges.map(e => [e.benchmarkNodeId, e.gpuNodeId]), [["gemm-2", "a100-1"]]);
  assert.throws(() => Graph.connect(graph, "gemm-1", "gemm-2", "bad"), /一个测试程序和一个 GPU/);
  assert.throws(() => Graph.connect(graph, "gemm-2", "a100-1", "duplicate"), /已经连接/);
  Graph.remove(graph, "gemm-2"); assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 0);
});
test("repeat progress counts actual jobs and never reports failures or unverified results as passed", () => {
  assert.equal(Graph.aggregate([{ status: "completed" }, { status: "running" }, { status: "queued" }]).completed, 1);
  assert.equal(Graph.aggregate([{ status: "completed" }, { status: "running" }]).busy, true);
  assert.equal(Graph.aggregate([{ status: "completed" }, { status: "completed" }]).phase, "completed");
  for (const status of ["limited", "incorrect", "failed", "timed_out", "interrupted"]) assert.equal(Graph.aggregate([{ status: "completed" }, { status }]).phase, "failed");
  assert.equal(Graph.aggregate([{ status: "unverified" }]).phase, "warning");
  assert.equal(Graph.aggregate([{ status: "cancelled" }]).phase, "cancelled");
});
test("zoom keeps the point below the pointer stationary and fit includes the whole node bounds", () => {
  const view = { x: 35, y: -80, zoom: 0.8 }, before = Graph.worldPoint(view, 231, 119);
  const next = Graph.zoomAt(view, 231, 119, 1.3), after = Graph.worldPoint(next, 231, 119);
  assert.ok(Math.abs(before.x - after.x) < 1e-9); assert.ok(Math.abs(before.y - after.y) < 1e-9);
  const nodes = [{ x: -200, y: -50 }, { x: 1100, y: 750 }], fit = Graph.fit(nodes, 1000, 600);
  for (const node of nodes) { assert.ok(node.x * fit.zoom + fit.x >= 0); assert.ok((node.x + Graph.nodeWidth) * fit.zoom + fit.x <= 1000); assert.ok((node.y + Graph.nodeHeight) * fit.zoom + fit.y <= 600); }
});
test("submission preserves connection identity and immutable settings for repeated independent runs", () => {
  const manager = new JobManager(() => ({ cancel() {} }));
  const catalog = { benchmarks: [{ id: "gemm", available: true }], profiles: [{ id: "a100", name: "A100", text: "base", supported: true }] };
  const spec = { benchmarkModules: [{ id: "gemm", sizes: [8] }], gpuModules: [{ id: "a100", name: "A100 variant 2" }], repeats: 3, maxConcurrent: 2, wallMinutes: 1, maxCycles: 0, canvas: { edgeId: "edge-2", benchmarkNodeId: "program-2", gpuNodeId: "gpu-2" } };
  manager.submit(spec, {}, catalog); spec.canvas.edgeId = "changed"; spec.benchmarkModules[0].sizes[0] = 99;
  assert.equal(manager.jobs.length, 3);
  assert.ok(manager.jobs.every(j => j.canvasEdgeId === "edge-2" && j.benchmarkNodeId === "program-2" && j.gpuNodeId === "gpu-2" && j.size === 8 && j.profileName === "A100 variant 2"));
});
