import { ActionButton } from './action-button.tsx'
import type { Press, Verdict as VerdictCopy, VerdictButton } from './copy.ts'

interface VerdictProps {
  verdict: VerdictCopy
  busy: boolean
  /** A failed press from here, said under the line. */
  failure: string | null
  onPress: (press: Press) => void
}

/** The line over the tiles, with the one or two presses that answer it. */
export function Verdict({ verdict, busy, failure, onPress }: VerdictProps) {
  const [first, second] = verdict.buttons
  const button = ({ label, press, primary }: VerdictButton) => (
    <ActionButton
      primary={primary}
      disabled={busy}
      onClick={() => onPress(press)}
      className="px-2.5 max-[599px]:flex-1 max-[599px]:gap-1.5 min-[600px]:px-5.5 lg:px-6.5"
    >
      {label}
    </ActionButton>
  )
  return (
    <section
      aria-labelledby="verdict"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-[2.5px] border-foreground bg-card p-4 min-[600px]:p-5"
    >
      <div aria-live="polite" className="flex flex-col gap-1">
        <h1
          id="verdict"
          className="font-heading text-xl font-black min-[600px]:text-2xl"
        >
          {verdict.heading}
        </h1>
        <p className="text-muted-foreground">{verdict.line}</p>
        {failure !== null && (
          <p role="alert" className="font-extrabold">
            {failure}
          </p>
        )}
      </div>
      <div className="flex gap-2 max-[599px]:w-full">
        {first !== undefined && button(first)}
        {second !== undefined && button(second)}
      </div>
    </section>
  )
}
