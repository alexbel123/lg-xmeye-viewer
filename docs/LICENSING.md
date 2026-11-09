# Licensing and distribution scope

Project-authored source, including `decoder/viewer_decoder.c`, is licensed under
**GNU GPL version 3 only** (`GPL-3.0-only`); see [LICENSE](../LICENSE). Copyright
2026 LG XMEye Viewer contributors. Commercial use is allowed subject to the
license; recipients retain their GPL rights. Preserve third-party notices.

## Version 0.3.3 and later

The WebAssembly decoder is compiled from the pinned FFmpeg 8.1.3 sources and
our C adapter. The former Jessibuca runtime and its unidentified static
dependencies are no longer used. FFmpeg is configured with GPL, nonfree and
version3-only optional code disabled, without external library autodetection.
The used libavcodec/libavutil code is LGPL-2.1-or-later; see
[its license](../decoder/COPYING.FFMPEG.LGPLv2.1).

The Emscripten-generated runtime and toolchain standard libraries retain their
upstream licenses. Notices are supplied in `decoder/COPYING.EMSCRIPTEN` and
`decoder/COPYING.MUSL`, copied into the installed decoder bundle. Complete
Emscripten source, including runtime and standard-library sources, is bundled
with the release sources. Official compiler binaries are downloaded by the
pinned SDK; this project does not rebuild LLVM itself.

Each binary release is accompanied on the same GitHub release page by
`lg-xmeye-viewer-VERSION-source.zip`. It includes the project source, adapter,
build scripts, lockfiles, original unmodified FFmpeg/Emscripten source archives
and the SDK installer source. Bundled archives live under `third_party/` and
their hashes are recorded in `decoder/dependencies.json`. Build options and
artifact provenance are in `app/vendor/decoder/build-manifest.json`.

See [rebuild instructions](../decoder/README.md) and
[third-party notices](../THIRD_PARTY_NOTICES.txt). The source delivery resolves
the previously unverified decoder-source composition; codec patent rights and
LG store approval remain separate questions for distribution/monetization.

## Historical 0.3.2 release

Version 0.3.2 was source-only. Its optional upstream Jessibuca download contained
precompiled libraries whose complete corresponding source had not been
verified. No IPK/decoder binary was distributed in that historical release.

The project does not include the XMEye mobile application, proprietary cloud
SDK or vendor credentials. Protocol references are attributed in the notices.
The native FFmpeg executable is a development test dependency and is not
included in the TV application. Repository videos are generated test patterns;
prototype images are generated illustrations, not private CCTV footage.
