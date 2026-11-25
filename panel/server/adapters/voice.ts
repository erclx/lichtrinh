const HEALTH_TIMEOUT_MS = 2_000

/** Whether a voice server answers on this machine, whoever started it. */
export async function voiceAnswers(
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
