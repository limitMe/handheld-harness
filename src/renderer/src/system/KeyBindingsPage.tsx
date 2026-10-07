import { useCallback, useEffect, useRef, useState } from 'react'
import {
  actionLabel,
  splitControlKey,
  type ActionId,
  type ControlPhase,
} from '@shared/actions'
import {
  bindingTable,
  contextLabel,
  formatBindingKey,
  listContexts,
  listBindings,
  rebindConflict,
  rebindRows,
  type ConflictResolution,
  type MenuDevice,
} from '@shared/bindings'
import type { ActionMap } from '@shared/input'
import type { Settings, SettingsPatch } from '@shared/ipc'
import { useFocusTree } from '../focus'
import { useInputApi, type CapturedControl } from '../input'
import { ChoiceDialog, ConfirmDialog } from '../ui'
import { MenuGroupLabel, MenuRow } from './MenuRow'

const HOLD_CANCEL_MS = 2000
/** Sibling-order stride between context groups, so each group's reset stays last. */
const GROUP_STRIDE = 100

export interface KeyBindingsPageProps {
  map: ActionMap
  settings: Settings
  update: (patch: SettingsPatch) => Promise<void>
}

interface CaptureState {
  context: string
  action: ActionId
  device: MenuDevice
  oldKey: string | undefined
  phase: ControlPhase
}

interface ConflictState {
  context: string
  action: ActionId
  device: MenuDevice
  oldKey: string | undefined
  newKey: string
  other: ActionId
}

/** Resolves with the next control for `device`; Start-hold or Escape cancels. */
async function captureForDevice(
  api: ReturnType<typeof useInputApi>,
  device: MenuDevice,
  onHold: (holding: boolean) => void,
): Promise<CapturedControl | 'cancelled'> {
  for (;;) {
    const captured = await api.captureNextControl()
    if (captured.source !== device) continue
    if (captured.source === 'keyboard' && captured.control === 'Escape') return 'cancelled'
    if (captured.source === 'gamepad' && captured.control === 'Start') {
      onHold(true)
      const held = await waitForHold(api, HOLD_CANCEL_MS)
      onHold(false)
      if (held) return 'cancelled'
      continue
    }
    return captured
  }
}

function waitForHold(api: ReturnType<typeof useInputApi>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (held: boolean): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      off()
      resolve(held)
    }
    const off = api.subscribeControls((change) => {
      if (change.source === 'gamepad' && change.control === 'Start' && !change.pressed) {
        finish(false)
      }
    })
    const timer = window.setTimeout(() => finish(true), ms)
  })
}

function buildKey(control: string, phase: ControlPhase, device: MenuDevice): string {
  if (device === 'keyboard') return control
  return phase === 'hold' ? `${control}:hold` : control
}

/**
 * Key-binding page (spec 15). Groups the effective ActionMap by context; A on a
 * row captures the next control for that device. Conflicts ask swap / overwrite.
 */
export function KeyBindingsPage({ map, settings, update }: KeyBindingsPageProps) {
  const tree = useFocusTree()
  const api = useInputApi()
  const [device, setDevice] = useState<MenuDevice>('gamepad')
  const [capture, setCapture] = useState<CaptureState | null>(null)
  const [holding, setHolding] = useState(false)
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [resetTarget, setResetTarget] = useState<string | 'all' | null>(null)

  const mapRef = useRef(map)
  const tokenRef = useRef(0)

  useEffect(() => {
    mapRef.current = map
  }, [map])

  // A pending capture must not swallow a control after the page closes.
  useEffect(
    () => () => {
      tokenRef.current += 1
      api.cancelCapture()
    },
    [api],
  )

  const applyRows = useCallback(
    async (context: string, target: MenuDevice, rows: Record<string, ActionId | null>) => {
      const patch: SettingsPatch =
        target === 'gamepad'
          ? { input: { contexts: { [context]: rows } } }
          : { input: { keyboard: { [context]: rows } } }
      await update(patch)
    },
    [update],
  )

  const beginCapture = useCallback(
    async (context: string, action: ActionId, oldKey: string | undefined) => {
      const phase: ControlPhase = oldKey ? splitControlKey(oldKey).phase : 'press'
      const token = ++tokenRef.current
      setCapture({ context, action, device, oldKey, phase })
      const captured = await captureForDevice(api, device, setHolding)
      if (tokenRef.current !== token) return
      setCapture(null)
      setHolding(false)
      if (captured === 'cancelled') return
      const newKey = buildKey(captured.control, phase, device)
      if (newKey === oldKey) return
      const table = bindingTable(mapRef.current, device)[context]
      const other = rebindConflict(table, action, newKey)
      if (other) {
        setConflict({ context, action, device, oldKey, newKey, other })
        return
      }
      await applyRows(context, device, rebindRows(table, action, oldKey, newKey))
    },
    [api, device, applyRows],
  )

  const resolveConflict = useCallback(
    async (resolution: ConflictResolution) => {
      const pending = conflict
      if (!pending) return
      setConflict(null)
      const table = bindingTable(mapRef.current, pending.device)[pending.context]
      await applyRows(
        pending.context,
        pending.device,
        rebindRows(table, pending.action, pending.oldKey, pending.newKey, resolution),
      )
    },
    [conflict, applyRows],
  )

  const confirmReset = useCallback(async () => {
    const target = resetTarget
    setResetTarget(null)
    if (!target) return
    if (target === 'all') {
      await update({
        input: {
          resetContexts: Object.keys(settings.input.contexts),
          resetKeyboard: Object.keys(settings.input.keyboard),
        },
      })
    } else if (device === 'gamepad') {
      await update({ input: { resetContexts: [target] } })
    } else {
      await update({ input: { resetKeyboard: [target] } })
    }
  }, [resetTarget, device, settings, update])

  const contexts = listContexts(map, device)
  const groupPrefix = `system-menu.keys.${device}`

  const selectDevice = (next: MenuDevice): void => {
    setDevice(next)
    // Keep the panel entry stable so the next direction press has somewhere to go.
    window.requestAnimationFrame(() => tree?.setFocus('system-menu.first'))
  }

  return (
    <div data-testid="key-bindings">
      <MenuRow
        id="system-menu.first"
        order={0}
        selected={device === 'gamepad'}
        testId="keys-device-gamepad"
        onActivate={() => selectDevice('gamepad')}
        onClick={() => selectDevice('gamepad')}
      >
        <span>Gamepad bindings</span>
      </MenuRow>
      <MenuRow
        id="system-menu.keys.device.keyboard"
        order={1}
        selected={device === 'keyboard'}
        testId="keys-device-keyboard"
        onActivate={() => selectDevice('keyboard')}
        onClick={() => selectDevice('keyboard')}
      >
        <span>Keyboard bindings</span>
      </MenuRow>

      {capture ? (
        <div
          data-testid="capture-banner"
          className="mt-4 rounded-md border border-accent bg-card px-3 py-2 text-base text-on-card"
        >
          <p className="font-medium">
            Press a new {device === 'gamepad' ? 'button' : 'key'} for{' '}
            {actionLabel(capture.action)}…
          </p>
          <p className="text-code text-text-muted">
            {holding ? 'Keep holding Start to cancel…' : 'Hold Start for 2 seconds to cancel.'}
          </p>
        </div>
      ) : null}

      {contexts.length === 0 ? (
        <p className="px-3 py-4 text-text-muted">No bindings for this device.</p>
      ) : (
        contexts.map((context, groupIndex) => (
          <div key={context}>
            <MenuGroupLabel>{contextLabel(context)}</MenuGroupLabel>
            {listBindings(map, device, context).map((row, rowIndex) => (
              <MenuRow
                key={`${context}:${row.action}:${row.key}`}
                id={`${groupPrefix}.${context}.${row.action}`}
                order={100 + groupIndex * GROUP_STRIDE + rowIndex}
                testId={`binding-${context}-${row.action}`}
                onActivate={() => void beginCapture(context, row.action, row.key)}
                onClick={() => void beginCapture(context, row.action, row.key)}
              >
                <span>{actionLabel(row.action)}</span>
                <span
                  data-testid={`binding-key-${context}-${row.action}`}
                  className="text-code text-text-muted"
                >
                  {formatBindingKey(row.key, device)}
                </span>
              </MenuRow>
            ))}
            <MenuRow
              id={`${groupPrefix}.${context}.reset`}
              order={100 + groupIndex * GROUP_STRIDE + GROUP_STRIDE - 1}
              testId={`binding-reset-${context}`}
              onActivate={() => setResetTarget(context)}
              onClick={() => setResetTarget(context)}
            >
              <span className="text-text-muted">Reset {contextLabel(context)}</span>
            </MenuRow>
          </div>
        ))
      )}

      <div className="pt-4">
        <MenuRow
          id={`${groupPrefix}.reset-all`}
          order={100 + contexts.length * GROUP_STRIDE + GROUP_STRIDE - 1}
          testId="binding-reset-all"
          onActivate={() => setResetTarget('all')}
          onClick={() => setResetTarget('all')}
        >
          <span className="text-text-muted">Restore all bindings</span>
        </MenuRow>
      </div>

      <ChoiceDialog
        open={conflict !== null}
        onOpenChange={(next) => {
          if (!next) setConflict(null)
        }}
        title="Key already in use"
        description={
          conflict
            ? `${formatBindingKey(conflict.newKey, conflict.device)} is bound to ${actionLabel(conflict.other)}.`
            : undefined
        }
        initialId="swap"
        options={[
          { id: 'swap', label: 'Swap', description: 'The other action takes the old key.' },
          { id: 'overwrite', label: 'Overwrite', description: 'The other action becomes unbound.' },
          { id: 'cancel', label: 'Cancel', destructive: true },
        ]}
        onChoose={(id) => {
          if (id === 'swap' || id === 'overwrite') void resolveConflict(id)
        }}
      />

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(next) => {
          if (!next) setResetTarget(null)
        }}
        title="Restore default bindings"
        description={
          resetTarget === 'all'
            ? 'Discards every custom binding for both devices.'
            : `Discards custom bindings for ${contextLabel(resetTarget ?? '')}.`
        }
        confirmLabel="Restore"
        initialFocus="confirm"
        onConfirm={() => void confirmReset()}
      />
    </div>
  )
}
