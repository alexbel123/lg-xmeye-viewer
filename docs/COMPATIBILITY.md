# Compatibility / Совместимость

| Area | Current evidence and limits |
| --- | --- |
| Target | LG webOS 22+; not a guarantee for every TV or firmware |
| Physical TV | v0.4.0 six-camera live/workspace tested on LG OLED65C2RLA; service/runtime checks on OLED65B3RLA |
| Installation | Hardware installation used root access; ordinary Developer Mode/store sandbox not validated |
| Networking | Direct IPv4/DVRIP TCP, usually port 34567; routed subnets supported in principle; no cloud/P2P/serial login |
| DVR/NVR | XMEye-compatible protocol; protocol/firmware variants may differ; not every branded recorder is supported |
| Live view | One recorder selected at a time, up to six concurrent selected channels |
| Grid video | Extra1 substream; native TV uses source-built FFmpeg WebAssembly workers/WebGL; 8-bit YUV420 only, 1920×1080 pixel budget, performance depends on TV and stream settings |
| Main/archive | MediaSource fragmented MP4, H.264/H.265 subject to platform codec support; reordered B-frames rejected |
| Archive | Search/playback tested on generated recordings; real private archives were not examined |
| Controls | Arrow keys, OK, Back, pointer, CH+/CH−; UI currently Russian |
| Layout | HD/FHD logical canvas; browser layout tests do not prove every physical panel or accessibility use case |
| Missing | Audio, PTZ, cloud login, pause/export, multi-recorder grids |
| Workspace | Production layouts 1/2/4/6, per-recorder named sets/order, pagination and enlarged grid tile; switching layouts preserves selected cameras |
| Automatic set sizing | Creating/editing a set fits its grid to selected cameras: 1→1, 2→2, 3–4→4, 5–6→6; larger sets use pages of six. Cancelling preserves the previous viewing layout |

Historical C2 test: four HEVC 800×448 channels at approximately 15/15/15/20 fps for 45 seconds, six hot switches. This is not an endurance benchmark. See [verification.json](../verification.json), which describes the **0.3.1 baseline**, not a new 0.3.4 physical-TV test.

The native service's default credential directory is `/media/internal/local.xmeye.viewer/`. Its writability in the standard app sandbox is unresolved. Filesystem behavior must be validated before claiming normal-user/store installation support. Do not interpret a successful rooted-TV test as store readiness.

Useful official references: [LG JS services](https://webostv.developer.lge.com/develop/guides/js-service-basics), [graphics resolution](https://webostv.developer.lge.com/develop/specifications/app-resolution), [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).

Version 0.3.3 uses a rebuilt FFmpeg decoder. Scalar/SIMD pixel accuracy and synthetic browser multiview are checked locally; its physical-TV throughput has not yet been measured. The 0.3.1 TV benchmark used the previous decoder and must not be treated as a 0.3.3 performance claim.

Version 0.3.4 raised the application/service limit to six cameras. Version 0.4.0 integrates the workspace UI and was sampled on a physical C2 for 45 seconds with six HEVC 800×448 streams at 15/15/15/20/20/15 fps, without WebGL errors or lost contexts. Layouts 1/2/4/6, seven hot switches, fullscreen and settings recovery were checked. Later network interruptions/reinstalls were followed by a DVRIP login timeout despite a successful TCP connection; its cause remains unresolved. See [v0.4.0 evidence](../verification-v0.4.0.json). This is not an endurance or reconnect-reliability certification.

Version 0.4.1 automatic sizing was checked in the editor on the physical C2 while selecting 1–6 cameras and removing them again. Saved profiles, sets and credentials remained unchanged after the update and cancelled preview. This patch has no new endurance benchmark; see [v0.4.1 evidence](../verification-v0.4.1.json).
