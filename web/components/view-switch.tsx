import type { ComponentType } from 'react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

interface ViewOption<T extends string> {
  value: T
  label: string
  icon: ComponentType<{ className?: string }>
}

interface ViewSwitchProps<T extends string> {
  /** The group's accessible name, since the options alone do not say what they switch. */
  label: string
  options: readonly ViewOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Two or more ways to show one thing, each an icon and its label at the tap target. */
export function ViewSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: ViewSwitchProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={([next]) => {
        // Pressing the option already on reports no value, which keeps it on.
        const option = options.find((candidate) => candidate.value === next)
        if (option !== undefined) onChange(option.value)
      }}
      className={cn('w-auto', className)}
    >
      {options.map(({ value: option, label: name, icon: OptionIcon }) => (
        <ToggleGroupItem
          key={option}
          value={option}
          className="flex-none gap-2 px-3"
        >
          <OptionIcon className="size-5" />
          {name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
