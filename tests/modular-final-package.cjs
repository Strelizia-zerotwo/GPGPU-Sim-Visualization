// Verify the final package against the saved successful experiment session.
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve("artifacts");
  const previous = JSON.parse(fs.readFileSync(path.join(root, "modular-package-verification.json"), "utf8"));
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: previous.dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ executablePath: path.resolve("release/win-unpacked/GPGPU Studio.exe"), args: [], env, timeout: 90000 });
  try {
    const page = await desktop.firstWindow(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector("#header-status").classList.contains("ready"), null, { timeout: 90000 });
    const status = await page.evaluate(async () => {
      const initial = await window.studio.bootstrap();
      const a100 = state.info.profiles.find(p => p.id === "SM80_A100");
      return { version: initial.version, jobs: initial.jobs.map(j => j.status), modules: Object.keys(state.customGPUs).length,
        fractionalSharedRejected: GpuModel.validate({ ...GpuModel.read(a100.text), sharedKB: 100.5 }, a100.text).length > 0,
        taskCount: document.querySelector("#task-count").textContent };
    });
    assert.equal(status.version, "0.3.0");
    assert.deepEqual(status.jobs, ["completed", "completed", "completed", "completed"]);
    assert.equal(status.modules, 1); assert.equal(status.taskCount, "4"); assert.ok(status.fractionalSharedRejected);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "minimum-size window has horizontal overflow");
    await page.locator('[data-edit="SM80_A100"]').click();
    const saveBox = await page.locator("#save-config").boundingBox();
    assert.ok(saveBox && saveBox.y + saveBox.height <= await page.evaluate(() => window.innerHeight), "save action must be visible");
    await page.screenshot({ path: path.join(root, "modular-small-window.png") });
    await page.locator("#close-config").click();
    assert.equal(errors.length, 0, errors.join("\n"));
    fs.writeFileSync(path.join(root, "modular-final-package.json"), JSON.stringify({ ...status, rendererErrors: errors, minimumWindow: { width: 1100, height: 760, noHorizontalOverflow: true, saveActionVisible: true } }, null, 2));
    console.log(JSON.stringify(status));
  } finally { await desktop.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
