# Historical dependency cache

Version 0.3.2 used a locally downloaded Jessibuca 4.0.0 archive. That archive is
Git-ignored and is not included in public release assets. It is no longer used
by the current decoder.

Version 0.3.3 builds its decoder from pinned FFmpeg sources and the project's
C adapter. See [decoder sources and build](../../decoder/README.md) and
[licensing](../../docs/LICENSING.md). Current source downloads are cached under
`output/decoder-sources/`; the full source release bundles them in `third_party/`.
