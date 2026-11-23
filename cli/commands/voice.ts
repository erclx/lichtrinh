import { resolve } from 'node:path'

import type { Command } from 'commander'

import type { CliIo, RunInCheckout } from '../program'

/** Every verb runs in the gpu environment, which only the workspace PC syncs. */
const VOICE = ['uv', 'run', '--directory', 'voice', '--group', 'gpu', 'voice']

/** Speech recognition on the workspace PC, beside the bridge that calls it. */
export function registerVoice(
  program: Command,
  run: RunInCheckout,
  io: CliIo,
): void {
  const voice = program
    .command('voice')
    .description('Run the speech recognition server on the workspace PC')

  voice
    .command('serve')
    .description('Serve transcriptions on 127.0.0.1:8770 until stopped')
    .action(async () => {
      await run([...VOICE, 'serve'])
    })

  voice
    .command('models')
    .description('Download every speech model and convert PhoWhisper once')
    .action(async () => {
      await run([...VOICE, 'models'])
    })

  voice
    .command('transcribe')
    .description('Send one clip to the running server and print its text')
    .argument('<path>', 'the clip to transcribe')
    .option('--model <id>', 'the model to use instead of the default')
    .action(async (path: string, options: { model?: string }) => {
      // uv runs inside voice/, so a relative path resolves from here first.
      const clip = resolve(io.cwd, path)
      const model =
        options.model === undefined ? [] : ['--model', options.model]
      await run([...VOICE, 'transcribe', clip, ...model])
    })
}
