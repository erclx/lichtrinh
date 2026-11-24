import { describe, expect, it } from 'vitest'

import type { Miss } from './prerequisites'
import type { GroupEnd, Service, ServiceGroup } from './services'
import { type DevRun, type OneShot, runDev } from './start'

/** A group that records what started and ends only when a test ends it. */
function fakeGroup() {
  const started: Service[] = []
  let end: (value: GroupEnd) => void = () => {}
  const done = new Promise<GroupEnd>((resolve) => {
    end = resolve
  })
  const group: ServiceGroup = {
    start: (service) => started.push(service),
    stop: () => end({ reason: 'stopped' }),
    done,
  }
  return { group, started, end: (value: GroupEnd) => end(value) }
}

function devRun(overrides: Partial<DevRun> = {}) {
  const lines: string[] = []
  const oneShots: OneShot[] = []
  const removed: string[] = []
  const order: string[] = []
  const services = fakeGroup()
  let interrupt = () => {}
  const run: DevRun = {
    checkout: '/work/lichtrinh',
    appPort: 5193,
    reset: false,
    secret: 'invented-run-secret',
    write: (text) => lines.push(text),
    findMissing: async () => [],
    removeState: async (path) => {
      order.push('remove')
      removed.push(path)
    },
    runOnce: async (task) => {
      order.push('seed')
      oneShots.push(task)
      return 0
    },
    services: services.group,
    answers: async (url) => !url.includes(':8770'),
    onInterrupt: (handler) => {
      interrupt = handler
    },
    appWaitMs: 1_000,
    pollMs: 1,
    ...overrides,
  }
  return {
    run,
    services,
    oneShots,
    removed,
    order,
    output: () => lines.join(''),
    interrupt: () => interrupt(),
  }
}

/**
 * Starts the run and resolves once it has started `count` services, with
 * its exit wrapped so awaiting this does not wait for the run to end.
 */
async function untilStarted(dev: ReturnType<typeof devRun>, count: number) {
  const exit = runDev(dev.run)
  for (let tries = 0; dev.services.started.length < count; tries += 1) {
    if (tries > 1_000) throw new Error('the run never started its services')
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  return { exit }
}

describe('runDev', () => {
  describe('before anything starts', () => {
    it('names every miss with its fix and starts nothing', async () => {
      const missing: Miss[] = [
        { need: 'uv', fix: 'Install uv.' },
        { need: 'the speech models', fix: 'Run lichtrinh voice models.' },
      ]
      const dev = devRun({ findMissing: async () => missing })

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(1)
      expect(dev.output()).toContain('uv: Install uv.')
      expect(dev.output()).toContain(
        'the speech models: Run lichtrinh voice models.',
      )
      expect(dev.oneShots).toEqual([])
      expect(dev.services.started).toEqual([])
    })

    it('seeds its own database with the today trip and keeps it', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 1)
      dev.services.group.stop()
      await exit

      expect(dev.removed).toEqual([])
      expect(dev.oneShots).toEqual([
        {
          command: ['bun', 'scripts/seed.ts', '--today'],
          cwd: '/work/lichtrinh',
          env: { LICHTRINH_STATE_ROOT: '/work/lichtrinh/.wrangler/dev' },
        },
      ])
    })

    it('removes its own database before the seed under --reset', async () => {
      const dev = devRun({ reset: true })

      const { exit } = await untilStarted(dev, 1)
      dev.services.group.stop()
      await exit

      expect(dev.removed).toEqual(['/work/lichtrinh/.wrangler/dev'])
      expect(dev.order).toEqual(['remove', 'seed'])
    })

    it('starts nothing and exits with the code of a failed seed', async () => {
      const dev = devRun({ runOnce: async () => 4 })

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(4)
      expect(dev.services.started).toEqual([])
    })

    it('starts nothing once interrupted during the seed', async () => {
      const dev = devRun()
      dev.run.runOnce = async () => {
        dev.interrupt()
        return 0
      }

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(130)
      expect(dev.services.started).toEqual([])
    })
  })

  describe('the services', () => {
    it('gives the app its database and the run secret through the environment', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.group.stop()
      await exit

      expect(dev.services.started[0]).toEqual({
        name: 'app',
        command: ['bun', 'run', 'dev'],
        cwd: '/work/lichtrinh',
        env: {
          LICHTRINH_STATE_ROOT: '/work/lichtrinh/.wrangler/dev',
          BRIDGE_SECRET: 'invented-run-secret',
          CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
        },
      })
    })

    it('points the bridge at this machine with the same secret', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.group.stop()
      await exit

      expect(
        dev.services.started.find(({ name }) => name === 'bridge'),
      ).toEqual({
        name: 'bridge',
        command: ['bun', 'cli/index.ts', 'bridge', 'run'],
        cwd: '/work/lichtrinh',
        env: {
          LICHTRINH_URL: 'http://localhost:5193',
          BRIDGE_SECRET: 'invented-run-secret',
        },
      })
    })

    it('starts voice when none answers', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.group.stop()
      await exit

      expect(dev.services.started.map(({ name }) => name)).toEqual([
        'app',
        'voice',
        'bridge',
      ])
    })

    it('reuses a voice server that already answers', async () => {
      const dev = devRun({ answers: async () => true })

      const { exit } = await untilStarted(dev, 2)
      dev.services.group.stop()
      await exit

      expect(dev.services.started.map(({ name }) => name)).toEqual([
        'app',
        'bridge',
      ])
      expect(dev.output()).toContain('reuses the voice server')
    })

    it('names no remote database in any command it runs', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.group.stop()
      await exit

      const commands = [
        ...dev.oneShots.map(({ command }) => command),
        ...dev.services.started.map(({ command }) => command),
      ].flat()
      expect(commands).not.toContain('--remote')
    })
  })

  describe('once the app answers', () => {
    it('prints the link and the invented sign-ins', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.group.stop()
      await exit

      expect(dev.output()).toContain('http://localhost:5193')
      expect(dev.output()).toContain('traveler / seed-family-pass')
      expect(dev.output()).toContain('admin / seed-admin-pass')
    })

    it('exits cleanly on a stop', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.interrupt()

      expect(await exit).toBe(0)
    })

    it('names a service that exited and exits with its code', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.end({ reason: 'exited', name: 'bridge', code: 2 })

      expect(await exit).toBe(2)
      expect(dev.output()).toContain('bridge exited with 2')
    })

    it('exits non-zero when a service exits cleanly on its own', async () => {
      const dev = devRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.end({ reason: 'exited', name: 'voice', code: 0 })

      expect(await exit).toBe(1)
    })
  })

  describe('while the app is starting', () => {
    it('stops and exits non-zero when the app never answers', async () => {
      const dev = devRun({ answers: async () => false, appWaitMs: 20 })

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(1)
      expect(dev.services.started.map(({ name }) => name)).toEqual(['app'])
      expect(dev.output()).toContain('http://localhost:5193')
    })

    it('exits with the code of an app that ends before it answers', async () => {
      const dev = devRun({ answers: async () => false })

      const { exit } = await untilStarted(dev, 1)
      dev.services.end({ reason: 'exited', name: 'app', code: 3 })

      expect(await exit).toBe(3)
      expect(dev.services.started.map(({ name }) => name)).toEqual(['app'])
    })

    it('exits 130 when interrupted before the app answers', async () => {
      const dev = devRun({ answers: async () => false })

      const { exit } = await untilStarted(dev, 1)
      dev.interrupt()

      expect(await exit).toBe(130)
    })
  })
})
