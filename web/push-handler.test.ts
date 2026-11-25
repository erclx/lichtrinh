import { readFileSync } from 'node:fs'

import { pushWords } from '@shared/notice-text.ts'

interface Shown {
  title: string
  body?: string
}

interface Options {
  body?: string
  tag?: string
  renotify?: boolean
}

type Listener = (event: Record<string, unknown>) => void

/** Runs the handler as the service worker does, over a worker's few globals. */
function loadHandler(windows: { focus: () => void }[] = []) {
  const listeners = new Map<string, Listener>()
  const shown: Shown[] = []
  const places: Omit<Options, 'body'>[] = []
  const opened: string[] = []
  const worker = {
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
    registration: {
      showNotification: async (
        title: string,
        { body, tag, renotify }: Options,
      ) => {
        shown.push({ title, body })
        places.push({ tag, renotify })
      },
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (path: string) => {
        opened.push(path)
      },
    },
  }
  const script = readFileSync('web/public/push-handler.js', 'utf8')
  new Function('self', script)(worker)

  /** Fires an event and waits for what the handler asked to finish. */
  async function fire(type: string, event: Record<string, unknown>) {
    const waits: unknown[] = []
    listeners.get(type)?.({
      ...event,
      waitUntil: (wait: unknown) => waits.push(wait),
    })
    await Promise.all(waits)
  }

  return { fire, shown, places, opened }
}

function dataOf(payload: unknown) {
  return { data: { json: () => payload } }
}

// 10:20 on the device's own clock, whatever zone the run sits in.
const at = new Date(2031, 4, 15, 10, 20)

describe('the push handler', () => {
  it("shows the Worker's words with the time on the device's clock", async () => {
    const { fire, shown } = loadHandler()
    const words = pushWords({ kind: 'assistant', name: 'Du khách', at }, 'en')

    await fire('push', dataOf(words))

    expect(shown).toEqual([
      {
        title: 'The assistant is off',
        body: 'Du khách asked at 10:20 for the home computer to be turned on.',
      },
    ])
  })

  it('shows a Vietnamese push in Vietnamese', async () => {
    const { fire, shown } = loadHandler()
    const words = pushWords({ kind: 'voice', name: 'Du khách', at }, 'vi')

    await fire('push', dataOf(words))

    expect(shown[0]?.body).toBe('Du khách nhờ bật lại giọng nói lúc 10:20.')
  })

  it.each([
    ['no data', {}],
    ['data that is not JSON', { data: { json: () => JSON.parse('{') } }],
    ['null', dataOf(null)],
    ['an empty title', dataOf({ title: '' })],
    ['a later version with none of these fields', dataOf({ v: 2 })],
    ['a time it cannot read', dataOf({ at: 'never', lang: 'not a language' })],
  ])("shows the app's name on %s", async (_name, event) => {
    const { fire, shown } = loadHandler()

    await fire('push', event)

    expect(shown).toEqual([{ title: 'Lịch trình', body: '' }])
  })

  it('alerts again as a later notice takes the place of one left unread', async () => {
    const { fire, places } = loadHandler()
    const words = pushWords({ kind: 'assistant', name: 'Du khách', at }, 'en')

    await fire('push', dataOf(words))
    await fire('push', dataOf(words))

    expect(places).toEqual([
      { tag: 'The assistant is off', renotify: true },
      { tag: 'The assistant is off', renotify: true },
    ])
  })

  it('opens the assistant settings on a tap with the app closed', async () => {
    const { fire, opened } = loadHandler()
    const close = vi.fn()

    await fire('notificationclick', { notification: { close } })

    expect(opened).toEqual(['/admin/assistant'])
    expect(close).toHaveBeenCalledOnce()
  })

  it('brings an open app forward as it is', async () => {
    const focus = vi.fn()
    const { fire, opened } = loadHandler([{ focus }])

    await fire('notificationclick', { notification: { close: vi.fn() } })

    expect(focus).toHaveBeenCalledOnce()
    expect(opened).toEqual([])
  })
})
