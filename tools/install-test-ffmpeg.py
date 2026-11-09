"""Download the test-only FFmpeg binary; never included in the webOS package."""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

base = Path(__file__).resolve().parent / "ffmpeg-runtime"
base.mkdir(parents=True, exist_ok=True)
if (base / "ffmpeg.exe").exists():
    print("Test FFmpeg is already present")
    raise SystemExit(0)
with urllib.request.urlopen("https://pypi.org/pypi/imageio-ffmpeg/json", timeout=20) as response:
    metadata = json.load(response)
asset = next(item for item in metadata["urls"] if item["filename"].endswith("win_amd64.whl"))
parts = []
received = 0
reported = -1
with urllib.request.urlopen(asset["url"], timeout=60) as response:
    while True:
        part = response.read(512 * 1024)
        if not part:
            break
        parts.append(part)
        received += len(part)
        percent = min(100, received * 100 // asset["size"])
        if percent // 25 != reported:
            print(f"Download: {percent}%", flush=True)
            reported = percent // 25
blob = b"".join(parts)
digest = hashlib.sha256(blob).hexdigest()
if digest != asset["digests"]["sha256"]:
    raise RuntimeError("Downloaded file failed SHA-256 verification")
with zipfile.ZipFile(io.BytesIO(blob)) as archive:
    filename = next(name for name in archive.namelist() if "/binaries/" in name and name.endswith(".exe"))
    (base / "ffmpeg.exe").write_bytes(archive.read(filename))
(base / "provenance.json").write_text(json.dumps({"package": "imageio-ffmpeg", "version": metadata["info"]["version"], "url": asset["url"], "sha256": digest}, indent=2), encoding="utf-8")
print("Test FFmpeg installed and verified")
