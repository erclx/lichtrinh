const HEALTH_TIMEOUT_MS = 2_000
// As often as the bridge asks, since voice logs every one.
const ASK_EVERY_MS = 20_000

/**
 * Reads whether a voice server answers on this machine, whoever started it.
 * A yes stands for a while, for the run that gave it alone, so a server that
 * ended never reads as one that answers.
 */
export function createVoiceReader(
  fetcher: typeof fetch,
  voiceUrl: string,
  now: () => Date,
) {
  let heard: { run: string; at: number } | undefined

  return async (run: string | null): Promise<boolean> => {
    const at = now().getTime()
    if (heard?.run === run && at - heard.at < ASK_EVERY_MS) return true
    const answers = await voiceAnswers(fetcher, voiceUrl)
    heard = answers && run !== null ? { run, at } : undefined
    return answers
  }
}

async function voiceAnswers(
  fetcher: typeof fetch,
  voiceUrl: string,
): Promise<boolean> {
  try {
    const response = await fetcher(`${voiceUrl}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}
