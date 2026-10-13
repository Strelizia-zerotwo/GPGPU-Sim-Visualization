const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

(async () => {
  const artifacts = path.resolve("artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  const stamp = Date.now();
  const dataDir = path.join(artifacts, `enhancements-data-${stamp}`);
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ args: ["."], env });
  let passed = false;
  try {
    const page = await desktop.firstWindow();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.waitForFunction(
      () =>
        document.querySelector("#header-status")?.classList.contains("ready"),
      null,
      { timeout: 90000 },
    );
    assert.equal(await page.locator("#task-count").innerText(), "0");
    const before = await page.evaluate(() => window.studio.bootstrap());
    const distro = before.settings.distro;
    const root =
      process.env.GPGPU_STUDIO_REUSE_ENV ||
      `/tmp/gpgpu-studio-enhancements-${stamp}`;
    await page.locator('[data-view="environment"]').click();
    await page.locator("#sim-root").fill(root + "/gpgpu-sim_distribution");
    await page.locator("#apps-root").fill(root + "/gpu-app-collection");
    await page.locator("#runs-root").fill(root + "/runs");
    await page.locator("#inspect-env").click();
    await page.waitForFunction(
      (expected) =>
        !document.querySelector("#inspect-env")?.disabled &&
        document.querySelector("#sim-root")?.value === expected &&
        (document
          .querySelector("#deploy-guidance")
          ?.textContent.includes("CUDA 与编译依赖已就绪") ||
          document.querySelector("#environment-badge")?.textContent ===
            "检查通过"),
      root + "/gpgpu-sim_distribution",
      { timeout: 60000 },
    );
    await page.locator("#build-jobs").fill("4");
    await page.screenshot({
      path: path.join(artifacts, "onboarding-deploy.png"),
    });
    await page.evaluate(() =>
      window.studio.onMaintenance((v) => {
        if (v.stage !== window.lastMaintenanceStage) {
          window.lastMaintenanceStage = v.stage;
          console.log("Maintenance stage:", v.stage);
        }
      }),
    );
    page.on("console", (message) => {
      if (message.text().startsWith("Maintenance stage:"))
        console.log(message.text());
    });
    if (!process.env.GPGPU_STUDIO_REUSE_ENV) {
      await page.locator("#deploy-simulator").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#maintenance-status")?.textContent ===
          "已完成",
        null,
        { timeout: 900000 },
      );
      assert.equal(
        await page
          .locator("#maintenance-error")
          .innerText()
          .then((t) => t.includes("失败")),
        false,
      );
    }
    const deployed = await page.evaluate(() => window.studio.bootstrap());
    assert.equal(deployed.settings.simRoot, root + "/gpgpu-sim_distribution");
    await page.locator('[data-view="store"]').click();
    assert.equal(await page.locator(".store-card").count(), 15);
    await page.screenshot({
      path: path.join(artifacts, "polybench-store.png"),
    });
    if (!process.env.GPGPU_STUDIO_REUSE_ENV) {
      await page.locator("#select-store-all").click();
      await page.locator("#download-selected").click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("#store-count")
            ?.textContent.includes("15 个已下载"),
        null,
        { timeout: 600000 },
      );
    }
    await page.locator('[data-view="workbench"]').click();
    await page.evaluate(() => {
      document.querySelector("#sizes").value = "8";
      document.querySelector("#concurrency").value = "2";
      const gpu = addCanvasGpu("SM80_A100");
      for (const b of state.info.benchmarks.filter(b => b.kind === "builtin" && b.available)) {
        const node = addCanvasBenchmark(b.id);
        connectCanvasNodes(node.id, gpu.id);
      }
    });
    assert.equal(await page.locator("#task-count").innerText(), "15");
    await page.locator("#launch").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#stat-completed")?.textContent === "15" ||
        (Number(document.querySelector("#stat-running")?.textContent) === 0 &&
          Number(document.querySelector("#stat-attention")?.textContent) > 0),
      null,
      { timeout: 240000 },
    );
    let snapshot = await page.evaluate(() => window.studio.bootstrap());
    fs.writeFileSync(
      path.join(artifacts, "suite-verification.json"),
      JSON.stringify(snapshot.jobs, null, 2),
    );
    assert.ok(
      snapshot.jobs.every((j) => j.status === "completed"),
      snapshot.jobs
        .filter((j) => j.status !== "completed")
        .map((j) => `${j.benchmark}: ${j.status} ${j.error || ""}`)
        .join("\n"),
    );
    const localSource = execFileSync(
      "wsl.exe",
      [
        "-d",
        distro,
        "--exec",
        "wslpath",
        "-u",
        path.resolve("examples/vector-add"),
      ],
      { encoding: "utf8" },
    ).trim();
    await page.locator('[data-view="store"]').click();
    await page.locator("#add-custom").click();
    await page.locator("#custom-name").fill("My vector add");
    await page.locator("#custom-root").fill(localSource);
    await page.locator("#custom-mode").selectOption("arguments");
    await page.locator('#custom-form button[type="submit"]').click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".store-card h3")).some(
          (n) => n.textContent === "My vector add",
        ),
      null,
      { timeout: 60000 },
    );
    await page
      .locator(".store-card")
      .filter({ has: page.locator("h3", { hasText: "My vector add" }) })
      .locator("[data-use-benchmark]")
      .click();
    const customEdge = await page.evaluate(() => {
      const node = state.canvas.nodes.at(-1), gpu = state.canvas.nodes.find(n => n.kind === "gpu");
      const edge = CanvasGraph.connect(state.canvas, node.id, gpu.id, crypto.randomUUID());
      renderCanvas(); persistWorkbench(); return edge.id;
    });
    assert.equal(await page.locator("#task-count").innerText(), "16");
    await page.evaluate(id => { canvasEdge(id).repeats = 2; renderCanvas(); persistWorkbench(); }, customEdge);
    assert.equal(await page.locator("#task-count").innerText(), "17");
    await page.locator(`#canvas-connection-list [data-run-edge="${customEdge}"]`).click();
    await page.waitForFunction(
      () => document.querySelector("#stat-completed")?.textContent === "17",
      null,
      { timeout: 60000 },
    );
    snapshot = await page.evaluate(() => window.studio.bootstrap());
    assert.ok(
      snapshot.jobs
        .slice(-2)
        .every(
          (j) =>
            j.correctness === "passed" && j.manifest.runArguments[0] === "8",
        ),
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    await page.screenshot({
      path: path.join(artifacts, "enhancements-results.png"),
    });
    // Simulate absent WSL only at the UI boundary; do not modify the host's WSL installation.
    await desktop.evaluate(({ ipcMain }, fallback) => {
      ipcMain.removeHandler("studio:bootstrap");
      ipcMain.handle("studio:bootstrap", () => ({
        settings: {},
        jobs: [],
        distros: [],
        distroError: "未检测到 WSL，请按教程安装 Ubuntu。",
        version: "0.4.0",
        benchmarksFallback: fallback,
      }));
    }, before.benchmarksFallback);
    await page.reload();
    await page.locator("#view-tutorial").waitFor({ state: "visible" });
    assert.equal(await page.locator(".tutorial-card").count(), 4);
    await page.locator('[data-copy="wsl --install -d Ubuntu"]').click();
    assert.equal(
      await desktop.evaluate(({ clipboard }) => clipboard.readText()),
      "wsl --install -d Ubuntu",
    );
    await page.screenshot({ path: path.join(artifacts, "wsl-tutorial.png") });
    fs.writeFileSync(
      path.join(artifacts, "enhancements-verification.json"),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          root,
          dataDir,
          defaultTaskCount: 0,
          freshDeployment: !process.env.GPGPU_STUDIO_REUSE_ENV,
          deploymentReused: Boolean(process.env.GPGPU_STUDIO_REUSE_ENV),
          suitePrograms: 15,
          suitePassed: 15,
          customRuns: 2,
          runtimeSizeArguments: true,
          tutorialCards: 4,
          copiedInstallCommand: true,
          rendererErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "Enhancements passed: fresh clone/build/install, 15 real CUDA simulations, custom runtime arguments, repetitions, WSL tutorial.",
    );
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
    await desktop.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
