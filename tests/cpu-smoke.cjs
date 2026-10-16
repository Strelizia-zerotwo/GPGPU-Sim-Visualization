// End-to-end validation against the existing WSL simulator, in isolated app/run directories.
const { _electron: electron, chromium } = require('playwright');
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve('artifacts'), stamp = Date.now();
  const portable = process.argv.includes('--portable');
  const dataDir = path.join(root, `cpu-data-${stamp}`);
  const seed = JSON.parse(fs.readFileSync('artifacts/profiler-data-1791902721850/state.json', 'utf8'));
  const legacy = seed.jobs.find(j => j.status === 'completed' && j.benchmark === 'gemm');
  const runsRoot = execFileSync('wsl.exe', ['-d', seed.settings.distro, '--exec', 'wslpath', '-u', path.join(root, `cpu-runs-${stamp}`)], { encoding: 'utf8', windowsHide: true }).trim();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({ settings: { ...seed.settings, runsRoot }, jobs: [legacy] }));
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: dataDir }; delete env.ELECTRON_RUN_AS_NODE;
  let desktop, browser, launcher, page;
  const errors = [], mode = portable ? 'portable' : 'source';
  try {
    if (portable) {
      const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
      const port = server.address().port; await new Promise(r => server.close(r));
      launcher = spawn(path.resolve('release/cpu-affinity/GPGPU-Studio-0.5.1-Windows-x64.exe'), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env, stdio: 'ignore', windowsHide: true });
      const deadline = Date.now() + 60000;
      while (true) {
        try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch {}
        if (Date.now() > deadline || launcher.exitCode !== null) throw Error('portable startup failed');
        await new Promise(r => setTimeout(r, 250));
      }
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      page = browser.contexts()[0].pages()[0];
    } else {
      desktop = await electron.launch({ args: ['.'], env });
      page = await desktop.firstWindow();
      await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1080));
    }
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector('#header-status')?.classList.contains('ready'), null, { timeout: 90000 });
    assert.equal(await page.locator('#version').innerText(), '0.5.1');
    const cpu = await page.evaluate(() => state.info.cpu);
    assert.ok(cpu.bindingSupported && cpu.logicalCount >= 2);
    await page.locator('#canvas-settings-button').click();
    assert.equal(await page.locator('#bind-cpu').isChecked(), false);
    await page.locator('#refresh-cpu').click();
    await page.waitForFunction(() => !document.querySelector('#refresh-cpu').disabled);
    await page.locator('#apply-cpu-recommendation').click();
    assert.equal(Number(await page.locator('#concurrency').inputValue()), cpu.recommendedConcurrency);
    await page.locator('#bind-cpu').check();
    await page.screenshot({ path: path.join(root, `cpu-settings-${mode}.png`) });
    await page.locator('#concurrency').fill('2');
    await page.locator('#save-canvas-settings').click();
    await page.reload();
    await page.waitForFunction(() => state.info?.ready, null, { timeout: 90000 });
    assert.equal(await page.locator('#bind-cpu').isChecked(), true);
    assert.equal(await page.locator('#concurrency').inputValue(), '2');
    const ids = await page.evaluate(async () => {
      const a = addCanvasBenchmark('gemm'), b = addCanvasGpu('SM80_A100');
      a.settings.sizes = '128'; connectCanvasNodes(a.id, b.id);
      const edge = state.canvas.edges.at(-1); edge.repeats = 2;
      const spec = edgeSpec(edge);
      if (!spec.bindCpu) throw Error('Canvas omitted CPU binding');
      const ids = await window.studio.submit({ ...spec, wallMinutes: 3 });
      edge.jobIds = ids; renderCanvas(); persistWorkbench(); return ids;
    });
    await page.waitForFunction(ids => ids.every(id => state.jobs.find(j => j.id === id)?.cpuAffinity?.verified), ids, { timeout: 90000 });
    const active = await page.evaluate(ids => state.jobs.filter(j => ids.includes(j.id)), ids);
    assert.equal(new Set(active.map(j => j.cpuId)).size, 2);
    const probe = `import json,sys,time;from pathlib import Path
items=json.loads(sys.argv[1]);proof=[]
for item in items:
 deadline=time.monotonic()+4
 while True:
  root=Path('/proc')/str(item['pid'])
  try:
   exe=root.joinpath('exe').resolve().name
   rows=[{'tid':int(p.name),'allowed':next(s.split(':',1)[1].strip() for s in (p/'status').read_text().splitlines() if s.startswith('Cpus_allowed_list:'))} for p in (root/'task').iterdir()]
   if exe=='benchmark' and len(rows)>=2: break
  except (OSError,StopIteration): pass
  if time.monotonic()>deadline: raise RuntimeError('could not inspect running simulator threads')
  time.sleep(.03)
 proof.append({'cpu':item['cpu'],'pid':item['pid'],'exe':exe,'threads':rows})
print(json.dumps(proof))`;
    const proofs = JSON.parse(execFileSync('wsl.exe', ['-d', seed.settings.distro, '--exec', 'python3', '-c', probe,
      JSON.stringify(active.map(j => ({ pid: j.cpuAffinity.processId, cpu: j.cpuId })))], { encoding: 'utf8', windowsHide: true }));
    assert.ok(proofs.every(p => p.threads.every(t => t.allowed === String(p.cpu))), JSON.stringify(proofs));
    await page.waitForFunction(ids => ids.every(id => ['completed','failed','incorrect','incomplete','timed_out'].includes(state.jobs.find(j => j.id === id)?.status)), ids, { timeout: 240000 });
    const completed = await page.evaluate(ids => state.jobs.filter(j => ids.includes(j.id)), ids);
    assert.ok(completed.every(j => j.status === 'completed' && j.correctness === 'passed'), JSON.stringify(completed.map(j => ({ status: j.status, error: j.error }))));
    assert.ok(completed.every(j => j.profile.kernels.length && j.manifest.cpuAffinity.enabled));
    for (const job of completed) {
      const manifest = JSON.parse((await page.evaluate(id => window.studio.read(id, 'manifest.json'), job.id)).text);
      assert.deepEqual(manifest.cpuAffinity.actualCpuIds, [job.cpuId]);
      assert.equal(manifest.cpuAffinity.verified, true);
    }
    await page.locator('[data-view="results"]').click();
    await page.locator(`.job-name[data-job="${completed[0].id}"]`).click();
    assert.ok((await page.locator('#job-detail-summary').innerText()).includes('绑定已核验'));
    assert.ok(await page.locator('#profile-content').isVisible());
    await page.screenshot({ path: path.join(root, `cpu-result-${mode}.png`) });
    await page.locator('#close-job').click();
    await page.locator(`.job-name[data-job="${legacy.id}"]`).click();
    await page.waitForFunction(() => document.querySelector('#profile-content').textContent.includes('L1 Data'));
    assert.ok((await page.locator('#job-detail-summary').innerText()).includes('系统调度'));
    await page.locator('#close-job').click(); await page.locator('[data-view="workbench"]').click();
    await page.locator('#canvas-settings-button').click(); await page.locator('#bind-cpu').uncheck();
    await page.locator('#save-canvas-settings').click();
    const unboundIds = await page.evaluate(() => {
      const spec = edgeSpec(state.canvas.edges.at(-1));
      return window.studio.submit({ ...spec, benchmarkModules: [{ id: 'gemm', sizes: [8] }], repeats: 1 });
    });
    await page.waitForFunction(ids => state.jobs.find(j => j.id === ids[0])?.status === 'completed', unboundIds, { timeout: 90000 });
    const unbound = await page.evaluate(ids => state.jobs.find(j => j.id === ids[0]), unboundIds);
    assert.equal(unbound.bindCpu, false); assert.equal(unbound.cpuId, null); assert.equal(unbound.cpuAffinity.enabled, false);
    const unboundLog = (await page.evaluate(id => window.studio.read(id, 'sim.log'), unbound.id)).text;
    assert.ok(!unboundLog.includes('GPGPU_STUDIO_AFFINITY='));
    await page.reload(); await page.waitForFunction(() => state.info?.ready, null, { timeout: 90000 });
    assert.equal(await page.locator('#bind-cpu').isChecked(), false);
    if (desktop) await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.locator('#canvas-settings-button').click();
    const fit = await page.locator('#canvas-settings').evaluate(el => { const r=el.getBoundingClientRect(); return r.top>=0 && r.bottom<=innerHeight && el.scrollWidth<=el.clientWidth; });
    assert.ok(fit, 'settings dialog must fit the small window');
    await page.screenshot({ path: path.join(root, `cpu-small-${mode}.png`) });
    assert.deepEqual(errors, []);
    const report = { version: '0.5.1', mode, dataDir, runsRoot, cpu, proofs, completed: completed.map(j => ({ id:j.id, status:j.status, cpuAffinity:j.cpuAffinity })), unbound: { id:unbound.id, status:unbound.status }, persistence:true, legacyReport:true, rendererErrors:errors };
    fs.writeFileSync(path.join(root, `cpu-${mode}-verification.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } catch (error) {
    if (page) await page.screenshot({ path:path.join(root, `cpu-${mode}-error.png`) }).catch(() => {});
    throw error;
  } finally {
    if (desktop) await desktop.close();
    if (browser) { await page.evaluate(() => window.close()).catch(() => {}); await browser.close(); }
    if (launcher && launcher.exitCode === null) {
      await new Promise(r => { launcher.once('exit', r); setTimeout(r, 3000); });
      if (launcher.exitCode === null) execFileSync('taskkill', ['/PID', String(launcher.pid), '/T', '/F'], { stdio:'ignore' });
    }
  }
})().catch(error => { console.error(error); process.exitCode=1; });
