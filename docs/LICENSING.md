# Licensing and distribution scope

Project-authored source is licensed under **GNU GPL version 3 only** (`GPL-3.0-only`); see [LICENSE](../LICENSE). Copyright 2026 LG XMEye Viewer contributors. You may use, modify and sell the covered software while complying with the GPL. Recipients retain the rights granted by that license. Third-party notices and licenses must be preserved.

## Initial public release: source only

The repository and source release do not distribute Jessibuca JavaScript loaders, WebAssembly binaries, its npm tarball, third-party static libraries, FFmpeg executables or IPK packages. Local setup fetches Jessibuca 4.0.0 from its original npm URL and verifies a pinned checksum before restoring runtime files. Those files remain Git-ignored. The upstream GPL text is retained in `app/vendor/decoder/COPYING`.

The npm metadata labels Jessibuca as MIT, but the actual package's LICENSE is GPLv3. We follow the actual included license. Its archive contains decoder source/build scripts and prebuilt third-party libraries; complete corresponding source and reproducible builds for those libraries have not been verified. Copying the tarball alone has not been established to satisfy all source obligations for binary distribution. Public binary releases are deferred until that work is completed.

Local setup replaces `export default Module;` with `self.createVideoDecoder = Module;` in the generated loaders; the WASM files are unchanged. See [dependency details](../tools/vendor-sources/README.md) and [notices](../THIRD_PARTY_NOTICES.txt).

## Before distributing a binary

Verify the exact decoder/dependency sources, license notices, build scripts and corresponding-source delivery requirements for the binaries you distribute. Also check applicable codec patent licensing and store terms for your distribution territories. A source license alone does not settle patent rights or grant rights to third-party trademarks.

The project does not include the XMEye mobile application, proprietary cloud SDK or vendor credentials. Protocol references are attributed in the notices and `protocol-sources.json`. Development FFmpeg is a test dependency only. Synthetic video fixtures are generated with the supplied FFmpeg test-pattern script; prototype camera images are generated illustrations rather than real CCTV.
