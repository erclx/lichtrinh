// The panel unit's process. It binds this machine alone, and its log carries
// ids and outcomes, never a service's own lines.
import { join } from 'node:path'

import { createApp } from './app.ts'
import { readConfig } from './config.ts'
import { createMachine } from './machine.ts'
import { runCommand } from './run.ts'

const config = readConfig(process.env)

const app = createApp({
  machine: createMachine(
    { run: runCommand, fetch, now: () => new Date() },
    config,
  ),
  port: config.port,
  pageRoot: join(import.meta.dirname, '../dist'),
  log: (event, fields) => console.error(JSON.stringify({ event, ...fields })),
})

export default {
  hostname: '127.0.0.1',
  port: config.port,
  fetch: app.fetch,
  // A stop waits on systemd's own 90 seconds, past Bun's 10 idle by default.
  idleTimeout: 120,
}
