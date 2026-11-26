import type { OwnerMessage } from '@shared/owner.ts'

import type { AppView } from '../state.ts'
import {
  APP_UNREACHABLE,
  endNote,
  messageKind,
  NO_MESSAGES,
  shortTime,
} from './copy.ts'

interface MessagesProps {
  /** The app as last read, never `unset`, which draws no section. */
  app: Exclude<AppView, { reach: 'unset' }>
  now: Date
}

/** The family's recent messages, newest first, each reply with its model. */
export function Messages({ app, now }: MessagesProps) {
  if (app.reach === 'unreachable') {
    return <Note>{APP_UNREACHABLE}</Note>
  }
  if (app.messages.length === 0) return <Note>{NO_MESSAGES}</Note>
  return (
    <ol className="rounded-xl border-2 bg-card px-4 py-1.5">
      {app.messages.map((message) => (
        <Row key={message.id} message={message} now={now} />
      ))}
    </ol>
  )
}

function Row({ message, now }: { message: OwnerMessage; now: Date }) {
  const note = endNote(message)
  const text = message.text.trim() === '' ? null : message.text
  return (
    <li className="grid grid-cols-[70px_1fr] items-baseline gap-x-2.5 gap-y-0.5 border-t-2 px-1 py-3.5 text-sm first:border-t-0 min-[600px]:grid-cols-[70px_96px_1fr_180px] min-[600px]:gap-3 lg:grid-cols-[86px_110px_1fr_190px]">
      <time dateTime={message.at} className="text-muted-foreground">
        {shortTime(message.at, now)}
      </time>
      <span className="font-extrabold">{messageKind(message)}</span>
      <p className="col-span-full flex min-w-0 flex-col text-base wrap-break-word min-[600px]:col-span-1">
        {text !== null && <span lang="vi">{text}</span>}
        {note !== null && (
          <span lang="en" className="text-muted-foreground">
            {note}
          </span>
        )}
      </p>
      {message.model !== null && (
        <span className="col-span-full text-muted-foreground min-[600px]:col-span-1">
          {message.model}
        </span>
      )}
    </li>
  )
}

function Note({ children }: { children: string }) {
  return (
    <p className="rounded-xl border-2 bg-card p-4 text-sm text-muted-foreground">
      {children}
    </p>
  )
}
