interface HapticActuator {
  playEffect?(type: string, params: Record<string, number>): Promise<string>
}

/** A short rumble on release, when the gamepad supports it (spec 16). Best-effort. */
export function pulseGamepad(): void {
  try {
    const pads = navigator.getGamepads?.()
    if (!pads) return
    const pad = Array.from(pads).find((entry): entry is Gamepad => entry !== null)
    const actuator = (pad as (Gamepad & { vibrationActuator?: HapticActuator }) | undefined)
      ?.vibrationActuator
    void actuator?.playEffect?.('dual-rumble', {
      duration: 120,
      strongMagnitude: 0.4,
      weakMagnitude: 0.4,
    })
  } catch {
    // Haptics are optional; never let them break dictation.
  }
}
