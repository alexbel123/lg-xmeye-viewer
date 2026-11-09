# Local decoder dependency cache

The public repository does not redistribute Jessibuca binary loaders, WebAssembly files or the upstream npm archive. `python tools/vendor-decoder.py` fetches the pinned archive directly from its original npm registry, verifies SHA-256 before writing it here, then restores runtime files into `app/vendor/decoder/`. These downloaded/generated files are ignored by Git.

- Version: Jessibuca 4.0.0
- URL: https://registry.npmjs.org/jessibuca/-/jessibuca-4.0.0.tgz
- Upstream: https://github.com/langhuihui/jessibuca
- SHA-256: `d201aa5e064cbea1be4ba8da1b8fd5e9c2899cd1a20801ed29c30d97d7b691b4`
- Actual included license: GPLv3; the npm metadata's MIT label is not authoritative.

The upstream archive includes decoder C++ sources and build scripts, but also precompiled third-party static libraries. Complete corresponding source and a reproducible build for those libraries have not been verified. Public releases therefore contain source only, without decoder binaries or IPK packages. See [licensing](../../docs/LICENSING.md) before redistributing a locally built package.

The local loader change replaces `export default Module;` with `self.createVideoDecoder = Module;`. The WebAssembly binaries are unchanged.
