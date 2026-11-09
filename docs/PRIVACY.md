# Privacy / Конфиденциальность

The source release contains no configured recorders, real passwords/hashes, private device addresses, MAC addresses, serial numbers, local session logs or private CCTV footage. Screenshots use generated imagery or synthetic test patterns. Protocol fixtures use intentionally public, synthetic credentials.

## Runtime data

- TV/browser localStorage stores profile ID, display name, host, port, channel count, favorites, named camera sets/order and display preferences. The service also keeps a restricted-permission `workspace.json` snapshot in its private data directory, so settings can recover after webOS clears browser data during an update. This snapshot contains no login credentials; profile addresses and set names are not encrypted. These are user data and should not be included in screenshots or reports.
- The service stores username and the Sofia password hash per profile in an AES-256-GCM encrypted vault. The hash is an authentication secret even though it is not the original password.
- The key is stored locally with restricted file permissions; Windows additionally uses CurrentUser DPAPI. Local encryption does not protect against an administrator/root user with access to the running TV or computer.
- TV default: `/media/internal/local.xmeye.viewer/`. Windows preview: `%LOCALAPPDATA%/LGXMEyeViewer/`. Other local runtimes: the OS temporary directory's `lg-xmeye-viewer` subdirectory. `VIEWER_CREDENTIALS_DIR` can select an isolated development directory. Standard TV sandbox storage support remains unverified.
- Video is streamed to the local player; the application has no developer-operated video relay, cloud recorder account, analytics or payment backend. Dependency setup and GitHub pages/documentation can make their own network requests.
- DVRIP transport is not an encrypted internet transport. Use a trusted routed network or VPN and a viewing-only recorder account.

## Removal and reports

Use the device settings' delete-credentials control to remove that profile's saved login. Removing a recorder profile also removes its vault entry. Browser profile storage and an externally stored service vault may survive some uninstall/reinstall workflows; clearing app data alone is not proof that every external file has been erased.

Before sharing logs or screenshots, remove hostnames/IPs, MACs, serial numbers, usernames, passwords, credential hashes, media URLs/tokens and actual video. Report security issues privately through [GitHub Security](https://github.com/alexbel123/lg-xmeye-viewer/security/advisories/new), not public Issues.
