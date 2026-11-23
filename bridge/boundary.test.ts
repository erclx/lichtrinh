import { assistantTools } from '@shared/assistant-tools.ts'
import { describe, expect, it } from 'vitest'

import { calls, fakeModel, text } from './fixtures/fake-model.ts'
import { runTurn } from './turn.ts'

// Every source file of the bridge, read as text through the bundler so the
// test itself needs no file access.
const sources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const FORBIDDEN = [
  /\bfrom\s+['"](node:)?(child_process|fs|fs\/promises)['"]/,
  /\bimport\(\s*['"](node:)?(child_process|fs|fs\/promises)['"]/,
  /['"]bun:ffi['"]/,
  /\bBun\.(spawn|spawnSync|write|file|\$)\b/,
  /\brequire\(/,
]

describe('what the bridge can reach', () => {
  it('offers the model exactly the four calendar tools from shared', async () => {
    const fake = fakeModel([
      [calls({ name: 'add_entry', arguments: {} })],
      [text('ok')],
    ])

    await runTurn(
      {
        type: 'turn',
        turnId: 't',
        model: 'lichtrinh-assistant',
        messages: [{ role: 'user', content: 'x' }],
      },
      {
        model: fake.model,
        send: () => {},
        callTool: async () => ({ ok: true }),
      },
    ).done

    expect(fake.requests[0].tools).toEqual(assistantTools)
    expect(assistantTools.map((tool) => tool.function.name)).toEqual([
      'add_entry',
      'move_entry',
      'update_entry',
      'remove_entry',
    ])
  })

  it('reads at least the loop and the entry point', () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining(['./turn.ts', './index.ts', './socket.ts']),
    )
  })

  it.each(Object.entries(sources))(
    'keeps %s from processes, files, and native code',
    (_, source) => {
      for (const pattern of FORBIDDEN) expect(source).not.toMatch(pattern)
    },
  )
})
