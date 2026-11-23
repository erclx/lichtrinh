// The RMS of speech sits well under full scale, so it is lifted to fill the bar.
const GAIN = 4

/**
 * Reads how loud `stream` is, from 0 to 1, once per animation frame, and
 * stops when the page hides or the returned call runs. A browser with no
 * audio context reads nothing, and the bar holds still.
 */
export function watchLevel(
  stream: MediaStream,
  onLevel: (level: number) => void,
): () => void {
  if (typeof AudioContext === 'undefined') return () => undefined
  const context = new AudioContext()
  // Safari opens a context suspended when it starts after an await.
  context.resume().catch(() => undefined)
  const source = context.createMediaStreamSource(stream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const samples = new Uint8Array(analyser.fftSize)
  let frame = 0

  function tick() {
    analyser.getByteTimeDomainData(samples)
    let sum = 0
    for (const sample of samples) {
      const centered = (sample - 128) / 128
      sum += centered * centered
    }
    onLevel(Math.min(1, Math.sqrt(sum / samples.length) * GAIN))
    frame = requestAnimationFrame(tick)
  }

  function stop() {
    cancelAnimationFrame(frame)
    document.removeEventListener('visibilitychange', onVisibility)
    source.disconnect()
    context.close().catch(() => undefined)
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') stop()
  }

  document.addEventListener('visibilitychange', onVisibility)
  frame = requestAnimationFrame(tick)
  return stop
}
