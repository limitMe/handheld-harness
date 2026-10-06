import { HOLD_SUFFIX, type ActionId } from '@shared/actions'
import type { ActionMap } from '@shared/input'
import type { InputActionEvent } from './types'

export type ActionHandler = (event: InputActionEvent) => void
export type ActionHandlers = Partial<Record<ActionId, ActionHandler>>

export interface DispatchRecord {
  event: InputActionEvent
  handled: boolean
  contextId?: string
}

interface ContextNode {
  id: string
  getHandlers: () => ActionHandlers
}

export const GLOBAL_CONTEXT = 'global'

/**
 * Holds the context stack and routes normalized actions to handlers. Contexts
 * are consulted from the top down; the first one that handles an action stops
 * propagation. Bindings are also resolved from the stack, so a screen's action
 * map only applies while its context is on the stack.
 */
export class InputRouter {
  private map: ActionMap
  private nodes: ContextNode[] = []
  private dispatchListeners = new Set<(record: DispatchRecord) => void>()
  private contextListeners = new Set<(ids: string[]) => void>()

  constructor(map: ActionMap) {
    this.map = map
  }

  setMap(map: ActionMap): void {
    this.map = map
  }

  /** Pushes a context; the returned function pops it (idempotent). */
  pushContext(id: string, getHandlers: () => ActionHandlers): () => void {
    const node: ContextNode = { id, getHandlers }
    this.nodes.push(node)
    this.emitContexts()
    return () => {
      const index = this.nodes.indexOf(node)
      if (index < 0) return
      this.nodes.splice(index, 1)
      this.emitContexts()
    }
  }

  /** Unique context ids from the top of the stack down, always ending with `global`. */
  contextIds(): string[] {
    const ids: string[] = []
    for (let index = this.nodes.length - 1; index >= 0; index -= 1) {
      const node = this.nodes[index]
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
    for (let index = this.nodes.length - 1; index >= 0; index -= 1) {
      const node = this.nodes[index]
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
