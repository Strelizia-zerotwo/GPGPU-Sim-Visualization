const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const markerName = '.gpgpu-studio-data.json';
const transientLocks = new Set(['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']);
function atomicJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}
function canonical(location) {
  let existing = path.resolve(location), tail = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error('无法访问所选磁盘。');
    tail.unshift(path.basename(existing)); existing = parent;
  }
  const resolved = path.join(fs.realpathSync.native(existing), ...tail);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
function within(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function inventory(root) {
  const result = new Map();
  function walk(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (!prefix && transientLocks.has(entry.name)) continue;
      const relative = path.join(prefix, entry.name), file = path.join(root, relative);
      if (entry.isSymbolicLink()) result.set(relative, 'link:' + fs.readlinkSync(file));
      else if (entry.isDirectory()) { result.set(relative, 'directory'); walk(file, relative); }
      else if (entry.isFile()) {
        const hash = crypto.createHash('sha256'), descriptor = fs.openSync(file, 'r'), buffer = Buffer.allocUnsafe(1024 * 1024);
        try { let length; while ((length = fs.readSync(descriptor, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length)); }
        finally { fs.closeSync(descriptor); }
        result.set(relative, 'file:' + hash.digest('hex'));
      } else throw new Error('数据目录中有不支持的文件：' + relative);
    }
  }
  walk(root); return result;
}
class Storage {
  constructor({ defaultDir, overrideDir, configFile, beforeCleanup = () => {} }) {
    this.beforeCleanup = beforeCleanup;
    this.defaultDir = path.resolve(overrideDir || defaultDir);
    this.configFile = configFile || (overrideDir ? this.defaultDir + '.storage-location.json' : path.join(path.dirname(this.defaultDir), 'gpgpu-studio-storage.json'));
    this.config = fs.existsSync(this.configFile) ? JSON.parse(fs.readFileSync(this.configFile, 'utf8')) : {};
    this.dataDir = path.resolve(this.config.dataDir || this.defaultDir);
    this.error = '';
  }
  validateDestination(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('请选择完整的文件夹路径。');
    const source = canonical(this.dataDir), target = canonical(directory), config = canonical(this.configFile);
    if (within(source, target) || within(target, source)) throw new Error('新位置不能是当前数据目录、它的子目录或上级目录。');
    if (within(target, config)) throw new Error('请选择单独的数据文件夹。');
    if (fs.existsSync(directory) && (!fs.statSync(directory).isDirectory() || fs.readdirSync(directory).length)) throw new Error('请选择一个新的空文件夹，避免覆盖已有文件。');
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, '.gpgpu-write-test-' + crypto.randomUUID());
    fs.writeFileSync(probe, ''); fs.unlinkSync(probe);
    return path.resolve(directory);
  }
  initialize() {
    if (this.config.pending) this.completeMigration();
    fs.mkdirSync(this.dataDir, { recursive: true });
    const marker = path.join(this.dataDir, markerName);
    if (!fs.existsSync(marker)) atomicJSON(marker, { id: crypto.randomUUID(), application: 'gpgpu-studio' });
    return this.dataDir;
  }
  prepare(directory) {
    const target = this.validateDestination(directory);
    const marker = JSON.parse(fs.readFileSync(path.join(this.dataDir, markerName), 'utf8'));
    atomicJSON(this.configFile, { dataDir: this.dataDir, pending: { source: this.dataDir, target, id: marker.id } });
    return target;
  }
  completeMigration() {
    const pending = this.config.pending;
    let staging;
    try {
      if (canonical(pending.source) !== canonical(this.dataDir)) throw new Error('迁移来源与当前设置不一致。');
      const marker = JSON.parse(fs.readFileSync(path.join(this.dataDir, markerName), 'utf8'));
      if (marker.application !== 'gpgpu-studio' || marker.id !== pending.id) throw new Error('数据目录标识不一致，原数据已保留。');
      const target = this.validateDestination(pending.target);
      staging = path.join(path.dirname(target), '.gpgpu-storage-migration-' + crypto.randomUUID());
      fs.cpSync(this.dataDir, staging, { recursive: true, verbatimSymlinks: true, filter: file => path.dirname(file) !== this.dataDir || !transientLocks.has(path.basename(file)) });
      const original = inventory(this.dataDir), copied = inventory(staging);
      if (original.size !== copied.size || [...original].some(([file, hash]) => copied.get(file) !== hash)) throw new Error('迁移文件校验失败，原数据已保留。');
      fs.rmdirSync(target); fs.renameSync(staging, target); staging = null;
      atomicJSON(this.configFile, { dataDir: target });
      const previous = this.dataDir;
      this.dataDir = target; this.config = { dataDir: target };
      // The previous process has exited; only remove the verified, identified profile.
      this.beforeCleanup();
      try { fs.rmSync(previous, { recursive: true, maxRetries: 5, retryDelay: 100 }); }
      catch (error) { this.error = '新位置已启用，但旧目录未完全清理：' + previous + '。' + error.message; }
    } catch (error) {
      if (staging) fs.rmSync(staging, { recursive: true, force: true });
      this.error = '迁移未完成，继续使用原位置：' + error.message;
      atomicJSON(this.configFile, { dataDir: this.dataDir });
      this.config = { dataDir: this.dataDir };
    }
  }
}
module.exports = { Storage, canonical, inventory };
