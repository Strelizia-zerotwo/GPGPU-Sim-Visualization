const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Gpu = require("../desktop/ui/gpu-model.js");
const { JobManager } = require("../desktop/runner.cjs");
const text = fs.readFileSync(path.join(__dirname, "fixtures/a100.config"), "utf8");
const catalog = {
  benchmarks: [
    { id: "gemm", name: "GEMM", kind: "builtin", available: true, parameters: [
      ...["NI", "NJ", "NK"].map(key => ({ key, min: 1, max: 4096, group: "dimensions" })),
      ...["DIM_THREAD_BLOCK_X", "DIM_THREAD_BLOCK_Y"].map((key, i) => ({ key, min: 1, max: 1024, group: "launch", default: i ? 8 : 32 })),
    ] },
    { id: "mvt", name: "MVT", kind: "builtin", available: true, parameters: [] },
  ],
  profiles: [{ id: "a100", name: "A100", supported: true, text }],
};
const spec = { benchmarkModules: [{ id: "gemm", sizes: [8], parameters: { NI: 7, NJ: 13, NK: 5 } }, { id: "mvt", sizes: [16, 32] }], gpuModules: [{ id: "a100" }], maxConcurrent: 2, wallMinutes: 1, maxCycles: 0 };

test("reads A100 cache geometry, adaptive budget, and total L2 without conflating them", () => {
  const v = Gpu.read(text), m = Gpu.metrics(v);
  assert.equal(v.sms, 108);
  assert.equal(m.l1KB, 32);
  assert.equal(v.unified, 192);
  assert.equal(v.sharedKB, 164);
  assert.equal(m.l2KB, 256);
  assert.equal(m.l2MB, 40);
  assert.deepEqual(Gpu.validate(v, text), []);
});
test("writes geometry, cluster count, clocks and shared-memory options consistently", () => {
  const v = { ...Gpu.read(text), sms: 54, l2Ways: 8, sharedKB: 96, coreClock: 1200 };
  const changed = Gpu.build(text, v);
  assert.equal(Gpu.get(changed, "-gpgpu_n_clusters"), "54");
  assert.equal(Gpu.metrics(Gpu.read(changed)).l2MB, 20);
  assert.equal(Gpu.get(changed, "-gpgpu_clock_domains"), "1200:1410:1410:1512");
  assert.equal(Gpu.get(changed, "-gpgpu_shmem_sizeDefault"), String(96 * 1024));
  assert.equal(Gpu.get(changed, "-gpgpu_shmem_option"), "0,8,16,32,64,96");
  assert.ok(changed.includes("L:B:m:L:X,A:192:4,32:0,32"));
});
test("blocks incomplete and incompatible architectures before scheduling", () => {
  assert.throws(() => Gpu.build(text, {}), /请填写/);
  assert.throws(() => Gpu.build(text, { ...Gpu.read(text), sms: 55, cores: 2 }), /整除/);
  assert.throws(() => Gpu.build(text, { ...Gpu.read(text), unified: 190 }), /整数倍/);
  assert.throws(() => Gpu.build(text, { ...Gpu.read(text), sharedKB: 100.5 }), /整数/);
  assert.throws(() => Gpu.build(text, { ...Gpu.read(text), l2Line: 64 }), /Sector/);
});
test("combines independent benchmark sizes with a separately named custom GPU", () => {
  const manager = new JobManager(() => ({ cancel() {} }));
  const values = { ...Gpu.read(text), sms: 54 };
  const ids = manager.submit({ ...spec, gpuModules: [{ id: "a100" }, { id: "custom-example", name: "My GPU", baseProfileId: "a100", values }] }, {}, catalog);
  assert.equal(ids.length, 6);
  const custom = manager.jobs.find(j => j.profileId === "custom-example");
  assert.equal(custom.baseProfileId, "a100");
  assert.equal(custom.profileName, "My GPU");
  assert.equal(Gpu.read(custom.configText).sms, 54);
  assert.deepEqual(custom.parameters, { NI: 7, NJ: 13, NK: 5 });
  values.sms = 12;
  assert.equal(Gpu.read(custom.configText).sms, 54);
  assert.deepEqual(manager.jobs.filter(j => j.benchmark === "mvt").map(j => j.size), [16, 16, 32, 32]);
});
test("rejects invalid kernel blocks and empty custom GPUs without creating jobs", () => {
  const manager = new JobManager(() => assert.fail("must not launch"));
  assert.throws(() => manager.submit({ ...spec, gpuModules: [{ id: "custom-empty", name: "Empty", baseProfileId: "a100", values: {} }] }, {}, catalog), /请填写/);
  assert.throws(() => manager.submit({ ...spec, benchmarkModules: [{ id: "gemm", sizes: [8], parameters: { DIM_THREAD_BLOCK_X: 64, DIM_THREAD_BLOCK_Y: 64 } }] }, {}, catalog), /1024/);
  assert.equal(manager.jobs.length, 0);
});
