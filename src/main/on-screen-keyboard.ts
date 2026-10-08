import { spawn } from 'node:child_process'

const OSK_COMMAND = 'osk.exe'

export interface OnScreenKeyboardDeps {
  platform: NodeJS.Platform
  launch(command: string): void
}

function launchDetached(command: string): void {
  try {
    spawn(command, [], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // Showing the keyboard is best-effort; the OS may legitimately refuse.
  }
}

function defaultDeps(): OnScreenKeyboardDeps {
  return { platform: process.platform, launch: launchDetached }
}

/**
 * Shows the Windows on-screen keyboard (spec 17, touch fallback). Desktop apps
 * have no public API for this, and the modern touch keyboard (TabTip) is a
 * resident single-instance process that cannot be surfaced by launching it, so
 * we use the classic `osk.exe`: a normal top-level window that injects keys into
 * the focused control. The renderer focuses a hidden editable field first so the
 * keystrokes have a destination and the caret stays put.
 */
export function showOnScreenKeyboard(deps: OnScreenKeyboardDeps = defaultDeps()): void {
  if (deps.platform !== 'win32') return
  deps.launch(OSK_COMMAND)
}
