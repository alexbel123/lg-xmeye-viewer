# Source-built video decoder

The scalar and SIMD WebAssembly decoders are built from **FFmpeg 8.1.3**, with
the project's small C adapter in `viewer_decoder.c`. No Jessibuca/libavc/libhevc
prebuilt libraries are used in version 0.3.3. Both variants decode H.264 and HEVC
Annex-B access units to 8-bit YUV420. Each worker owns its decoder and memory.

## Rebuild

Use Linux (Ubuntu 24.04+ recommended) with Python 3.12+, Git and build-essential.
On Windows, use an installed Ubuntu WSL distribution; the Python entry point
automatically invokes it. Set `VIEWER_WSL_DISTRO` for a different distro name.

```sh
python tools/build-decoder.py
npm run test:decoder
```

Source downloads are pinned by commit and SHA-256 in `dependencies.json`.
Emscripten 3.1.64 is installed into the build cache, without editing shell
profiles. The default Linux build cache is `/var/tmp/lg-xmeye-decoder-8.1.3-3.1.64`;
set `VIEWER_DECODER_CACHE` to use another parent directory. For a clean rebuild,
select a new empty cache parent. Downloaded source archives are stored in
`output/decoder-sources/`; a source release's bundled `third_party/` archives
are used before requesting the network. `--sdk-dir` may select an already
installed **Linux** Emscripten 3.1.64 SDK.

FFmpeg libavcodec/libavutil are compiled locally. GPL/nonfree/version3-only
optional FFmpeg code, network components, programs and external library
autodetection are disabled. HEVC's native WebAssembly SIMD routines are enabled
in the SIMD variant. The scalar variant disables SIMD. Emscripten's generated
runtime and standard-library code are checked against the supplied Emscripten
source snapshot before building. Compiler binaries are supplied by the pinned
official SDK; the compiler itself is not built from LLVM source by this script.

## Outputs and evidence

`app/vendor/decoder/` receives `videodec{,_simd}.{js,wasm}`, license notices and
`build-manifest.json`. The manifest records source pins, adapter/builder hashes,
verified runtime-source file count, compiler version, configure options and
artifact hashes. Do not modify generated files manually.

`test/decoder.test.cjs` checks scalar/SIMD H.264 and HEVC, delayed B-frame flush,
pixel hashes against native FFmpeg, four independent instances, invalid state
and codec reinitialization. Browser integration is tested separately with
synthetic recorders. The software decoder accepts only 8-bit YUV420 and a pixel
budget of 1920×1080; memory grows from 32 MiB up to a maximum 256 MiB per worker.
Actual TV performance requires separate hardware testing.

## Distribution

`python tools/package-decoder.py` creates a decoder ZIP and pins its archive/file
hashes in `artifacts.json`. `python tools/vendor-decoder.py` installs that bundle
from the project's GitHub release; `--archive FILE` verifies a local copy.
`python tools/release-source.py` packages the Git-tracked project plus complete
FFmpeg, Emscripten runtime/standard-library and SDK installer source archives.
Distribute that source ZIP alongside the IPK/decoder ZIP, retaining all notices.
See [licensing](../docs/LICENSING.md).
