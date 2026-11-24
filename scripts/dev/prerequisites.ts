import { join } from 'node:path'

import { assistantModel } from '@shared/assistant'

/** What the check reads off the machine, passed in so a test sets each one. */
export interface Probes {
  onPath: (command: string) => boolean
  /** The model names Ollama lists, or undefined when it does not answer. */
  ollamaModels: () => Promise<string[] | undefined>
  exists: (path: string) => boolean
}

/** One thing the run needs and lacks, with what the owner runs for it. */
export interface Miss {
  need: string
  fix: string
}

// `lichtrinh voice models` converts this one last, after fetching every
// snapshot `voice/src/voice/models.py` lists, so its folder means all arrived.
const LAST_SPEECH_MODEL = 'phowhisper-large'

/** Every prerequisite the run lacks, in one list, so one read fixes them all. */
export async function findMissing(
  probes: Probes,
  where: { checkout: string; speechModels: string },
): Promise<Miss[]> {
  const missing: Miss[] = []
  if (!probes.onPath('uv')) {
    missing.push({
      need: 'uv',
      fix: 'Install it from https://docs.astral.sh/uv/ to run voice.',
    })
  }

  const models = await probes.ollamaModels()
  if (models === undefined) {
    missing.push({
      need: 'Ollama',
      fix: 'Start it with sudo systemctl start ollama.',
    })
  } else {
    for (const alias of assistantModel.options) {
      if (models.some((name) => name.split(':')[0] === alias)) continue
      missing.push({
        need: `the ${alias} model`,
        fix: 'Run lichtrinh bridge models.',
      })
    }
  }

  if (!probes.exists(join(where.speechModels, LAST_SPEECH_MODEL))) {
    missing.push({
      need: 'the speech models',
      fix: 'Run uv sync --directory voice --group gpu, then lichtrinh voice models.',
    })
  }

  // Wrangler reads the environment only when no `.dev.vars` exists at all.
  const devVars = join(where.checkout, '.dev.vars')
  if (probes.exists(devVars)) {
    missing.push({
      need: 'no .dev.vars',
      fix: `Move ${devVars} aside, since the Worker ignores the run's secret while it exists.`,
    })
  }
  return missing
}
