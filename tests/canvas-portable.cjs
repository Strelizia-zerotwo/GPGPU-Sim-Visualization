// The NSIS portable wrapper does not expose Electron's inspector stdout.
// Connect to the actual renderer after normal portable extraction instead.
const { chromium } = require("playwright");
const { spawn, execFileSync } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve("artifacts"), previous = JSON.parse(fs.readFileSync(path.join(root, "canvas-package-verification.json"), "utf8"));
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: previous.dataDir }; delete env.ELECTRON_RUN_AS_NODE;
  const server = net.createServer(); await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const launcher = spawn(path.resolve("release/canvas/GPGPU-Studio-0.4.0-Windows-x64.exe"), [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"], { env, stdio: "ignore", windowsHide: true });
  let browser;
  try {
    const end = Date.now() + 60000;
    let ready = false;
    while (Date.now() < end) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {}
      if (ready) break;
      if (launcher.exitCode !== null) throw Error("Portable launcher exited: " + launcher.exitCode);
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, "portable renderer debug endpoint did not start");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.waitForEvent("page");
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector("#header-status")?.classList.contains("ready"), null, { timeout: 90000 });
    const status = await page.evaluate(async () => {
      const initial = await window.studio.bootstrap();
      return { version: initial.version, jobs: initial.jobs.map(j => j.status), modules: state.canvas.nodes.length, edges: state.canvas.edges.length, taskCount: document.querySelector("#task-count").textContent };
    });
    assert.equal(status.version, "0.4.0"); assert.equal(status.modules, 6); assert.equal(status.edges, 3); assert.equal(status.taskCount, "5");
    assert.deepEqual(status.jobs, ["completed", "completed", "completed", "completed", "limited"]);
    const gpuId = await page.evaluate(() => state.canvas.nodes.find(n => n.kind === "gpu").id);
    await page.locator(`[data-edit-node="${gpuId}"]`).click();
    assert.equal(await page.locator("#gpu-sms").inputValue(), "54");
    await page.screenshot({ path: path.join(root, "canvas-portable-window.png") });
    await page.locator("#close-config").click();
    assert.equal(errors.length, 0, errors.join("\n"));
    fs.writeFileSync(path.join(root, "canvas-portable-verification.json"), JSON.stringify({ ...status, portable: true, rendererErrors: errors }, null, 2));
    console.log(JSON.stringify(status));
    await page.evaluate(() => window.close());
  } finally {
    if (browser) await browser.close();
    if (launcher.exitCode === null) {
      await new Promise(r => { launcher.once("exit", r); setTimeout(r, 3000); });
      if (launcher.exitCode === null) execFileSync("taskkill", ["/PID", String(launcher.pid), "/T", "/F"], { stdio: "ignore" });
    }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
