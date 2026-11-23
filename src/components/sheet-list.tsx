import { ChevronDownIcon } from 'lucide-react'
import { type KeyboardEvent, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PickerField, PickerSheet } from '@/components/picker-sheet'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupRow } from '@/components/ui/radio-group'

export interface SheetListOption {
  value: string
  label: string
}

interface SheetListProps {
  label: string
  value: string
  options: readonly SheetListOption[]
  onChange: (value: string) => void
  /** Adds a filter field above the rows, for a list too long to scroll through. */
  filterable?: boolean
}

// The traveler may type without diacritics, so both sides drop their marks.
// `đ` carries no combining mark and needs its own swap.
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
}

/**
 * The app's one select. Its field opens the options as a sheet list, and a
 * row picks on a tap or on Enter, closing the sheet.
 */
export function SheetList({
  label,
  value,
  options,
  onChange,
  filterable = false,
}: SheetListProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // The row Arrow keys reach, held apart from `value` until Enter commits it.
  const [current, setCurrent] = useState(value)
  const fieldRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const filterId = useId()

  const chosen = options.find((option) => option.value === value)
  const folded = fold(query.trim())
  const shown = folded
    ? options.filter((option) => fold(option.label).includes(folded))
    : options

  function openSheet() {
    setCurrent(value)
    setQuery('')
    setOpen(true)
  }

  function pick(next: string) {
    setOpen(false)
    if (next !== value) onChange(next)
  }

  function onRowsKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      pick(current)
    }
  }

  function focusChosenRow() {
    const row =
      listRef.current?.querySelector<HTMLElement>('[data-checked]') ??
      listRef.current?.querySelector<HTMLElement>('[role="radio"]')
    // The test DOM has no scrollIntoView.
    row?.scrollIntoView?.({ block: 'center' })
    return row ?? true
  }

  return (
    <div className="flex flex-col gap-1.5">
      <PickerField
        ref={fieldRef}
        label={label}
        value={chosen?.label ?? ''}
        icon={
          <ChevronDownIcon
            aria-hidden="true"
            className="size-[22px]"
            strokeWidth={2.4}
          />
        }
        expanded={open}
        onOpen={openSheet}
      />
      <PickerSheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        titleId={titleId}
        initialFocus={focusChosenRow}
        finalFocus={fieldRef}
      >
        {filterable && (
          <Field className="shrink-0 px-1 pb-2">
            <FieldLabel htmlFor={filterId} className="sr-only">
              {t('controls.filterLabel')}
            </FieldLabel>
            <Input
              ref={filterRef}
              id={filterId}
              type="search"
              autoComplete="off"
              enterKeyHint="search"
              placeholder={t('controls.filterPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
        )}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {shown.length > 0 ? (
            <RadioGroup
              aria-labelledby={titleId}
              value={current}
              onValueChange={(next: string) => setCurrent(next)}
              onKeyDown={onRowsKeyDown}
              className="gap-0"
            >
              {shown.map((option) => (
                <RadioGroupRow
                  key={option.value}
                  value={option.value}
                  onClick={() => pick(option.value)}
                >
                  {option.label}
                </RadioGroupRow>
              ))}
            </RadioGroup>
          ) : (
            <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
              <p className="text-muted-foreground">
                {t('controls.noMatch', { query: query.trim() })}
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('')
                  filterRef.current?.focus()
                }}
              >
                {t('controls.clearFilter')}
              </Button>
            </div>
          )}
        </div>
      </PickerSheet>
    </div>
  )
}
