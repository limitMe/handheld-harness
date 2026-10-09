# Recovery handbook (spec 04)

While dogfooding there are two kinds of instance: the **stable build** (`handheld-harness-stable`, fullscreen, last confirmed-good build) and the **dev build** (main repository, `npm run dev`, the code being edited). The stable build is the lifeboat: as long as it works, you can always direct the Agent through it to fix the dev build.

This handbook lists only actions performed by a human (or by the user directing the Agent). **The Agent must not terminate opencode / electron / node processes on its own, and must not run `server:stop`, `taskkill`, or `Stop-Process`** (see the bootstrap development rules in `AGENTS.md`).

| Symptom | Recovery |
|---|---|
| Dev build shows a blank screen or a compile-error overlay | In the **stable build**, tell the Agent the symptom; the Agent runs `npm run typecheck` to locate and fix it |
| Dev build's main process keeps crashing and restarting | Same. If needed, press `Ctrl+C` in the dev terminal to stop it, fix, then `npm run dev` again |
| The stable build also breaks | Run `npm run stable:rollback`, or double-click the last working shortcut |
| Neither instance works | In Windows Terminal, enter the main repository and run `opencode` (TUI). If the locked version supports attaching to an existing server (e.g. `opencode attach <url>`, per `opencode --help`), you can take over the original session directly |
| The code is a mess and you want to drop this change | **The user** manually runs `git stash` or `git checkout -- .`. The Agent must not run these on its own |
| The server hangs | The user runs `npm run server:status` to inspect, then `npm run server:stop -- <workspace>`, then restarts the instance |

## Common commands

```powershell
# List every registered OpenCode server (pid, address, version, workspace, health)
npm run server:status

# Stop the server for a workspace and delete its registration file
npm run server:stop -- C:\Apps\handheld-harness

# Roll the stable build back to the previous stable-* tag and rebuild
npm run stable:rollback

# Rebuild and upgrade the stable build (requires a clean main repo and a passing npm run check)
npm run stable:update
```

## Fallback: the TUI

If neither instance opens, OpenCode's TUI still works:

```powershell
cd C:\Apps\handheld-harness
opencode
```

The TUI uses the main repository's workspace directly. If `opencode` supports `attach`, it can even take over the same session the app is using; otherwise just describe the request again from the TUI and the code changes land in the same repository, so the dev build sees them once it recovers.
