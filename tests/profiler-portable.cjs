const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve('artifacts');
  const previous = JSON.parse(fs.readFileSync(path.join(root, 'profiler-package-verification.json'), 'utf8'));
  const env = { ...process.env, GPGPU_STUDIO_DATA_DIR: previous.dataDir }; delete env.ELECTRON_RUN_AS_NODE;
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r));
  const launcher = spawn(path.resolve('release/profiler/GPGPU-Studio-0.5.0-Windows-x64.exe'), [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env, stdio: 'ignore', windowsHide: true });
  let browser;
  try {
    const deadline = Date.now() + 60000; let ready = false;
    while (Date.now() < deadline) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch {}
      if (ready) break;
      if (launcher.exitCode !== null) throw Error('Portable launcher exited: ' + launcher.exitCode);
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(ready, 'portable renderer did not start');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0], page = context.pages()[0] || await context.waitForEvent('page');
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector('#header-status')?.classList.contains('ready'), null, { timeout: 90000 });
    const initial = await page.evaluate(() => window.studio.bootstrap());
    assert.equal(initial.version, '0.5.0');
    const gemm = previous.successfulJobs.find(j => j.benchmark === 'gemm');
    await page.locator('[data-view="results"]').click(); await page.locator(`.job-name[data-job="${gemm.id}"]`).click();
    assert.equal(await page.locator('.roof-point').count(), 1);
    assert.ok((await page.locator('#profile-content').innerText()).includes('4.0833'));
    // Reparse the legacy experiment through the backend shipped inside the EXE.
    await page.locator('#close-job').click(); await page.locator(`.job-name[data-job="${previous.legacyReport.id}"]`).click();
    await page.waitForFunction(() => document.querySelector('#profile-content').textContent.includes('L1 Data'), null, { timeout: 60000 });
    assert.ok((await page.locator('#profile-content').innerText()).includes('1,600'));
    assert.equal(await page.locator('.roof-point').count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: path.join(root, 'profiler-portable-window.png') });
    const verification = { portable: true, version: initial.version, reportRestored: true, legacyBackendReparse: true, rendererErrors: errors };
    fs.writeFileSync(path.join(root, 'profiler-portable-verification.json'), JSON.stringify(verification, null, 2));
    console.log(JSON.stringify(verification));
    await page.evaluate(() => window.close());
  } finally {
    if (browser) await browser.close();
    if (launcher.exitCode === null) {
      await new Promise(r => { launcher.once('exit', r); setTimeout(r, 3000); });
      if (launcher.exitCode === null) execFileSync('taskkill', ['/PID', String(launcher.pid), '/T', '/F'], { stdio: 'ignore' });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
