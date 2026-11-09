"""Package source-built decoder artifacts and pin their download checksums."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
directory = root / 'app/vendor/decoder'
provenance = json.loads((directory / 'build-manifest.json').read_text())
if provenance['adapter_sha256'] != hashlib.sha256((root / 'decoder/viewer_decoder.c').read_bytes()).hexdigest():
    raise RuntimeError('Rebuild decoder after changing its adapter')
names = ['videodec.js', 'videodec.wasm', 'videodec_simd.js', 'videodec_simd.wasm',
         'build-manifest.json', 'COPYING', 'COPYING.FFMPEG.LGPLv2.1', 'COPYING.EMSCRIPTEN', 'COPYING.MUSL']
destination = root / 'dist'
destination.mkdir(exist_ok=True)
archive = destination / f'lg-xmeye-decoder-{version}.zip'
files = {}
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as package:
    for name in names:
        data = (directory / name).read_bytes()
        files[name] = hashlib.sha256(data).hexdigest()
        info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        package.writestr(info, data)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
lock = {'version': version,
        'url': f'https://github.com/alexbel123/lg-xmeye-viewer/releases/download/v{version}/{archive.name}',
        'sha256': digest, 'files': files}
(root / 'decoder/artifacts.json').write_text(json.dumps(lock, indent=2) + '\n')
print(json.dumps({'archive': archive.name, 'bytes': archive.stat().st_size, 'sha256': digest}))
