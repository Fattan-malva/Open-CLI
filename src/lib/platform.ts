export const isDesktop =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const isMobile =
  typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)