export type ThemeId = 'light' | 'dark' | 'pink'

export const THEMES: { id: ThemeId; label: string; swatch: string[] }[] = [
  { id: 'light', label: 'Trắng', swatch: ['#ffffff', '#111111'] },
  { id: 'dark', label: 'Đen', swatch: ['#111111', '#f5f5f5'] },
  { id: 'pink', label: 'Hồng', swatch: ['#fff1f5', '#e11d74'] },
]

const THEME_KEY = 'riland-theme-v1'

export function loadTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'pink') return saved
  } catch {
    /* ignore */
  }
  return 'light'
}

export function saveTheme(theme: ThemeId): void {
  localStorage.setItem(THEME_KEY, theme)
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  const colors: Record<ThemeId, string> = {
    light: '#f6f6f7',
    dark: '#0a0a0b',
    pink: '#fff0f5',
  }
  if (meta) meta.setAttribute('content', colors[theme])
}
