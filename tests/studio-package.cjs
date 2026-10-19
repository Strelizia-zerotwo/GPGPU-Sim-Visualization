const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const { execFileSync } = require('node:child_process');
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
const executable = path.join(output, 'win-unpacked', 'GPGPU Studio.exe');
const artifact = path.join(output, `GPGPU-Studio-${version}-Windows-x64.zip`);
const zipCheck = `import hashlib,json,sys,zipfile,pathlib
archive,root=sys.argv[1:]
with zipfile.ZipFile(archive) as package:
 assert package.testzip() is None, 'ZIP checksum failure'
 files=['resources/app.asar']+['resources/backend/'+p.name for p in pathlib.Path(root,'resources/backend').iterdir() if p.suffix in ('.py','.json')]
 for name in files:
  assert package.read(name)==pathlib.Path(root,name).read_bytes(), name+' differs in ZIP'
 assert 'GPGPU Studio.exe' in package.namelist()
 print(json.dumps({'zipCRCValid':True,'zipRuntimeFilesCompared':len(files)}))`;
const zip = JSON.parse(execFileSync('python', ['-c', zipCheck, artifact, path.join(output, 'win-unpacked')], { encoding: 'utf8' }));
const report = { version, artifact, executable, bytes: fs.statSync(artifact).size, ...zip,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex'), checked };
fs.writeFileSync('artifacts/studio-package-integrity.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
