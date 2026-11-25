import type { Page } from '@playwright/test'

import { DEMO_INSTANT } from '../../../scripts/seed'
import type { CaptureCase } from '../../capture-types'
import { asTraveler, flowSticky, inTripZone, lightAndDark } from '../page-setup'

interface TalkScript {
  /** Whether the status read says the voice server answers. */
  voice: boolean
  /** The buttons pressed once the composer shows, in order. */
  presses: readonly ('Talk' | 'Stop and write it down')[]
  /** The clip's words, or null to hold the clip at transcribing. */
  words: string | null
  /** Refuses the microphone, as a traveler who tapped Don't Allow. */
  denied?: boolean
  /** The words so far, answering each live piece. Left out, none answers. */
  live?: string
}

const TALK_CHAT = '/chats/fixture-chat-today'

// The harness has no microphone and no hook after the load, so the page
// gets a tone for a microphone, answers its own clip, and presses the mic
// itself. The thread reads empty, as the talk frames draw it.
async function talkScript(page: Page, script: TalkScript) {
  await page.route('**/api/assistant/status', (route) =>
    route.fulfill({
      json: {
        online: true,
        lastAnsweredAt: null,
        model: 'lichtrinh-assistant',
        voice: { online: script.voice, model: 'qwen3-asr-1.7b' },
      },
    }),
  )
  await page.route(`**/api${TALK_CHAT}`, async (route) => {
    const response = await route.fetch()
    const thread = (await response.json()) as Record<string, unknown>
    await route.fulfill({ response, json: { ...thread, messages: [] } })
  })
  await page.addInitScript(({ presses, words, denied, live }) => {
    navigator.mediaDevices.getUserMedia = async () => {
      if (denied === true) throw new DOMException('denied', 'NotAllowedError')
      const context = new AudioContext()
      const tone = context.createOscillator()
      const out = context.createMediaStreamDestination()
      tone.connect(out)
      tone.start()
      return out.stream
    }
    const realFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/api/voice/transcriptions/')) {
        if (words === null) return new Promise<Response>(() => undefined)
        const id = url.split('/').pop() ?? ''
        return Promise.resolve(
          Response.json({
            id,
            text: words,
            model: 'qwen3-asr-1.7b',
            audioMs: 2100,
            ms: 900,
          }),
        )
      }
      if (url.includes('/api/voice/live/')) {
        return live === undefined
          ? new Promise<Response>(() => undefined)
          : Promise.resolve(Response.json({ text: live, heard: 1 }))
      }
      if (url.endsWith('/api/assistant/warm')) {
        return Promise.resolve(new Response(null, { status: 202 }))
      }
      return realFetch(input, init)
    }
    // Hands back audio at once, so listening starts without waiting a slice.
    class StandInRecorder {
      static isTypeSupported = (mime: string) => mime.startsWith('audio/webm')
      state = 'inactive'
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
        queueMicrotask(() =>
          this.ondataavailable?.({ data: new Blob([new Uint8Array([1])]) }),
        )
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob([new Uint8Array([1])]) })
        this.onstop?.()
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: StandInRecorder })
    const queue = [...presses]
    const timer = setInterval(() => {
      const label = queue[0]
      if (label === undefined) {
        clearInterval(timer)
        return
      }
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      )
      if (button === null) {
        // Beside a page, the tablet's mic waits in the sheet this bar opens.
        for (const bar of document.querySelectorAll('button')) {
          if (bar.innerText.trim() === 'Talk to the assistant') bar.click()
        }
        return
      }
      // Stop shows while the mic opens too, where a press cancels the clip.
      const listening = document.body.innerText.includes('Listening…')
      if (label !== 'Talk' && !listening) return
      queue.shift()
      button.click()
    }, 50)
  }, script)
}

/** One talk state as the traveler, on the chat page unless told otherwise. */
function talkCases(
  section: string,
  script: TalkScript,
  route = TALK_CHAT,
): CaptureCase[] {
  return lightAndDark(section, route, async (page) => {
    await inTripZone(page)
    await page.clock.setFixedTime(new Date(DEMO_INSTANT))
    await flowSticky(page)
    await talkScript(page, script)
    await asTraveler(page)
  })
}

const STOP = 'Stop and write it down'

// Sixty words, so the older ones fill the thread and fade at its top.
const LONG_TURN =
  'Thứ bảy đi chợ hoa Sông Mây lúc chín giờ sáng, rồi ăn trưa với cả nhà ở quán gần bến thuyền, khoảng ba trăm nghìn đồng. Buổi chiều về khách sạn nghỉ, đến năm giờ rưỡi thì đi thuyền ngắm hoàng hôn. Tối hôm đó không có việc gì nữa, nhưng nhớ ghi là mang theo áo khoác và nước uống, vì trên thuyền gió lạnh lắm'

const LIVE: TalkScript = {
  voice: true,
  presses: ['Talk'],
  words: null,
  live: LONG_TURN,
}

// Each state is reached by the page pressing the mic itself.
export const CASES: CaptureCase[] = [
  ...talkCases('talk-ready', { voice: true, presses: [], words: null }),
  ...talkCases('talk-listening', {
    voice: true,
    presses: ['Talk'],
    words: null,
  }),
  ...talkCases('talk-live', LIVE),
  // The sheet and the dock, which a phone has neither of.
  ...talkCases('talk-live-beside', LIVE, '/trips').map((one) => ({
    ...one,
    excludeViewports: ['320', '390'],
  })),
  ...talkCases('talk-transcribing', {
    voice: true,
    presses: ['Talk', STOP],
    words: null,
  }),
  ...talkCases('talk-review', {
    voice: true,
    presses: ['Talk', STOP],
    words: 'doi an toi sang 8 gio',
  }),
  ...talkCases('talk-retry', {
    voice: true,
    presses: ['Talk', STOP],
    words: '',
  }),
  ...talkCases('talk-voice-off', { voice: false, presses: [], words: null }),
  ...talkCases('talk-denied', {
    voice: true,
    presses: ['Talk'],
    words: null,
    denied: true,
  }),
]
