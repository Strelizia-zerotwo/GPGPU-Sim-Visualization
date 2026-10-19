const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Storage } = require('../desktop/storage.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gpgpu-storage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'old profile'), target = path.join(root, '新数据 profile');
  const configFile = path.join(root, 'location.json');
  const create = () => new Storage({ defaultDir: source, configFile });
  const storage = create(); storage.initialize();
  fs.mkdirSync(path.join(source, 'Local Storage', 'leveldb'), { recursive: true });
  fs.writeFileSync(path.join(source, 'state.json'), JSON.stringify({ settings: { runsRoot: '/mnt/e/runs' }, jobs: [{ id: 'completed-job' }] }));
  fs.writeFileSync(path.join(source, 'Local Storage', 'leveldb', '000001.log'), 'canvases, GPU drafts and viewport');
  fs.writeFileSync(path.join(source, 'SingletonLock'), 'old process lock');
  return { root, source, target, configFile, storage, create };
}

test('relocation occurs on the next startup and preserves profile data before cleaning the old location', t => {
  const f = fixture(t), original = fs.readFileSync(path.join(f.source, 'state.json'));
  f.storage.prepare(f.target);
  assert.deepEqual(fs.readFileSync(path.join(f.source, 'state.json')), original);
  assert.equal(fs.readdirSync(f.target).length, 0);
  const restarted = f.create(); restarted.initialize();
  assert.equal(restarted.dataDir, f.target);
  assert.equal(restarted.error, '');
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'state.json')), original);
  assert.equal(fs.readFileSync(path.join(f.target, 'Local Storage', 'leveldb', '000001.log'), 'utf8'), 'canvases, GPU drafts and viewport');
  assert.equal(fs.existsSync(f.source), false);
  assert.equal(fs.existsSync(path.join(f.target, 'SingletonLock')), false);
  assert.equal(f.create().initialize(), f.target);
});

test('rejects occupied folders, the current profile, and overlapping paths including junction aliases', t => {
  const f = fixture(t), occupied = path.join(f.root, 'occupied');
  fs.mkdirSync(occupied); fs.writeFileSync(path.join(occupied, 'important.txt'), 'keep');
  for (const directory of [occupied, f.source, f.root, path.join(f.source, 'nested'), 'relative']) assert.throws(() => f.storage.prepare(directory));
  const alias = path.join(f.root, 'alias'); fs.symlinkSync(f.source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => f.storage.prepare(path.join(alias, 'nested')));
  assert.equal(fs.readFileSync(path.join(occupied, 'important.txt'), 'utf8'), 'keep');
});

test('a copy failure or a folder populated after selection retains the original profile', t => {
  const f = fixture(t);
  f.storage.prepare(f.target);
  fs.writeFileSync(path.join(f.target, 'created-after-selection.txt'), 'keep');
  let restarted = f.create(); restarted.initialize();
  assert.equal(restarted.dataDir, f.source); assert.match(restarted.error, /迁移未完成/);
  assert.ok(fs.existsSync(path.join(f.source, 'state.json')));
  assert.equal(fs.readFileSync(path.join(f.target, 'created-after-selection.txt'), 'utf8'), 'keep');
  fs.unlinkSync(path.join(f.target, 'created-after-selection.txt'));
  f.storage.prepare(f.target);
  const copy = t.mock.method(fs, 'cpSync', () => { throw new Error('simulated disk full'); });
  restarted = f.create(); restarted.initialize(); copy.mock.restore();
  assert.equal(restarted.dataDir, f.source); assert.match(restarted.error, /simulated disk full/);
  assert.ok(fs.existsSync(path.join(f.source, 'state.json')));
  assert.ok(!fs.readdirSync(f.root).some(name => name.startsWith('.gpgpu-storage-migration-')));
});

test('does not activate or delete the source if copied content differs', t => {
  const f = fixture(t); f.storage.prepare(f.target);
  const realCopy = fs.cpSync;
  const copy = t.mock.method(fs, 'cpSync', (source, destination, options) => {
    realCopy(source, destination, options); fs.writeFileSync(path.join(destination, 'state.json'), 'corrupted');
  });
  const restarted = f.create(); restarted.initialize(); copy.mock.restore();
  assert.equal(restarted.dataDir, f.source); assert.match(restarted.error, /校验失败/);
  assert.match(fs.readFileSync(path.join(f.source, 'state.json'), 'utf8'), /completed-job/);
  assert.equal(fs.readdirSync(f.target).length, 0);
});
