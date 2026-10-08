import { useTranslation } from '../i18n'
import { MenuRow } from './MenuRow'

export interface QuitPageProps {
  /** Opens the confirm dialog; the actual quit happens after confirmation. */
  onQuit: () => void
}

/** Quit app (spec 15). A on the row opens the confirm dialog. */
export function QuitPage({ onQuit }: QuitPageProps) {
  const { t } = useTranslation()
  return (
    <div data-testid="quit-page">
      <MenuRow
        id="system-menu.first"
        order={0}
        testId="quit-app"
        onActivate={onQuit}
        onClick={onQuit}
      >
        <span>{t('menu.categories.quit')}</span>
      </MenuRow>
    </div>
  )
}
