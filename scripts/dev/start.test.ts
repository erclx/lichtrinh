import { describe, expect, it } from 'vitest'

import {
  fakeTailscale,
  HOST,
  readyStatus,
  shareOf,
} from './fixtures/fake-tailscale'
import type { Tailscale } from './phone'
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
    portFree: async () => true,
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

/** Resolves once the condition holds, for a step the run takes after its services start. */
async function until(condition: () => boolean) {
  for (let tries = 0; !condition(); tries += 1) {
    if (tries > 1_000) throw new Error('the condition never held')
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

/** A run with the phone part over a fake Tailscale and a shut database page. */
function phoneRun(
  fake = fakeTailscale(),
  overrides: Partial<DevRun> = {},
  databasePage: () => Promise<number | undefined> = async () => 404,
) {
  return devRun({
    phone: { tailscale: fake.tailscale, databasePage },
    ...overrides,
  })
}

const SHARED_URL = `https://${HOST}/`

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

    it('names a taken app port and neither resets nor seeds', async () => {
      const dev = devRun({ reset: true, portFree: async () => false })

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(1)
      expect(dev.output()).toContain('port 5193')
      expect(dev.removed).toEqual([])
      expect(dev.oneShots).toEqual([])
    })

    it('neither resets nor seeds once interrupted during the check', async () => {
      const dev = devRun({ reset: true })
      dev.run.findMissing = async () => {
        dev.interrupt()
        return []
      }

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(130)
      expect(dev.removed).toEqual([])
      expect(dev.oneShots).toEqual([])
    })

    it('does not seed once interrupted during the reset', async () => {
      const dev = devRun({ reset: true })
      dev.run.removeState = async () => {
        dev.interrupt()
      }

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(130)
      expect(dev.oneShots).toEqual([])
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

  describe('a phone run', () => {
    it('names a Tailscale that is not ready and starts nothing', async () => {
      const fake = fakeTailscale({
        status: { ...readyStatus(), BackendState: 'NeedsLogin' },
      })
      const dev = phoneRun(fake)

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(1)
      expect(dev.output()).toContain('Tailscale signed in and connected')
      expect(dev.oneShots).toEqual([])
      expect(dev.services.started).toEqual([])
    })

    it('names an address another port holds before the seed', async () => {
      const fake = fakeTailscale({ serve: shareOf(5200) })
      const dev = phoneRun(fake)

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(1)
      expect(dev.output()).toContain('http://127.0.0.1:5200')
      expect(dev.oneShots).toEqual([])
      expect(fake.serve()).toEqual(shareOf(5200))
    })

    it('starts nothing while Funnel is on', async () => {
      const fake = fakeTailscale({
        serve: { AllowFunnel: { [`${HOST}:443`]: true } },
      })
      const dev = phoneRun(fake)

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(1)
      expect(dev.output()).toContain('Funnel off')
      expect(dev.services.started).toEqual([])
    })

    it('gives the app the tailnet name with its database page shut', async () => {
      const dev = phoneRun()

      const { exit } = await untilStarted(dev, 3)
      dev.services.group.stop()
      await exit

      expect(dev.services.started[0]?.env).toEqual({
        LICHTRINH_STATE_ROOT: '/work/lichtrinh/.wrangler/dev',
        BRIDGE_SECRET: 'invented-run-secret',
        CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
        LICHTRINH_PHONE: '1',
        __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: HOST,
        X_LOCAL_EXPLORER: 'false',
      })
    })

    it.each([200, 403, undefined])(
      'shares nothing and stops when the database page answers %s',
      async (status) => {
        const fake = fakeTailscale()
        const dev = phoneRun(fake, {}, async () => status)

        const exitCode = await runDev(dev.run)

        expect(exitCode).toBe(1)
        expect(dev.output()).toContain('database page')
        expect(dev.services.started.map(({ name }) => name)).toEqual(['app'])
        expect(fake.serve()).toEqual({})
      },
    )

    it('shares the app port and prints the code once the stack is up', async () => {
      const fake = fakeTailscale()
      const dev = phoneRun(fake)

      const { exit } = await untilStarted(dev, 3)
      await until(() => dev.output().includes(SHARED_URL))
      const during = fake.serve()
      dev.services.group.stop()
      await exit

      expect(during).toEqual(shareOf(5193))
      expect(dev.output()).toContain('http://localhost:5193')
    })
  })

  describe('closing the phone share', () => {
    it('removes the share on a stop and exits cleanly', async () => {
      const fake = fakeTailscale()
      const dev = phoneRun(fake)

      const { exit } = await untilStarted(dev, 3)
      await until(() => dev.output().includes(SHARED_URL))
      dev.interrupt()

      expect(await exit).toBe(0)
      expect(fake.serve()).toEqual({})
    })

    it('removes the share when a service exits', async () => {
      const fake = fakeTailscale()
      const dev = phoneRun(fake)

      const { exit } = await untilStarted(dev, 3)
      await until(() => dev.output().includes(SHARED_URL))
      dev.services.end({ reason: 'exited', name: 'bridge', code: 2 })

      expect(await exit).toBe(2)
      expect(fake.serve()).toEqual({})
    })

    it('removes the share when interrupted while it opens, and prints no code', async () => {
      const fake = fakeTailscale()
      const dev = phoneRun(fake)
      const interruptingOpen: Tailscale = async (args) => {
        const ran = await fake.tailscale(args)
        if (args[1] === '--bg') dev.interrupt()
        return ran
      }
      dev.run.phone = {
        tailscale: interruptingOpen,
        databasePage: async () => 404,
      }

      await runDev(dev.run)

      expect(fake.serve()).toEqual({})
      expect(dev.output()).not.toContain(SHARED_URL)
    })

    it('removes a share that opened but failed, and exits non-zero', async () => {
      const fake = fakeTailscale()
      const dev = phoneRun(fake)
      const failingOpen: Tailscale = async (args) => {
        const ran = await fake.tailscale(args)
        return args[1] === '--bg'
          ? { code: 1, stdout: '', stderr: 'Invented refusal.' }
          : ran
      }
      dev.run.phone = { tailscale: failingOpen, databasePage: async () => 404 }

      const exitCode = await runDev(dev.run)

      expect(exitCode).toBe(1)
      expect(dev.output()).toContain('Invented refusal.')
      expect(fake.serve()).toEqual({})
    })

    it('names the removal command and exits non-zero when the share stays', async () => {
      const fake = fakeTailscale({
        replies: { off: { code: 1, stdout: '', stderr: '' } },
      })
      const dev = phoneRun(fake)

      const { exit } = await untilStarted(dev, 3)
      await until(() => dev.output().includes(SHARED_URL))
      dev.interrupt()

      expect(await exit).toBe(1)
      expect(dev.output()).toContain('tailscale.exe serve --https=443 off')
    })
  })
})
