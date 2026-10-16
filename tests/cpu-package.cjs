const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const output = path.resolve('release/cpu-affinity');
const resources = path.join(output, 'win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const checked = [];
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes:true }).flatMap(entry => {
    const item = path.join(folder, entry.name); return entry.isDirectory() ? walk(item) : [item];
  });
}
// electron-builder removes development/build fields from package.json.
const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString());
const sourceManifest = JSON.parse(fs.readFileSync('package.json','utf8'));
for (const key of ['name', 'version', 'main']) assert.equal(manifest[key], sourceManifest[key]);
checked.push('package.json (runtime fields)');
for (const file of walk('desktop')) {
  assert.ok(fs.readFileSync(file).equals(asar.extractFile(archive, file)), file + ' differs from packaged code');
  checked.push(file);
}
for (const file of fs.readdirSync('backend').filter(name => /\.(py|json)$/.test(name))) {
  assert.ok(fs.readFileSync(path.join('backend',file)).equals(fs.readFileSync(path.join(resources,'backend',file))), file + ' differs from packaged backend');
  checked.push('backend/' + file);
}
const executable = path.join(output, 'GPGPU-Studio-0.5.1-Windows-x64.exe');
const report = { version:'0.5.1', executable, bytes:fs.statSync(executable).size,
  sha256:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'), checked };
fs.writeFileSync('artifacts/cpu-package-integrity.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
