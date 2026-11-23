import { assistantTools, parseToolCall } from '@shared/assistant-tools.ts'
import type { DownFrame, UpFrame } from '@shared/bridge-frames.ts'

import type { Message, TurnModel } from './ollama.ts'

export type TurnFrame = Extract<DownFrame, { type: 'turn' }>
export type ToolCallFrame = Extract<UpFrame, { type: 'tool_call' }>

const MAX_ROUNDS = 6

// Under the relay's 120-second backstop, so the bridge names the timeout
// rather than the relay giving up on a silent socket.
const TURN_TIMEOUT_MS = 110_000

export interface TurnDeps {
  model: TurnModel
  send: (frame: UpFrame) => void
  /** Sends a tool call up to the relay and resolves with its result. */
  callTool: (frame: ToolCallFrame) => Promise<Record<string, unknown>>
}

export interface RunningTurn {
  done: Promise<void>
  /** Stops the turn because the relay cancelled it, sending nothing more. */
  cancel: () => void
}

type Ended = 'cancelled' | 'timeout' | undefined

/**
 * One turn as a tool loop over Ollama's chat API. Every tool call goes up to
 * the relay, and it ends on a plain reply, six rounds, a cancel, or a timeout.
 */
export function runTurn(
  turn: TurnFrame,
  deps: TurnDeps,
  limits: { timeoutMs?: number } = {},
): RunningTurn {
  let ended: Ended
  const stop = (why: Exclude<Ended, undefined>) => {
    if (ended !== undefined) return
    ended = why
    deps.model.abort()
  }
  const timer = setTimeout(
    () => stop('timeout'),
    limits.timeoutMs ?? TURN_TIMEOUT_MS,
  )
  const up = (frame: UpFrame) => {
    if (ended === undefined) deps.send(frame)
  }
  const done = loop(turn, deps, up, () => ended)
    .catch(() => {
      if (ended === undefined) {
        up({ type: 'failed', turnId: turn.turnId, reason: 'model_error' })
      }
    })
    .finally(() => {
      clearTimeout(timer)
      if (ended === 'timeout') {
        deps.send({ type: 'failed', turnId: turn.turnId, reason: 'timeout' })
      }
    })
  return { done, cancel: () => stop('cancelled') }
}

async function loop(
  turn: TurnFrame,
  deps: TurnDeps,
  up: (frame: UpFrame) => void,
  ended: () => Ended,
) {
  const { turnId } = turn
  const messages: Message[] = turn.messages.map((m) => ({ ...m }))
  const guard = removalGuard(turn)
  let reply = ''
  let calledAny = false
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (ended() !== undefined) return
    const stream = await deps.model.chat({
      model: turn.model,
      messages,
      tools: assistantTools,
    })
    let content = ''
    let thinking = ''
    const toolCalls: NonNullable<Message['tool_calls']> = []
    for await (const { message } of stream) {
      thinking += message.thinking ?? ''
      toolCalls.push(...(message.tool_calls ?? []))
      if (message.content === '') continue
      // Text from an earlier round is a separate paragraph of the reply.
      const piece =
        content === '' && reply !== ''
          ? `\n\n${message.content}`
          : message.content
      content += piece
      up({ type: 'delta', turnId, text: piece })
    }
    if (ended() !== undefined) return
    reply += content
    if (toolCalls.length === 0) {
      if (reply.trim() === '' && !calledAny) {
        up({ type: 'failed', turnId, reason: 'empty_reply' })
      } else {
        up({ type: 'final', turnId, text: reply })
      }
      return
    }
    calledAny = true
    messages.push({
      role: 'assistant',
      content,
      thinking,
      tool_calls: toolCalls,
    })
    const refusals = guard.check(toolCalls.map((call) => call.function.name))
    for (const [i, call] of toolCalls.entries()) {
      const { name, arguments: args } = call.function
      const result =
        refusals[i] ?? (await callUp(turnId, name, args, deps.callTool))
      if (ended() !== undefined) return
      messages.push({
        role: 'tool',
        tool_name: name,
        content: JSON.stringify(result),
      })
    }
  }
  up({ type: 'failed', turnId, reason: 'step_cap' })
}

async function callUp(
  turnId: string,
  name: string,
  args: unknown,
  callTool: TurnDeps['callTool'],
): Promise<Record<string, unknown>> {
  const parsed = parseToolCall(name, args)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  return callTool({
    type: 'tool_call',
    turnId,
    callId: crypto.randomUUID(),
    name,
    arguments: args,
  })
}

const CONFIRM_FIRST = {
  ok: false,
  error: 'confirm_first',
  hint: 'List the entries that would go and ask the traveler for a yes before removing several',
}

/**
 * Holds a turn to one removal unless the last reply asked a question. A
 * round asking for several is refused whole, so none lands before the ask.
 */
function removalGuard(turn: TurnFrame) {
  const lastReply = turn.messages
    .slice(0, -1)
    .findLast((message) => message.role === 'assistant')
  const asked = lastReply?.content.trim().endsWith('?') ?? false
  let removed = 0
  return {
    check(names: string[]): (Record<string, unknown> | undefined)[] {
      const removals = names.filter((name) => name === 'remove_entry').length
      const allowed = asked || removed + removals <= 1
      if (allowed) removed += removals
      return names.map((name) =>
        name === 'remove_entry' && !allowed ? CONFIRM_FIRST : undefined,
      )
    },
  }
}
