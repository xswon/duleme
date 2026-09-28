# Desktop release

## V1 release target

- Product: 读了么
- Version: 0.1.0
- Desktop runtime: Electron 44.4.3
- Primary target: macOS DMG (arm64 + x64)
- Data: local IndexedDB
- Distribution: GitHub Release

## Required GitHub Actions secrets

The desktop release workflow never stores signing credentials in the repository.

- `MAC_CSC_LINK`: Developer ID Application certificate in a format accepted by electron-builder (for example base64 encoded `.p12`).
- `MAC_CSC_KEY_PASSWORD`: password for the certificate.
- `APPLE_API_KEY_BASE64`: base64 encoded App Store Connect API key (`.p8`).
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER`: App Store Connect issuer ID.
- `APPLE_TEAM_ID`: Apple Developer Team ID.

## Release flow

1. Merge the release changes to `main`.
2. Confirm CI is green, including storage/backup tests and the desktop main-process bundle.
3. Create and push a version tag, for example `v0.1.0`.
4. The Desktop Release workflow builds, signs, notarizes, and uploads both macOS DMGs.
5. Verify the downloaded DMG on a clean macOS account before sharing it.

## Backup/restore regression

The existing storage test suite is the V1 compatibility gate. It covers:

- checksummed version-1 backup export and restore;
- AI secret exclusion from backup files;
- same-endpoint secret preservation and different-endpoint secret clearing;
- dedicated audio progress backup and restore;
- legacy version-1 audio progress restoration.

Do not bump the backup format for Desktop V1 unless the stored schema actually changes.

## Public-download constraint

This source repository is currently private. GitHub Release assets in a private repository are not suitable as public download links for ordinary users.

Before public launch, use one of these options:

1. make the release repository public; or
2. publish the DMGs to a separate public GitHub release repository and update `website/index.html` to that repository's `/releases/latest` URL.

The website can remain independent of where binaries are hosted.
