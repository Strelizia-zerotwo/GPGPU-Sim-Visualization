const test = require("node:test");
const assert = require("node:assert/strict");
const { JobManager } = require("../desktop/runner.cjs");

const catalog = {
  benchmarks: [{ id: "gemm", available: true }],
  profiles: [
    { id: "a100", name: "A100", supported: true, text: "test config" },
  ],
};
const spec = {
  benchmarks: ["gemm"],
  sizes: [8, 16, 32],
  profiles: ["a100"],
  maxConcurrent: 2,
  maxCycles: 0,
  wallMinutes: 1,
};

test("starts independent jobs concurrently, respects limit, and fills a free slot", () => {
  const callbacks = new Map();
  let peak = 0;
  const manager = new JobManager((job, event) => {
    callbacks.set(job.id, event);
    peak = Math.max(peak, callbacks.size);
    return { cancel() {} };
  });
  const ids = manager.submit(spec, { distro: "Ubuntu" }, catalog);
  assert.equal(callbacks.size, 2);
  assert.equal(manager.jobs.filter((j) => j.status === "queued").length, 1);
  const first = ids[0];
  const event = callbacks.get(first);
  callbacks.delete(first);
  event({ type: "done", result: { status: "completed" } });
  assert.equal(callbacks.size, 2);
  assert.equal(peak, 2);
  assert.equal(manager.jobs[2].status, "preparing");
  assert.notEqual(manager.jobs[0].id, manager.jobs[1].id);
});

test("cancels waiting tasks without launching them and forwards running cancellation", () => {
  let cancelled = 0;
  let launches = 0;
  const manager = new JobManager(() => {
    launches++;
    return {
      cancel() {
        cancelled++;
      },
    };
  });
  const ids = manager.submit({ ...spec, maxConcurrent: 1 }, {}, catalog);
  manager.cancel(ids[2]);
  manager.cancel(ids[0]);
  assert.equal(manager.jobs[2].status, "cancelled");
  assert.equal(manager.jobs[0].status, "cancelling");
  assert.equal(cancelled, 1);
  assert.equal(launches, 1);
});

test("restores interrupted tasks without silently starting them again", () => {
  const manager = new JobManager(
    () => assert.fail("must not relaunch"),
    [
      { id: "x", status: "running" },
      { id: "y", status: "completed" },
    ],
  );
  assert.equal(manager.jobs[0].status, "interrupted");
  assert.equal(manager.jobs[1].status, "completed");
});

test("captures the environment for each job and rejects invalid batches", () => {
  const environment = { cudaRoot: "/cuda-one" };
  const manager = new JobManager(() => ({ cancel() {} }));
  manager.submit(spec, environment, catalog);
  environment.cudaRoot = "/cuda-two";
  assert.equal(manager.jobs[0].environment.cudaRoot, "/cuda-one");
  assert.throws(
    () => manager.submit({ ...spec, sizes: [0] }, {}, catalog),
    /规模/,
  );
  assert.throws(
    () => manager.submit({ ...spec, maxConcurrent: 0 }, {}, catalog),
    /并发/,
  );
});

test("uses a single host clock for UI timestamps while retaining backend time", () => {
  let notify;
  const manager = new JobManager((_, callback) => {
    notify = callback;
    return { cancel() {} };
  });
  manager.submit({ ...spec, sizes: [8] }, {}, catalog);
  notify({
    type: "done",
    result: { status: "completed", finishedAt: "2099-01-01T00:00:00Z" },
  });
  assert.equal(manager.jobs[0].backendFinishedAt, "2099-01-01T00:00:00Z");
  assert.ok(new Date(manager.jobs[0].finishedAt).getTime() <= Date.now());
});

test("supports one experiment and independently adjustable repetition counts", () => {
  const manager = new JobManager(() => ({ cancel() {} }));
  let ids = manager.submit(
    { ...spec, sizes: [8], maxConcurrent: 1, repeats: 1 },
    {},
    catalog,
  );
  assert.equal(ids.length, 1);
  ids = manager.submit(
    { ...spec, sizes: [8], maxConcurrent: 1, repeats: 3 },
    {},
    catalog,
  );
  assert.equal(ids.length, 3);
  assert.deepEqual(
    manager.jobs.slice(-3).map((j) => j.repeatIndex),
    [1, 2, 3],
  );
  assert.ok(manager.jobs.slice(-3).every((j) => j.repeatCount === 3));
  assert.throws(
    () => manager.submit({ ...spec, repeats: 0 }, {}, catalog),
    /重复/,
  );
});
