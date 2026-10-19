const { _electron: electron } = require('playwright');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
(async () => {
  const stamp = Date.now(), root = path.resolve(`artifacts/storage-check-${stamp}`);
  const oldProfile = path.join(os.tmpdir(), `gpgpu-storage-smoke-${stamp}`), newProfile = path.join(root, '数据与缓存 with spaces');
  const runs = path.join(root, '实验输出'), pointer = path.join(root, 'storage-location.json');
  fs.mkdirSync(oldProfile); fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(runs);
  const seedReport = JSON.parse(fs.readFileSync('artifacts/workspace-verification-source.json', 'utf8'));
  const seed = JSON.parse(fs.readFileSync(path.join(seedReport.dataDir, 'state.json'), 'utf8'));
  fs.writeFileSync(path.join(oldProfile, 'state.json'), JSON.stringify(seed));
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: oldProfile, GPGPU_STUDIO_STORAGE_CONFIG: pointer };
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.argv.includes('--packaged'), mode = packaged ? 'packaged' : 'source';
  const version = require('../package.json').version;
  let app, page; const errors = [];
  async function launch() {
    app = await electron.launch(packaged ? { executablePath: path.resolve(`release/${version}/win-unpacked/GPGPU Studio.exe`), args: [], env } : { args: ['.'], env });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
    await page.waitForFunction(() => typeof state !== 'undefined' && state.info?.ready, null, { timeout: 90000 });
  }
  async function selectFolder(directory, cancel = false) {
    await app.evaluate(({ dialog }, value) => { dialog.showOpenDialog = async () => ({ canceled: value.cancel, filePaths: value.cancel ? [] : [value.directory] }); }, { directory, cancel });
  }
  async function capture(name) {
    await page.evaluate(() => document.querySelector('#toast').hidden = true);
    await page.screenshot({ path: path.join(root, `${name}.png`), animations: 'disabled' });
  }
  async function runAndWait(initialCount) {
    await page.locator('#launch').click();
    await page.waitForFunction(n => state.jobs.length > n, initialCount, { timeout: 90000 });
  }
  try {
    await launch();
    const graph = await page.evaluate(() => {
      state.canvas.name = '存储迁移实验';
      const benchmark = addCanvasBenchmark('gemm'), gpu = addCanvasGpu('SM80_A100');
      benchmark.settings.sizes = '8'; connectCanvasNodes(benchmark.id, gpu.id); persistWorkbench();
      return { id: state.canvas.id, nodes: state.canvas.nodes.map(node => node.id), edge: state.canvas.edges[0].id };
    });
    await page.locator('[data-view="environment"]').click();
    assert.equal(await page.locator('#storage-current').innerText(), oldProfile);
    await selectFolder(newProfile, true); await page.locator('#choose-storage').click();
    assert.equal(await page.locator('#storage-target').inputValue(), '');
    const occupied = path.join(root, 'occupied'); fs.mkdirSync(occupied); fs.writeFileSync(path.join(occupied, 'keep.txt'), 'keep');
    await selectFolder(occupied); await page.locator('#choose-storage').click(); await page.locator('#move-storage').click();
    await page.waitForFunction(() => document.querySelector('#storage-status').textContent.includes('空文件夹'));
    assert.ok(fs.existsSync(path.join(oldProfile, 'state.json'))); assert.ok(!fs.existsSync(pointer));
    const invalidRuns = path.join(root, 'contains spaces'); fs.mkdirSync(invalidRuns);
    const originalRuns = await page.locator('#runs-root').inputValue();
    await selectFolder(invalidRuns); await page.locator('[data-browse-environment="runsRoot"]').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('空格'));
    assert.equal(await page.locator('#runs-root').inputValue(), originalRuns);
    await page.locator('#runs-root').fill(originalRuns + ' with spaces');
    await page.locator('#inspect-env').click();
    await page.waitForFunction(() => !state.info?.ready && state.info?.issues.some(issue => issue.includes('空格')));
    await selectFolder(runs); await page.locator('[data-browse-environment="runsRoot"]').click();
    const linuxRuns = execFileSync('wsl.exe', ['-d', 'only', '--exec', 'wslpath', '-u', runs], { encoding: 'utf8', windowsHide: true }).trim();
    await page.waitForFunction(value => document.querySelector('#runs-root').value === value, linuxRuns);
    assert.equal(await page.locator('#runs-root').inputValue(), linuxRuns);
    await page.locator('#inspect-env').click(); await page.waitForFunction(p => state.settings.runsRoot === p && state.info?.ready, linuxRuns);
    for (const [kind, input, value] of [['appsRoot', '#apps-root', 'appsRoot'], ['simRoot', '#sim-root', 'simRoot']]) {
      const previous = await page.locator(input).inputValue();
      await selectFolder(runs); await page.locator(`[data-browse-environment="${kind}"]`).click();
      await page.waitForFunction(({ selector, value }) => document.querySelector(selector).value === value, { selector: input, value: linuxRuns });
      assert.equal(await page.locator(input).inputValue(), linuxRuns); await page.locator(input).fill(previous);
    }
    await selectFolder(newProfile); await page.locator('#choose-storage').click();
    await page.waitForFunction(value => document.querySelector('#storage-target').value === value, newProfile);
    await capture('before-migration');
    const initialJobs = await page.evaluate(() => state.jobs.length);
    await page.locator('[data-view="workbench"]').click(); await runAndWait(initialJobs);
    await page.locator('[data-view="environment"]').click(); await page.locator('#move-storage').click();
    await page.waitForFunction(() => document.querySelector('#storage-status').textContent.includes('请先结束'));
    assert.ok(!fs.existsSync(pointer), 'busy experiments must not schedule a migration');
    await page.waitForFunction(n => state.jobs.length > n && state.jobs.slice(n).every(job => ['completed', 'failed', 'limited', 'incorrect', 'cancelled', 'incomplete'].includes(job.status)), initialJobs, { timeout: 180000 });
    const first = await page.evaluate(n => state.jobs[n], initialJobs);
    assert.equal(first.status, 'completed', JSON.stringify(first));
    assert.equal(first.correctness, 'passed'); assert.ok(first.workDir.startsWith(linuxRuns + '/'));
    const manifest = JSON.parse((await page.evaluate(id => window.studio.read(id, 'manifest.json'), first.id)).text);
    assert.equal(manifest.temporaryDirectory, first.workDir + '/tmp');
    fs.mkdirSync(path.join(oldProfile, 'Cache'), { recursive: true });
    fs.writeFileSync(path.join(oldProfile, 'Cache', 'migration-sentinel.txt'), 'preserved cache');
    await app.evaluate(({ app }) => { global.storageRealQuit = app.quit.bind(app); global.storageRestarts = 0; app.relaunch = () => global.storageRestarts++; app.quit = () => {}; });
    await page.locator('#move-storage').click();
    assert.equal(await app.evaluate(() => global.storageRestarts), 1);
    assert.ok(JSON.parse(fs.readFileSync(pointer, 'utf8')).pending);
    await app.evaluate(({ app }) => app.quit = global.storageRealQuit); await app.close(); app = null;
    await launch();
    const paths = await app.evaluate(({ app }) => ({ data: app.getPath('userData'), session: app.getPath('sessionData'), temp: app.getPath('temp'), crash: app.getPath('crashDumps') }));
    assert.equal(paths.data, newProfile); assert.equal(paths.session, newProfile);
    assert.ok(paths.temp.startsWith(newProfile + path.sep)); assert.ok(paths.crash.startsWith(newProfile + path.sep));
    assert.ok(!fs.existsSync(oldProfile), 'verified old profile must be removed: ' + JSON.stringify(await page.evaluate(() => state.storage)));
    assert.equal(fs.readFileSync(path.join(newProfile, 'Cache', 'migration-sentinel.txt'), 'utf8'), 'preserved cache');
    const restored = await page.evaluate(() => ({ id: state.canvas.id, name: state.canvas.name, nodes: state.canvas.nodes.map(node => node.id), edge: state.canvas.edges[0].id, error: state.storage.error }));
    assert.deepEqual(restored, { ...graph, name: '存储迁移实验', error: '' });
    assert.equal(await page.evaluate(() => state.jobs.length), initialJobs + 1);
    assert.match((await page.evaluate(id => window.studio.read(id, 'result.json'), first.id)).text, /completed/);
    await page.locator('[data-view="environment"]').click(); assert.equal(await page.locator('#storage-current').innerText(), newProfile); await capture('after-migration');
    await page.locator('[data-view="workbench"]').click(); await runAndWait(initialJobs + 1);
    await page.waitForFunction(n => state.jobs.length > n && ['completed', 'failed', 'limited', 'incorrect', 'cancelled', 'incomplete'].includes(state.jobs.at(-1).status), initialJobs + 1, { timeout: 180000 });
    const second = await page.evaluate(() => state.jobs.at(-1)); assert.equal(second.status, 'completed', JSON.stringify(second)); assert.equal(second.correctness, 'passed');
    assert.ok(second.workDir.startsWith(linuxRuns + '/')); assert.deepEqual(errors, []);
    const report = { version, mode, root, oldProfile, newProfile, linuxRuns, paths, sourceRemoved: true, canvasAndCachePreserved: true, historyReadable: true, busyAndOverwriteProtected: true, folderPickers: true, rendererErrors: errors, jobs: [first, second].map(job => ({ id: job.id, status: job.status, correctness: job.correctness, workDir: job.workDir, cycles: job.metrics.cycles })) };
    fs.writeFileSync(`artifacts/storage-verification-${mode}.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } catch (error) { if (page && !page.isClosed()) { await page.screenshot({ path: path.join(root, 'error.png') }); console.error((await page.locator('body').innerText()).slice(-1800)); } throw error; }
  finally {
    if (app) { await app.evaluate(({ dialog }) => dialog.showMessageBox = async () => ({ response: 1 })); await app.close(); }
    if (fs.existsSync(oldProfile)) fs.rmSync(oldProfile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
