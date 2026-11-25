// The panel over a workspace PC in memory, for the journey and for evidence.
// It reads and drives nothing on this machine. POST /fake/enter/<scenario>
// puts it in one of the states `SCENARIOS` names.
import { join } from 'node:path'

import { createApp } from '../../panel/server/app.ts'
import { createMachine } from '../../panel/server/machine.ts'
import {
  createFakeMachine,
  FAKE_CONFIG,
  SCENARIOS,
} from '../../panel/server/test/fakes.ts'

const offset = Number(process.env.WORKTREE_PORT_OFFSET) || 0
const port = Number(process.env.PANEL_PORT) || 4280 + offset

// Every state opens on one invented afternoon, so two captures of it match.
const OPENS_AT = Date.parse('2031-11-22T14:24:00Z')
const clock = { enteredAt: Date.now() }

const fake = createFakeMachine(
  () => new Date(OPENS_AT + Date.now() - clock.enteredAt),
)

function build() {
  return createApp({
    machine: createMachine(fake.tools, FAKE_CONFIG),
    port,
    pageRoot: join(import.meta.dirname, '../../panel/dist'),
  })
}

function enter(name: string) {
  const scenario = SCENARIOS.find((known) => known === name)
  if (scenario === undefined) return undefined
  clock.enteredAt = Date.now()
  fake.enter(scenario)
  // A machine of its own, so no load or card read outlives the last state.
  return build()
}

fake.enter('failed')
let app = build()

export default {
  hostname: '127.0.0.1',
  port,
  fetch: (request: Request) => {
    const name = /^\/fake\/enter\/([a-z]+)$/.exec(new URL(request.url).pathname)
    if (request.method !== 'POST' || name?.[1] === undefined) {
      return app.fetch(request)
    }
    const entered = enter(name[1])
    if (entered === undefined) return new Response(null, { status: 404 })
    app = entered
    return new Response(null, { status: 204 })
  },
}
