# Handheld Harness Specs

This directory holds the **English spec summaries** for Handheld Harness, plus this index. The full, authoritative specs are in Chinese under [`../zh-CN/specs/`](../zh-CN/specs/); each summary links to its Chinese source. The product definition is `docs/HandheldHarness.md` (local, Chinese; not tracked in git).

This project follows SDD (Spec-Driven Development): the specs are the source of requirements, and the bootstrap loop lets the app drive the development of itself (see [spec 04](04-dogfooding-loop.md)).

## Stages

| Stage | Range | Goal | Style |
|---|---|---|---|
| **A. Bootstrap** | 00–04 | Get a usable framework running on a Windows 11 handheld, and **use the app itself to drive AI Agent development of itself** (dogfooding) | **Strict**: every item has an executable acceptance criterion; the implementing Agent must verify each one |
| **B. Product features** | 10–21 | Implement the four screens, shared components, gamepad, voice, and motion per the product doc | **Directional**: goals, boundaries, suggested designs, and open inputs; refined with the user during dogfooding before implementation |

| # | Spec | Stage | Status |
|---|---|---|---|
| 00 | [Windows 11 Development Environment](00-windows-dev-environment.md) | A | Implemented |
| 01 | [Project Scaffold](01-project-scaffold.md) | A | Implemented |
| 02 | [Agent Engine Adapter (OpenCode)](02-agent-engine-opencode.md) | A | Implemented |
| 03 | [Minimal Viable Workbench](03-workbench-mvp.md) | A | Implemented |
| 04 | [Dogfooding Loop](04-dogfooding-loop.md) | A | Implemented |
| 10 | [Input System and Key Mapping](10-input-system.md) | B | Implemented (accepted jointly with 11; automated checks pass, pending on-device testing) |
| 11 | [Focus System](11-focus-system.md) | B | Implemented (accepted jointly with 10; automated checks pass, pending on-device testing) |
| 12 | [Shared Components: Status Bar, Action Hints, List Input, Dialogs](12-shared-components.md) | B | Implemented (automated checks pass, pending on-device testing) |
| 13 | [Screen: Current Work](13-screen-current-work.md) | B | Implemented (includes the agent-output card refactor; dictation and text-edit hooks still to come; pending on-device testing) |
| 14 | [Screen: Task Map](14-screen-task-map.md) | B | Implemented (automated checks pass, pending on-device testing; the temporary task switcher has been retired; includes the empty-card model ring and recent models) |
| 15 | [Screen: System Menu](15-screen-system-menu.md) | B | Implemented (automated checks pass, pending on-device testing) |
| 16 | [Voice Input Protocol and Implementation](16-voice-input.md) | B | Partially implemented (protocol layer + Doubao adapter + long-press-Y dictation + settings page; automated checks pass, pending on-device testing; offline fallback not done) |
| 17 | [Screen: Text Edit](17-screen-text-edit.md) | B | Implemented (no undo; includes single-sentence keyboard editing and the on-screen keyboard; automated checks pass, pending on-device testing) |
| 18 | [Motion and Visual System](18-motion-and-visual.md) | B | Partially implemented (theme system + task-map card motion; reduced-motion / power-save modes not done) |
| 19 | [Packaging, Native Helpers, and Device Integration](19-packaging-and-native.md) | B | Partially implemented (release basics + manual / GitHub-Release auto-update; auto-start / Steam Input / exit confirmation / native processes not done; pending install verification) |
| 20 | [Internationalization (i18n)](20-i18n.md) | B | Implemented (English and Chinese copy cover the renderer UI, switchable in the system menu; engine diagnostics copy pending) |
| 21 | [Screen: Session Info](21-screen-session-info.md) | B | Implemented (automated checks pass; per-session directory across the project list and the real server's variant / directory behavior pending on-device testing) |

**Execution order**: 00 → 01 → 02 → 03 → 04 must be strictly serial. Once 04 passes, Stage B begins and development switches to "request changes from the Agent inside the app". The suggested Stage B order is 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21; spec 16's protocol part can run in parallel with 10/11.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Electron 44 + electron-vite 5, TypeScript |
| UI | React 19; component library **Base UI** (unstyled, used only through the `ui/` wrapper); styling **Tailwind CSS 4** (semantic tokens declared in `@theme`, theme values kept in separate files under `theme/` for easy whole-theme replacement); animation with Motion plus CSS transitions |
| State | zustand |
| Focus & input | a custom focus tree (inspired by Steam `Focusable`) + ActionMap; gamepad via the Gamepad API |
| Agent engine | OpenCode server 1.18.34 (v1); the `AgentEngine` abstraction and capability declarations leave room for other backends |
| Voice | protocol-first, swappable providers; first implementation is Volcano Engine Doubao (Seed-ASR streaming); Win+H is still usable during bootstrap |
| Testing | Vitest, Playwright (`_electron`), engine contract tests |

## Structure of each spec

- **Goal**: what's different in the world once it's done.
- **Scope**: in / out.
- **Dependencies**: prerequisite specs.
- **Design**: constraints and suggested approach. Items marked "must" in Stage A must not be deviated from; a deviation requires editing the spec first and explaining why.
- **Acceptance criteria**: in Stage A, each item gives a verification method (command or manual step).
- **Open inputs**: questions the user must decide, numbered `P-xx`, summarized below.
- **Notes for the implementing Agent**.

## General rules for implementing agents

1. **Verify first, then code.** Third-party APIs named in a spec (OpenCode SDK, Electron, electron-vite, etc.) are governed by the **actual type definitions and docs of the locked version**. Method names in a spec only convey intent; where they differ from reality, reality wins — record the difference in the PR or commit description.
2. **Version pinning.** Use exact versions (no `^` / `~`); upgrade in a separate commit.
3. **Windows first.** All scripts must run in Windows 11 PowerShell 7. Don't rely on bash-specific syntax; write cross-platform scripts in Node. Always use `path.join`, never hardcode `/`.
4. **Definition of done.** `npm run typecheck`, `npm run lint`, and `npm test` all pass, and every acceptance criterion of the current spec is met.
5. **Don't expand scope on your own.** If a spec has a gap, note it in that spec's implementation notes at the end; don't implement the next spec along the way.
6. **Keep comments minimal.** If a method name says it, don't write a comment.
7. Code, comments, and commit messages are in English; the full specs are Chinese (with English summaries in this directory).

## Terminology

| Term | Meaning |
|---|---|
| Task | an AI session, corresponding to one OpenCode session |
| Open task | a task shown on the task map, maintained by the app; a subset of all OpenCode sessions |
| History task | a session that exists in OpenCode but is not open on the task map |
| Current work | the screen (main view) of the task currently shown fullscreen |
| Focused | the node currently selected in the focus tree, with visual highlight |
| Activated | a node has entered its internal interaction mode, e.g. a text field has a caret. While activated, direction keys act inside the node |
| Short / long press | defaults to a 400 ms threshold (configurable), see spec 10 |
| Engine / backend | abstraction of the agent backend. v1 has only OpenCode. To allow other backends later (e.g. DeepSeek Harness), three rules apply from day one: backend differences are expressed only through `capabilities`; sessions are always referenced as `SessionRef = { engineId, sessionId }`; models are set per session. See spec 02 §9 |

## Default key map

| Context | Key | Action |
|---|---|---|
| Global | Start | Open / close the system menu |
| Global | Back | Open / close the task map |
| Global | Long-press Y | Voice dictation, inserted at the active caret. Does nothing when focus isn't on an input (P-05), see spec 16 |
| Global · keyboard | `Ctrl+D` | Dictation toggle (keyboards have no long-press); `Esc` cancels while dictating |
| Global · keyboard | `Esc` / `Tab` | Open / close the system menu / task map (inactive inside text fields; rebindable) |
| Current work · input focused | A | Activate the input |
| Current work · input active | A | Send |
| Current work · input active | B | Leave the active state |
| Current work · input active | X | Delete one character backward |
| Current work · input active | LB | List input |
| Current work · input active | RB | Enter text edit |
| Current work · permission card | A / X / B | Allow once / Always allow / Deny (default keys, pending P-13; backends without "always allow" have no X) |
| Current work · question card | Up / Down / A / B | Select option / confirm (toggle when multi-select) / ignore (pending P-13) |
| Task map | Left / Right | Switch the selected card |
| Task map | A | Switch to that task and return to current work |
| Task map | Short B | Leave the task map (P-03) |
| Task map | Long-press B | Close the selected task (with confirmation). Only removes it from the map; the session is kept as a history task (P-04) |
| Task map | Y | New empty task card |
| Task map · empty card | X | Expand the history list ("open recent task") |
| Task map · empty card | A | Create a new task and switch to it |
| Task map · empty card | Long-press LB | Open the model ring, rotate the stick to choose a model, release LB to apply (see 14) |
| Text edit | Direction keys / both sticks | Move focus between sentences (geometric navigation) |
| Text edit | X | Delete one character before the caret (same as the input) |
| Text edit | Long-press Y | Dictation, inserted after the focused sentence (P-07) |
| Text edit | B | Save and return: exit and confirm the changes (P-07) |
| Text edit | RB | Bring up the Windows on-screen keyboard (touch fallback) |

> On newer controllers, Xbox "Back" and "Start" are called View (⧉) and Menu (≡); in the Gamepad API standard mapping they are `buttons[8]` and `buttons[9]`. This document calls them **Back** and **Start**.

## Conventions at a glance

### Environment variables

| Variable | Purpose | Defined in |
|---|---|---|
| `HANDHELD_PROFILE` | profile name. Dev defaults to `dev`, the built app to `default` | 01 |
| `HANDHELD_WINDOW` | `windowed` / `fullscreen`. Dev defaults to `windowed`, the built app to `fullscreen` | 01 |
| `HANDHELD_ENGINE_MODE` | `attached` / `detached` / `external` / `fake`. Dev defaults to `detached`, the built app to `attached` | 02, 03 |
| `HANDHELD_WORKSPACE` | workspace directory | 02 |
| `HANDHELD_OPENCODE_BIN` / `HANDHELD_OPENCODE_ALLOW_PATH` | specify the OpenCode binary / allow the `opencode` on PATH | 02 |
| `HANDHELD_OPENCODE_URL` / `HANDHELD_OPENCODE_PASSWORD` | connection info for `external` mode | 02 |
| `HANDHELD_OPENCODE_CONFIG_CONTENT` | `OPENCODE_CONFIG_CONTENT` passed to the server | 02 |
| `HANDHELD_FAKE_CAPABILITIES` | disable some Fake-engine capabilities to test UI degradation | 03 |
| `HANDHELD_STABLE_DIR` | override the stable worktree directory (default `<sibling of main repo>/<main repo name>-stable`) | 04 |

### Dev / debug shortcuts (keyboard)

| Shortcut | Action | Defined in |
|---|---|---|
| `F11` / `Ctrl+Shift+I` / `Ctrl+R` | toggle fullscreen / DevTools / reload | 01 |
| `Ctrl+Shift+G` / `Ctrl+Shift+M` | gamepad debug / microphone debug | 01 |
| `Ctrl+Shift+E` | engine debug | 02 |
| `Ctrl+Shift+V` | voice debug (provider, API key, live transcription) | 16 |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | font zoom | 03 |
| `Ctrl+Shift+F` | overlay the focus tree | 11 |

### settings.json fields

| Field | Meaning | Defined in |
|---|---|---|
| `schemaVersion`, `window.mode` | version, window mode | 01 |
| `engine.workspaceDir` | workspace directory | 02 |
| `ui.lastSession` (`SessionRef`), `ui.zoom`, `ui.scrollSpeed`, `ui.theme` | last opened task, font zoom, stick scroll speed, theme (`system` / `dark` / `light`) | 03, 10, 18 |
| `ui.language` | UI language (`system` / `en` / `zh`) | 20 |
| `input` | user key bindings (the user layer of the ActionMap) | 10 |
| `tasks.open` (`SessionRef[]`), `tasks.unread` (`SessionRef[]`) | tasks open on the map (by creation time) and tasks showing a red dot | 14 |
| `hints = { enabled, delayMs }` | action hints on/off and wait time | 12, 15 |
| `model.default` | default model for new tasks | 15 |
| `model.recent` | recently used models (`{ model, slot, name? }[]`, most recent first; `slot` is the model-ring slot) | 14 |
| `speech` (`provider` / `language` / `doubao.{...}` / `funasr.{...}` / `openai.{...}`) | speech provider, language, and per-provider params; default provider is `none` | 16 |

Speech API keys are not in `settings.json`: they are encrypted with Electron `safeStorage` into a profile-private `speech-credentials.json` (spec 16).

Settings files are per-profile (under each `userData`). The only cross-profile state is spec 02's server registry and the "session → model" table.

Default workspace directory: the repo root in dev mode (bootstrap); the OS Documents folder for the built app (Windows `%USERPROFILE%\Documents`, matching OpenCode). Explicit config (`settings.engine.workspaceDir` / `HANDHELD_WORKSPACE`) wins. See spec 02 §4 and spec 19.

## Open inputs

### Decided (P-01 … P-12, P-22, P-23)

| ID | Question | Decision | Landed in |
|---|---|---|---|
| P-01 | Keep "weapon-swap" quick model switching? | No. Switching models is low-frequency; "weapon swap" was just a game-ified concept | 10, 13, 15. Models are set only in the system menu; the API still sets models per session (02) |
| P-02 | How are agent permission requests and questions shown, and which keys answer them? | Similar to ordinary action hints; can even focus the question directly, reusing action hints | 12, 13, 10. The minimal implementation (card + buttons) from 03 stays |
| P-03 | How to leave the task map without selecting a task? | Long-press B closes the card; short B leaves the map. Keyboards can bind long B and short B to different keys | 10, 14 |
| P-04 | Does "delete" on the task map also delete the OpenCode session? | Only closes it on the map; the session is kept as a history task | 14 |
| P-05 | Behavior of long-press Y when no input is active | Does nothing | 16 |
| P-06 | Voice provider choice | Leave it open in the SDD, only fix the interface; the user picks after MVP. During MVP use the built-in system dictation. **2026-10-07 update: implement Volcano Engine Doubao (Seed-ASR streaming) first, and only this one; the interface stays swappable** | 16, 15, 17 |
| P-07 | Where does dictation insert in text edit, and how do you exit? | Insert after the focused sentence, with a blinking caret at the sentence end; exiting confirms the changes by default | 17 |
| P-08 | Visual style | Follow the UI library's default style; keep the visual theme decoupled so the whole theme can be swapped after MVP | 01, 14, 18 |
| P-09 | Action-hint wait time | Same for all components; the wait time and on/off are configurable in settings | 12, 15 |
| P-10 | Support remote OpenCode servers? | Local only | 02, 15 |
| P-11 | Do tasks keep running when the app exits? | They end together | 02, 04, 19 |
| P-12 | Source of list-input entries | MVP supports default commands only. Different backends have different commands; each backend keeps its own list | 12, 02 |
| P-22 | How is a session's working directory handled? | Per-session directory (OpenCode `directory` param); editable on a new task and before the first message, then locked | 21, 02 |
| P-23 | How far does model effort go? | Editable: read the choices from the model `variants` and pass the selection as a variant on subsequent prompts | 21 |

### Open (non-blocking; the Agent proposes an option and the user confirms when implementing the relevant Stage B spec)

The defaults below are the suggestions in each spec, not decided items.

| ID | Question | Affected specs |
|---|---|---|
| P-13 | Default keys for the permission / question cards (suggested: A allow once, X always allow, B deny) and the question-card interaction details (how a multi-select submits) | 10, 13 |
| P-14 | Keys to scroll the conversation and abort the Agent (suggested: right stick / D-pad to scroll; long-press LB to abort) | 10, 13 |
| P-15 | Whether the left stick also moves the caret while the input is active; which elements in the message list are focusable | 11 |
| P-16 | Task map: whether to auto-open the most recent task on first run; which card to switch to after closing the current one | 14 |
| P-17 | Text edit: the undo key for deleting a sentence; whether there are entry points other than the input | 17 |
| P-18 | How many characters to keep when a user message is sticky-collapsed (suggested: determined by the longest screen width) | 13 |
| P-19 | Device integration: auto-update, launch at startup, Steam Input template, whether to confirm quitting with tasks in progress | 19 |
| P-20 | Whether to configure model-provider and speech-provider credentials inside the app (currently relies on `opencode auth login` and main-process settings) | 15, 16 |
| P-21 | Optional enhancements: LLM polish of voice results, PixiJS / Rive background layers | 16, 18 |

## Key differences from the tech research

The product doc is authoritative. The following ideas from the research were superseded:

| Item | Research idea | Product doc (adopted) |
|---|---|---|
| Model switching | LB / RB swap models like weapons | **No quick switching** (P-01). Models are a low-frequency need, set only in "System menu › Model management"; "weapon swap" was just a game-ified analogy. LB / RB have other uses |
| Voice input | Hold RT to talk | **Long-press Y**, inserting live at the active caret |
| LB | Previous model | While the input is active: **list input** (e.g. `/clear`) |
| RB | Next model | While the input is active: enter **text edit** |
| Task map | View key, 3×2 grid | **Back (= View) key**, a horizontal carousel of 3 or 5 cards, the middle one enlarged |
| System menu | Menu key, key overlay | **Start (= Menu) key**, a two-column settings screen |
| Y | Quick-action wheel | Global: long-press to talk; on the task map: new task card |
| Permission requests | A allow / B deny / X always, QTE-style | Same keys, but presented by reusing **action hints** (P-02): the card auto-focuses and shows the available keys beside it, see spec 13 |
