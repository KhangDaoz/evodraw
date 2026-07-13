// Shared theme + canvas-background utilities (single source of truth for
// SettingsPanel, RoomPage, and App boot logic).

// Each swatch has a light and dark variant — like Excalidraw
export const BG_PRESETS = [
  { id: 'default', light: '#ffffff', dark: '#121212' },
  { id: 'warm', light: '#f5f0e8', dark: '#1a1714' },
  { id: 'blue', light: '#f0f4ff', dark: '#121620' },
  { id: 'sage', light: '#e8ede4', dark: '#141a12' },
  { id: 'rose', light: '#fce4ec', dark: '#1c1215' },
  { id: 'mint', light: '#e0f2f1', dark: '#0f1a19' },
]

export function resolveTheme(themeId) {
  if (themeId === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return themeId
}

export function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId)
  localStorage.setItem('evodraw_theme', themeId)
}
