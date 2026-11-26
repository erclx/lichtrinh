import { useEffect, useRef, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'

import type { PanelState } from '../state.ts'
import { Activity } from './activity.tsx'
import type { Press } from './copy.ts'
import { clock, failureLine, stopAllWarning, verdict } from './copy.ts'
import { GpuCard } from './gpu-card.tsx'
import { Messages } from './messages.tsx'
import { ServiceTile } from './service-tile.tsx'
import { StopAllDialog } from './stop-all-dialog.tsx'
import { Verdict } from './verdict.tsx'

interface PanelPageProps {
  state: PanelState
  /** Whether the last read failed, so what shows is from the one before. */
  stale: boolean
  /** Presses whose commands have not ended. */
  pending: readonly Press[]
  failure: Press | null
  onPress: (press: Press) => void
}

const COLUMNS: Record<number, string> = {
  4: 'min-[600px]:grid-cols-2 lg:grid-cols-4',
  3: 'min-[600px]:grid-cols-2 lg:grid-cols-3',
  2: 'min-[600px]:grid-cols-2',
}

/** The owner's panel, with each failed service in a row of its own on top. */
export function PanelPage({
  state,
  stale,
  pending,
  failure,
  onPress,
}: PanelPageProps) {
  const [confirming, setConfirming] = useState(false)
  const page = useRef<HTMLDivElement>(null)
  const lastPress = useRef<Press | null>(null)
  const now = new Date(state.readAt)
  const { app } = state
  const failed = state.services.filter((service) => service.status === 'failed')
  const rest = state.services.filter((service) => service.status !== 'failed')
  const allPending = pending.some((press) => press.on === 'all')

  // A press can take its own button away, which drops a keyboard to the top.
  useEffect(() => {
    const pressed = lastPress.current
    if (pressed === null || document.activeElement !== document.body) return
    const tile =
      pressed.on === 'service'
        ? page.current?.querySelector(`[data-service="${pressed.id}"] button`)
        : null
    const target = tile ?? page.current?.querySelector('[data-verdict] button')
    if (target instanceof HTMLElement) target.focus({ preventScroll: true })
  })

  // A click on nothing also leaves the page unfocused, and means it.
  useEffect(() => {
    const forget = () => {
      lastPress.current = null
    }
    document.addEventListener('pointerdown', forget)
    return () => document.removeEventListener('pointerdown', forget)
  }, [])

  function press(next: Press) {
    lastPress.current = next
    onPress(next)
  }

  return (
    <div
      ref={page}
      className="mx-auto flex max-w-[1408px] flex-col px-4 pb-8 tabular-nums"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2.5 pb-3.5">
        <div className="flex items-center gap-2.5 text-lg font-extrabold">
          <BrandMark className="size-8.5 shrink-0" />
          <span lang="vi">Lịch trình</span>
          <span className="text-sm font-bold text-muted-foreground">
            This PC
          </span>
        </div>
        <time
          dateTime={state.readAt}
          className="text-sm font-bold whitespace-nowrap text-muted-foreground"
        >
          {clock(now)}
        </time>
      </header>
      <main className="flex flex-col gap-5.5">
        {stale && (
          <p
            role="alert"
            className="rounded-xl border-2 border-foreground bg-card p-4"
          >
            The panel cannot read this PC, so this is from {clock(now)}. If this
            stays, double-click the shortcut.
          </p>
        )}
        <div data-verdict>
          <Verdict
            verdict={verdict(state)}
            busy={allPending}
            failure={failure?.on === 'all' ? failureLine(failure) : null}
            onPress={(next) => {
              if (next.on === 'all' && next.action === 'stop') {
                setConfirming(true)
              } else {
                press(next)
              }
            }}
          />
        </div>
        <section aria-labelledby="services" className="flex flex-col gap-2">
          <SectionHeading id="services">Services</SectionHeading>
          <div className={cn('grid gap-3', COLUMNS[rest.length])}>
            {[...failed, ...rest].map((service) => (
              <ServiceTile
                key={service.id}
                service={service}
                now={now}
                busy={
                  allPending ||
                  pending.some(
                    (one) => one.on === 'service' && one.id === service.id,
                  )
                }
                failure={
                  failure?.on === 'service' && failure.id === service.id
                    ? failureLine(failure)
                    : null
                }
                narrow={rest.length === 4}
                solo={rest.length % 2 === 1 && service === rest.at(-1)}
                onAction={(action) =>
                  press({ on: 'service', id: service.id, action })
                }
              />
            ))}
          </div>
        </section>
        <div className="grid gap-5.5 lg:grid-cols-2 lg:gap-3">
          <section aria-labelledby="card" className="flex flex-col gap-2">
            <SectionHeading id="card">Graphics card</SectionHeading>
            <GpuCard gpu={state.gpu} />
          </section>
          {app.reach === 'read' && (
            <section aria-labelledby="activity" className="flex flex-col gap-2">
              <SectionHeading id="activity">Activity</SectionHeading>
              <Activity activity={app.activity} now={now} />
            </section>
          )}
        </div>
        {app.reach !== 'unset' && (
          <section aria-labelledby="messages" className="flex flex-col gap-2">
            <SectionHeading id="messages">Messages</SectionHeading>
            <Messages app={app} now={now} />
          </section>
        )}
      </main>
      <StopAllDialog
        open={confirming}
        warning={stopAllWarning(state)}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          press({ on: 'all', action: 'stop' })
        }}
      />
    </div>
  )
}

function SectionHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2
      id={id}
      className="mx-1 font-heading text-sm font-extrabold text-muted-foreground"
    >
      {children}
    </h2>
  )
}
