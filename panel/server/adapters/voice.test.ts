import { describe, expect, it } from 'vitest'

import { createVoiceReader } from './voice.ts'

/** A voice server that answers, refuses, or fails as a test sets it. */
function reader() {
  const clock = { now: new Date('2031-11-22T14:24:00Z') }
  const server = {
    respond: (): Promise<Response> =>
      Promise.resolve(Response.json({ status: 'ok' })),
  }
  let asked = 0
  const read = createVoiceReader(
    (() => {
      asked += 1
      return server.respond()
    }) as typeof fetch,
    'http://127.0.0.1:8770',
    () => clock.now,
  )
  return {
    read,
    server,
    asked: () => asked,
    wait: (ms: number) => {
      clock.now = new Date(clock.now.getTime() + ms)
    },
  }
}

const refusing = () => Promise.reject(new TypeError('connection refused'))

describe('createVoiceReader', () => {
  it('asks a run that answered once within twenty seconds and again after', async () => {
    const voice = reader()

    await voice.read('run-1')
    voice.wait(19_999)
    const within = await voice.read('run-1')
    const askedWithin = voice.asked()
    voice.wait(1)
    await voice.read('run-1')

    expect(within).toBe(true)
    expect(askedWithin).toBe(1)
    expect(voice.asked()).toBe(2)
  })

  it.each([
    ['another run', 'run-2'],
    ['a unit that ended', null],
  ])('asks again at once for %s', async (_, run) => {
    const voice = reader()
    await voice.read('run-1')
    voice.server.respond = refusing

    expect(await voice.read(run)).toBe(false)
  })

  it('asks each time for a server outside the unit', async () => {
    const voice = reader()
    await voice.read(null)
    voice.server.respond = refusing

    expect(await voice.read(null)).toBe(false)
  })

  it.each([
    ['a refused connection', refusing],
    [
      'a failed answer',
      () => Promise.resolve(new Response('', { status: 503 })),
    ],
  ])('reads %s as no answer, and asks again at once', async (_, respond) => {
    const voice = reader()
    const { respond: answering } = voice.server
    voice.server.respond = respond

    const first = await voice.read('run-1')
    voice.server.respond = answering

    expect(first).toBe(false)
    expect(await voice.read('run-1')).toBe(true)
  })
})
