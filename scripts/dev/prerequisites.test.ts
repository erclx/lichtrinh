import { describe, expect, it } from 'vitest'

import { findMissing, type Probes } from './prerequisites'

const where = {
  checkout: '/work/lichtrinh',
  speechModels: '/home/owner/.local/share/lichtrinh/voice',
}

/** A machine holding every prerequisite, so each test removes one. */
function readyMachine(overrides: Partial<Probes> = {}): Probes {
  return {
    onPath: () => true,
    ollamaModels: async () => [
      'lichtrinh-assistant:latest',
      'lichtrinh-assistant-gemma:latest',
      'qwen3.5:9b',
    ],
    exists: (path) =>
      path === '/home/owner/.local/share/lichtrinh/voice/phowhisper-large',
    ...overrides,
  }
}

describe('findMissing', () => {
  it('finds nothing on a machine holding every prerequisite', async () => {
    expect(await findMissing(readyMachine(), where)).toEqual([])
  })

  it('names uv and how to install it when it is not on PATH', async () => {
    const machine = readyMachine({ onPath: (command) => command !== 'uv' })

    const missing = await findMissing(machine, where)

    expect(missing).toEqual([
      { need: 'uv', fix: expect.stringContaining('docs.astral.sh/uv') },
    ])
  })

  it('names Ollama and how to start it when it does not answer', async () => {
    const machine = readyMachine({ ollamaModels: async () => undefined })

    const missing = await findMissing(machine, where)

    expect(missing).toEqual([
      {
        need: 'Ollama',
        fix: expect.stringContaining('systemctl start ollama'),
      },
    ])
  })

  it('names each missing alias and the verb that makes them', async () => {
    const machine = readyMachine({
      ollamaModels: async () => ['lichtrinh-assistant:latest'],
    })

    const missing = await findMissing(machine, where)

    expect(missing).toEqual([
      {
        need: 'the lichtrinh-assistant-gemma model',
        fix: expect.stringContaining('lichtrinh bridge models'),
      },
    ])
  })

  it('names the speech models and the verb that fetches them', async () => {
    const machine = readyMachine({ exists: () => false })

    const missing = await findMissing(machine, where)

    expect(missing).toEqual([
      {
        need: 'the speech models',
        fix: expect.stringContaining('lichtrinh voice models'),
      },
    ])
  })

  it('names any .dev.vars, which hides the environment from the Worker', async () => {
    const machine = readyMachine({
      exists: (path) =>
        path === '/work/lichtrinh/.dev.vars' ||
        path === '/home/owner/.local/share/lichtrinh/voice/phowhisper-large',
    })

    const missing = await findMissing(machine, where)

    expect(missing).toEqual([
      {
        need: 'no .dev.vars',
        fix: expect.stringContaining('Move /work/lichtrinh/.dev.vars aside'),
      },
    ])
  })

  it('reports every miss at once', async () => {
    const machine = readyMachine({
      onPath: () => false,
      ollamaModels: async () => undefined,
      exists: () => false,
    })

    const missing = await findMissing(machine, where)

    expect(missing.map(({ need }) => need)).toEqual([
      'uv',
      'Ollama',
      'the speech models',
    ])
  })
})
