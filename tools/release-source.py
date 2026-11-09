"""Create a source-only release from audited Git-tracked files."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(root / 'tools/check-publication.py')], cwd=root, check=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
destination = root / 'dist'
destination.mkdir(exist_ok=True)
archive = destination / f'lg-xmeye-viewer-{version}-source.zip'
names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split(chr(0))
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(filter(None, names)):
        bundle.write(root / name, 'lg-xmeye-viewer/' + name)
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(destination / f'SHA256SUMS-v{version}.txt').write_text(checksum + '  ' + archive.name + '\n', encoding='utf-8')
print(json.dumps({'source_archive': archive.name, 'files': len(list(filter(None, names))), 'bytes': archive.stat().st_size}))
