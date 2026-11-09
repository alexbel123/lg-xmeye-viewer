# Build and install on LG webOS

[Home](../README.en.md) · [Русский](INSTALL.ru.md)

This is a webOS app, not an Android APK. The first public release is source-only; see [licensing](LICENSING.md). Ordinary non-root Developer Mode operation, including service storage permissions, has not been validated. Historical hardware testing used a rooted TV.

## Build

Install Git, Node.js 18+ and Python 3.10+:

```sh
git clone https://github.com/alexbel123/lg-xmeye-viewer.git
cd lg-xmeye-viewer
python tools/vendor-decoder.py
npm install --global @webos-tools/cli
npm run build
```

The decoder setup downloads the original npm dependency and verifies its pinned SHA-256. The output is `dist/local.xmeye.viewer_0.3.2_all.ipk`. `npm run build:hd` builds a 1280×720 graphics variant. If CLI discovery fails, set `WEBOS_CLI_DIR` to the installed `@webos-tools/cli` package directory.

## Pair and install

Follow [LG's official Developer Mode guide](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app). Developer Mode sessions expire. Create a local device profile named `my-tv` and pair using your TV's details:

```sh
ares-setup-device
ares-novacom --device my-tv --getkey
ares-install --device my-tv dist/local.xmeye.viewer_0.3.2_all.ipk
ares-launch --device my-tv local.xmeye.viewer
```

These standard CLI commands do not establish that every non-root runtime restriction is supported. Report sanitized service/storage errors through Issues; do not change TV protections merely to follow this guide.

## Configure

Start with **Add device** (the current UI is Russian). Enter the recorder's IP, DVRIP port (usually 34567), username and password. The TV must have a routed connection to the recorder. Phone access through XMEye cloud is not sufficient. Use separate profiles for separate recorder credentials.

Select a live channel or open the camera grid and select up to four channels from the same recorder. Grid mode uses the Extra1 substream; use moderate resolution/frame rates. Hide the interface to fill the TV with the camera field; Back restores controls.

See [compatibility](COMPATIBILITY.md), [privacy/storage](PRIVACY.md) and [development](../CONTRIBUTING.md). Do not expose the recorder's DVRIP port to the public internet; use your own protected network/VPN for remote access.
