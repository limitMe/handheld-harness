# Releasing and auto-update (spec 19)

Package HANDHELD.AI as an NSIS installer and distribute updates through GitHub Releases. In-app, "Settings → About & Diagnostics → Software update → Check for updates" checks manually, downloads after confirmation, and shows "Restart now / Later" when the download completes.

Repository: `https://github.com/limitMe/handheld-harness` (public). At runtime it reads Releases anonymously; **the app carries no token**. The token is used only at release time to upload.

## Prerequisites

- The build machine has run `npm install` (pulls in `electron-builder`, `electron-updater`, and the OpenCode platform binary).
- Provide `GH_TOKEN` when releasing:
  - a classic PAT with `repo`; or
  - a fine-grained token limited to this repo with `Contents: Read and write`.
- Close any running dev build: while it runs, `node_modules` and the Electron binary are locked and `npm install` fails with EBUSY / EPERM.

## Release steps

```powershell
# 1) Bump the version (package.json "version", e.g. 0.1.0 -> 0.2.0)
#    The version decides whether users get the update and must be strictly increasing semver.

# 2) Make sure the dev build is closed, then install dependencies (first time or when the lockfile changes)
npm install

# 3) The self-check must pass
npm run check

# 4) Build + package + publish to GitHub Releases
$env:GH_TOKEN = "<your token>"
npm run dist:publish
```

`dist:publish` is equivalent to:

```
npm run build && electron-builder --win --x64 --publish always
```

## Artifacts

electron-builder produces the files in `dist/` and creates a GitHub release. Every release must include:

| Asset | Purpose |
|---|---|
| `HANDHELD.AI-<version>-setup.exe` | NSIS installer (x64) |
| `HANDHELD.AI-<version>-setup.exe.blockmap` | for differential updates |
| `latest.yml` | the **update manifest**; electron-updater relies on it to detect new versions |

The installer embeds `app-update.yml` (recording `provider/owner/repo`); installed builds use it to check for updates.

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
| Publishing returns 401 / 403 | Missing `GH_TOKEN` or insufficient permissions (needs `repo` or `Contents: write`) |
| Empty release notes | The release body is empty; the app shows "this version has no update notes" |
