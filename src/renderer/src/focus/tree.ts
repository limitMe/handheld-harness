import type {
  FocusDirection,
  FocusFlow,
  FocusNodeDebug,
  FocusNodeInit,
  FocusRect,
  FocusableState,
  NavigateResult,
} from './types'

interface FocusNode {
  id: string
  parentId: string | null
  order: number
  container: boolean
  flow: FocusFlow
  memory: boolean
  scope: boolean
  activatable: boolean
  disabled: boolean
  seq: number
  getRect?: () => FocusRect | null
  getElement?: () => HTMLElement | null
  onActivate?: () => void
  onDeactivate?: () => void
  onNavigate?: (direction: FocusDirection) => NavigateResult | void
  onFocus?: () => void
  onBlur?: () => void
  onCancel?: () => void
  childIds: string[]
  lastFocusedChildId?: string
}

function centerOf(rect: FocusRect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function inDirection(direction: FocusDirection, dx: number, dy: number): boolean {
  switch (direction) {
    case 'left':
      return dx < 0
    case 'right':
      return dx > 0
    case 'up':
      return dy < 0
    case 'down':
      return dy > 0
  }
}

/**
 * The focus engine (spec 11). Pure TypeScript: it stores the node tree, the
 * focused/activated ids and modal scopes, and never touches React. React
 * registers nodes and subscribes to redraw.
 *
 * Navigation first searches the current container by its flow rule, then walks
 * up to parent containers, so nested groups behave like Steam's Focusable.
 */
export class FocusTree {
  private readonly nodes = new Map<string, FocusNode>()
  private readonly listeners = new Set<() => void>()
  private readonly scopeStack: string[] = []
  private readonly scopeFocus: Array<string | null> = []
  private focusedId: string | null = null
  private activatedId: string | null = null
  private nextSeq = 0

  /** Registers a node; the returned function unregisters it (idempotent). */
  register(init: FocusNodeInit): () => void {
    const existing = this.nodes.get(init.id)
    if (existing) {
      this.updateNode(existing, init)
      this.ensureFocus()
      this.emit()
      return () => this.unregister(init.id)
    }

    const node: FocusNode = {
      id: init.id,
      parentId: init.parentId,
      order: init.order ?? 0,
      container: init.container ?? false,
      flow: init.flow ?? 'geometric',
      memory: init.memory ?? false,
      scope: init.scope ?? false,
      activatable: init.activatable ?? false,
      disabled: init.disabled ?? false,
      seq: this.nextSeq++,
      childIds: [],
      ...(init.getRect ? { getRect: init.getRect } : {}),
      ...(init.getElement ? { getElement: init.getElement } : {}),
      ...(init.onActivate ? { onActivate: init.onActivate } : {}),
      ...(init.onDeactivate ? { onDeactivate: init.onDeactivate } : {}),
      ...(init.onNavigate ? { onNavigate: init.onNavigate } : {}),
      ...(init.onFocus ? { onFocus: init.onFocus } : {}),
      ...(init.onBlur ? { onBlur: init.onBlur } : {}),
      ...(init.onCancel ? { onCancel: init.onCancel } : {}),
    }
    this.nodes.set(init.id, node)

    if (init.parentId) {
      const parent = this.ensureContainer(init.parentId)
      this.addChild(parent, node)
    }

    this.ensureFocus()
    this.emit()
    return () => this.unregister(init.id)
  }

  unregister(id: string): void {
    const node = this.nodes.get(id)
    if (!node) return

    for (const childId of [...node.childIds]) this.unregister(childId)

    let parent: FocusNode | undefined
    let index = -1
    if (node.parentId) {
      parent = this.nodes.get(node.parentId)
      if (parent) {
        index = parent.childIds.indexOf(id)
        parent.childIds = parent.childIds.filter((childId) => childId !== id)
      }
    }

    const scopeIndex = this.scopeStack.lastIndexOf(id)
    if (scopeIndex >= 0) {
      this.scopeStack.splice(scopeIndex, 1)
      this.scopeFocus.splice(scopeIndex, 1)
    }

    for (const other of this.nodes.values()) {
      if (other.lastFocusedChildId === id) other.lastFocusedChildId = undefined
    }

    if (this.activatedId === id) {
      node.onDeactivate?.()
      this.activatedId = null
    }

    const wasFocused = this.focusedId === id
    this.nodes.delete(id)

    if (wasFocused) this.focusAfterRemoval(parent, index)
    this.emit()
  }

  /** Transfers focus to the nearest surviving neighbor after a focus node unmounts. */
  private focusAfterRemoval(parent: FocusNode | undefined, index: number): void {
    let container = parent
    let at = index
    while (container) {
      for (let i = at; i < container.childIds.length; i += 1) {
        const entry = this.resolveEntry(container.childIds[i]!)
        if (entry && this.inScope(entry)) {
          this.setFocusInternal(entry)
          return
        }
      }
      for (let i = at - 1; i >= 0; i -= 1) {
        const entry = this.resolveEntry(container.childIds[i]!)
        if (entry && this.inScope(entry)) {
          this.setFocusInternal(entry)
          return
        }
      }
      const grandparentId = container.parentId
      const grandparent = grandparentId ? this.nodes.get(grandparentId) : undefined
      if (!grandparent) break
      at = grandparent.childIds.indexOf(container.id)
      container = grandparent
    }
    this.focusedId = null
    this.ensureFocus()
  }

  getFocusedId(): string | null {
    return this.focusedId
  }

  getActivatedId(): string | null {
    return this.activatedId
  }

  getElement(id: string): HTMLElement | null {
    return this.nodes.get(id)?.getElement?.() ?? null
  }

  stateFor(id: string): FocusableState {
    return {
      focused: this.focusedId === id,
      activated: this.activatedId === id,
      focusWithin:
        this.focusedId !== null && this.focusedId !== id && this.isDescendant(this.focusedId, id),
    }
  }

  /** Moves focus to a node (resolving containers to their remembered/first child). */
  setFocus(id: string): boolean {
    const entry = this.resolveEntry(id)
    if (!entry) return false
    if (!this.inScope(entry)) return false
    if (entry === this.focusedId) return true
    if (this.activatedId && this.activatedId !== entry) this.deactivate()
    this.setFocusInternal(entry)
    this.emit()
    return true
  }

  move(direction: FocusDirection): boolean {
    if (this.activatedId) {
      const active = this.nodes.get(this.activatedId)
      const result = active?.onNavigate?.(direction)
      if (result === 'handled') return true
      if (result === 'exit') {
        this.deactivate()
        return true
      }
      this.deactivate()
    }

    let currentId = this.focusedId
    while (currentId) {
      const current = this.nodes.get(currentId)
      if (!current || !current.parentId) break
      const parent = this.nodes.get(current.parentId)
      if (!parent) break
      const next = this.findNext(parent, currentId, direction)
      if (next) {
        this.setFocus(next)
        return true
      }
      currentId = parent.id
    }
    return false
  }

  activate(id?: string): boolean {
    const target = id ?? this.focusedId
    if (!target) return false
    const node = this.nodes.get(target)
    if (!node || node.container || node.disabled) return false
    // Plain buttons are momentary; activatable nodes enter an internal mode.
    if (!node.activatable) {
      if (!node.onActivate) return false
      node.onActivate()
      this.emit()
      return true
    }
    if (this.activatedId === target) return true
    if (this.activatedId) this.deactivate()
    this.activatedId = target
    node.onActivate?.()
    this.emit()
    return true
  }

  deactivate(): boolean {
    if (!this.activatedId) return false
    const node = this.nodes.get(this.activatedId)
    this.activatedId = null
    node?.onDeactivate?.()
    this.emit()
    return true
  }

  /**
   * Back/cancel: exit activation when activated, otherwise give the focused
   * node a chance to handle it (e.g. close a modal).
   */
  cancel(): boolean {
    if (this.activatedId) return this.deactivate()
    const node = this.focusedId ? this.nodes.get(this.focusedId) : undefined
    if (!node?.onCancel) return false
    node.onCancel()
    return true
  }

  pushScope(containerId: string): void {
    this.scopeStack.push(containerId)
    this.scopeFocus.push(this.focusedId)
    const entry = this.resolveEntry(containerId)
    if (entry) {
      if (this.activatedId && this.activatedId !== entry) this.deactivate()
      this.setFocusInternal(entry)
    } else {
      this.ensureFocus()
    }
    this.emit()
  }

  popScope(): void {
    if (this.scopeStack.length === 0) return
    this.scopeStack.pop()
    const restore = this.scopeFocus.pop() ?? null
    if (restore && this.isSelectable(restore) && this.inScope(restore)) {
      if (this.activatedId && this.activatedId !== restore) this.deactivate()
      this.setFocusInternal(restore)
    } else {
      this.ensureFocus()
    }
    this.emit()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  debugNodes(): FocusNodeDebug[] {
    return [...this.nodes.values()].map((node) => ({
      id: node.id,
      parentId: node.parentId,
      container: node.container,
      flow: node.flow,
      memory: node.memory,
      scope: node.scope,
      activatable: node.activatable,
      disabled: node.disabled,
      focused: node.id === this.focusedId,
      activated: node.id === this.activatedId,
      focusWithin:
        this.focusedId !== null &&
        this.focusedId !== node.id &&
        this.isDescendant(this.focusedId, node.id),
      children: [...node.childIds],
    }))
  }

  private updateNode(node: FocusNode, init: FocusNodeInit): void {
    if (init.parentId !== node.parentId) {
      if (node.parentId) {
        const previous = this.nodes.get(node.parentId)
        if (previous) previous.childIds = previous.childIds.filter((id) => id !== node.id)
      }
      node.parentId = init.parentId
      if (init.parentId) this.addChild(this.ensureContainer(init.parentId), node)
    }
    if (init.order !== undefined && init.order !== node.order) {
      node.order = init.order
      if (node.parentId) {
        const parent = this.nodes.get(node.parentId)
        if (parent) {
          parent.childIds = parent.childIds.filter((id) => id !== node.id)
          this.addChild(parent, node)
        }
      }
    }
    node.container = init.container ?? node.container
    if (init.flow !== undefined) node.flow = init.flow
    if (init.memory !== undefined) node.memory = init.memory
    if (init.scope !== undefined) node.scope = init.scope
    if (init.activatable !== undefined) node.activatable = init.activatable
    if (init.disabled !== undefined) node.disabled = init.disabled
    node.getRect = init.getRect
    node.getElement = init.getElement
    node.onActivate = init.onActivate
    node.onDeactivate = init.onDeactivate
    node.onNavigate = init.onNavigate
    node.onFocus = init.onFocus
    node.onBlur = init.onBlur
    node.onCancel = init.onCancel
  }

  private ensureContainer(id: string): FocusNode {
    const existing = this.nodes.get(id)
    if (existing) return existing
    const node: FocusNode = {
      id,
      parentId: null,
      order: 0,
      container: true,
      flow: 'column',
      memory: false,
      scope: false,
      activatable: false,
      disabled: false,
      seq: this.nextSeq++,
      childIds: [],
    }
    this.nodes.set(id, node)
    return node
  }

  /** Inserts a child so `childIds` stays sorted by (order, seq). */
  private addChild(parent: FocusNode, node: FocusNode): void {
    const ids = parent.childIds
    let index = ids.length
    for (let i = 0; i < ids.length; i += 1) {
      const sibling = this.nodes.get(ids[i]!)
      if (!sibling) continue
      if (sibling.order > node.order || (sibling.order === node.order && sibling.seq > node.seq)) {
        index = i
        break
      }
    }
    ids.splice(index, 0, node.id)
  }

  private setFocusInternal(id: string): void {
    const previous = this.focusedId
    this.focusedId = id
    this.updateMemory(id)
    if (previous && previous !== id) this.nodes.get(previous)?.onBlur?.()
    if (previous !== id) this.nodes.get(id)?.onFocus?.()
  }

  private updateMemory(leafId: string): void {
    let childId = leafId
    let parentId = this.nodes.get(childId)?.parentId ?? null
    while (parentId) {
      const parent = this.nodes.get(parentId)
      if (!parent) break
      if (parent.memory) parent.lastFocusedChildId = childId
      childId = parentId
      parentId = parent.parentId
    }
  }

  private ensureFocus(): void {
    if (this.focusedId) {
      if (this.isSelectable(this.focusedId) && this.inScope(this.focusedId)) return
      this.focusedId = null
    }
    const entry = this.currentEntry()
    if (entry) this.setFocusInternal(entry)
  }

  private currentEntry(): string | null {
    const scope = this.scopeStack[this.scopeStack.length - 1]
    if (scope) {
      const entry = this.resolveEntry(scope)
      if (entry) return entry
    }
    const roots = [...this.nodes.values()]
      .filter((node) => node.parentId === null)
      .sort((a, b) => a.seq - b.seq)
    for (const root of roots) {
      const entry = this.resolveEntry(root.id)
      if (entry) return entry
    }
    return null
  }

  private resolveEntry(id: string): string | null {
    const node = this.nodes.get(id)
    if (!node) return null
    if (node.container) {
      if (node.memory && node.lastFocusedChildId) {
        const remembered = this.resolveEntry(node.lastFocusedChildId)
        if (remembered) return remembered
      }
      for (const childId of node.childIds) {
        const entry = this.resolveEntry(childId)
        if (entry) return entry
      }
      return null
    }
    if (node.disabled) return null
    return id
  }

  private isSelectable(id: string): boolean {
    const node = this.nodes.get(id)
    return !!node && !node.container && !node.disabled
  }

  private inScope(id: string): boolean {
    const scope = this.scopeStack[this.scopeStack.length - 1]
    if (!scope || !this.nodes.has(scope)) return true
    if (!this.hasFocusable(scope)) return true
    return this.isDescendant(id, scope)
  }

  private hasFocusable(containerId: string): boolean {
    const node = this.nodes.get(containerId)
    if (!node) return false
    for (const childId of node.childIds) {
      const child = this.nodes.get(childId)
      if (!child) continue
      if (!child.container && !child.disabled) return true
      if (child.container && this.hasFocusable(childId)) return true
    }
    return false
  }

  private isDescendant(id: string, ancestorId: string): boolean {
    let current = this.nodes.get(id)?.parentId ?? null
    while (current) {
      if (current === ancestorId) return true
      current = this.nodes.get(current)?.parentId ?? null
    }
    return false
  }

  private findNext(container: FocusNode, fromId: string, direction: FocusDirection): string | null {
    const candidates = container.childIds
      .map((id) => this.nodes.get(id))
      .filter((node): node is FocusNode => node !== undefined)
    const fromIndex = candidates.findIndex((node) => node.id === fromId)
    if (fromIndex < 0) return null

    if (container.flow === 'row' || container.flow === 'column') {
      const forward = direction === 'right' || direction === 'down'
      const horizontal = direction === 'left' || direction === 'right'
      if (container.flow === 'row' ? !horizontal : horizontal) return null
      for (let i = fromIndex + (forward ? 1 : -1); i >= 0 && i < candidates.length; i += forward ? 1 : -1) {
        const entry = this.resolveEntry(candidates[i]!.id)
        if (entry) return entry
      }
      return null
    }

    const fromRect = this.rectOf(fromId)
    if (!fromRect) return null
    const fromCenter = centerOf(fromRect)
    let best: string | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
      if (candidate.id === fromId) continue
      const entry = this.resolveEntry(candidate.id)
      if (!entry) continue
      const rect = this.rectOf(entry) ?? this.rectOf(candidate.id)
      if (!rect) continue
      const candidateCenter = centerOf(rect)
      const dx = candidateCenter.x - fromCenter.x
      const dy = candidateCenter.y - fromCenter.y
      if (!inDirection(direction, dx, dy)) continue
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        best = entry
      }
    }
    return best
  }

  private rectOf(id: string): FocusRect | null {
    const node = this.nodes.get(id)
    if (!node) return null
    if (node.getRect) return node.getRect()
    const element = node.getElement?.()
    if (!element || typeof element.getBoundingClientRect !== 'function') return null
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}
