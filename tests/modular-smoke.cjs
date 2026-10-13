// Real desktop + WSL execution. All new outputs live inside this workspace.
const { _electron: electron } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
(async () => {
  const root = path.resolve("artifacts");
  const stamp = Date.now(), dataDir = path.join(root, `modular-data-${stamp}`);
  const runsRoot = execFileSync("wsl.exe", ["-d", "only", "--exec", "wslpath", "-u", path.join(root, `modular-runs-${stamp}`)], { encoding: "utf8" }).trim();
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.argv.includes("--packaged");
  const desktop = await electron.launch(packaged ? { executablePath: path.resolve("release/win-unpacked/GPGPU Studio.exe"), args: [], env } : { args: ["."], env });
  const errors = [];
  let page;
  try {
    page = await desktop.firstWindow();
    page.on("pageerror", e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector("#header-status")?.classList.contains("ready"), null, { timeout: 90000 });
    await page.locator('[data-view="environment"]').click();
    await page.locator("#runs-root").fill(runsRoot);
    await page.locator("#inspect-env").click();
    await page.waitForFunction(() => !document.querySelector("#inspect-env").disabled && document.querySelector("#header-status").classList.contains("ready"), null, { timeout: 90000 });
    await page.locator('[data-view="workbench"]').click();
    const templateChecks = await page.evaluate(() => allGpuModules().filter(p => p.supported).map(p => ({ id: p.id, errors: gpuErrors(p) })));
    assert.ok(templateChecks.every(p => !p.errors.length), JSON.stringify(templateChecks));
    assert.equal(await page.locator("#task-count").innerText(), "1");
    await page.locator("#sizes").fill("8");
    await page.locator('[data-edit="SM80_A100"]').click();
    assert.equal(await page.locator("#gpu-sms").inputValue(), "108");
    await page.locator('[data-gpu-group="l1"]').click();
    assert.equal(await page.locator("#gpu-unified").inputValue(), "192");
    assert.ok((await page.locator("#gpu-metrics").innerText()).includes("40 MiB"));
    await page.locator('[data-gpu-group="compute"]').click();
    await page.screenshot({ path: path.join(root, "modular-a100.png") });
    await page.locator("#close-config").click();

    // Blank modules remain editable/savable but cannot silently start a run.
    await page.locator("#add-gpu").click();
    assert.equal(await page.locator("#gpu-sms").inputValue(), "");
    await page.screenshot({ path: path.join(root, "modular-custom-empty.png") });
    await page.locator("#gpu-template").selectOption("SM80_A100");
    assert.equal(await page.locator("#gpu-sms").inputValue(), "");
    await page.locator("#save-config").click();
    assert.ok(await page.locator("#launch").isDisabled());
    const customId = await page.locator('[data-profile^="custom-"]').getAttribute("data-profile");
    await page.locator(`[data-edit="${customId}"]`).click();
    await page.locator("#fill-gpu-template").click();
    await page.locator("#gpu-name").fill("A100 54 SM / 20 MiB L2");
    await page.locator("#gpu-sms").fill("54");
    await page.locator('[data-gpu-group="l2"]').click();
    await page.locator("#gpu-l2Ways").fill("8");
    assert.ok((await page.locator("#gpu-metrics").innerText()).includes("20 MiB"));
    await page.screenshot({ path: path.join(root, "modular-custom-filled.png") });
    await page.locator("#save-config").click();

    await page.locator('[data-edit-benchmark="gemm"]').click();
    await page.locator("#dimension-mode").selectOption("independent");
    for (const [key, value] of Object.entries({ NI: 7, NJ: 13, NK: 5, DIM_THREAD_BLOCK_X: 8, DIM_THREAD_BLOCK_Y: 4 })) await page.locator(`[data-benchmark-param="${key}"]`).fill(String(value));
    await page.screenshot({ path: path.join(root, "modular-gemm.png") });
    await page.locator("#save-benchmark").click();
    await page.locator('[data-benchmark="mvt"]').check();
    await page.locator('[data-edit-benchmark="mvt"]').click();
    await page.locator("#benchmark-sizes").fill("9");
    await page.locator("#save-benchmark").click();
    await page.locator("#concurrency").fill("2");
    assert.equal(await page.locator("#task-count").innerText(), "4");
    await page.evaluate(() => { document.querySelector("#toast").hidden = true; window.scrollTo(0, 0); });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(root, "modular-workbench.png"), fullPage: true });
    await page.locator("#launch").click();
    await page.waitForFunction(() => document.querySelector("#stat-completed").textContent === "4" || Number(document.querySelector("#stat-attention").textContent) > 0, null, { timeout: 240000 });
    const initial = await page.evaluate(() => window.studio.bootstrap());
    assert.ok(initial.jobs.length === 4 && initial.jobs.every(j => j.status === "completed" && j.correctness === "passed"), JSON.stringify(initial.jobs.map(j => ({ benchmark: j.benchmark, status: j.status, error: j.error }))));
    const proofs = [];
    for (const job of initial.jobs) {
      const manifest = JSON.parse((await page.evaluate(id => window.studio.read(id, "manifest.json"), job.id)).text);
      const config = (await page.evaluate(id => window.studio.read(id, "gpgpusim.config"), job.id)).text;
      if (job.benchmark === "gemm") assert.deepEqual(manifest.effectiveDimensions, { NI: 7, NJ: 13, NK: 5 });
      if (job.benchmark === "mvt") assert.equal(job.size, 9);
      if (job.profileId === customId) {
        assert.ok(config.includes("-gpgpu_n_clusters 54"));
        assert.ok(config.includes("-gpgpu_cache:dl2 S:128:128:8,"));
        assert.equal(manifest.baseProfileId, "SM80_A100");
      }
      proofs.push({ id: job.id, benchmark: job.benchmark, size: job.size, parameters: job.parameters, gpu: job.profileName, status: job.status, cycles: job.metrics.cycles, effectiveDimensions: manifest.effectiveDimensions });
    }
    assert.ok(new Date(initial.jobs[1].startedAt) < new Date(initial.jobs[0].finishedAt), "real concurrent jobs must overlap");
    const csv = path.join(root, "modular-results.csv");
    await desktop.evaluate(({ dialog }, output) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: output }); }, csv);
    await page.locator("#export-csv").click();
    await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("结果已导出"));
    assert.ok(fs.readFileSync(csv, "utf8").includes("DIM_THREAD_BLOCK_X"));
    await page.evaluate(() => document.querySelector("#toast").hidden = true);
    await page.screenshot({ path: path.join(root, "modular-results.png") });
    await page.locator('[data-view="workbench"]').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#header-status").classList.contains("ready"), null, { timeout: 90000 });
    assert.equal(await page.locator("#task-count").innerText(), "4");
    assert.ok((await page.locator("#summary-size").innerText()).includes("NI=7"));
    assert.equal(await page.locator('[data-profile^="custom-"]').count(), 1);
    assert.equal(errors.length, 0, errors.join("\n"));
    fs.writeFileSync(path.join(root, packaged ? "modular-package-verification.json" : "modular-verification.json"), JSON.stringify({ version: initial.version, packaged, dataDir, runsRoot, rendererErrors: errors, templateChecks, jobs: proofs, persistence: true, concurrency: true }, null, 2));
    console.log(JSON.stringify({ version: initial.version, packaged, verifiedJobs: proofs, rendererErrors: errors }));
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(root, "modular-error.png") }); console.error(await page.locator("body").innerText()); }
    throw error;
  } finally {
    await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
    await desktop.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
