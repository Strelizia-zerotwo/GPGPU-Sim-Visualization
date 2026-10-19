const {_electron:electron,chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
(async()=>{
 const version=require('../package.json').version,root=path.resolve('artifacts'),dataDir=path.join(root,`studio-data-${Date.now()}`);
 const seedReport=JSON.parse(fs.readFileSync('artifacts/workspace-verification-source.json','utf8'));
 const seed=JSON.parse(fs.readFileSync(path.join(seedReport.dataDir,'state.json'),'utf8'));
 fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(path.join(dataDir,'state.json'),JSON.stringify(seed));
 const env={...process.env,GPGPU_STUDIO_DATA_DIR:dataDir};delete env.ELECTRON_RUN_AS_NODE;
 const portable=process.argv.includes('--portable'),packaged=process.argv.includes('--packaged'),mode=portable?'portable':packaged?'packaged':'source';
 let app,browser,launcher,page;const errors=[];
 try{
  if(portable){
   const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
   launcher=spawn(path.resolve(process.env.STUDIO_RELEASE_DIR || `release/${version}`,`GPGPU-Studio-${version}-Windows-x64.exe`),[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env,stdio:'ignore',windowsHide:true});
   const deadline=Date.now()+60000;
   while(true){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}if(Date.now()>deadline||launcher.exitCode!==null)throw Error('portable startup failed');await new Promise(r=>setTimeout(r,250));}
   browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);page=browser.contexts()[0].pages()[0];
  }else{app=await electron.launch(packaged?{executablePath:path.resolve(`release/${version}/win-unpacked/GPGPU Studio.exe`),args:[],env}:{args:['.'],env});page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));}
  page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.info?.ready,null,{timeout:90000});
  async function capture(name){await page.evaluate(()=>document.querySelector('#toast').hidden=true);await page.screenshot({path:path.join(root,`studio-${name}-${mode}.png`),animations:'disabled'});}
  const layout=await page.evaluate(()=>{
   const viewport=document.querySelector('#canvas-viewport').getBoundingClientRect(),panel=document.querySelector('.floating-run-panel').getBoundingClientRect(),bar=document.querySelector('.titlebar').getBoundingClientRect(),tools=document.querySelector('.workspace-toolbar').getBoundingClientRect();
   return {canvasFraction:viewport.height/innerHeight,canvasWidth:viewport.width,titlebarHeight:bar.height,toolbarTop:tools.top,floating:{right:viewport.right-panel.right,bottom:viewport.bottom-panel.bottom,width:panel.width,height:panel.height},titleVisible:document.querySelector('#page-title').getBoundingClientRect().height>0,overlay:navigator.windowControlsOverlay?.visible,background:getComputedStyle(document.querySelector('.titlebar')).backgroundColor,sidebar:getComputedStyle(document.querySelector('.sidebar')).backgroundColor};
  });
  assert.ok(layout.canvasFraction>.78,JSON.stringify(layout));assert.equal(layout.titleVisible,false);assert.equal(layout.titlebarHeight,32);assert.ok(layout.toolbarTop<=34);assert.ok(layout.floating.right>=10&&layout.floating.bottom>=10);assert.ok(layout.floating.width<=280&&layout.floating.height<190);
  await capture('empty');
  async function drag(x,y,dx,dy){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
  const box=await page.locator('#canvas-viewport').boundingBox();
  let before=await page.evaluate(()=>({...state.canvas.viewport}));await drag(box.x+30,box.y+35,75,55);let after=await page.evaluate(()=>({...state.canvas.viewport}));assert.equal(after.x-before.x,75);assert.equal(after.y-before.y,55);
  const zoom=await page.locator('#canvas-zoom-value').boundingBox();before=after;await drag(zoom.x+zoom.width/2,zoom.y+zoom.height/2,60,-40);after=await page.evaluate(()=>({...state.canvas.viewport}));assert.deepEqual(after,before,'zoom text must never initiate pan');assert.equal(await page.evaluate(()=>getSelection().toString()),'');
  assert.equal(await page.evaluate(()=>canvasPointer),null);
  // Recover from platform cancellation, lost capture, release outside the canvas, and focus loss.
  for(const reason of ['pointercancel','lostpointercapture','blur']){
   await page.mouse.move(box.x+35,box.y+40);await page.mouse.down();await page.mouse.move(box.x+70,box.y+65);
   await page.evaluate(reason=>{const view=document.querySelector('#canvas-viewport');if(reason==='blur')window.dispatchEvent(new Event('blur'));else if(reason==='lostpointercapture')view.releasePointerCapture(canvasPointer.pointerId);else view.dispatchEvent(new PointerEvent('pointercancel',{pointerId:canvasPointer.pointerId,bubbles:true}));},reason);
   if(reason==='lostpointercapture')await page.mouse.move(box.x+72,box.y+67);
   await page.waitForFunction(()=>canvasPointer===null);await page.mouse.up();
   before=await page.evaluate(()=>({...state.canvas.viewport}));await page.mouse.move(box.x+120,box.y+100);after=await page.evaluate(()=>({...state.canvas.viewport}));assert.deepEqual(after,before,reason+' left stale drag');
  }
  await drag(box.x+30,box.y+35,100,-box.height-50);assert.equal(await page.evaluate(()=>canvasPointer),null);
  await page.locator('#canvas-fit').click();
  // Add nodes with the actual top controls; connecting ports still works after capture changes.
  await page.locator('#add-benchmark-node').click();await page.locator('[data-pick-benchmark="gemm"]').click();
  const p=await page.evaluate(()=>state.canvas.nodes.at(-1).id);
  await page.locator('#add-gpu-node').click();await page.locator('[data-pick-gpu="SM80_A100"]').click();
  const g=await page.evaluate(()=>state.canvas.nodes.at(-1).id);
  await page.evaluate(id=>canvasNode(id).settings.sizes='8',p);await page.locator('#canvas-fit').click();
  const interactions=await require('./canvas-interactions.cjs')(page,root,mode,p,g);
  const from=await page.locator(`[data-node-port="${p}"]`).boundingBox(),to=await page.locator(`[data-node-port="${g}"]`).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();
  assert.equal(await page.locator('.edge-control').count(),1);
  const nodeBefore=await page.evaluate(id=>({x:canvasNode(id).x,y:canvasNode(id).y}),p),header=await page.locator(`[data-node="${p}"] .canvas-node-header`).boundingBox();
  await drag(header.x+70,header.y+15,40,25);assert.ok(await page.evaluate(({id,x})=>canvasNode(id).x!==x,{id:p,x:nodeBefore.x}));assert.equal(await page.evaluate(()=>canvasPointer),null);
  await page.waitForFunction(()=>Date.now()>=canvasIgnoreClickUntil);
  await page.locator('#toggle-run-panel').click();assert.ok(await page.locator('#canvas-connection-list').isVisible());await capture('expanded');await page.locator('#toggle-run-panel').click();assert.ok(!await page.locator('#canvas-connection-list').isVisible());
  const initialJobs=await page.evaluate(()=>state.jobs.length);
  await page.locator('#launch').click();
  await page.waitForFunction(n=>state.jobs.length>n&&document.querySelectorAll('.workspace-task').length>0,initialJobs,{timeout:90000});
  const busyCanvas=await page.evaluate(()=>state.activeCanvasId);
  assert.ok(await page.locator(`[data-close-canvas="${busyCanvas}"]`).isDisabled());
  assert.match(await page.locator(`[data-close-canvas="${busyCanvas}"]`).getAttribute('title'),/正在提交或执行/);
  assert.equal(await page.evaluate(id=>closeCanvas(id),busyCanvas),false);
  assert.match(await page.locator('#summary-cuda').innerText(),/CUDA 12.8/);await capture('running');
  // Clicking a top task opens its real report. A context/dialog transition cannot retain a drag.
  await page.locator('.workspace-task').first().click();assert.ok(await page.locator('#job-dialog').isVisible());assert.equal(await page.evaluate(()=>canvasPointer),null);await page.locator('#close-job').click();
  await page.waitForFunction(n=>state.jobs.slice(n).every(j=>['completed','failed','limited','incorrect','incomplete','cancelled'].includes(j.status)),initialJobs,{timeout:180000});
  const job=await page.evaluate(n=>state.jobs[n],initialJobs);assert.equal(job.status,'completed',JSON.stringify(job));assert.equal(job.correctness,'passed');
  assert.equal(await page.locator('.workspace-task').count(),0);await capture('canvas');
  await page.locator('#toggle-run-panel').click();await page.reload();await page.waitForFunction(()=>typeof state!=='undefined'&&state.info?.ready,null,{timeout:90000});assert.equal(await page.locator('#toggle-run-panel').getAttribute('aria-expanded'),'true');await page.locator('#toggle-run-panel').click();
  if(app){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,760));await page.locator('#canvas-fit').click();await capture('small');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));}
  await page.locator('#canvas-details-button').click();assert.ok(await page.locator('#canvas-details').isVisible());await page.locator('#close-canvas-details').click();
  await page.locator('#canvas-settings-button').click();assert.ok(await page.locator('#canvas-settings').isVisible());await page.locator('#close-canvas-settings').click();
  await page.locator('#workspace-environment').click();assert.ok(await page.locator('#view-environment').isVisible());await capture('environment');
  await page.locator('[data-view="store"]').click();await page.locator('#store-suite').selectOption('PolyBench/GPU');await capture('store');
  await page.locator('[data-view="results"]').click();await capture('results');
  await page.locator('[data-view="workbench"]').click();await page.locator('#new-canvas').click();await page.locator('#new-canvas-name').fill('新实验');await page.locator('#new-canvas-form button[type="submit"]').click();assert.equal(await page.locator('.canvas-node').count(),0);await capture('blank');
  assert.deepEqual(errors,[]);
  const report={version,mode,dataDir,layout,interactions,busyCanvasProtected:true,rendererErrors:errors,panWithoutTextSelection:true,zoomTextExcluded:true,recoveredPointerCancellation:true,recoveredLostCapture:true,recoveredFocusLoss:true,releasedOutsideCanvas:true,realPortDrag:true,topTaskOpened:true,floatingRunPanel:true,panelPersistence:true,realCompletedJob:{id:job.id,status:job.status,cycles:job.metrics.cycles}};
  fs.writeFileSync(path.join(root,`studio-verification-${mode}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(e){if(page){await page.screenshot({path:path.join(root,`studio-error-${mode}.png`)});console.error((await page.locator('body').innerText()).slice(-4000));}throw e;}
 finally{if(app){await app.evaluate(({dialog})=>dialog.showMessageBox=async()=>({response:1}));await app.close();}else if(browser){await browser.close();if(launcher&&launcher.exitCode===null)launcher.kill();}}
})().catch(e=>{console.error(e);process.exitCode=1;});
