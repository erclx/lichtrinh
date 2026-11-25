import type { ServiceId } from '../services.ts'
import { serviceOf } from '../services.ts'
import type {
  AllAction,
  LogLine,
  PanelState,
  ServiceAction,
  ServiceState,
} from '../state.ts'

export const PURPOSE: Record<ServiceId, string> = {
  voice: 'Speech to text for the talk button',
  model: 'The assistant on this PC',
  bridge: 'Links this PC to the family’s app',
  staging: 'Links this PC to the test copy',
}

export interface ServiceButton {
  action: ServiceAction
  label: string
  primary: boolean
}

/** What a press asks for, on one service or on all of them. */
export type Press =
  | { on: 'service'; id: ServiceId; action: ServiceAction }
  | { on: 'all'; action: AllAction }

export interface VerdictButton {
  label: string
  press: Press
  primary: boolean
}

export interface Verdict {
  heading: string
  line: string
  buttons: VerdictButton[]
}

/** Whether a service is in the way, so its tile and the verdict say so. */
export function isDown(service: ServiceState): boolean {
  if (service.status === 'failed') return true
  return service.status === 'stopped' && serviceOf(service.id).inTarget
}

export function statusWord({ id, status }: ServiceState): string {
  const model = id === 'model'
  switch (status) {
    case 'starting':
      return model ? 'Loading' : 'Starting'
    case 'stopping':
      return 'Stopping'
    case 'up':
      return model ? 'Loaded' : id === 'voice' ? 'Running' : 'Connected'
    case 'failed':
      return model || id === 'voice' ? 'Failed' : 'Dropped'
    case 'stopped':
      return model ? 'Not loaded' : id === 'staging' ? 'Off' : 'Stopped'
  }
}

export function detail(service: ServiceState, now: Date): string {
  switch (service.id) {
    case 'voice':
      return voiceDetail(service, now)
    case 'model':
      return modelDetail(service, now)
    case 'bridge':
      return bridgeDetail(service, now)
    case 'staging':
      return stagingDetail(service, now)
  }
}

function voiceDetail(service: ServiceState, now: Date): string {
  const meanwhile = 'Talk shows its voice-off screen meanwhile.'
  switch (service.status) {
    case 'up':
      return service.cause === 'elsewhere'
        ? 'Something else on this PC serves voice, so talk is on. Stop it there to run voice from here.'
        : 'Listening on this PC. Talk is on.'
    case 'starting':
      return 'Getting ready.'
    case 'stopping':
      return `Stopping. ${meanwhile}`
    case 'failed':
      return service.cause === 'not_answering'
        ? `Running, but not answering. ${meanwhile}`
        : `${gaveUp(service, now)} ${meanwhile}`
    case 'stopped':
      return `Stopped here. ${meanwhile}`
  }
}

function modelDetail(service: ServiceState, now: Date): string {
  switch (service.status) {
    case 'up':
      return freesIn(service.freesAt, now)
    case 'starting':
      return 'Loading onto the card.'
    case 'stopping':
      return 'Leaving the card.'
    case 'failed':
      return service.cause === 'not_answering'
        ? 'Ollama is not answering, and it starts with sudo systemctl start ollama. Chat cannot answer until it does.'
        : 'Could not load. Chat cannot answer until it does.'
    case 'stopped':
      return 'The card is free. Loads on the next message.'
  }
}

function bridgeDetail(service: ServiceState, now: Date): string {
  switch (service.status) {
    case 'up':
      return service.since === null
        ? 'Connected.'
        : `Connected since ${moment(service.since, now)}.`
    case 'starting':
      return 'Dialing the app.'
    case 'stopping':
      return 'Stopping. The app cannot reach this PC.'
    case 'failed':
      return service.cause === 'not_answering'
        ? 'Lost the app and could not reconnect.'
        : `${gaveUp(service, now)} The app cannot reach this PC.`
    case 'stopped':
      return 'Stopped here. The app cannot reach this PC.'
  }
}

function stagingDetail(service: ServiceState, now: Date): string {
  const apart = 'The family’s app is not affected.'
  switch (service.status) {
    case 'up':
      return 'Up now. Not counted in the line at the top.'
    case 'starting':
      return 'Dialing the test copy.'
    case 'stopping':
      return `Stopping. ${apart}`
    case 'failed':
      return service.cause === 'not_answering'
        ? `Lost the test copy. ${apart}`
        : `${gaveUp(service, now)} ${apart}`
    case 'stopped':
      return 'Off is normal here. Start all skips it.'
  }
}

/** A service's buttons, none while it changes or where it runs elsewhere. */
export function serviceButtons(service: ServiceState): ServiceButton[] {
  const { id, status, cause } = service
  if (status === 'starting' || status === 'stopping') return []
  if (id === 'model') {
    return status === 'up'
      ? [{ action: 'unload', label: 'Unload', primary: false }]
      : [{ action: 'load', label: 'Load', primary: status === 'failed' }]
  }
  if (status === 'up') {
    if (cause === 'elsewhere') return []
    return [
      { action: 'restart', label: 'Restart', primary: false },
      { action: 'stop', label: 'Stop', primary: false },
    ]
  }
  const primary = serviceOf(id).counted
  // A start does nothing to a process that runs and cannot be reached.
  return cause === 'not_answering'
    ? [
        { action: 'restart', label: 'Restart', primary },
        { action: 'stop', label: 'Stop', primary: false },
      ]
    : [{ action: 'start', label: 'Start', primary }]
}

const NAMES: Partial<Record<ServiceId, string>> = {
  voice: 'voice',
  model: 'the local model',
  bridge: 'the bridge',
}

const STOP_ALL: VerdictButton = {
  label: 'Stop all',
  press: { on: 'all', action: 'stop' },
  primary: false,
}
const START_ALL: VerdictButton = {
  label: 'Start all',
  press: { on: 'all', action: 'start' },
  primary: true,
}

/** The one line over the tiles. Staging never changes it. */
export function verdict(state: PanelState): Verdict {
  const of = (id: ServiceId) =>
    state.services.find((service) => service.id === id)
  const is = (id: ServiceId, status: ServiceState['status']) =>
    of(id)?.status === status
  const down = state.services.filter(
    (service) => serviceOf(service.id).counted && isDown(service),
  )

  if (is('voice', 'stopped') && is('bridge', 'stopped')) {
    const left = !is('model', 'stopped') || !is('staging', 'stopped')
    return {
      heading: 'Everything is stopped',
      line: 'Chat and talk are off until you start it again.',
      buttons: left ? [START_ALL, STOP_ALL] : [START_ALL],
    }
  }
  const [first, ...others] = down
  if (first !== undefined) {
    const start = others.length > 0 ? START_ALL : startOne(first)
    return {
      heading: downHeading(down),
      line: downLine(down, is('bridge', 'up')),
      buttons: [start, STOP_ALL],
    }
  }
  if (is('voice', 'stopping') || is('bridge', 'stopping')) {
    return {
      heading: 'Stopping',
      line: 'Give it a moment.',
      buttons: [STOP_ALL],
    }
  }
  if (is('voice', 'starting') || is('bridge', 'starting')) {
    return {
      heading: 'Starting',
      line: 'Give it a moment.',
      buttons: [STOP_ALL],
    }
  }
  return {
    heading: 'Everything is up',
    line: is('model', 'up')
      ? 'Voice, the local model, and the bridge are all ready.'
      : is('model', 'starting')
        ? 'Voice and the bridge are ready, and the model is loading.'
        : 'Voice and the bridge are ready, and the model loads on the next message.',
    buttons: [STOP_ALL],
  }
}

function startOne(service: ServiceState): VerdictButton {
  const [button] = serviceButtons(service)
  const action = button?.action ?? 'start'
  return {
    label: `${button?.label ?? 'Start'} ${service.id}`,
    press: { on: 'service', id: service.id, action },
    primary: true,
  }
}

function downHeading(down: ServiceState[]): string {
  const names = down.map(({ id }) => NAMES[id] ?? id)
  const joined =
    names.length > 2
      ? `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
      : names.join(' and ')
  const sentence = `${joined} ${names.length > 1 ? 'are' : 'is'} down`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

function downLine(down: ServiceState[], bridgeUp: boolean): string {
  const has = (id: ServiceId) => down.some((service) => service.id === id)
  if (has('bridge')) {
    return 'The app cannot reach this PC, so chat and talk are off.'
  }
  if (has('voice') && has('model')) return 'Chat cannot answer and talk is off.'
  if (has('voice')) {
    return bridgeUp
      ? 'Chat works, and talk is off until voice starts.'
      : 'Talk is off until voice starts.'
  }
  return 'Talk still hears, and chat cannot answer until the model loads.'
}

/** What Stop all takes away, naming staging while its bridge runs. */
export function stopAllWarning(state: PanelState): string {
  const staging = state.services.find(({ id }) => id === 'staging')
  const off =
    'Chat and talk will be off for the family until you start it again.'
  return staging === undefined || staging.status === 'stopped'
    ? off
    : `${off} The staging bridge stops too.`
}

/** A failed action, said where its button is. */
export function failureLine(press: Press): string {
  if (press.on === 'all') {
    return press.action === 'start'
      ? 'Not everything started. The log lines below say why.'
      : 'Not everything stopped. The log lines below say why.'
  }
  const { label } = serviceOf(press.id)
  const done = {
    start: 'did not start',
    stop: 'did not stop',
    restart: 'did not restart',
    load: 'did not load',
    unload: 'did not unload',
  }[press.action]
  return `${label} ${done}. Its log lines say why.`
}

const STRONG_EVENTS = new Set([
  'closed',
  'failed',
  'ready',
  'started',
  'stopped',
])

/** Whether a log line's event changes what the service is. */
export function isStrong(line: LogLine): boolean {
  return line.event !== null && STRONG_EVENTS.has(line.event)
}

/** A log line's time, with its day once that is not today. */
export function logTime(at: string, now: Date): string {
  return `${dayPrefix(new Date(at), now)}${time(new Date(at), true)}`
}

/** The header's clock, such as `Sat 22 Nov 2031, 14:24`. */
export function clock(now: Date): string {
  const day = now.toLocaleDateString('en-GB', { weekday: 'short' })
  return `${day} ${dayOf(now)} ${now.getFullYear()}, ${time(now, false)}`
}

function gaveUp({ since, restarts }: ServiceState, now: Date): string {
  const at = since === null ? '' : ` at ${moment(since, now)}`
  if (restarts === 0) return `Failed${at}.`
  return `Failed${at} after ${restarts} ${restarts === 1 ? 'restart' : 'restarts'}.`
}

function freesIn(freesAt: string | null, now: Date): string {
  if (freesAt === null) return 'On the card.'
  const minutes = Math.ceil(
    (new Date(freesAt).getTime() - now.getTime()) / 60_000,
  )
  return minutes <= 1
    ? 'Frees the card in under a minute.'
    : `Frees the card in ${minutes} min.`
}

function moment(at: string, now: Date): string {
  const day = dayPrefix(new Date(at), now)
  // Mid-sentence, where a month keeps its capital and a day word does not.
  return `${day === YESTERDAY ? day.toLowerCase() : day}${time(new Date(at), false)}`
}

const YESTERDAY = 'Yesterday '

function dayPrefix(at: Date, now: Date): string {
  if (at.toDateString() === now.toDateString()) return ''
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return at.toDateString() === yesterday.toDateString()
    ? YESTERDAY
    : `${dayOf(at)} `
}

function dayOf(at: Date): string {
  return `${at.getDate()} ${at.toLocaleDateString('en-GB', { month: 'short' })}`
}

function time(at: Date, seconds: boolean): string {
  return at.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  })
}
