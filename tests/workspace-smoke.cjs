const { _electron: electron, chromium } = require('playwright');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
(async () => {
  const version = require('../package.json').version, releaseDir = process.env.STUDIO_RELEASE_DIR || `release/${version}`;
  const root = path.resolve('artifacts'), stamp = Date.now(), dataDir = path.join(root, `workspace-data-${stamp}`);
  const runsRoot = execFileSync('wsl.exe', ['-d','only','--exec','wslpath','-u',path.join(root,`workspace-runs-${stamp}`)], { encoding:'utf8',windowsHide:true }).trim();
  fs.mkdirSync(dataDir,{recursive:true});
  const settings = { distro:'only',simRoot:'/home/only/projects/gpgpu-project/gpgpu-sim_distribution',appsRoot:'/home/only/projects/gpgpu-project/gpu-app-collection',cudaRoot:'/usr/local/cuda-12.8',runsRoot };
  fs.writeFileSync(path.join(dataDir,'state.json'),JSON.stringify({settings,jobs:[]}));
  const env = {...process.env,GPGPU_STUDIO_DATA_DIR:dataDir}; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.argv.includes('--packaged'), portable = process.argv.includes('--portable');
  let desktop, browser, launcher, page; const errors=[];
  const mode=portable?'portable':packaged?'packaged':'source';
  try {
    if(portable) {
      const server=net.createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port; await new Promise(r=>server.close(r));
      launcher=spawn(path.resolve(releaseDir, `GPGPU-Studio-${version}-Windows-x64.exe`),[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,stdio:'ignore',windowsHide:true});
      const deadline=Date.now()+60000;
      while(true) { try { if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; }catch{} if(Date.now()>deadline||launcher.exitCode!==null) throw Error('portable startup failed'); await new Promise(r=>setTimeout(r,250)); }
      browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`); page=browser.contexts()[0].pages()[0];
    }else {
      desktop=await electron.launch(packaged?{executablePath:path.resolve(releaseDir, 'win-unpacked/GPGPU Studio.exe'),args:[],env}:{args:['.'],env}); page=await desktop.firstWindow();
      await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000));
    }
    page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>typeof state !== 'undefined' && state.info?.ready,null,{timeout:90000});
    assert.equal(await page.locator('#version').innerText(),version);
    // Migrate the real legacy storage shape, including CPU settings and an existing graph.
    await page.evaluate(()=>{
      const b=addCanvasBenchmark('gemm'),g=addCanvasGpu('SM80_A100');b.settings.sizes='8';connectCanvasNodes(b.id,g.id);
      const saved=JSON.parse(localStorage.getItem('gpgpu-workbench-v4'));delete saved.canvases;delete saved.activeCanvasId;delete saved.canvas.id;delete saved.canvas.name;
      saved.bindCpu=true;saved.concurrency='2';localStorage.setItem('gpgpu-workbench-v4',JSON.stringify(saved));
    });
    await page.reload();await page.waitForFunction(()=>typeof state !== 'undefined' && state.info?.ready,null,{timeout:90000});
    assert.equal(await page.locator('.canvas-node').count(),2);assert.equal(await page.locator('[data-canvas-tab]').count(),1);assert.ok(await page.locator('#bind-cpu').isChecked());
    // Fan out: one program to two GPUs. Rename, retain independent repeat counts.
    const first=await page.evaluate(()=>{
      const b=state.canvas.nodes.find(n=>n.kind==='benchmark'),g=addCanvasGpu('SM80_A100');connectCanvasNodes(b.id,g.id);
      state.canvas.edges[0].repeats=2;state.canvas.edges[1].repeats=1;renderCanvas();persistWorkbench();return {canvas:state.canvas.id,benchmark:b.id,edges:state.canvas.edges.map(e=>e.id)};
    });
    await page.locator('#canvas-details-button').click();await page.locator('#canvas-name').fill('GEMM · GPU 对比');await page.locator('#canvas-details-form button[type="submit"]').click();
    await page.locator('#canvas-fit').click();
    assert.match(await page.locator(`[data-run-node="${first.benchmark}"]`).innerText(),/2\/2/);
    // Capture all specs in the main process and delay each response to force a real mid-submit canvas switch.
    if(desktop) await desktop.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('studio:submit');global.workspaceSubmissions=[];
      ipcMain.removeHandler('studio:submit');ipcMain.handle('studio:submit',async(event,spec)=>{global.workspaceSubmissions.push(JSON.parse(JSON.stringify(spec)));await new Promise(r=>setTimeout(r,250));return original(event,spec);});
    });
    await page.evaluate(id=>document.querySelector('#canvas-viewport').addEventListener('click',event=>{
      if(event.target.closest(`[data-run-node="${id}"]`)) createCanvas('提交过程中切换');
    },{once:true}),first.benchmark);
    await page.locator(`[data-run-node="${first.benchmark}"]`).click();
    assert.equal(await page.locator('.canvas-node').count(),0);
    assert.ok(await page.locator(`[data-canvas-tab="${first.canvas}"] .run-spinner`).isVisible());
    // Fan in on a different canvas: two new-suite programs to one GPU, plus an unrelated edge.
    const second=await page.evaluate(()=>{
      const p=addCanvasBenchmark('rodinia-3-1-pathfinder'),q=addCanvasBenchmark('rodinia-3-1-gaussian'),g=addCanvasGpu('SM80_A100');
      p.settings.sizes='8';q.settings.sizes='5';connectCanvasNodes(p.id,g.id);connectCanvasNodes(q.id,g.id);
      const unrelated=addCanvasBenchmark('gemm'),g2=addCanvasGpu('SM80_A100');unrelated.settings.sizes='8';connectCanvasNodes(unrelated.id,g2.id);
      renderCanvas();persistWorkbench();return {canvas:state.canvas.id,gpu:g.id,edges:state.canvas.edges.slice(0,2).map(e=>e.id),unrelated:state.canvas.edges.at(-1).id};
    });
    await page.locator('#canvas-fit').click();
    await page.locator(`[data-run-node="${second.gpu}"]`).click();
    // Duplicate invocation during submit must skip reserved connections.
    await page.evaluate(id=>runCanvasNode(id),second.gpu);
    await page.locator('#new-canvas').click();await page.locator('#new-canvas-name').fill('独立空画布');await page.locator('#new-canvas-form button[type="submit"]').click();const third=await page.evaluate(()=>state.canvas.id);
    await page.waitForFunction(()=>state.jobs.length===5&&state.jobs.every(j=>!['queued','preparing','compiling','running','cancelling'].includes(j.status)),null,{timeout:240000});
    const jobs=await page.evaluate(()=>state.jobs);
    assert.ok(jobs.every(j=>j.status==='completed'&&j.correctness==='passed'),JSON.stringify(jobs.map(j=>({benchmark:j.benchmark,status:j.status,error:j.error,workDir:j.workDir}))));
    assert.equal(jobs.filter(j=>j.canvasId===first.canvas).length,3);assert.equal(jobs.filter(j=>j.canvasId===second.canvas).length,2);assert.ok(!jobs.some(j=>j.canvasEdgeId===second.unrelated));
    const overlap=jobs.some(a=>jobs.some(b=>a.id!==b.id&&new Date(a.startedAt)<new Date(b.finishedAt)&&new Date(b.startedAt)<new Date(a.finishedAt)));
    assert.ok(overlap,'independent experiments must actually overlap');
    for(const job of jobs) assert.ok(job.metrics.cycles>0&&job.cpuAffinity?.enabled&&job.cpuAffinity?.verified);
    if(desktop) {
      const submitted=await desktop.evaluate(()=>global.workspaceSubmissions);assert.equal(submitted.length,4);
      assert.equal(submitted.filter(s=>s.canvas.canvasId===first.canvas).length,2);
    }
    await page.locator(`[data-canvas-tab="${first.canvas}"]`).click();assert.equal(await page.locator('.edge-control.completed').count(),2);
    await page.evaluate(()=>document.querySelector('#toast').hidden=true);await page.screenshot({path:path.join(root,`workspace-fanout-${mode}.png`)});
    await page.locator(`[data-canvas-tab="${second.canvas}"]`).click();assert.equal(await page.locator('.edge-control.completed').count(),2);assert.equal(await page.locator('.edge-control.idle').count(),1);
    await page.evaluate(()=>document.querySelector('#toast').hidden=true);await page.screenshot({path:path.join(root,`workspace-fanin-${mode}.png`)});
    // Editing one canvas and reloading must retain all graphs, results, viewports, and CPU policy.
    await page.reload();await page.waitForFunction(()=>typeof state !== 'undefined' && state.info?.ready,null,{timeout:90000});
    assert.equal(await page.locator('[data-canvas-tab]').count(),3);assert.equal(await page.evaluate(()=>state.activeCanvasId),second.canvas);assert.equal(await page.locator('.edge-control.completed').count(),2);
    if(desktop) {
      const target=path.join(root,`workspace-results-${mode}.csv`);
      await desktop.evaluate(({dialog},file)=>dialog.showSaveDialog=async()=>({canceled:false,filePath:file}),target);
      await page.evaluate(()=>window.studio.exportCSV());
      const csv=fs.readFileSync(target,'utf8');assert.ok(csv.includes('"canvas_id","canvas_name","canvas_edge_id"'));assert.ok(csv.includes(second.canvas));
    }
    const manifest=JSON.parse((await page.evaluate(id=>window.studio.read(id,'manifest.json'),jobs.find(j=>j.benchmark==='rodinia-3-1-pathfinder').id)).text);assert.equal(manifest.canvasId,second.canvas);assert.ok(manifest.adapterPatches.includes('rodinia-pathfinder:serial-cpu-reference'));
    await page.locator('[data-view="store"]').click();assert.match(await page.locator('#page-title').innerText(),/Benchmark/);
    assert.equal(await page.locator('.store-card').count(),156);
    await page.screenshot({path:path.join(root,`workspace-all-suites-${mode}.png`)});
    await page.locator('#store-suite').selectOption('Rodinia 3.1');assert.ok(await page.locator('.store-card').count()>20);
    await page.locator('#store-readiness').selectOption('available');assert.equal(await page.locator('.store-card').count(),2);
    await page.evaluate(()=>document.querySelector('#toast').hidden=true);await page.screenshot({path:path.join(root,`workspace-store-${mode}.png`)});
    await page.locator('#store-suite').selectOption('Parboil');await page.locator('#store-readiness').selectOption('');assert.equal(await page.locator('.store-card').count(),11);assert.equal(await page.locator('[data-use-benchmark]').count(),0);assert.match(await page.locator('.store-card').first().innerText(),/待运行适配/);
    await page.locator('#store-search').fill('bfs');assert.equal(await page.locator('.store-card').count(),1);
    await page.locator('[data-view="workbench"]').click();await page.locator(`[data-canvas-tab="${third}"]`).click();await page.locator('#canvas-details-button').click();await page.locator('#delete-canvas').click();assert.equal(await page.locator('[data-canvas-tab]').count(),2);
    if(desktop) await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,760));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
    await page.screenshot({path:path.join(root,`workspace-small-${mode}.png`)});assert.deepEqual(errors,[]);
    const appearance = await page.evaluate(() => ({ accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), sidebar: getComputedStyle(document.querySelector('.sidebar')).backgroundColor, icons: document.querySelectorAll('.nav-icon .studio-icon').length }));
    const report={version,mode,dataDir,runsRoot,appearance,rendererErrors:errors,legacyMigration:true,multipleCanvases:true,midSubmissionSwitch:true,nodeFanout:true,nodeFanin:true,duplicateSubmissionPrevented:true,unrelatedEdgeSkipped:true,realConcurrency:overlap,cpuBinding:true,catalogEntries:156,successfulJobs:jobs.map(j=>({id:j.id,canvasId:j.canvasId,benchmark:j.benchmark,status:j.status,cycles:j.metrics.cycles,affinity:j.cpuAffinity}))};
    fs.writeFileSync(path.join(root,`workspace-verification-${mode}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } catch(error) {if(page){await page.screenshot({path:path.join(root,`workspace-error-${mode}.png`)});console.error((await page.locator('body').innerText()).slice(-8000));}throw error;}
  finally {if(desktop){await desktop.evaluate(({dialog})=>dialog.showMessageBox=async()=>({response:1}));await desktop.close();}else if(browser){await browser.close(); if(launcher&&launcher.exitCode===null) launcher.kill();}}
})().catch(e=>{console.error(e);process.exitCode=1;});
