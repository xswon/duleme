# Desktop release

## V1 release target

- Product: 读了么
- Version: 0.1.0
- Desktop runtime: Electron 44.4.3
- Primary target: macOS DMG (arm64 + x64)
- Data: local IndexedDB
- Source repository: private `xswon/duleme`
- Binary distribution repository: public `xswon/duleme-releases`
- Apple signing/notarization: deferred

## One required GitHub Actions secret

Create a fine-grained GitHub personal access token that can write releases to the public
`xswon/duleme-releases` repository, then save it in the private source repository as:

- `RELEASE_REPO_TOKEN`

The token should be scoped only to `xswon/duleme-releases` and needs repository
`Contents: Read and write` permission. Do not grant access to the private source repository
unless it is otherwise required.

## Public release repository

Create `xswon/duleme-releases` as a **public** repository and initialize it with a README.
It is intentionally separate from the private source repository.

Its purpose is to expose:

- macOS DMGs;
- SHA-256 checksums;
- release notes;
- a minimal GitHub Pages download entry.

Source code remains in the private `xswon/duleme` repository.

## Release flow

1. Merge the Desktop V1 changes to `main`.
2. Confirm CI is green, including storage/backup tests and the desktop main-process bundle.
3. Run the Desktop Release workflow manually once to verify the unsigned macOS build.
4. Test the generated arm64/x64 DMG artifact on a clean Mac.
5. Create and push a version tag, for example `v0.1.0`.
6. The Desktop Release workflow builds both unsigned DMGs and publishes them to
   `xswon/duleme-releases`.

## Unsigned macOS behavior

Desktop V1 intentionally has no Apple Developer ID signature or notarization.

On first launch, macOS may block the app. The user should:

1. try opening 读了么 once;
2. open **System Settings → Privacy & Security**;
3. find the blocked app notice and choose **Open Anyway**;
4. confirm **Open**.

Do not instruct ordinary users to run Terminal commands such as `xattr`.

When the project later joins the paid Apple Developer Program, signing/notarization can
be re-enabled without changing the local-first application architecture.

## Backup/restore regression

The existing storage test suite is the V1 compatibility gate. It covers:

- checksummed version-1 backup export and restore;
- AI secret exclusion from backup files;
- same-endpoint secret preservation and different-endpoint secret clearing;
- dedicated audio progress backup and restore;
- legacy version-1 audio progress restoration.

Do not bump the backup format for Desktop V1 unless the stored schema actually changes.

## GitHub Pages

GitHub Pages should be hosted from the public `xswon/duleme-releases` repository rather
than the private source repository. This keeps the source private and also allows Pages to
work on GitHub Free.

The Pages site should remain intentionally minimal:

- product name and one-sentence description;
- latest macOS public-beta download link;
- unsigned-build first-launch instructions;
- version/platform note.

No separate website framework or marketing site is required for V1.
