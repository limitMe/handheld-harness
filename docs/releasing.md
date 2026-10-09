# Releasing and auto-update (spec 19)

Package Handheld Harness as an NSIS installer and distribute updates through GitHub Releases. In-app, "Settings → About & Diagnostics → Software update → Check for updates" checks manually, downloads after confirmation, and shows "Restart now / Later" when the download completes.

Repository: `https://github.com/limitMe/handheld-harness` (public). At runtime it reads Releases anonymously; **the app carries no token**. The token is used only at release time to upload.

## Prerequisites

- The build machine has run `npm install` (pulls in `electron-builder`, `electron-updater`, and the OpenCode platform binary).
- Provide `GH_TOKEN` when releasing:
  - a classic PAT with `repo`; or
  - a fine-grained token limited to this repo with `Contents: Read and write`.
- Close any running dev build: while it runs, `node_modules` and the Electron binary are locked and `npm install` fails with EBUSY / EPERM.

## Release steps

```powershell
# 1) Bump the version in package.json "version" AND package-lock.json
#    (the lockfile repeats it twice: the root "version" and packages."".version).
#    e.g. 0.1.0 -> 0.2.0. The version decides whether users get the update and
#    must be strictly increasing semver.

# 2) Make sure the dev build is closed, then install dependencies (first time or when the lockfile changes)
npm install

# 3) The self-check must pass
npm run check

# 4) Commit the bump and push it to main BEFORE publishing.
#    GitHub creates the v<version> tag from the default-branch HEAD, so an
#    uncommitted (or unpushed) bump would leave the tag on a commit without it.
git add package.json package-lock.json
git commit -m "chore: release <version>"
git push origin main

# 5) Build + package + publish to GitHub Releases
$env:GH_TOKEN = "<your token>"
npm run dist:publish

# 6) Verify the release carries all three assets (see Artifacts)
npm run release:verify
```

`dist:publish` is equivalent to:

```
npm run build && electron-builder --win --x64 --publish always
```

## Artifacts

electron-builder produces the files in `dist/` and creates a GitHub release. `npm run release:verify` checks the published release for them. Every release must include:

| Asset | Purpose |
|---|---|
| `handheld-harness-<version>-setup.exe` | NSIS installer (x64) |
| `handheld-harness-<version>-setup.exe.blockmap` | for differential updates |
| `latest.yml` | the **update manifest**; electron-updater relies on it to detect new versions |

The installer embeds `app-update.yml` (recording `provider/owner/repo`); installed builds use it to check for updates.

## Recovering a failed or partial release

If a release with the same tag already exists, publishing can abort with `422 ... "Published releases must have a valid tag"`. The run then stops before it writes and uploads `latest.yml`, leaving a "successful-looking" release that auto-update can never see. To repair it, re-run while reusing the existing release instead of re-creating it:

```powershell
$env:GH_TOKEN = "<your token>"
$env:EP_GH_IGNORE_TIME = "true"   # reuse an existing release (bypasses the 2-hour window)
npm run dist:publish
```

The exe is overwritten and `latest.yml` is regenerated from the uploaded exe, so never edit or upload `latest.yml` by hand. If it still fails, delete the GitHub Release (keep the `v<version>` tag) and run `npm run dist:publish` again; with the tag already present, creating the release no longer collides.

Finish with `npm run release:verify`.

## Publishing rules (auto-update depends on them)

- Tag with `v<version>` (electron-builder default).
- Must **not** be a draft, and a stable release must **not** be marked prerelease, or electron-updater ignores it. `electron-builder.yml` forces `releaseType: release`.
- The version must be strictly greater than the installed one; electron-updater **never downgrades**. To "roll back", ship a package with a higher version number, or have the user install the old installer manually.
- Release notes go in the GitHub Release body; the app prefers the update metadata and falls back to the GitHub API using the tag when it's missing.

## In-app update flow

1. The user opens "About & Diagnostics → Software update → Check for updates".
2. A new version exists → a dialog shows the release notes with "Update / Cancel".
3. Click "Update" → background download with a percentage.
4. Download completes → "Restart now / Later"; "Restart now" calls `quitAndInstall`, and on exit it ends running tasks per P-11.
5. "Later" just closes the dialog; the update file is cached and the next check can continue.

Available only in the **NSIS-installed build**; `npm run dev` and `stable:start` (preview) show "installed build only".

## Testing an update

1. Install an old version (e.g. set `version` to `0.1.0`, publish, install).
2. Set `version` to `0.2.0` and run `npm run dist:publish`.
3. In the installed `0.1.0`, click "Check for updates" and confirm the `0.2.0` release notes appear; after updating, the version becomes `0.2.0`.

## Manual publishing (alternative)

`npm run dist` without `--publish` produces files only, no release. To upload manually:

1. `npm run dist`.
2. Create a `v<version>` release on GitHub (not draft, not prerelease).
3. Upload the three assets above.
4. Forgetting `latest.yml` means updates can't be found.

## FAQ

| Symptom | Cause / fix |
|---|---|
| The app says "installed build only" | It's a dev / preview build, not an installed one |
| New version not found | The release is draft / prerelease; or `latest.yml` is missing; or the version didn't increase |
| First install blocked by SmartScreen | No code signing; acceptable for personal use, click "Run anyway". A signing certificate is not a prerequisite for auto-update |
| `npm install` reports EBUSY / EPERM | The dev build is running; close it first |
| `422 ... "Published releases must have a valid tag"` | A release for this version already exists; re-run with `EP_GH_IGNORE_TIME=true`, or delete the Release (keep the tag) and retry |
| Release exists but the app finds no update | Publishing aborted before uploading `latest.yml`; re-run with `EP_GH_IGNORE_TIME=true`, then confirm with `npm run release:verify` |
| Publishing returns 401 / 403 | Missing `GH_TOKEN` or insufficient permissions (needs `repo` or `Contents: write`) |
| Empty release notes | The release body is empty; the app shows "this version has no update notes" |
