import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { VOICE_MODEL_LANGUAGES, voiceModel } from './voice.ts'

const SERVER_LANGUAGES: Record<string, string> = {
  VIETNAMESE: 'vi',
  ENGLISH: 'en',
}

// Reads the voice server's own list as text, since nothing here runs Python.
// A model that names no languages hears every one.
function serverModels() {
  const source = readFileSync(
    path.join(process.cwd(), 'voice/src/voice/models.py'),
    'utf8',
  )
  const list = source.slice(source.indexOf('MODELS = ('))
  return [...list.matchAll(/^ {4}Model\(([\s\S]*?)\),$/gm)].map(([, args]) => {
    const named = /languages=frozenset\(\{([^}]*)\}/.exec(args)?.[1]
    return {
      id: /'([^']+)'/.exec(args)?.[1],
      languages:
        named === undefined
          ? Object.values(SERVER_LANGUAGES)
          : [...named.matchAll(/Language\.(\w+)/g)].map(
              ([, name]) => SERVER_LANGUAGES[name],
            ),
    }
  })
}

describe('VOICE_MODEL_LANGUAGES', () => {
  it.each(voiceModel.options)('has %s hear Vietnamese', (model) => {
    expect(VOICE_MODEL_LANGUAGES[model]).toContain('vi')
  })

  it('matches the list the voice server keeps', () => {
    const offered = voiceModel.options.map((id) => ({
      id,
      languages: VOICE_MODEL_LANGUAGES[id],
    }))

    expect(offered).toEqual(serverModels())
  })
})
