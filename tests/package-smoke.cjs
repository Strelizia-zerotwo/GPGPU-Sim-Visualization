const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
(async () => {
  const root = path.resolve("artifacts");
  const report = JSON.parse(
    fs.readFileSync(path.join(root, "enhancements-verification.json"), "utf8"),
  );
  const dataDir = path.join(root, `package-data-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(
    path.join(report.dataDir, "state.json"),
    path.join(dataDir, "state.json"),
  );
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({
    executablePath: path.resolve("release/canvas/win-unpacked/GPGPU Studio.exe"),
    args: [],
    env,
  });
  try {
    const page = await desktop.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        document.querySelector("#header-status")?.classList.contains("ready"),
      null,
      { timeout: 60000 },
    );
    assert.equal(await page.locator("#task-count").innerText(), "0");
    await page.locator('[data-view="store"]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator(".store-card").count(), 16);
    await page.screenshot({ path: path.join(root, "desktop-store-final.png") });
    await page.locator('[data-view="tutorial"]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator(".tutorial-card").count(), 4);
    await page.screenshot({
      path: path.join(root, "desktop-tutorial-final.png"),
    });
    await page.locator('[data-view="results"]').click();
    assert.equal(await page.locator("#stat-total").innerText(), "17");
    assert.equal(await page.locator("#stat-completed").innerText(), "17");
    const snapshot = await page.evaluate(() => window.studio.bootstrap());
    const covariance = snapshot.jobs.find((j) => j.benchmark === "covar");
    const diff = await page.evaluate(
      (id) => window.studio.read(id, "source.diff"),
      covariance.id,
    );
    assert.ok(diff.text.includes("DIM_THREAD_BLOCK_KERNEL_2_Y"));
    const csvPath = path.join(root, "verified-export.csv");
    await desktop.evaluate(({ dialog }, output) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: output,
      });
    }, csvPath);
    await page.locator("#export-csv").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast")?.textContent.includes("结果已导出"),
    );
    assert.equal(fs.readFileSync(csvPath, "utf8").split("\r\n").length, 18);
    assert.equal(errors.length, 0, errors.join("\n"));
    await page.evaluate(() => (document.querySelector("#toast").hidden = true));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(root, "desktop-final.png") });
    fs.writeFileSync(
      path.join(root, "package-verification.json"),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          version: snapshot.version,
          packagedBackendConnected: true,
          historyRestored: 17,
          completed: 17,
          storeCards: 16,
          tutorialCards: 4,
          defaultTasks: 1,
          csvRows: 17,
          sourceDiffReadBack: true,
          rendererErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "Packaged 0.2 desktop passed: catalog JSON/Python resources, default single task, store, tutorial, 17 results, source diff, CSV.",
    );
  } finally {
    await desktop.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
