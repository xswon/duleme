# Desktop release

## V1 beta target

- Product: 读了么
- Version: 0.1.0-beta.2
- Desktop runtime: Electron 44.4.3
- Primary target: macOS DMG (arm64 + x64)
- Data: local IndexedDB
- Source repository: private `xswon/duleme`
- Binary distribution repository: public `xswon/duleme-releases`
- Apple signing/notarization: deferred

## Release baseline

Desktop packaging now lives on top of the current `main` product baseline. Do not publish
an artifact from a long-lived desktop-only branch. Release candidates must be built from a
commit whose normal CI and Desktop Release workflow are both green.

The packaged Electron process:

- starts the existing Express + React app on a random loopback port;
- keeps `contextIsolation` and the renderer sandbox enabled;
- disables Node integration and webviews;
- denies renderer permission requests;
- opens external HTTP(S) navigation in the system browser;
- serves production pages with a restrictive Content Security Policy.

## Automated clean-machine validation

The Desktop Release workflow runs the packaged build on two fresh GitHub-hosted macOS VMs:

- `macos-15` — Apple Silicon / arm64;
- `macos-15-intel` — Intel / x64.

For each architecture the workflow:

1. installs dependencies with `npm ci`;
2. builds the frontend, local server and Electron main process;
3. builds only the native DMG for that VM;
4. mounts the DMG read-only;
5. copies the `.app` bundle to a fresh temporary install directory;
6. verifies bundle ID, version, executable bit and CPU architecture;
7. launches the packaged executable with `--smoke-test`;
8. verifies the local health endpoint, packaged frontend and production CSP.

This is intentionally stronger than inspecting the DMG as an archive: the packaged
application process itself has to start successfully on both architectures.

## Manual Gatekeeper acceptance

The public beta remains unsigned and unnotarized. GitHub-hosted runners do not reproduce
the exact quarantine metadata and the human **Privacy & Security → Open Anyway** flow of a
browser-downloaded DMG, so each release candidate still gets one short manual acceptance
pass before the tag is published:

- download the candidate DMG through a browser on a clean/non-development Mac;
- drag 读了么 to Applications;
- verify the expected first-launch block;
- use **System Settings → Privacy & Security → Open Anyway**;
- reopen the app and confirm the welcome screen renders;
- add one RSS feed, restart, and confirm local persistence;
- export a backup, restore it, and confirm subscriptions/notes survive.

Do not use Terminal workarounds such as `xattr` in end-user instructions.

## Release flow

1. Merge the beta-readiness PR to `main` after both CI workflows pass.
2. Run Desktop Release manually once from `main` and inspect both DMG artifacts.
3. Complete the manual Gatekeeper acceptance above.
4. Create a version tag such as `v0.1.0-beta.2`.
5. The tag workflow re-runs verification and both native-architecture smoke jobs.
6. After both pass, the publish job uploads the two DMGs and `SHA256SUMS.txt` to
   `xswon/duleme-releases`.

## Release repository token

`RELEASE_REPO_TOKEN` is a fine-grained token scoped only to
`xswon/duleme-releases` with repository **Contents: Read and write** permission.
It does not need access to the private source repository.

## Backup/restore compatibility

Desktop V1 keeps backup format version 1. Existing storage regression tests remain the
compatibility gate, including:

- checksummed export and restore;
- AI secret exclusion from backup files;
- same-endpoint secret preservation and different-endpoint secret clearing;
- dedicated audio progress backup and restore;
- legacy version-1 audio progress restoration.
