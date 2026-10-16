// Optional desktop integration against the local, already deployed WSL simulator.
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

(async () => {
  const root = path.resolve('artifacts'), stamp = Date.now();
  const dataDir = path.join(root, `profiler-data-${stamp}`);
  const seedPath = path.resolve(process.env.GPGPU_STUDIO_PROFILE_SEED || 'artifacts/canvas-data-1791828128146/state.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const archived = seed.jobs.find(j => j.status === 'completed' && j.benchmark === 'gemm');
  assert.ok(archived, 'An existing successful GEMM is needed to verify legacy report loading');
  const copy = { ...archived }; delete copy.profile;
  fs.mkdirSync(dataDir, { recursive: true });
  const runsRoot = execFileSync('wsl.exe', ['-d', seed.settings.distro, '--exec', 'wslpath', '-u', path.join(root, `profiler-runs-${stamp}`)], { encoding: 'utf8', windowsHide: true }).trim();
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({ settings: { ...seed.settings }, jobs: [copy] }));
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir }; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.argv.includes('--packaged');
  const desktop = await electron.launch(packaged ? { executablePath: path.resolve('release/profiler/win-unpacked/GPGPU Studio.exe'), args: [], env } : { args: ['.'], env });
  const errors = []; let page;
  try {
    page = await desktop.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector('#header-status').classList.contains('ready'), null, { timeout: 90000 });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1080));
    await page.locator('[data-view="results"]').click();
    await page.locator(`.job-name[data-job="${copy.id}"]`).click();
    await page.waitForFunction(() => document.querySelector('#profile-content').textContent.includes('L1 Data'), null, { timeout: 60000 });
    assert.ok((await page.locator('#profile-content').innerText()).includes('61.54%'));
    assert.ok((await page.locator('#profile-content').innerText()).includes('1,600'));
    assert.ok((await page.locator('#profile-content').innerText()).includes('DRAM 流量为 0'));
    assert.equal(await page.locator('.roof-point').count(), 0);
    const oldReport = await page.evaluate(id => window.studio.profile(id), copy.id);
    assert.equal(oldReport.kernels[0].fp32Flops, 1600);
    assert.equal(oldReport.kernels[0].dramBytes, 0);
    await page.screenshot({ path: path.join(root, 'profiler-legacy.png') });
    await page.locator('#show-artifacts').click(); assert.ok(await page.locator('#job-log').isVisible());
    await page.locator('#show-profile').click(); assert.ok(await page.locator('#profile-content').isVisible());
    await page.locator('#close-job').click();
    // Run a cold-cache GEMM and a two-kernel MVT in isolated output directories.
    // The memcpy flag is changed only for these validation experiment copies.
    await page.locator('[data-view="environment"]').click();
    await page.locator('#runs-root').fill(runsRoot); await page.locator('#inspect-env').click();
    await page.waitForFunction(() => !document.querySelector('#inspect-env').disabled && document.querySelector('#header-status').classList.contains('ready'));
    const ids = await page.evaluate(async () => {
      const info = state.info;
      const base = info.profiles.find(p => p.id === 'SM80_A100');
      const configText = base.text.replace(/^-gpgpu_perf_sim_memcpy\s+\S+/m, '-gpgpu_perf_sim_memcpy 0');
      return window.studio.submit({ benchmarkModules: [{ id: 'gemm', sizes: [16], parameters: {} }, { id: 'mvt', sizes: [8], parameters: {} }], gpuModules: [{ id: 'SM80_A100', name: 'A100 · cold-cache validation' }], drafts: { SM80_A100: configText }, repeats: 1, maxConcurrent: 1, maxCycles: 0, wallMinutes: 3 });
    });
    await page.waitForFunction(ids => ids.every(id => state.jobs.some(j => j.id === id && ['completed', 'failed', 'incorrect', 'incomplete', 'timed_out'].includes(j.status))), ids, { timeout: 240000 });
    const jobs = await page.evaluate(ids => state.jobs.filter(j => ids.includes(j.id)), ids);
    assert.ok(jobs.every(j => j.status === 'completed'), JSON.stringify(jobs.map(j => ({ status: j.status, error: j.error }))));
    const gemm = jobs.find(j => j.benchmark === 'gemm'), mvt = jobs.find(j => j.benchmark === 'mvt');
    const g = gemm.profile.kernels[0];
    assert.ok(g.fp32Flops > 0 && g.dramBytes > 0 && g.intensity > 0);
    assert.equal(mvt.profile.kernels.length, 2);
    assert.ok(mvt.profile.kernels.every(k => k.timeMs > 0));
    assert.equal(mvt.profile.kernels[1].caches.L1D.accesses, mvt.profile.kernels[1].raw.L1D_total_cache_accesses - mvt.profile.kernels[0].raw.L1D_total_cache_accesses);
    await page.locator('[data-view="results"]').click(); await page.locator(`.job-name[data-job="${gemm.id}"]`).click();
    assert.equal(await page.locator('.roof-point').count(), 1);
    await page.screenshot({ path: path.join(root, 'profiler-overview.png') });
    await page.locator('.roof-chart').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, 'profiler-roofline.png') });
    await page.locator('.profile-method').filter({ hasText: '上限设置与计算依据' }).locator('summary').click();
    await page.locator('#roof-peak').fill('-1'); await page.locator('#apply-roof').click();
    assert.ok((await page.locator('#roof-error').innerText()).includes('正数'));
    await page.locator('#roof-peak').fill('100'); await page.locator('#roof-bandwidth').fill('200'); await page.locator('#apply-roof').click();
    assert.equal(await page.locator('.profile-tag').innerText(), '手动上限');
    await page.locator('.profile-method').filter({ hasText: '上限设置与计算依据' }).locator('summary').click();
    await page.locator('#reset-roof').click(); assert.equal(await page.locator('.profile-tag').innerText(), '配置理想上限');
    await page.locator('#close-job').click(); await page.locator(`.job-name[data-job="${mvt.id}"]`).click();
    assert.equal(await page.locator('#profile-kernel option').count(), 2);
    const options = await page.locator('#profile-kernel option').evaluateAll(xs => xs.map(x => x.value));
    await page.locator('#profile-kernel').selectOption(options[1]);
    assert.ok((await page.locator('.profile-context').innerText()).includes('mvt_kernel2'));
    await page.locator('#refresh-profile').click();
    await page.waitForFunction(() => !document.querySelector('#refresh-profile').disabled);
    assert.equal(await page.locator('#profile-kernel').inputValue(), options[1]);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.screenshot({ path: path.join(root, 'profiler-small-window.png') });
    assert.ok(await page.evaluate(() => document.querySelector('#job-dialog').scrollWidth <= document.querySelector('#job-dialog').clientWidth + 1));
    assert.equal(errors.length, 0, errors.join('\n'));
    const verification = { packaged, version: '0.5.0', dataDir, runsRoot, legacyReport: { id: copy.id, flops: 1600, dramBytes: 0 }, successfulJobs: jobs.map(j => ({ id: j.id, benchmark: j.benchmark, status: j.status, kernels: j.profile.kernels.map(k => ({ id: k.id, cycles: k.cycles, fp32Flops: k.fp32Flops, dramBytes: k.dramBytes, intensity: k.intensity })) })), rendererErrors: errors, multipleKernels: true, rooflinePoint: true, invalidCeilingRejected: true, minimumWindowFits: true };
    fs.writeFileSync(path.join(root, packaged ? 'profiler-package-verification.json' : 'profiler-verification.json'), JSON.stringify(verification, null, 2));
    console.log(JSON.stringify(verification, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(root, 'profiler-error.png') });
    throw error;
  } finally {
    await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
    await desktop.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
