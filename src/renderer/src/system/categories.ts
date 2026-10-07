export type CategoryId = 'keys' | 'models' | 'voice' | 'display' | 'about'

export interface MenuCategory {
  id: CategoryId
  label: string
}

/** Left column of the system menu (spec 15). */
export const MENU_CATEGORIES: MenuCategory[] = [
  { id: 'keys', label: 'Key bindings' },
  { id: 'models', label: 'Models' },
  { id: 'voice', label: 'Voice input' },
  { id: 'display', label: 'Display & hints' },
  { id: 'about', label: 'About & diagnostics' },
]
