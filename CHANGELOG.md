# Changelog

## 0.3.4 — 2026-11-09

- Raise the working UI and service limit to six concurrent cameras; reject a seventh while retaining the active six.
- Use a 3×2 grid for five/six tiles and show the service-advertised stream limit.
- Verify six independent decoder instances, service slots, camera failure/removal and browser H.264/H.265 multiview.
- Update user documentation and screenshots. No physical-TV deployment was performed.

## 0.3.3 — 2026-11-09

- Source-built FFmpeg 8.1.3 scalar/SIMD decoders with the project's C adapter.
- Pinned source archives, verified Emscripten runtime sources, complete source bundle and third-party notices.
- Pixel-hash regression tests for H.264/H.265 including B-frames, independent instances and reinitialization.
- Worker stride handling and delayed-frame flush; 8-bit YUV420 software decode with a 1920×1080 pixel budget.
- Ready HD/FHD IPK and decoder bundles accompanied by complete source archives and checksums.
- Rebuilt decoder verified locally; no new physical-TV installation or performance claim.

## 0.3.2 — 2026-11-09

Initial public source preview.

- Empty first run; personal recorder defaults removed.
- Sanitized verification metadata and example addresses.
- Portable webOS CLI discovery and FFmpeg lookup.
- GPL-3.0-only project license, preserved third-party notices and explicit source-only distribution scope.
- Pinned decoder download with checksum verification; upstream binary dependencies excluded from Git/releases.
- Russian/English documentation, synthetic screenshots, contribution/security guidance and CI/publication checks.

The hardware verification in `verification.json` describes the previous 0.3.1 baseline. Version 0.3.2 has not been installed on a TV as part of public-release preparation.

## 0.3.1 — development baseline

Independent control/media connections, hot switching, up to four live channels, HEVC software multiview and fullscreen camera field. Limited hardware verification is documented separately.

## v0.4 design concept

A separate interactive prototype explores 1/2/4/6 layouts, named camera sets and enlarged grid tiles. It is not the current production player.
