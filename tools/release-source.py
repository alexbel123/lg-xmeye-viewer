"""Package project and complete pinned decoder sources alongside binaries."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / 'tools/check-publication.py')], cwd=root, check=True)
subprocess.run([sys.executable, str(root / 'tools/build-decoder.py'), '--fetch-only'], cwd=root, check=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
destination = root / 'dist'
destination.mkdir(exist_ok=True)
archive = destination / f'lg-xmeye-viewer-{version}-source.zip'
names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split(chr(0))
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(filter(None, names)):
        bundle.write(root / name, 'lg-xmeye-viewer/' + name)
    dependencies = json.loads((root / 'decoder/dependencies.json').read_text())
    for dependency in dependencies.values():
        source = root / 'output/decoder-sources' / dependency['archive']
        if hashlib.sha256(source.read_bytes()).hexdigest() != dependency['sha256']:
            raise RuntimeError('Dependency source checksum mismatch')
        bundle.write(source, 'lg-xmeye-viewer/third_party/' + source.name)
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
artifacts = [archive, destination / f'lg-xmeye-decoder-{version}.zip',
             destination / f'local.xmeye.viewer_{version}_all.ipk',
             destination / f'local.xmeye.viewer_{version}_1280x720.ipk']
checksums = ''.join(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n' for path in artifacts if path.exists())
(destination / f'SHA256SUMS-v{version}.txt').write_text(checksums, encoding='utf-8')
print(json.dumps({'source_archive': archive.name, 'files': len(list(filter(None, names))), 'bytes': archive.stat().st_size}))
