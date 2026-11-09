'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const hd = process.argv.includes('--hd');
const cli = process.env.WEBOS_CLI_DIR || (() => {
  try { return path.dirname(require.resolve('@webos-tools/cli/package.json')); }
  catch (_) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' });
    if (result.error || result.status !== 0) return '';
    return path.join(result.stdout.trim(), '@webos-tools/cli');
  }
})();
const packageFile = path.join(cli, 'package.json');
if (!cli || !fs.existsSync(packageFile)) throw new Error('Set WEBOS_CLI_DIR to the installed @webos-tools/cli directory');
for (const name of ['videodec.js', 'videodec.wasm', 'videodec_simd.js', 'videodec_simd.wasm']) {
  if (!fs.existsSync(path.join(root, 'app/vendor/decoder', name))) throw new Error('Run python tools/vendor-decoder.py before building');
}
const tools = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
const entry = path.resolve(cli, tools.bin['ares-package']);
fs.mkdirSync(path.join(root, 'service/lib'), { recursive: true });
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.copyFileSync(path.join(root, 'THIRD_PARTY_NOTICES.txt'), path.join(root, 'app/THIRD_PARTY_NOTICES.txt'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(root, 'app/LICENSE'));
for (const file of ['dvrip.cjs', 'media.cjs', 'manager.cjs', 'credentials.cjs']) fs.copyFileSync(path.join(root, 'src', file), path.join(root, 'service/lib', file));
let appDirectory = path.join(root, 'app');
const outputDirectory = hd ? path.join(root, 'output/package-hd') : path.join(root, 'dist');
if (hd) {
  fs.mkdirSync(path.join(root, 'output'), { recursive: true });
  appDirectory = fs.mkdtempSync(path.join(root, 'output/app-hd-'));
  fs.cpSync(path.join(root, 'app'), appDirectory, { recursive: true });
  const manifestPath = path.join(appDirectory, 'appinfo.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.resolution = '1280x720';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
fs.mkdirSync(outputDirectory, { recursive: true });
const result = spawnSync(process.execPath, [entry, appDirectory, path.join(root, 'service'), '-o', outputDirectory], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (hd && result.status === 0) {
  const { id, version } = JSON.parse(fs.readFileSync(path.join(appDirectory, 'appinfo.json'), 'utf8'));
  fs.copyFileSync(path.join(outputDirectory, `${id}_${version}_all.ipk`), path.join(root, 'dist', `${id}_${version}_1280x720.ipk`));
}
process.exitCode = result.status || 0;
