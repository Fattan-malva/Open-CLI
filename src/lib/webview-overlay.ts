export const WEBVIEW_OVERLAY_EVENT = 'opencli:webview-overlay'

const OVERLAY_SELECTOR = [
  '[data-slot="sheet-content"][data-state="open"]',
  '[data-slot="popover-content"][data-state="open"]',
  '[data-slot="dropdown-menu-content"][data-state="open"]',
  '[data-slot="select-content"][data-state="open"]',
  '[data-slot="context-menu-content"][data-state="open"]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"]:not([hidden]):not([aria-hidden="true"])',
  '[role="listbox"]:not([hidden]):not([aria-hidden="true"])',
].join(',')

let overlayOpen = false

export function isWebviewOverlayOpen() {
  return overlayOpen
}

export function notifyWebviewOverlay(open: boolean) {
  if (open === overlayOpen) return
  overlayOpen = open
  window.dispatchEvent(new Event(WEBVIEW_OVERLAY_EVENT))
}

export function watchWebviewOverlays() {
  if (typeof window === 'undefined') return

  const check = () => {
    notifyWebviewOverlay(Boolean(document.querySelector(OVERLAY_SELECTOR)))
  }

  const observer = new MutationObserver(check)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state', 'hidden', 'aria-hidden'],
  })
  window.addEventListener('focusin', check)
  check()

  return () => {
    observer.disconnect()
    window.removeEventListener('focusin', check)
    notifyWebviewOverlay(false)
  }
}
