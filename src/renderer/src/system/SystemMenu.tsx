import { useEffect, useMemo, useState } from 'react'
import { CONTEXT_ORDER, useInputApi, useInputContext } from '../input'
import { FocusContainer, useFocusTree } from '../focus'
import { useTranslation } from '../i18n'
import { ConfirmDialog } from '../ui'
import { MENU_CATEGORIES, type CategoryId } from './categories'
import { AboutPage } from './AboutPage'
import { DisplayPage } from './DisplayPage'
import { KeyBindingsPage } from './KeyBindingsPage'
import { MenuCancelProvider, MenuRow } from './MenuRow'
import { ModelsPage } from './ModelsPage'
import { QuitPage } from './QuitPage'
import { useSettings } from './useSettings'
import { VoicePage } from './VoicePage'

export interface SystemMenuProps {
  open: boolean
  onClose: () => void
  onOpenDebug: (page: 'gamepad' | 'mic' | 'engine' | 'speech') => void
}

/** Mounted only while open, so the selected category resets on every open. */
export function SystemMenu({ open, onClose, onOpenDebug }: SystemMenuProps) {
  if (!open) return null
  return <SystemMenuBody onClose={onClose} onOpenDebug={onOpenDebug} />
}

function SystemMenuBody({ onClose, onOpenDebug }: Omit<SystemMenuProps, 'open'>) {
  const { t } = useTranslation()
  const tree = useFocusTree()
  const api = useInputApi()
  const { settings, update } = useSettings()
  const [map, setMap] = useState(() => api.getMap())
  const [category, setCategory] = useState<CategoryId>('keys')
  const [quitOpen, setQuitOpen] = useState(false)

  useEffect(() => api.subscribeMap(setMap), [api])

  // Register the menu context so its bindings resolve while it is on top.
  useInputContext(
    'systemMenu',
    useMemo(() => ({}), []),
    CONTEXT_ORDER.overlay,
  )

  const focusPanel = (): void => {
    tree?.setFocus('system-menu.first')
  }
  const focusCategories = (): void => {
    tree?.setFocus(`system-menu.category.${category}`)
  }

  return (
    <div data-testid="system-menu" className="absolute inset-0 z-40 flex flex-col bg-surface/95">
      <FocusContainer id="system-menu" flow="row" scope>
        <div className="flex h-full w-full gap-6 p-6">
          <div className="w-64 shrink-0">
            <FocusContainer id="system-menu.categories" flow="column" memory>
              <nav className="flex flex-col gap-1">
                {MENU_CATEGORIES.map((id, index) => (
                  <MenuRow
                    key={id}
                    id={`system-menu.category.${id}`}
                    order={index}
                    selected={category === id}
                    testId={`menu-category-${id}`}
                    onFocus={() => setCategory(id)}
                    onActivate={id === 'quit' ? () => setQuitOpen(true) : focusPanel}
                    onCancel={onClose}
                    onClick={() => {
                      setCategory(id)
                      if (id === 'quit') setQuitOpen(true)
                      else focusPanel()
                    }}
                  >
                    <span>{t(`menu.categories.${id}`)}</span>
                  </MenuRow>
                ))}
              </nav>
            </FocusContainer>
          </div>

          <div className="min-w-0 flex-1">
            <FocusContainer id="system-menu.panel" flow="column">
              <MenuCancelProvider onCancel={focusCategories}>
                <div
                  data-scroll-region
                  data-testid="system-menu-panel"
                  // Horizontal padding leaves room for the focus ring, which the
                  // scroll container would otherwise clip on the left.
                  className="flex h-full flex-col gap-1 overflow-y-auto px-2 py-2"
                >
                  {!settings ? (
                    <p className="px-3 py-4 text-text-muted">{t('menu.loading')}</p>
                  ) : category === 'keys' ? (
                    <KeyBindingsPage map={map} settings={settings} update={update} />
                  ) : category === 'models' ? (
                    <ModelsPage settings={settings} update={update} />
                  ) : category === 'voice' ? (
                    <VoicePage settings={settings} update={update} />
                  ) : category === 'display' ? (
                    <DisplayPage settings={settings} update={update} />
                  ) : category === 'quit' ? (
                    <QuitPage onQuit={() => setQuitOpen(true)} />
                  ) : (
                    <AboutPage onOpenDebug={onOpenDebug} />
                  )}
                </div>
              </MenuCancelProvider>
            </FocusContainer>
          </div>
        </div>
      </FocusContainer>

      <ConfirmDialog
        open={quitOpen}
        onOpenChange={setQuitOpen}
        title={t('quit.title')}
        description={t('quit.description')}
        confirmLabel={t('quit.confirm')}
        destructive
        onConfirm={() => void window.handheld?.app.quit()}
      />
    </div>
  )
}
