import { assistantModel, DEFAULT_ASSISTANT_MODEL } from '@shared/assistant'
import { type Command, Option } from 'commander'

import type { RunInCheckout } from '../program'

/**
 * The bridge the workspace PC runs beside Ollama. A later systemd unit runs
 * `bridge run` the same way the owner does by hand.
 */
export function registerBridge(program: Command, run: RunInCheckout): void {
  const bridge = program
    .command('bridge')
    .description('Run and tune the assistant bridge on the workspace PC')

  bridge
    .command('run')
    .description('Connect to the app and answer chats with the local model')
    .action(async () => {
      await run(['bun', 'bridge/index.ts'])
    })

  bridge
    .command('models')
    .description('Make the assistant aliases in Ollama from their Modelfiles')
    .action(async () => {
      for (const alias of assistantModel.options) {
        const code = await run([
          'ollama',
          'create',
          alias,
          '-f',
          `bridge/models/${alias}.Modelfile`,
        ])
        if (code !== 0) return
      }
    })

  bridge
    .command('eval')
    .description('Score an alias on the invented requests, live')
    .addOption(
      new Option('--model <alias>', 'the alias to score')
        .choices(assistantModel.options)
        .default(DEFAULT_ASSISTANT_MODEL),
    )
    .action(async (options: { model: string }) => {
      await run(['bun', 'bridge/eval.ts', '--model', options.model])
    })
}
