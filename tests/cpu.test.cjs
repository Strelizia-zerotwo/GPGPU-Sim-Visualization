const test = require('node:test');
const assert = require('node:assert/strict');
const { JobManager } = require('../desktop/runner.cjs');
const catalog = { benchmarks: [{ id: 'gemm', available: true }],
  profiles: [{ id: 'a100', name: 'A100', supported: true, text: 'config' }],
  cpu: { bindingSupported: true, availableCpuIds: [2, 6], allocationOrder: [6, 2] } };
const spec = { benchmarks: ['gemm'], profiles: ['a100'], sizes: [8], repeats: 3,
  maxConcurrent: 4, maxCycles: 0, wallMinutes: 1, bindCpu: true };

test('binding reserves distinct non-contiguous CPUs, queues overflow, and reuses released CPU', () => {
  const callbacks = new Map();
  const manager = new JobManager((job, event) => { callbacks.set(job.id, event); return { cancel() {} }; });
  manager.submit(spec, { distro: 'Linux' }, catalog);
  assert.deepEqual(manager.jobs.map(j => j.cpuId), [6, 2, null]);
  manager.cancel(manager.jobs[0].id);
  assert.equal(manager.jobs[2].status, 'queued', 'cancellation must retain reservation until exit');
  callbacks.get(manager.jobs[0].id)({ type: 'done', result: { status: 'cancelled' } });
  assert.equal(manager.jobs[2].cpuId, 6);
  assert.equal(manager.jobs[2].status, 'preparing');
  callbacks.get(manager.jobs[2].id)({ type: 'cpu-affinity', cpuAffinity: { verified: true, cpuId: 6 } });
  assert.equal(manager.jobs[2].cpuAffinity.verified, true);
});

test('reservations span batches, failures release them, and unbound jobs require no CPU assignment', () => {
  const callbacks = new Map();
  const manager = new JobManager((job, event) => { callbacks.set(job.id, event); return { cancel() {} }; });
  manager.submit({ ...spec, repeats: 2 }, { distro: 'Linux' }, catalog);
  const ids = manager.submit({ ...spec, repeats: 1 }, { distro: 'Linux' }, catalog);
  assert.equal(manager.jobs.at(-1).status, 'queued');
  callbacks.get(manager.jobs[0].id)({ type: 'error', message: 'failed' });
  assert.equal(manager.jobs.at(-1).id, ids[0]);
  assert.equal(manager.jobs.at(-1).cpuId, 6);
  manager.submit({ ...spec, bindCpu: false, repeats: 1 }, { distro: 'Linux' }, catalog);
  assert.equal(manager.jobs.at(-1).status, 'preparing');
  assert.equal(manager.jobs.at(-1).cpuId, null);
});

test('rejects unavailable binding rather than silently falling back to system scheduling', () => {
  const manager = new JobManager(() => ({ cancel() {} }));
  assert.throws(() => manager.submit(spec, {}, { ...catalog, cpu: null }), /CPU/);
  assert.throws(() => manager.submit({ ...spec, bindCpu: 'yes' }, {}, catalog), /CPU/);
  manager.submit({ ...spec, bindCpu: false }, {}, { ...catalog, cpu: null });
  assert.ok(manager.jobs.every(j => !j.bindCpu && j.cpuId === null));
});
