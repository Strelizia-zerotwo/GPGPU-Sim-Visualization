const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const version = require('../package.json').version;
const output = path.resolve(process.env.STUDIO_RELEASE_DIR || `release/${version}`);
const resources = path.join(output, 'win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const checked = [];
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString());
for (const key of ['name', 'version', 'main']) assert.equal(manifest[key], require('../package.json')[key]);
for (const file of walk('desktop')) {
  assert.ok(fs.readFileSync(file).equals(asar.extractFile(archive, file)), `${file} differs from packaged source`);
  checked.push(file);
}
for (const file of fs.readdirSync('backend').filter(name => /\.(py|json)$/.test(name))) {
  assert.ok(fs.readFileSync(path.join('backend', file)).equals(fs.readFileSync(path.join(resources, 'backend', file))), `${file} differs from packaged backend`);
  checked.push('backend/' + file);
}
const executable = path.join(output, `GPGPU-Studio-${version}-Windows-x64.exe`);
const report = { version, executable, bytes: fs.statSync(executable).size,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'), checked };
fs.writeFileSync('artifacts/studio-package-integrity.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
