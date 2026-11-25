import { useId, useState } from 'react'

import { cn } from '@/lib/utils'

import { serviceOf } from '../services.ts'
import type { LogLine, ServiceAction, ServiceState } from '../state.ts'
import { ActionButton } from './action-button.tsx'
import type { ServiceButton } from './copy.ts'
import {
  detail,
  isDown,
  isStrong,
  logTime,
  PURPOSE,
  serviceButtons,
  statusWord,
} from './copy.ts'
import { ChevronIcon, ServiceIcon } from './icons.tsx'

interface ServiceTileProps {
  service: ServiceState
  now: Date
  busy: boolean
  /** A failed press from this tile, said beside its button. */
  failure: string | null
  /** Whether the tile closes a row of its own on a tablet. */
  solo?: boolean
  /** Whether a desktop row is narrow enough for two lines of detail. */
  narrow?: boolean
  onAction: (action: ServiceAction) => void
}

/** One service. A failed one takes the whole row with its log lines open. */
export function ServiceTile({
  service,
  now,
  busy,
  failure,
  solo = false,
  narrow = false,
  onAction,
}: ServiceTileProps) {
  const [toggled, setToggled] = useState<boolean | null>(null)
  const ids = useId()
  const failed = service.status === 'failed'
  const down = isDown(service)
  const open = failed || (toggled ?? failure !== null)
  const { label, counted } = serviceOf(service.id)
  const [first, second] = serviceButtons(service)
  const changing =
    service.status === 'starting' || service.status === 'stopping'

  const button = (shown: ServiceButton) => (
    <ActionButton
      primary={shown.primary}
      disabled={busy}
      aria-label={`${shown.label} ${label}`}
      onClick={() => onAction(shown.action)}
    >
      {shown.label}
    </ActionButton>
  )

  return (
    <section
      aria-labelledby={`${ids}-name`}
      data-service={service.id}
      className={cn(
        'flex flex-col rounded-xl border-2 bg-card p-4',
        down && 'border-[2.5px] border-foreground',
        !counted && !failed && 'border-dashed bg-transparent',
        failed &&
          'col-span-full gap-3.5 min-[600px]:flex-row min-[600px]:gap-7',
        solo && 'min-[600px]:max-lg:col-span-full',
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2',
          failed && 'min-[600px]:flex-1',
          solo &&
            'min-[600px]:max-lg:grid min-[600px]:max-lg:grid-cols-[1fr_auto] min-[600px]:max-lg:gap-x-3',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2.5',
            solo && 'min-[600px]:max-lg:col-span-full',
          )}
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
            <ServiceIcon id={service.id} />
          </span>
          <h3
            id={`${ids}-name`}
            className="min-w-0 flex-1 font-heading text-lg leading-[1.09] font-extrabold"
          >
            {label}
          </h3>
          <span
            className={cn(
              'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-extrabold whitespace-nowrap',
              down ? 'bg-primary text-primary-foreground' : 'bg-muted',
            )}
          >
            {statusWord(service)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{PURPOSE[service.id]}</p>
        <p className={cn('text-sm', narrow && 'lg:min-h-12.5')}>
          {detail(service, now)}
        </p>
        <div
          className={cn(
            'flex min-h-16 flex-wrap gap-2 pt-1.5',
            solo &&
              'min-[600px]:max-lg:col-start-2 min-[600px]:max-lg:row-span-2 min-[600px]:max-lg:row-start-2 min-[600px]:max-lg:-mt-1 min-[600px]:max-lg:pt-0',
          )}
        >
          {changing && (
            <ActionButton disabled>{statusWord(service)}</ActionButton>
          )}
          {first !== undefined && button(first)}
          {second !== undefined && button(second)}
        </div>
        {failure !== null && (
          <p role="alert" className="text-sm font-extrabold">
            {failure}
          </p>
        )}
      </div>
      {failed ? (
        <LogLines
          lines={service.logs}
          now={now}
          className="min-[600px]:flex-[1.4]"
        />
      ) : (
        <>
          <div className="min-h-3.5 flex-1" />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${ids}-log`}
            onClick={() => setToggled(!open)}
            className="-mx-1 -mb-3 flex h-16 items-center justify-between rounded-b-lg border-t-2 px-1 text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Recent log lines
            <span className="sr-only">of {label}</span>
            <ChevronIcon
              className={cn(
                'size-5.5 text-muted-foreground',
                open && 'rotate-180',
              )}
            />
          </button>
          <div id={`${ids}-log`} hidden={!open} className="pt-3.5">
            <LogLines lines={service.logs} now={now} />
          </div>
        </>
      )}
    </section>
  )
}

interface LogLinesProps {
  lines: LogLine[]
  now: Date
  className?: string
}

function LogLines({ lines, now, className }: LogLinesProps) {
  return (
    <ol
      aria-label="Recent log lines, newest first"
      className={cn(
        'min-w-0 rounded-lg bg-muted px-3.5 py-3 text-sm leading-normal text-muted-foreground',
        className,
      )}
    >
      {lines.length === 0 && <li>No log lines yet</li>}
      {keyed(lines).map(({ key, line }) => (
        <li key={key} className="wrap-anywhere">
          {logTime(line.at, now)}{' '}
          {line.event !== null &&
            (isStrong(line) ? (
              <b className="font-extrabold text-foreground">{line.event}</b>
            ) : (
              line.event
            ))}
          {line.event !== null && ' '}
          {line.text}
        </li>
      ))}
    </ol>
  )
}

/** Two lines of one instant can read the same, so a repeat takes a count. */
function keyed(lines: LogLine[]) {
  const seen = new Map<string, number>()
  return lines.map((line) => {
    const name = `${line.at} ${line.event} ${line.text}`
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    return { key: `${name} ${count}`, line }
  })
}
