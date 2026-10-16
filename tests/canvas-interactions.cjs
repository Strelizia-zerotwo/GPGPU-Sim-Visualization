const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyCanvasInteractions(page, root, mode, benchmark, gpu) {
  const original = await page.evaluate(() => state.activeCanvasId);
  const viewport = await page.locator('#canvas-viewport').boundingBox();
  const blank = () => page.mouse.click(viewport.x + 25, viewport.y + 25);
  async function cancelled() {
    assert.deepEqual(await page.evaluate(() => ({ connecting: canvasConnecting, mode: canvasConnectMode, pointer: canvasPointer, edges: state.canvas.edges.length })), { connecting: null, mode: false, pointer: null, edges: 0 });
    assert.equal(await page.locator('#canvas-preview-line').getAttribute('d'), '');
    assert.equal(await page.locator('#canvas-connect').getAttribute('aria-pressed'), 'false');
  }
  for (const node of [benchmark, gpu]) {
    await page.locator(`[data-node-port="${node}"]`).click();
    assert.equal(await page.evaluate(() => canvasConnecting), node);
    await page.mouse.move(viewport.x + 25, viewport.y + 25);
    assert.ok(await page.locator('#canvas-preview-line').getAttribute('d'));
    await blank(); await cancelled();
  }
  await page.locator('#canvas-connect').click(); await blank(); await cancelled();
  await page.locator('#canvas-connect').click();
  await page.locator(`[data-edit-node="${benchmark}"]`).click();
  assert.equal(await page.evaluate(() => canvasConnecting), benchmark);
  await blank(); await cancelled();
  // A cancelled connection must restore ordinary node editing immediately.
  await page.locator(`[data-edit-node="${gpu}"]`).click();
  await page.locator('[data-gpu-group="memory"]').click();
  assert.match(await page.locator('#gpu-memory-capacity').innerText(), /GPU 主存.*容量/s);
  assert.match(await page.locator('#gpu-memory-capacity').innerText(), /尚未验证/);
  const memory = await page.evaluate(() => state.info.memoryCapacity);
  assert.equal(memory.runtimeVerified, false);
  assert.equal(memory.devicePropertiesBytes, 2147483648);
  assert.equal(memory.memGetInfoTotalBytes, 10000000000);
  assert.equal(await page.locator('#gpu-memory-capacity input').count(), 0);
  await page.locator('.gpu-editor-body').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: path.join(root, `studio-memory-${mode}.png`), animations: 'disabled' });
  await page.locator('#close-config').click();
  assert.ok(await page.locator(`[data-close-canvas="${original}"]`).isDisabled());

  await page.locator('#new-canvas').click();
  assert.equal(await page.evaluate(() => state.canvases.length), 1);
  assert.ok(await page.locator('#new-canvas-name').evaluate(el => el.selectionEnd === el.value.length && el.selectionStart === 0));
  assert.ok(await page.locator('#new-canvas-dialog').evaluate(el => {
    const dialog = el.getBoundingClientRect(), form = el.querySelector('form').getBoundingClientRect();
    return dialog.width < innerWidth * .6 && form.width / dialog.width > .9;
  }), 'naming dialog must fit its form without an empty side panel');
  await page.screenshot({ path: path.join(root, `studio-new-canvas-${mode}.png`), animations: 'disabled' });
  await page.locator('#cancel-new-canvas').click();
  assert.equal(await page.evaluate(() => state.canvases.length), 1);
  await page.locator('#new-canvas').click(); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => state.canvases.length), 1);
  async function namedCanvas(name) {
    await page.locator('#new-canvas').click();
    await page.locator('#new-canvas-name').fill('   ');
    await page.locator('#new-canvas-form button[type="submit"]').click();
    assert.ok(await page.locator('#new-canvas-dialog').isVisible());
    await page.locator('#new-canvas-name').fill(name); await page.keyboard.press('Enter');
    return page.evaluate(() => state.activeCanvasId);
  }
  const second = await namedCanvas('对比 <A100> & GEMM');
  assert.equal(await page.locator(`[data-canvas-tab="${second}"] span`).innerText(), '对比 <A100> & GEMM');
  assert.equal(await page.locator('.canvas-node').count(), 0);
  // Right-click an inactive tab and rename exactly that graph.
  await page.locator(`[data-canvas-tab="${original}"]`).click({ button: 'right' });
  assert.ok(await page.locator('#canvas-details').isVisible());
  assert.equal(await page.evaluate(() => state.activeCanvasId), original);
  await page.locator('#canvas-name').fill('GEMM · 主画布');
  await page.locator('#canvas-details-form button[type="submit"]').click();
  assert.equal(await page.locator('.canvas-node').count(), 2);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.info?.ready, null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => state.canvas.name), 'GEMM · 主画布');
  assert.equal(await page.evaluate(() => state.canvases.length), 2);
  assert.equal(await page.locator('.canvas-node').count(), 2);
  await page.screenshot({ path: path.join(root, `studio-tabs-${mode}.png`), animations: 'disabled' });
  await page.locator(`[data-close-canvas="${second}"]`).click();
  assert.equal(await page.evaluate(() => state.activeCanvasId), original);
  assert.equal(await page.evaluate(() => state.canvases.length), 1);
  const third = await namedCanvas('临时画布');
  await page.locator(`[data-close-canvas="${third}"]`).click();
  assert.equal(await page.evaluate(() => state.activeCanvasId), original);
  assert.equal(await page.locator('.canvas-node').count(), 2);
  assert.ok(await page.locator(`[data-close-canvas="${original}"]`).isDisabled());
  return { blankClickCancelsPortAndToolbar: true, normalEditingRestored: true, namedCreationAndCancel: true, rightClickInactiveTab: true, renamePersisted: true, closeInactiveAndActive: true, lastCanvasProtected: true, memorySource: memory };
};
