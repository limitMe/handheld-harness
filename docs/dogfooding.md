# Daily dogfooding workflow (spec 04)

"Develop Handheld Harness with Handheld Harness": the user requests changes from the Agent in the stable build, the Agent edits the main repository, the user sees the result immediately in the dev build, commits when satisfied, and periodically upgrades the stable build.

## Topology

```
C:\Apps\handheld-harness-stable   stable build (stable-branch worktree, built, fullscreen)
   └─ profile=stable, workspace=C:\Apps\handheld-harness   ←── the user talks to the Agent here
            │
            ▼
   OpenCode server (detached, shared per "workspace + version")
            ▲
   └─ profile=dev, npm run dev, windowed                    ←── the user watches changes here (HMR)
C:\Apps\handheld-harness          main repository (main / feature branches)
```

- The stable build runs the last confirmed-good artifact, so Agent edits can't break it.
- The dev build runs the code being edited; when both instances point at the same workspace and OpenCode version they reuse one server, so they see the same sessions.
- **Simplified mode**: run only the dev build and talk to the Agent there. Fine for renderer-only changes; use [`recovery.md`](recovery.md) if you break it.

## Steps

1. Open the stable build (desktop / Start menu shortcut) and the dev build (`npm run dev` in a terminal).
2. In the **stable build**, create a task such as: "Implement the 'input box: collapse and expand' part of `docs/zh-CN/specs/13-screen-current-work.md`."
3. If the Agent raises an open question (`P-xx`), the user answers.
4. The Agent edits code and runs `npm run check`, then explains what changed, where to look, and whether it goes live via HMR or restarts. The user switches to the dev window (`Alt+Tab` or the vendor's task switcher) to verify.
5. If unsatisfied, keep giving feedback in the same task; if satisfied, say "commit".
6. After accumulating a batch of usable changes, run `npm run stable:update` and restart the stable build. You can then use the new features (e.g. gamepad control) to keep developing.

## Conventions

- One task does one thing; small, verifiable steps.
- When the user says "commit", the Agent commits in the agreed format, one feature per commit; without an explicit instruction it must not `commit` / `push` / `reset --hard` / delete branches.
- Dependency changes: while the dev build runs, Electron and `node_modules` are locked and `npm install` fails. The Agent must tell the user the package name and reason first, and the user closes the dev build before installing.
- Before upgrading the stable build, the Agent must ensure the main repository is clean and `npm run check` passes; `stable:update` runs check again itself.

## Related commands

| Command | Purpose |
|---|---|
| `npm run stable:setup` | Create the stable branch / worktree for the first time, `npm ci`, and build |
| `npm run stable:start` | Start the stable build with `profile=stable`, shared server, fullscreen |
| `npm run stable:shortcut` | Create the "Handheld Harness (stable)" shortcuts on the desktop and Start menu |
| `npm run stable:update` | Fast-forward stable to main, tag, `npm ci` if needed, rebuild |
| `npm run stable:rollback` | Roll back to the previous `stable-*` tag and rebuild |
