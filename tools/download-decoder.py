"""Install the project's source-built decoder from a checksum-pinned release."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', type=Path, help='Use a local, checksum-pinned release ZIP')
args = parser.parse_args()
lock = json.loads((root / 'decoder/artifacts.json').read_text())
if args.archive:
    data = args.archive.read_bytes()
else:
    with urllib.request.urlopen(lock['url'], timeout=30) as response:
        data = response.read(16 * 1024 * 1024 + 1)
if len(data) > 16 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != lock['sha256']:
    raise RuntimeError('Decoder archive checksum mismatch')
with zipfile.ZipFile(io.BytesIO(data)) as package:
    if len(package.namelist()) != len(lock['files']) or set(package.namelist()) != set(lock['files']):
        raise RuntimeError('Unexpected decoder archive members')
    verified = {}
    for name, expected in lock['files'].items():
        if '/' in name or '\\' in name or name in {'.', '..'}:
            raise RuntimeError('Unsafe decoder member name')
        if package.getinfo(name).file_size > 16 * 1024 * 1024:
            raise RuntimeError('Decoder member too large')
        value = package.read(name)
        if hashlib.sha256(value).hexdigest() != expected:
            raise RuntimeError('Decoder file checksum mismatch: ' + name)
        verified[name] = value
destination = root / 'app/vendor/decoder'
destination.mkdir(parents=True, exist_ok=True)
for name, value in verified.items():
    (destination / name).write_bytes(value)
print('Installed source-built FFmpeg decoder ' + lock['version'] + '; archive and file checksums verified')
