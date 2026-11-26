import { describe, expect, it } from 'vitest'

import {
  fakeTailscale,
  HOST,
  readyStatus,
  shareOf,
} from './fixtures/fake-tailscale'
import {
  checkAddress,
  closeShare,
  openShare,
  phoneBanner,
  phoneEnv,
  readTailnet,
} from './phone'

const PORT = 5193

describe('readTailnet', () => {
  it('reads the machine’s tailnet name without its trailing dot', async () => {
    const fake = fakeTailscale()

    expect(await readTailnet(fake.tailscale)).toEqual({ host: HOST })
  })

  it('refuses when Tailscale is missing', async () => {
    const fake = fakeTailscale({
      replies: { status: { code: 127, stdout: '', stderr: '' } },
    })

    expect(await readTailnet(fake.tailscale)).toMatchObject({
      need: 'Tailscale on Windows',
    })
  })

  it('refuses when signed out, naming the state', async () => {
    const fake = fakeTailscale({
      status: { ...readyStatus(), BackendState: 'NeedsLogin' },
    })

    const read = await readTailnet(fake.tailscale)

    expect(read).toMatchObject({ need: 'Tailscale signed in and connected' })
    expect(read).toHaveProperty('fix', expect.stringContaining('NeedsLogin'))
  })

  it('refuses a status that does not parse', async () => {
    const fake = fakeTailscale({
      replies: { status: { code: 0, stdout: 'not json', stderr: '' } },
    })

    expect(await readTailnet(fake.tailscale)).toMatchObject({
      need: 'a readable Tailscale status',
    })
  })

  it('refuses a status missing the machine’s name', async () => {
    const fake = fakeTailscale({ status: { BackendState: 'Running' } })

    expect(await readTailnet(fake.tailscale)).toMatchObject({
      need: 'a readable Tailscale status',
    })
  })

  it('refuses a status that exits non-zero', async () => {
    const fake = fakeTailscale({
      replies: {
        status: { code: 1, stdout: JSON.stringify(readyStatus()), stderr: '' },
      },
    })

    expect(await readTailnet(fake.tailscale)).toMatchObject({
      need: 'a readable Tailscale status',
    })
  })

  it('refuses without MagicDNS', async () => {
    const fake = fakeTailscale({
      status: { ...readyStatus(), Self: { DNSName: '' } },
    })

    expect(await readTailnet(fake.tailscale)).toMatchObject({
      need: 'a tailnet name for this machine',
    })
  })

  it('refuses without a certificate for the name', async () => {
    const fake = fakeTailscale({
      status: { ...readyStatus(), CertDomains: null },
    })

    expect(await readTailnet(fake.tailscale)).toMatchObject({
      need: 'HTTPS certificates on the tailnet',
    })
  })
})

describe('checkAddress', () => {
  it('clears a free address', async () => {
    const fake = fakeTailscale()

    expect(await checkAddress(fake.tailscale, HOST, PORT)).toBeUndefined()
  })

  it('clears this run’s own leftover share on its own port', async () => {
    const fake = fakeTailscale({ serve: shareOf(PORT) })

    expect(await checkAddress(fake.tailscale, HOST, PORT)).toBeUndefined()
  })

  it('refuses while Funnel is on for any address', async () => {
    const fake = fakeTailscale({
      serve: { AllowFunnel: { [`${HOST}:8443`]: true } },
    })

    expect(await checkAddress(fake.tailscale, HOST, PORT)).toMatchObject({
      need: 'Funnel off',
    })
  })

  it('refuses a share of another port and names it', async () => {
    const fake = fakeTailscale({ serve: shareOf(5200) })

    const refused = await checkAddress(fake.tailscale, HOST, PORT)

    expect(refused?.fix).toContain('http://127.0.0.1:5200')
  })

  it('refuses a share on the address that is not a single proxy', async () => {
    const fake = fakeTailscale({
      serve: {
        TCP: { '443': { HTTPS: true } },
        Web: {
          [`${HOST}:443`]: {
            Handlers: {
              '/': { Proxy: `http://127.0.0.1:${PORT}` },
              '/files': {},
            },
          },
        },
      },
    })

    const refused = await checkAddress(fake.tailscale, HOST, PORT)

    expect(refused?.fix).toContain('something this run did not make')
  })

  it('refuses a foreground share on the address', async () => {
    const fake = fakeTailscale({
      serve: { Foreground: { session: shareOf(PORT) } },
    })

    const refused = await checkAddress(fake.tailscale, HOST, PORT)

    expect(refused?.fix).toContain('foreground')
  })

  it('refuses a serve status that does not parse', async () => {
    const fake = fakeTailscale({
      replies: { 'serve status': { code: 0, stdout: '[', stderr: '' } },
    })

    expect(await checkAddress(fake.tailscale, HOST, PORT)).toMatchObject({
      need: 'a readable Tailscale serve status',
    })
  })
})

describe('openShare', () => {
  it('shares the port in the background on 443 and reads it back', async () => {
    const fake = fakeTailscale()

    const failure = await openShare(fake.tailscale, HOST, PORT)

    expect(failure).toBeUndefined()
    expect(fake.calls).toContainEqual([
      'serve',
      '--bg',
      '--yes',
      '--https=443',
      'http://127.0.0.1:5193',
    ])
    expect(fake.serve()).toEqual(shareOf(PORT))
  })

  it('opens nothing while Funnel is on', async () => {
    const fake = fakeTailscale({
      serve: { AllowFunnel: { [`${HOST}:443`]: true } },
    })

    const failure = await openShare(fake.tailscale, HOST, PORT)

    expect(failure).toContain('Funnel off')
    expect(fake.calls.filter((args) => args[1] === '--bg')).toEqual([])
  })

  it('names what Tailscale said when it refuses the share', async () => {
    const fake = fakeTailscale({
      replies: {
        open: { code: 1, stdout: '', stderr: 'Serve is not enabled.\n' },
      },
    })

    const failure = await openShare(fake.tailscale, HOST, PORT)

    expect(failure).toContain('Serve is not enabled.')
  })

  it('fails when the share does not read back as this run’s', async () => {
    const fake = fakeTailscale({
      replies: { open: { code: 0, stdout: '', stderr: '' } },
    })

    expect(await openShare(fake.tailscale, HOST, PORT)).toBeDefined()
  })
})

describe('closeShare', () => {
  it('removes this run’s share and confirms it gone', async () => {
    const fake = fakeTailscale({ serve: shareOf(PORT) })

    const closed = await closeShare(fake.tailscale, HOST, PORT)

    expect(closed).toBe('closed')
    expect(fake.calls).toContainEqual(['serve', '--https=443', 'off'])
    expect(fake.serve()).toEqual({})
  })

  it('leaves a share of another port alone', async () => {
    const fake = fakeTailscale({ serve: shareOf(5200) })

    const closed = await closeShare(fake.tailscale, HOST, PORT)

    expect(closed).toBe('left')
    expect(fake.serve()).toEqual(shareOf(5200))
  })

  it('reads as closed when nothing was shared', async () => {
    const fake = fakeTailscale()

    expect(await closeShare(fake.tailscale, HOST, PORT)).toBe('closed')
    expect(fake.calls).not.toContainEqual(['serve', '--https=443', 'off'])
  })

  it('removes this run’s share even with Funnel turned on beside it', async () => {
    const fake = fakeTailscale({
      serve: { ...shareOf(PORT), AllowFunnel: { [`${HOST}:443`]: true } },
    })

    expect(await closeShare(fake.tailscale, HOST, PORT)).toBe('closed')
  })

  it('fails when the share is still listed after the removal', async () => {
    const fake = fakeTailscale({
      serve: shareOf(PORT),
      replies: { off: { code: 1, stdout: '', stderr: '' } },
    })

    expect(await closeShare(fake.tailscale, HOST, PORT)).toBe('failed')
  })

  it('fails when the status cannot be read', async () => {
    const fake = fakeTailscale({
      replies: { 'serve status': { code: 1, stdout: '', stderr: '' } },
    })

    expect(await closeShare(fake.tailscale, HOST, PORT)).toBe('failed')
  })
})

describe('phoneEnv', () => {
  it('allows the tailnet name, shuts the database page, and turns on the preview', () => {
    expect(phoneEnv(HOST)).toEqual({
      LICHTRINH_PHONE: '1',
      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: HOST,
      X_LOCAL_EXPLORER: 'false',
    })
  })
})

describe('phoneBanner', () => {
  it('prints the private address beneath the code', () => {
    expect(phoneBanner(HOST)).toContain(`https://${HOST}/`)
  })
})
