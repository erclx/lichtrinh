import { describe, expect, it } from 'vitest'

import { createGpuReader } from './gpu.ts'

function reader(...outputs: { code: number; stdout: string }[]) {
  const clock = { now: new Date('2031-11-22T14:24:00Z') }
  let reads = 0
  const read = createGpuReader(
    async () => {
      const output = outputs[reads++]
      if (output === undefined) throw new Error('The card was read again')
      return { ...output, stderr: '' }
    },
    () => clock.now,
  )
  return {
    read,
    reads: () => reads,
    wait: (ms: number) => {
      clock.now = new Date(clock.now.getTime() + ms)
    },
  }
}

describe('createGpuReader', () => {
  it('reads the total and the used memory', async () => {
    const card = reader({ code: 0, stdout: '32607, 4604\n' })

    expect(await card.read()).toEqual({ totalMiB: 32607, usedMiB: 4604 })
  })

  it.each([
    ['empty output', { code: 0, stdout: '' }],
    ['a card with no reading', { code: 0, stdout: '[N/A], [N/A]\n' }],
    ['a failed exit', { code: 9, stdout: '32607, 4604\n' }],
  ])('answers null on %s', async (_, output) => {
    expect(await reader(output).read()).toBeNull()
  })

  it('reads the card once within ten seconds and again after', async () => {
    const card = reader(
      { code: 0, stdout: '32607, 4604\n' },
      { code: 0, stdout: '32607, 22604\n' },
    )

    await card.read()
    card.wait(9_999)
    const within = await card.read()
    card.wait(1)
    const after = await card.read()

    expect(within?.usedMiB).toBe(4604)
    expect(after?.usedMiB).toBe(22604)
    expect(card.reads()).toBe(2)
  })
})
