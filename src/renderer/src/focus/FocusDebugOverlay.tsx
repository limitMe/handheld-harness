import { useEffect, useState } from 'react'
import { useTranslation } from '../i18n'
import { useFocusTree } from './context'
import type { FocusNodeDebug } from './types'

function depthOf(node: FocusNodeDebug, index: Map<string, FocusNodeDebug>): number {
  let depth = 0
  let parentId = node.parentId
  while (parentId) {
    depth += 1
    parentId = index.get(parentId)?.parentId ?? null
  }
  return depth
}

/** `Ctrl+Shift+F` overlay: shows the focus tree while DevTools is open (spec 11). */
export function FocusDebugOverlay({ open }: { open: boolean }) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!tree) return
    return tree.subscribe(() => setTick((value) => value + 1))
  }, [tree])

  if (!open || !tree) return null

  const nodes = tree.debugNodes()
  const index = new Map(nodes.map((node) => [node.id, node]))
  const focused = tree.getFocusedId()
  const activated = tree.getActivatedId()

  return (
    <div
      data-testid="focus-debug"
      className="pointer-events-none fixed bottom-3 left-3 z-50 max-h-[60vh] w-[26rem] overflow-auto rounded-card border border-surface-raised bg-surface/95 p-3 text-code text-text shadow-card"
    >
      <p className="mb-1 font-semibold">{t('debug.focus.title')}</p>
      <p className="mb-2 text-text-muted">
        {t('debug.focus.summary', {
          focused: focused ?? t('debug.focus.none'),
          activated: activated ?? t('debug.focus.none'),
        })}
      </p>
      <ul className="flex flex-col gap-0.5">
        {nodes.map((node) => (
          <li
            key={node.id}
            style={{ paddingLeft: `${depthOf(node, index) * 12}px` }}
            className={
              node.focused
                ? 'text-accent'
                : node.activated
                  ? 'text-success'
                  : node.focusWithin
                    ? 'text-warning'
                    : 'text-text-muted'
            }
          >
            <span>{node.container ? '▸' : '•'}</span> {node.id}
            {node.flow !== 'geometric' ? ` [${node.flow}]` : ''}
            {node.focused ? ` ${t('debug.focus.focusedMark')}` : ''}
            {node.activated ? ` ${t('debug.focus.activatedMark')}` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
