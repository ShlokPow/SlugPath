// The "MyUCSC layout changed" fallback. MyUCSC is a third-party site that
// can be redecorated without notice, and the adapter's selectors are
// defensive enough that a layout change shows up as *silence* — rows present
// on the page, zero of them parsed, no buttons injected, no error anywhere a
// student can see. This turns that silence into one visible, dismissible
// banner instead.
//
// Deliberately not shown when the results grid simply never appears
// (waitForResults timing out): that's the normal case on every MyUCSC page
// that isn't a class search, and bannering it would cry wolf site-wide.

const ATTR = 'data-slugpath-layout-warning'

export function showLayoutWarning(message: string): void {
  if (document.querySelector(`[${ATTR}]`)) return // already shown, or dismissed and re-triggered within the same page

  const host = document.createElement('div')
  host.setAttribute(ATTR, 'true')
  host.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;'
  // Same shadow-root isolation as every other injected UI (shadowMount.ts),
  // just without a React root for a static banner.
  const shadow = host.attachShadow({ mode: 'open' })

  const banner = document.createElement('div')
  banner.setAttribute('role', 'alert')
  banner.style.cssText =
    'display:flex;gap:12px;align-items:center;justify-content:center;padding:8px 12px;background:#fdc700;color:#003c6c;font:600 13px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.3);'
  banner.textContent = message

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.textContent = 'Dismiss'
  dismiss.style.cssText =
    'padding:2px 8px;border-radius:6px;border:1px solid #003c6c;background:#fff;color:#003c6c;cursor:pointer;font:600 12px system-ui,sans-serif;'
  dismiss.addEventListener('click', () => host.remove())
  banner.appendChild(dismiss)

  shadow.appendChild(banner)
  document.documentElement.appendChild(host)
}
