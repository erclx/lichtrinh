import { isHeld } from '@/update/holds'

/** What the safe reload reads of the open page and the worker behind it. */
export interface OpenPage {
  /** A worker answers this page's requests. */
  controlled: () => boolean
  /** The `index.html` the worker serves now, or null when it cannot be read. */
  saved: () => Promise<string | null>
  reload: () => void
}

const browserPage: OpenPage = {
  controlled: () =>
    'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
  saved: async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}index.html`)
      return response.ok ? await response.text() : null
    } catch {
      return null
    }
  },
  reload: () => window.location.reload(),
}

// The entry's name moves with every release, since the version is compiled
// into it, so it tells the page's own release from the one now saved.
function entryOf(root: ParentNode): string | null {
  const src = root
    .querySelector('script[type="module"][src]')
    ?.getAttribute('src')
  return src == null ? null : new URL(src, document.baseURI).pathname
}

/**
 * Reloads onto the release the worker now saves unless something holds the
 * page. It reads the saved `index.html` rather than an activation a page can
 * miss, and a reload serves that same copy, so one reload settles it.
 */
export async function takeRelease(page: OpenPage = browserPage) {
  if (isHeld() || !page.controlled()) return
  const html = await page.saved()
  if (html === null) return
  const saved = entryOf(new DOMParser().parseFromString(html, 'text/html'))
  const own = entryOf(document)
  if (saved === null || own === null || saved === own || isHeld()) return
  page.reload()
}
