"""Inspect generated IPKs and source ZIP without installing on a television."""
import io
import json
from pathlib import Path
import tarfile
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8-sig'))['version']
report = []
for suffix, resolution in [('all', '1920x1080'), ('1280x720', '1280x720')]:
    filename = root / 'dist' / f'local.xmeye.viewer_{version}_{suffix}.ipk'
    data = filename.read_bytes()
    assert data[:8] == b'!<arch>\n', 'Invalid IPK container'
    cursor = 8
    archive = None
    while cursor < len(data):
        header = data[cursor:cursor + 60]
        size = int(header[48:58])
        name = header[:16].decode('ascii').strip().rstrip('/')
        cursor += 60
        if name.startswith('data.tar'):
            archive = data[cursor:cursor + size]
        cursor += size + size % 2
    assert archive, 'Missing package data'
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:*') as package:
        names = package.getnames()
        assert not any(Path(name).suffix in {'.enc', '.key'} or '.secrets' in Path(name).parts or 'ffmpeg-runtime' in name for name in names), 'Private/test runtime data in package'
        def read_tail(tail):
            matches = [name for name in names if name.endswith(tail)]
            assert len(matches) == 1, tail
            return package.extractfile(matches[0]).read()
        manifest = json.loads(read_tail('local.xmeye.viewer/appinfo.json').decode('utf-8-sig'))
        assert manifest['version'] == version and manifest['resolution'] == resolution
        assert read_tail('local.xmeye.viewer.service/lib/credentials.cjs') == (root / 'src/credentials.cjs').read_bytes()
        assert read_tail('local.xmeye.viewer.service/lib/settings.cjs') == (root / 'src/settings.cjs').read_bytes()
        assert read_tail('local.xmeye.viewer/styles.css') == (root / 'app/styles.css').read_bytes()
        # ares-package minifies JavaScript. Execute that exact output in the browser QA.
        assert b'WorkspaceStore' in read_tail('local.xmeye.viewer/app.js')
        for script in ['workspace-store.js', 'workspace-icons.js', 'recorder-api.js', 'live-grid.js']:
            assert script.encode() in read_tail('local.xmeye.viewer/index.html')
            assert read_tail('local.xmeye.viewer/' + script)
        if suffix == 'all':
            extracted = root / 'output' / 'packaged-app'
            extracted.mkdir(parents=True, exist_ok=True)
            for asset in (root/'app').rglob('*'):
                if not asset.is_file():
                    continue
                name=asset.relative_to(root/'app')
                destination=extracted/name
                destination.parent.mkdir(parents=True,exist_ok=True)
                content=read_tail('local.xmeye.viewer/'+name.as_posix())
                if asset.suffix=='.wasm':
                    assert content==asset.read_bytes()
                destination.write_bytes(content)
    report.append({'file': filename.name, 'graphics': resolution, 'bytes': filename.stat().st_size, 'passed': True})
source = root / 'dist' / f'lg-xmeye-viewer-{version}-source.zip'
if source.exists():
    with zipfile.ZipFile(source) as package:
        assert package.testzip() is None
        assert not any(Path(name).suffix in {'.enc', '.key'} or {'output', 'dist', '.secrets', 'ffmpeg-runtime'}.intersection(Path(name).parts) for name in package.namelist())
        assert json.loads(package.read('lg-xmeye-viewer/package.json'))['version'] == version
        dependencies = json.loads(package.read('lg-xmeye-viewer/decoder/dependencies.json'))
        for dependency in dependencies.values():
            data = package.read('lg-xmeye-viewer/third_party/' + dependency['archive'])
            import hashlib
            assert hashlib.sha256(data).hexdigest() == dependency['sha256']
    report.append({'file': source.name, 'passed': True})
print(json.dumps(report))
