# Handheld Harness

An AI agent harness for handheld gaming PCs (Windows 11): an Electron shell plus a React UI that drives AI coding sessions from a gamepad, in the living room or on a handheld. The product definition is `docs/HandheldHarness.md` (local, Chinese; not tracked in git). Requirements live in [`docs/specs/README.md`](docs/specs/README.md) (English summaries); the full Chinese originals are under [`docs/zh-CN/specs/`](docs/zh-CN/specs/).

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | electron-vite dev mode. The renderer uses HMR; main / preload changes restart Electron automatically |
| `npm run build` | Build to `out/` |
| `npm run start` | Run the built output (electron-vite preview) |
| `npm run typecheck` | Check the three tsconfigs (main / preload / renderer) separately |
| `npm run lint` | ESLint, zero warnings |
| `npm run format` | Prettier write-back |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Build first, then run Playwright `_electron` smoke tests (opens a GUI; local only) |
| `npm run check` | Run typecheck, lint, and test in sequence; the standard self-check before finishing a task |
| `npm run clean` | Remove `out/` and e2e screenshot artifacts |

**You must run `npm run check` before finishing any change, and it must pass.**

## Directory layout

```
electron.vite.config.ts   # main / preload / renderer build config
scripts/                  # cross-platform Node scripts (no .sh)
src/
  shared/                 # pure TS shared by main and renderer: IPC contract, zod schemas, settings types
  main/                   # main process: system capabilities, networking, agent engine, IPC, settings, logging
  preload/                # contextBridge; exposes only window.handheld
  renderer/               # UI only
    src/ui/               # the only entry point for third-party UI (Base UI)
    src/components/       # product components
    src/debug/            # gamepad / microphone debug pages
    src/styles/           # Tailwind entry, semantic tokens, theme values
tests/
  unit/                   # Vitest
  e2e/                    # Playwright smoke tests (artifacts/ not committed)
```

Responsibilities:

- **main process** owns system capabilities, networking, and the agent engine; the renderer never touches the network or Node directly.
- **renderer** is UI only.
- **shared** holds pure TS only; it **must not** import electron or react.

## Runtime data (per-profile)

Settings live in `%APPDATA%\handheld-harness\<profile>\settings.json` (defaults are written on first launch), and logs in `<profile>\logs\main.log`. The dev profile is `dev`, the built app uses `default`; override with `HANDHELD_PROFILE`. State shared across profiles is defined by spec 02.

## Platform conventions (Windows first)

- All scripts must run in Windows 11 PowerShell 7; write cross-platform scripts in Node, not bash-specific syntax.
- Always join paths with `node:path`; never hardcode `/` or drive letters.
- The repo uses LF endings (enforced by `.gitattributes`); don't introduce CRLF.

## Security conventions

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the renderer has no `require`.
- preload exposes only the contracted `window.handheld`, never `ipcRenderer` itself; main validates every handler's input with zod.
- No network access in the renderer; all requests go through main.
- Never write API keys into the repo or logs.

## Dependency conventions

- Pin exact dependency versions (no `^` / `~`); upgrade in a separate commit.
- Stage A **must not** add dependencies that need a node-gyp native build.
- preload is bundled as a single CommonJS file under `sandbox: true`; don't switch it to ESM.

## Code style

- Code, comments, and commit messages in English; follow common naming practices (components PascalCase, functions / variables camelCase, constants UPPER_SNAKE_CASE).
- Keep comments minimal: explain intent, constraints, and non-obvious trade-offs only. If a method name says it, don't write a comment.

## UI conventions

- Use third-party UI components only through `src/renderer/src/ui/`; product code must not import `@base-ui/react` directly (ESLint blocks it).
- Style with Tailwind; design values must come from semantic tokens (`src/renderer/src/styles/tokens.css`). Components must not hardcode colors / font sizes / durations, nor use Tailwind palette classes (e.g. `bg-zinc-900`).
- Theme values live only under `src/renderer/src/styles/theme/`; swapping the whole theme means replacing that directory.
- Before adding a component, check `ui/` for an existing one to reuse.

## Networking

- When accessing foreign resources or hitting network timeouts, set the proxy and retry:
  `$env:HTTP_PROXY="http://127.0.0.1:7890"; $env:HTTPS_PROXY="http://127.0.0.1:7890"`
- Connect directly (no proxy) for domestic services (e.g. domestic npm mirrors).

## Git management

- Never commit to master. For simple tasks, change files on master, verify, then ask the user to commit; for complex tasks, open a branch and make several commits, then ask the user to squash and merge.

## Bootstrap development rules

(Added by spec 04.)

### Dogfooding rules (spec 04)

1. **You may be running inside the app you are editing.** Never terminate `opencode`, `electron`, or `node` processes. Never run `server:stop`. Never run `taskkill` or `Stop-Process`.
2. **Do not launch a GUI yourself.** Never run `npm run dev`, `npm run start`, or `stable:*`; the user already has these instances open. `npm run test:e2e` is allowed: it uses an isolated `e2e` profile and the fake engine, so it does not disturb the running instances.
3. **Edit only the main repository** (`C:\Apps\handheld-harness`). Never modify the `handheld-harness-stable` directory.
4. Run `npm run check` after every change, then tell the user:
   - what changed and where to look;
   - whether the change is live immediately through HMR (renderer) or restarts the dev instance (main / preload).
5. **Dependency changes:** on Windows, the Electron binary and files under `node_modules` are locked while the dev instance runs, so `npm install` fails with EBUSY or EPERM. Before adding or removing a dependency, tell the user the reason and the package name, and ask them to close the dev instance before installing.
6. Without an explicit user instruction, never `git commit`, `git push`, or `git reset --hard`, and never delete branches. When the user says "commit", follow the agreed format and make one commit per feature.
7. Specs are the source of requirements. If the implementation diverges, say so first and record it in that spec's implementation notes. Stage B specs are directional: for open inputs (`P-xx`), propose an option and get the user's confirmation before acting.
8. Keep changes small and verifiable. One conversation does one thing; let the user verify before moving on.

Recovery procedures: [`docs/recovery.md`](docs/recovery.md). Daily workflow: [`docs/dogfooding.md`](docs/dogfooding.md).
