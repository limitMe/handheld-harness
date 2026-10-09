# 14 · Screen: Task Map

> **English summary.** The full spec is in Chinese: [`docs/zh-CN/specs/14-screen-task-map.md`](../zh-CN/specs/14-screen-task-map.md).

**Status:** Implemented

The task map, opened with Back, browses "open tasks" as a horizontal card strip and lets the user switch, create and close tasks and reopen history; it replaces the temporary task switcher from spec 03. The open list is an ordered list of `SessionRef`s persisted to `settings.tasks.open` and sorted by creation time, history is the set of base sessions not in that list, and an unread red-dot state machine watches tasks that were left while busy, flags them once they go idle, and clears the flag when the user switches back.

A row shows three or five cards with the middle one larger and selected; cards carry status through borders and use the `card`/`on-card` tokens, and the map opens on the currently active task. Default gamepad bindings switch selection with left/right, open a task with A, exit with a short B, close the selected task with a long B after a confirmation, add an empty card with Y, and open history with X while an empty card is selected; unused empty cards are removed on exit. Closing only removes a task from the map and never deletes the base session. Task cards focus and activate so action hints appear, while empty cards only focus. A model-ring overlay opened with a long-press of LB on an empty card lets the stick angle point at one of six sectors and adopts that model on release, writing `settings.model.default` and the per-engine recency list. Verification covers pure helpers (task cards, model recents, ring geometry), the red-dot state machine, confirm-dialog focus, and a full e2e gamepad walkthrough; the white-on-black card styling is deferred to the spec 18 theme.
