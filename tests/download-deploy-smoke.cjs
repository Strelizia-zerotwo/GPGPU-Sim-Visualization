const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const artifacts = path.resolve("artifacts");
  const stamp = Date.now();
  const dataDir = path.join(artifacts, `download-data-${stamp}`);
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ args: ["."], env });
  let passed = false;
  try {
    const page = await desktop.firstWindow();
    await page.waitForFunction(
      () =>
        document.querySelector("#header-status")?.classList.contains("ready"),
      null,
      { timeout: 60000 },
    );
    const base = await page.evaluate(() => window.studio.bootstrap());
    const root =
      process.env.GPGPU_STUDIO_REUSE_ENV || `/tmp/gpgpu-studio-fresh-${stamp}`;
    const benchmarkName = `GitHub GEMM ${stamp}`;
    await page.locator('[data-view="environment"]').click();
    await page.locator("#sim-root").fill(root + "/gpgpu-sim_distribution");
    await page.locator("#apps-root").fill(root + "/gpu-app-collection");
    await page.locator("#runs-root").fill(root + "/runs");
    await page.locator("#inspect-env").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#inspect-env").disabled &&
        (document
          .querySelector("#deploy-guidance")
          .textContent.includes("CUDA 与编译依赖") ||
          document.querySelector("#environment-badge").textContent ===
            "检查通过"),
      null,
      { timeout: 60000 },
    );
    if (!process.env.GPGPU_STUDIO_REUSE_ENV) {
      await page.locator("#build-jobs").fill("4");
      await page.locator("#deploy-simulator").click();
      await page.waitForFunction(
        () =>
          ["已完成", "失败"].includes(
            document.querySelector("#maintenance-status")?.textContent,
          ),
        null,
        { timeout: 900000 },
      );
      assert.equal(
        await page.locator("#maintenance-status").innerText(),
        "已完成",
        await page.locator("#maintenance-error").innerText(),
      );
    }
    let current = await page.evaluate(() => window.studio.bootstrap());
    assert.equal(current.settings.simRoot, root + "/gpgpu-sim_distribution");
    if (!process.env.GPGPU_STUDIO_REUSE_ENV) {
      assert.equal(current.maintenance.status, "completed");
      assert.ok(current.maintenance.result.environment.simulatorReady);
    }
    await page.locator('[data-view="store"]').click();
    await page.locator("#add-custom").click();
    await page.locator("#custom-name").fill(benchmarkName);
    await page.locator("#custom-origin").selectOption("github");
    await page
      .locator("#custom-repo")
      .fill("https://github.com/accel-sim/gpu-app-collection.git");
    await page
      .locator("#custom-file")
      .fill("src/cuda/polybench-gpu-1.0/CUDA/GEMM/gemm.cu");
    await page.locator("#custom-macros").fill("NI,NJ,NK");
    await page.locator('#custom-form button[type="submit"]').click();
    await page.waitForFunction(
      (expectedName) =>
        Array.from(document.querySelectorAll(".store-card h3")).some(
          (n) => n.textContent === expectedName,
        ) ||
        document.querySelector("#maintenance-status").textContent === "失败",
      benchmarkName,
      { timeout: 180000 },
    );
    assert.equal(
      await page.locator("#maintenance-status").innerText(),
      "已完成",
      await page.locator("#maintenance-error").innerText(),
    );
    await page
      .locator(".store-card")
      .filter({ has: page.locator("h3", { hasText: benchmarkName }) })
      .locator("[data-use-benchmark]")
      .click();
    await page.evaluate(() => {
      const program = state.canvas.nodes.at(-1); program.settings.sizes = "8";
      const gpu = addCanvasGpu("SM80_A100"); connectCanvasNodes(program.id, gpu.id);
    });
    assert.equal(await page.locator("#task-count").innerText(), "1");
    await page.locator("#launch").click();
    await page.waitForFunction(
      () => document.querySelector("#stat-completed")?.textContent === "1",
      null,
      { timeout: 60000 },
    );
    current = await page.evaluate(() => window.studio.bootstrap());
    assert.equal(current.jobs[0].correctness, "passed");
    await page.locator('[data-view="results"]').click();
    await page.locator(".job-name").click();
    await page.locator('[data-artifact="source.diff"]').click();
    await page.waitForFunction(() =>
      document.querySelector("#job-log")?.textContent.includes("--- original/"),
    );
    await page.locator("#close-job").click();
    await page.locator('[data-view="store"]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(artifacts, "store-github.png") });
    fs.writeFileSync(
      path.join(artifacts, "fresh-deploy-verification.json"),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          root,
          dataDir,
          deploymentReused: Boolean(process.env.GPGPU_STUDIO_REUSE_ENV),
          buildInstalled: true,
          simulatorCommit: current.jobs[0].manifest.simulator.commit,
          githubCustomDownloaded: true,
          githubCustomPassed: true,
          sourceDiffVisible: true,
          originalEnvironment: base.settings.simRoot,
        },
        null,
        2,
      ),
    );
    console.log("Fresh deployment and GitHub custom benchmark passed.");
    passed = true;
  } finally {
    if (!passed)
      await desktop
        .evaluate(async ({ BrowserWindow }) => {
          const w = BrowserWindow.getAllWindows()[0];
          if (w)
            await w.webContents.executeJavaScript(
              "window.studio.bootstrap().then(s=>Promise.all([window.studio.cancelMaintenance(),...s.jobs.map(j=>window.studio.cancel(j.id))]))",
            );
        })
        .catch(() => {});
    await desktop
      .evaluate(({ dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
      })
      .catch(() => {});
    await desktop.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
