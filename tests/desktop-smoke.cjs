// Integration test against the actual Electron window and installed WSL simulator.
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const artifacts = path.resolve("artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  const dataDir = path.join(artifacts, `smoke-data-${Date.now()}`);
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const desktop = await electron.launch({ args: ["."], env });
  const errors = [];
  let succeeded = false;
  try {
    const page = await desktop.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error")
        console.error("Renderer:", message.text());
    });
    await page.screenshot({
      path: path.join(artifacts, "desktop-initial.png"),
    });
    try {
      await page.waitForFunction(
        () =>
          document.querySelector("#header-status")?.classList.contains("ready"),
        null,
        { timeout: 90000 },
      );
    } catch (error) {
      await page.screenshot({
        path: path.join(artifacts, "desktop-error.png"),
      });
      console.error(await page.locator("body").innerText());
      throw error;
    }
    await page.locator("#sizes").fill("8");
    await page.locator('[data-benchmark="mvt"]').check();
    await page.locator('[data-profile="SM86_RTX3070"]').check();
    await page.locator("#concurrency").fill("2");
    await page.locator('[data-edit="SM80_A100"]').click();
    await page.locator("#gpu-sms").fill("54");
    await page.locator("#save-config").click();
    assert.equal(await page.locator("#task-count").innerText(), "4");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(artifacts, "desktop-workbench.png"),
    });
    await page.locator("#launch").click();
    await page.waitForFunction(
      () => Number(document.querySelector("#stat-running")?.textContent) === 2,
      null,
      { timeout: 90000 },
    );
    await page.screenshot({
      path: path.join(artifacts, "desktop-parallel.png"),
    });
    await page.waitForFunction(
      () => document.querySelector("#stat-completed")?.textContent === "4",
      null,
      { timeout: 240000 },
    );
    assert.equal(await page.locator("#stat-attention").innerText(), "0");
    await page.screenshot({
      path: path.join(artifacts, "desktop-results.png"),
    });
    await page.locator(".job-name").first().click();
    await page.waitForFunction(() =>
      document.querySelector("#job-log")?.textContent.includes("Non-Matching"),
    );
    await page.screenshot({ path: path.join(artifacts, "desktop-log.png") });
    assert.equal(errors.length, 0, errors.join("\n"));
    const state = await page.evaluate(() => window.studio.bootstrap());
    assert.equal(state.jobs.length, 4);
    assert.ok(
      state.jobs.every(
        (j) =>
          j.status === "completed" &&
          j.correctness === "passed" &&
          j.metrics.cycles > 0,
      ),
    );
    const firstEnd = new Date(state.jobs[0].finishedAt).getTime();
    const secondStart = new Date(state.jobs[1].startedAt).getTime();
    assert.ok(
      secondStart < firstEnd,
      "two experiments must overlap in real time",
    );
    assert.ok(
      state.jobs
        .filter((j) => j.profileId === "SM80_A100")
        .every((j) => j.configText.includes("-gpgpu_n_clusters 54")),
    );
    fs.writeFileSync(
      path.join(artifacts, "verification.json"),
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          errors,
          jobs: state.jobs.map(
            ({
              id,
              benchmark,
              size,
              profileName,
              status,
              metrics,
              correctness,
              startedAt,
              finishedAt,
              workDir,
            }) => ({
              id,
              benchmark,
              size,
              profileName,
              status,
              metrics,
              correctness,
              startedAt,
              finishedAt,
              workDir,
            }),
          ),
        },
        null,
        2,
      ),
    );
    await page.locator("#close-job").click();
    await page.locator('[data-view="workbench"]').click();
    await page.locator('[data-benchmark="mvt"]').uncheck();
    await page.locator('[data-profile="SM86_RTX3070"]').uncheck();
    await page.locator("#sizes").fill("512");
    await page.locator("#launch").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#job-table tr .badge")?.textContent ===
        "运行中",
      null,
      { timeout: 60000 },
    );
    await page.locator("[data-cancel]").first().click();
    await page.waitForFunction(
      () =>
        document.querySelector("#job-table tr .badge")?.textContent ===
        "已取消",
      null,
      { timeout: 30000 },
    );
    const afterCancel = await page.evaluate(() => window.studio.bootstrap());
    assert.equal(afterCancel.jobs.at(-1).status, "cancelled");
    console.log(
      "Desktop integration passed: four real WSL simulations; two concurrent; custom config applied; all correctness checks passed; running job cancelled.",
    );
    succeeded = true;
  } finally {
    // Close stdin before closing Electron if a failed assertion leaves workers active.
    if (!succeeded)
      await desktop
        .evaluate(async ({ BrowserWindow }) => {
          const windows = BrowserWindow.getAllWindows();
          if (windows[0])
            await windows[0].webContents.executeJavaScript(
              "window.studio.bootstrap().then(s => Promise.all(s.jobs.map(j => window.studio.cancel(j.id))))",
            );
        })
        .catch(() => {});
    await desktop.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
