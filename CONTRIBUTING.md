# Contributing

Bug reports, compatibility reports, translations and pull requests are welcome. Check existing Issues first. Keep changes focused and explain the user-visible behavior and validation.

## Local checks

Use Node.js 18+, Python 3.10+ and FFmpeg. Run `python tools/vendor-decoder.py` for the source-built decoder bundle. On Windows run `python tools/install-test-ffmpeg.py`; elsewhere install `ffmpeg` or set `FFMPEG`.

```sh
npm test
npm run check:publication
```

`check:publication` checks Git-tracked files; stage intended new files before running it. CI separately runs Gitleaks against the Git history. Test fixtures are generated patterns, not recordings. To regenerate them: `node tools/generate-fixtures.cjs`. Preview: `npm start`. Fake recorder: `node test/fixture-recorder.cjs`.

For UI changes, test empty first run, remote focus/OK/Back, HD/FHD layouts and synthetic video. The `tools/ui-*.cjs` files are Playwright CLI `run-code` scenarios for a separate loopback-only test session; never run them in a user's real configured session. `tools/ui-verify-multiview.cjs` uses an isolated preview on port 19438.

Do not commit actual DVR/TV profiles, credential stores, hashes, media tokens, keys, personal device addresses, real recordings or local logs. Use loopback for test services and RFC 5737 documentation addresses in examples. Do not add generated service copies, decoder binaries or IPK files to Git; see [licensing](docs/LICENSING.md).

Project contributions are under GPL-3.0-only. Preserve third-party licensing. Report exploitable vulnerabilities through [private reporting](SECURITY.md), not public bug reports.

For decoder changes, rebuild with `python tools/build-decoder.py` and run `npm run test:decoder`. Preserve complete pinned dependency sources, licenses and artifact provenance.
