import { hold } from '@/update/holds'
import { type OpenPage, takeRelease } from '@/update/take-release'

const ownEntry = '/assets/index-a1b2c3.js'

/** The `index.html` a build writes, naming its own entry script. */
function aBuiltPage(entry: string): string {
  return `<!doctype html><html><head><script type="module" crossorigin src="${entry}"></script></head><body><div id="root"></div></body></html>`
}

interface FakePage extends OpenPage {
  reloads: number
}

/** A page under a worker whose saved copy is a newer release by default. */
function aFakePage({
  controlled = true,
  saved = async () => aBuiltPage('/assets/index-d4e5f6.js'),
}: {
  controlled?: boolean
  saved?: () => Promise<string | null>
} = {}): FakePage {
  const page: FakePage = {
    reloads: 0,
    controlled: () => controlled,
    saved,
    reload: () => {
      page.reloads += 1
    },
  }
  return page
}

let script: HTMLScriptElement

beforeEach(() => {
  script = document.createElement('script')
  script.type = 'module'
  script.src = ownEntry
  document.head.append(script)
})

afterEach(() => {
  script.remove()
})

describe('takeRelease', () => {
  it('reloads when the saved page names another entry', async () => {
    const page = aFakePage()

    await takeRelease(page)

    expect(page.reloads).toBe(1)
  })

  it('stays when the saved page names the entry this page runs', async () => {
    const page = aFakePage({ saved: async () => aBuiltPage(ownEntry) })

    await takeRelease(page)

    expect(page.reloads).toBe(0)
  })

  it('stays on a page no worker controls, as on a first visit', async () => {
    const saved = vi.fn(async () => aBuiltPage('/assets/index-d4e5f6.js'))
    const page = aFakePage({ controlled: false, saved })

    await takeRelease(page)

    expect(page.reloads).toBe(0)
    expect(saved).not.toHaveBeenCalled()
  })

  it('stays when the saved page cannot be read', async () => {
    const page = aFakePage({ saved: async () => null })

    await takeRelease(page)

    expect(page.reloads).toBe(0)
  })

  it('stays when the saved page names no entry, as a captive page would', async () => {
    const page = aFakePage({ saved: async () => '<html><body></body></html>' })

    await takeRelease(page)

    expect(page.reloads).toBe(0)
  })

  it('stays while held', async () => {
    const release = hold()
    const page = aFakePage()

    await takeRelease(page)

    expect(page.reloads).toBe(0)
    release()
  })

  it('stays when a hold arrives while the saved page is read', async () => {
    let release = () => {}
    const page = aFakePage({
      saved: async () => {
        release = hold()
        return aBuiltPage('/assets/index-d4e5f6.js')
      },
    })

    await takeRelease(page)

    expect(page.reloads).toBe(0)
    release()
  })
})
