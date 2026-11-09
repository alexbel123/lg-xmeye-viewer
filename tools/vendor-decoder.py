"""Restore the pinned, replaceable software decoder files from supplied source."""
import hashlib
from pathlib import Path
import tarfile
import urllib.request

root=Path(__file__).resolve().parents[1]
source=root/'tools/vendor-sources/jessibuca-4.0.0.tgz'
expected='d201aa5e064cbea1be4ba8da1b8fd5e9c2899cd1a20801ed29c30d97d7b691b4'
if not source.exists():
    with urllib.request.urlopen('https://registry.npmjs.org/jessibuca/-/jessibuca-4.0.0.tgz', timeout=30) as response:
        blob = response.read(16 * 1024 * 1024 + 1)
    if len(blob) > 16 * 1024 * 1024 or hashlib.sha256(blob).hexdigest() != expected:
        raise RuntimeError('Downloaded decoder package checksum mismatch')
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(blob)
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise RuntimeError('Decoder package checksum mismatch')
destination=root/'app/vendor/decoder'
destination.mkdir(parents=True,exist_ok=True)
with tarfile.open(source) as package:
    for name in ['videodec','videodec_simd']:
        prefix='package/packages/decoder/wasm/types/'+name
        loader=package.extractfile(prefix+'.js').read().decode().replace('export default Module;','self.createVideoDecoder = Module;')
        (destination/(name+'.js')).write_text(loader,encoding='utf-8')
        (destination/(name+'.wasm')).write_bytes(package.extractfile(prefix+'.wasm').read())
    (destination/'COPYING').write_bytes(package.extractfile('package/LICENSE').read())
print('Restored Jessibuca 4.0.0 video decoder; source archive checksum verified')
