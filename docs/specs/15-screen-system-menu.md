# 15 · Screen: System Menu

> **English summary.** The full spec is in Chinese: [`docs/zh-CN/specs/15-screen-system-menu.md`](../zh-CN/specs/15-screen-system-menu.md).

**Status:** Implemented

Opened with Start, the system menu is a two-column settings screen with categories on the left and their settings on the right, navigated entirely by gamepad. Changes take effect immediately and are auto-saved, and only irreversible actions require a confirmation step.

The categories are key bindings (gamepad and keyboard tabs, actions grouped by context, A to capture a new control, hold Start for two seconds to cancel, a conflict dialog offering swap/overwrite/cancel, and restore-default), model management (lists `engine.listModels()` and sets `settings.model.default`, with per-task switching and in-app provider credentials left out of scope for v1), voice input (a reserved page pending provider selection), display and hints (zoom, reduce motion, and the enabled/delay settings for action hints), about/diagnostics (versions, engine status, workspace, open log directory, and debug-page entries), and a later-added quit-app entry with a confirmation. The implementation deliberately does not use Base UI's Tabs/Switch/Slider, letting the focus tree own directional and A/B input to avoid double handling, and it renders the model list as a two-level provider-then-model list so tens of thousands of models cannot stall the renderer. Verification includes unit tests for the binding tables and menu navigation plus an e2e gamepad session that rebinds Send from A to X and then resets it. The model page only lists authenticated providers and shows a base-supplied setup command when none are connected.
