const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
(async () => {
  const root = path.resolve("artifacts"), stamp = Date.now(), dataDir = path.join(root, `canvas-data-${stamp}`);
  const runsRoot = execFileSync("wsl.exe", ["-d", "only", "--exec", "wslpath", "-u", path.join(root, `canvas-runs-${stamp}`)], { encoding: "utf8" }).trim();
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir }; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.argv.includes("--packaged");
  const desktop = await electron.launch(packaged ? { executablePath: path.resolve("release/canvas/win-unpacked/GPGPU Studio.exe"), args: [], env } : { args: ["."], env });
  let page; const errors = [];
  try {
    page = await desktop.firstWindow(); page.on("pageerror", e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector("#header-status").classList.contains("ready"), null, { timeout: 90000 });
    assert.equal(await page.locator(".canvas-node").count(), 0); assert.ok(await page.locator("#canvas-empty").isVisible());
    await page.screenshot({ path: path.join(root, "canvas-empty.png") });
    await page.locator('[data-view="environment"]').click(); await page.locator("#runs-root").fill(runsRoot); await page.locator("#inspect-env").click();
    await page.waitForFunction(() => !document.querySelector("#inspect-env").disabled && document.querySelector("#header-status").classList.contains("ready"));
    await page.locator('[data-view="workbench"]').click();
    async function addProgram(id) { await page.locator("#add-benchmark-node").click(); await page.locator(`[data-pick-benchmark="${id}"]`).click(); return await page.evaluate(() => state.canvas.nodes.at(-1).id); }
    async function addGpu(id) { await page.locator("#add-gpu-node").click(); await page.locator(`[data-pick-gpu="${id}"]`).click(); return await page.evaluate(() => state.canvas.nodes.at(-1).id); }
    const gemm1 = await addProgram("gemm"), gemm2 = await addProgram("gemm"), gpu1 = await addGpu("SM80_A100"), gpu2 = await addGpu("SM80_A100");
    await page.locator("#canvas-fit").click();
    async function editSize(id, value) { await page.locator(`[data-edit-node="${id}"]`).click(); await page.locator("#benchmark-sizes").fill(String(value)); await page.locator("#save-benchmark").click(); }
    await editSize(gemm1, 8); await editSize(gemm2, 9);
    await page.locator(`[data-edit-node="${gemm2}"]`).click(); await page.locator("#dimension-mode").selectOption("independent");
    for (const [key, value] of Object.entries({ NI: 7, NJ: 13, NK: 5 })) await page.locator(`[data-benchmark-param="${key}"]`).fill(String(value));
    await page.locator("#save-benchmark").click();
    await page.locator(`[data-edit-node="${gpu1}"]`).click(); await page.locator("#gpu-sms").fill("54"); await page.locator("#save-config").click();
    await page.locator(`[data-edit-node="${gpu2}"]`).click(); assert.equal(await page.locator("#gpu-sms").inputValue(), "108"); await page.locator("#close-config").click();
    const isolated = await page.evaluate(() => state.canvas.nodes.filter(n => n.kind === "benchmark").map(n => n.settings.sizes)); assert.deepEqual(isolated, ["8", "9"]);
    // Drag a port to connect the first pair; click ports to connect the second.
    const from = await page.locator(`[data-node-port="${gemm1}"]`).boundingBox(), to = await page.locator(`[data-node-port="${gpu1}"]`).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 }); await page.mouse.up();
    await page.locator(`[data-node-port="${gemm2}"]`).click(); await page.locator(`[data-node-port="${gpu2}"]`).click();
    assert.equal(await page.locator(".edge-control").count(), 2);
    const [edge1, edge2] = await page.evaluate(() => state.canvas.edges.map(e => e.id));
    await page.locator(`#canvas-edge-actions [data-run-edge="${edge1}"]`).click({ button: "right" });
    await page.locator("#edge-repeats").fill("3"); await page.screenshot({ path: path.join(root, "canvas-repeat-menu.png") }); await page.locator("#save-edge-repeat").click();
    assert.equal(await page.locator("#task-count").innerText(), "4");
    // An unconnected module adds no experiments.
    const mvt = await addProgram("mvt"); assert.equal(await page.locator("#task-count").innerText(), "4"); await editSize(mvt, 8);
    await page.locator("#canvas-fit").click();
    // Move a node and pan/zoom using real pointer events.
    const before = await page.evaluate(id => ({ ...canvasNode(id) }), gemm2), header = await page.locator(`[data-node="${gemm2}"] .canvas-node-header`).boundingBox();
    await page.mouse.move(header.x + 80, header.y + 15); await page.mouse.down(); await page.mouse.move(header.x + 115, header.y + 35, { steps: 7 }); await page.mouse.up();
    const after = await page.evaluate(id => ({ ...canvasNode(id) }), gemm2); assert.notEqual(before.x, after.x);
    assert.ok(!await page.locator("#benchmark-dialog").isVisible());
    const viewport = await page.locator("#canvas-viewport").boundingBox(); await page.mouse.move(viewport.x + 12, viewport.y + viewport.height - 55); await page.mouse.down(); await page.mouse.move(viewport.x + 37, viewport.y + viewport.height - 38); await page.mouse.up();
    await page.locator("#canvas-zoom-out").click(); assert.notEqual(await page.locator("#canvas-zoom-value").innerText(), "100%"); await page.locator("#canvas-fit").click();
    await page.locator("#canvas-settings-button").click(); await page.locator("#concurrency").fill("2"); await page.locator("#save-canvas-settings").click();
    await page.evaluate(() => document.querySelector("#toast").hidden = true); await page.screenshot({ path: path.join(root, "canvas-workbench.png") });
    await page.locator(`#canvas-edge-actions [data-run-edge="${edge1}"]`).click(); await page.locator(`#canvas-edge-actions [data-run-edge="${edge2}"]`).click();
    assert.ok(await page.locator("#view-workbench").isVisible());
    await page.waitForFunction(() => document.querySelectorAll(".edge-control.active .run-spinner").length > 0);
    await page.screenshot({ path: path.join(root, "canvas-running.png") });
    await page.waitForFunction(() => state.jobs.length === 4 && state.jobs.every(j => j.status === "completed" || ["failed", "incorrect", "incomplete"].includes(j.status)), null, { timeout: 240000 });
    const initial = await page.evaluate(() => window.studio.bootstrap());
    assert.ok(initial.jobs.every(j => j.status === "completed" && j.correctness === "passed"), JSON.stringify(initial.jobs.map(j => ({ status: j.status, error: j.error }))));
    assert.equal(initial.jobs.filter(j => j.canvasEdgeId === edge1).length, 3); assert.equal(initial.jobs.filter(j => j.canvasEdgeId === edge2).length, 1);
    assert.ok(initial.jobs.filter(j => j.benchmarkNodeId === gemm1).every(j => j.size === 8 && j.configText.includes("-gpgpu_n_clusters 54")));
    assert.ok(initial.jobs.filter(j => j.benchmarkNodeId === gemm2).every(j => j.size === 9 && j.configText.includes("-gpgpu_n_clusters 108")));
    assert.ok(initial.jobs.filter(j => j.benchmarkNodeId === gemm2).every(j => j.parameters.NI === 7 && j.parameters.NJ === 13 && j.parameters.NK === 5));
    assert.ok(new Date(initial.jobs[1].startedAt) < new Date(initial.jobs[0].finishedAt));
    assert.equal(await page.locator(".edge-control.completed").count(), 2);
    await page.evaluate(() => document.querySelector("#toast").hidden = true); await page.screenshot({ path: path.join(root, "canvas-completed.png") });
    // A truncated real simulation must remain distinct from a completed edge.
    await page.locator("#add-gpu-node").click(); await page.locator("[data-pick-custom-gpu]").click();
    assert.equal(await page.locator("#gpu-sms").inputValue(), "");
    await page.locator("#gpu-template").selectOption("SM80_A100"); await page.locator("#fill-gpu-template").click(); await page.locator("#gpu-name").fill("Custom 72 SM"); await page.locator("#gpu-sms").fill("72"); await page.locator("#save-config").click();
    const customGpu = await page.evaluate(() => state.canvas.nodes.at(-1).id); await page.locator("#canvas-fit").click();
    await page.locator(`[data-node-port="${mvt}"]`).click(); await page.locator(`[data-node-port="${customGpu}"]`).click();
    const limitedEdge = await page.evaluate(() => state.canvas.edges.at(-1).id);
    await page.locator("#canvas-settings-button").click(); await page.locator("#max-cycles").fill("100"); await page.locator("#save-canvas-settings").click();
    await page.locator(`#canvas-edge-actions [data-run-edge="${limitedEdge}"]`).click();
    await page.waitForFunction(id => state.jobs.some(j => j.canvasEdgeId === id && j.status === "limited"), limitedEdge, { timeout: 120000 });
    assert.ok(!await page.locator(`[data-edge-control="${limitedEdge}"]`).getAttribute("class").then(c => c.includes("completed")));
    const manifestJob = initial.jobs[0]; const manifest = JSON.parse((await page.evaluate(id => window.studio.read(id, "manifest.json"), manifestJob.id)).text); assert.equal(manifest.canvasEdgeId, edge1);
    await page.reload(); await page.waitForFunction(() => document.querySelector("#header-status").classList.contains("ready"), null, { timeout: 90000 });
    assert.equal(await page.locator(".canvas-node").count(), 6); assert.equal(await page.locator(".edge-control").count(), 3);
    assert.equal(await page.evaluate(id => canvasEdge(id).repeats, edge1), 3); assert.equal(await page.locator(".edge-control.completed").count(), 2);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760)); await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1), "canvas must fit vertically in the smallest supported window");
    await page.screenshot({ path: path.join(root, "canvas-small-window.png") });
    assert.equal(errors.length, 0, errors.join("\n"));
    fs.writeFileSync(path.join(root, packaged ? "canvas-package-verification.json" : "canvas-verification.json"), JSON.stringify({ version: initial.version, packaged, dataDir, runsRoot, rendererErrors: errors, independentNodeSettings: true, realConcurrentJobs: true, pointerDragAndConnections: true, persistedNodes: 6, edges: 3, customGpu: true, successfulJobs: initial.jobs.map(j => ({ id: j.id, canvasEdgeId: j.canvasEdgeId, size: j.size, parameters: j.parameters, status: j.status, cycles: j.metrics.cycles })), truncatedEdge: limitedEdge }, null, 2));
    console.log(JSON.stringify({ version: initial.version, packaged, successfulJobs: 4, truncatedJobs: 1, rendererErrors: errors }));
  } catch (error) { if (page) { await page.screenshot({ path: path.join(root, "canvas-error.png") }); console.error(await page.locator("body").innerText()); } throw error; }
  finally { await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); }); await desktop.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
