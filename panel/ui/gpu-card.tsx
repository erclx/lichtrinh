import type { GpuState } from '../state.ts'

const MIB_PER_GIB = 1024

function gib(mib: number) {
  return (mib / MIB_PER_GIB).toFixed(1)
}

interface GpuCardProps {
  gpu: GpuState | null
}

/** The card's memory as one bar. Voice sits in Other, which nothing splits. */
export function GpuCard({ gpu }: GpuCardProps) {
  if (gpu === null) {
    return (
      <p className="rounded-xl border-2 bg-card p-4 text-sm text-muted-foreground">
        The graphics card is not answering. The services do not need this
        reading.
      </p>
    )
  }
  const { totalMiB, usedMiB } = gpu
  const modelMiB = gpu.models.reduce((sum, model) => sum + model.vramMiB, 0)
  const other = Math.max(0, usedMiB - modelMiB)
  const free = Math.max(0, totalMiB - usedMiB)
  const models =
    gpu.models.length > 1
      ? gpu.models.map(({ alias, vramMiB }) => ({ name: alias, vramMiB }))
      : [{ name: 'Local model', vramMiB: modelMiB }]
  const share = (mib: number) => ({ width: `${(mib / totalMiB) * 100}%` })

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border-2 bg-card p-4">
      <div
        aria-hidden="true"
        className="flex h-7 overflow-hidden rounded-full bg-muted"
      >
        <div className="bg-foreground" style={share(modelMiB)} />
        <div className="bg-muted-foreground/55" style={share(other)} />
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground max-[599px]:flex-col">
        {models.map(({ name, vramMiB }) => (
          <Legend
            key={name}
            name={name}
            value={gib(vramMiB)}
            swatch="bg-foreground"
          />
        ))}
        <Legend
          name="Other, voice included"
          value={gib(other)}
          swatch="bg-muted-foreground/55"
        />
        <Legend
          name="Free"
          value={`${gib(free)} of ${Math.round(totalMiB / MIB_PER_GIB)} GiB`}
          swatch="border-2 bg-muted"
        />
      </dl>
    </div>
  )
}

interface LegendProps {
  name: string
  value: string
  swatch: string
}

function Legend({ name, value, swatch }: LegendProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-3.5 shrink-0 rounded-[5px] ${swatch}`}
      />
      <dt>{name}</dt>
      <dd className="font-extrabold text-foreground">{value}</dd>
    </div>
  )
}
