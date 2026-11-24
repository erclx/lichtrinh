import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { type ServiceGroup, superviseServices } from './services'

const node = process.execPath
const groups: ServiceGroup[] = []

function supervise(graceMs = 2_000) {
  const lines: string[] = []
  const group = superviseServices((text) => lines.push(text), { graceMs })
  groups.push(group)
  return { group, output: () => lines.join('') }
}

function service(name: string, script: string) {
  return { name, command: [node, '-e', script], cwd: tmpdir() }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Resolves with the first match in what the services printed, once it shows. */
async function untilPrinted(output: () => string, pattern: RegExp) {
  for (;;) {
    const match = pattern.exec(output())
    if (match) return match
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const idle = 'setInterval(() => {}, 1000)'

afterEach(async () => {
  for (const group of groups.splice(0)) {
    group.stop()
    await group.done
  }
})

describe('superviseServices', () => {
  it('prefixes each line a service prints with its name', async () => {
    const { group, output } = supervise()
    group.start(service('app', 'console.log("first"); console.error("second")'))

    await group.done

    expect(output()).toContain('[app] first\n')
    expect(output()).toContain('[app] second\n')
  })

  it('passes a service its own environment over the inherited one', async () => {
    const { group, output } = supervise()
    group.start({
      ...service('app', 'console.log(process.env.LICHTRINH_INVENTED)'),
      env: { LICHTRINH_INVENTED: 'from-the-service' },
    })

    await group.done

    expect(output()).toContain('[app] from-the-service\n')
  })

  it('names the service that exited on its own and stops the rest', async () => {
    const { group, output } = supervise()
    group.start(service('app', `console.log(process.pid); ${idle}`))
    const [, appPid] = await untilPrinted(output, /\[app\] (\d+)/)
    group.start(service('bridge', 'process.exit(3)'))

    const ended = await group.done

    expect(ended).toEqual({ reason: 'exited', name: 'bridge', code: 3 })
    expect(alive(Number(appPid))).toBe(false)
  })

  it('reads a stop as the reason once a stop was asked for', async () => {
    const { group, output } = supervise()
    group.start(service('app', `console.log("up"); ${idle}`))
    await untilPrinted(output, /\[app\] up/)

    group.stop()

    expect(await group.done).toEqual({ reason: 'stopped' })
  })

  it('stops a grandchild the service started', async () => {
    const { group, output } = supervise()
    // Inherited output, as Vite's under `bun run dev`, so the stop waits on it.
    const forks = [
      `const { spawn } = require('node:child_process')`,
      `const child = spawn(process.execPath, ['-e', '${idle}'], { stdio: 'inherit' })`,
      `console.log(child.pid)`,
      idle,
    ].join('\n')
    group.start(service('app', forks))
    const [, grandchildPid] = await untilPrinted(output, /\[app\] (\d+)/)

    group.stop()
    await group.done

    expect(alive(Number(grandchildPid))).toBe(false)
  })

  it('kills a service that ignores the stop once the grace runs out', async () => {
    const { group, output } = supervise(200)
    const stubborn = `process.on('SIGTERM', () => {}); console.log(process.pid); ${idle}`
    group.start(service('voice', stubborn))
    const [, pid] = await untilPrinted(output, /\[voice\] (\d+)/)

    group.stop()
    await group.done

    expect(alive(Number(pid))).toBe(false)
  })

  it('names a service that could not start', async () => {
    const { group, output } = supervise()

    group.start({
      name: 'voice',
      command: ['lichtrinh-no-such-command'],
      cwd: tmpdir(),
    })

    expect(await group.done).toEqual({
      reason: 'exited',
      name: 'voice',
      code: 127,
    })
    expect(output()).toContain('could not start lichtrinh-no-such-command')
  })
})
