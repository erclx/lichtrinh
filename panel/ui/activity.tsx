import type { AppActivity } from '../state.ts'
import { lastTurn } from './copy.ts'

interface ActivityProps {
  activity: AppActivity
  now: Date
}

/** The family's turns today, counted from this PC's midnight. */
export function Activity({ activity, now }: ActivityProps) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      <Fact label="Last turn" value={lastTurn(activity.lastAt, now)} />
      <Fact label="Turns today" value={String(activity.count)} />
      <Fact label="Failed today" value={String(activity.failed)} />
    </dl>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  // The value reads first on the page and the label first to a reader.
  return (
    <div className="flex flex-col-reverse justify-end rounded-[18px] bg-muted px-3.5 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-extrabold">{value}</dd>
    </div>
  )
}
