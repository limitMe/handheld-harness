import { HOLD_SUFFIX, type ActionId } from '@shared/actions'
import type { ActionMap } from '@shared/input'
import type { InputActionEvent } from './types'

export type ActionHandler = (event: InputActionEvent) => void
export type ActionHandlers = Partial<Record<ActionId, ActionHandler>>

/**
 * Wraps a handler so it ignores the `end` phase: momentary actions run once on
 * press, repeatable ones still fire on `repeat`. Without this, releasing a
 * button would re-trigger `nav.activate` and friends.
 */
export function onPress(handler: ActionHandler): ActionHandler {
  return (event) => {
    if (event.phase === 'end') return
    handler(event)
  }
}

export interface DispatchRecord {
  event: InputActionEvent
  handled: boolean
  contextId?: string
}

interface ContextNode {
  id: string
  getHandlers: () => ActionHandlers
  order: number
  seq: number
}

export const GLOBAL_CONTEXT = 'global'

/**
 * Stack layers, from the bottom up. Higher orders are consulted first, so an
 * activated component or a modal can shadow the screen beneath it.
 */
export const CONTEXT_ORDER = {
  focus: -100,
  screen: 0,
  activated: 100,
  overlay: 150,
  modal: 200,
} as const

/**
 * Holds the context stack and routes normalized actions to handlers. Contexts
 * are consulted from the top down; the first one that handles an action stops
 * propagation. Bindings are also resolved from the stack, so a screen's action
 * map only applies while its context is on the stack.
 */
export class InputRouter {
  private map: ActionMap
  private nodes: ContextNode[] = []
  private nextSeq = 0
  private dispatchListeners = new Set<(record: DispatchRecord) => void>()
  private contextListeners = new Set<(ids: string[]) => void>()
  private mapListeners = new Set<(map: ActionMap) => void>()

  constructor(map: ActionMap) {
    this.map = map
  }

  getMap(): ActionMap {
    return this.map
  }

  setMap(map: ActionMap): void {
    this.map = map
    for (const listener of this.mapListeners) listener(map)
  }

  subscribeMap(listener: (map: ActionMap) => void): () => void {
    this.mapListeners.add(listener)
    listener(this.map)
    return () => {
      this.mapListeners.delete(listener)
    }
  }

  /** Pushes a context; the returned function pops it (idempotent). */
  pushContext(id: string, getHandlers: () => ActionHandlers, order = 0): () => void {
    const node: ContextNode = { id, getHandlers, order, seq: this.nextSeq++ }
    this.nodes.push(node)
    this.emitContexts()
    return () => {
      const index = this.nodes.indexOf(node)
      if (index < 0) return
      this.nodes.splice(index, 1)
      this.emitContexts()
    }
  }

  /** Nodes sorted bottom-up; the last entry is the top of the stack. */
  private ordered(): ContextNode[] {
    return [...this.nodes].sort((a, b) => a.order - b.order || a.seq - b.seq)
  }

  /** Unique context ids from the top of the stack down, always ending with `global`. */
  contextIds(): string[] {
    const ordered = this.ordered()
    const ids: string[] = []
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const node = ordered[index]
      if (node && !ids.includes(node.id)) ids.push(node.id)
    }
    if (!ids.includes(GLOBAL_CONTEXT)) ids.push(GLOBAL_CONTEXT)
    return ids
  }

  resolveGamepad(control: string, phase: 'press' | 'hold'): ActionId | undefined {
    const key = phase === 'hold' ? `${control}${HOLD_SUFFIX}` : control
    for (const id of this.contextIds()) {
      const binding = this.map.contexts[id]?.[key]
      if (binding) return binding
    }
    return undefined
  }

  resolveKeyboard(combo: string, editable: boolean): ActionId | undefined {
    // While a text field is active only `global` combos may be intercepted.
    const ids = editable ? [GLOBAL_CONTEXT] : this.contextIds()
    for (const id of ids) {
      const binding = this.map.keyboard[id]?.[combo]
      if (binding) return binding
    }
    return undefined
  }

  dispatch(event: InputActionEvent): boolean {
    const ordered = this.ordered()
    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const node = ordered[index]
      if (!node) continue
      const handler = node.getHandlers()[event.action]
      if (!handler) continue
      handler(event)
      this.emitDispatch({ event, handled: true, contextId: node.id })
      return true
    }
    this.emitDispatch({ event, handled: false })
    return false
  }

  subscribe(listener: (record: DispatchRecord) => void): () => void {
    this.dispatchListeners.add(listener)
    return () => {
      this.dispatchListeners.delete(listener)
    }
  }

  subscribeContexts(listener: (ids: string[]) => void): () => void {
    this.contextListeners.add(listener)
    listener(this.contextIds())
    return () => {
      this.contextListeners.delete(listener)
    }
  }

  private emitDispatch(record: DispatchRecord): void {
    for (const listener of this.dispatchListeners) listener(record)
  }

  private emitContexts(): void {
    const ids = this.contextIds()
    for (const listener of this.contextListeners) listener(ids)
  }
}
