/** The shape source: every other language satisfies the type derived from this module. */
export const en = {
  app: {
    name: 'Lịch trình',
  },
  language: {
    // Bilingual in both languages, so someone stuck in the wrong one still finds the toggle.
    groupLabel: 'Language / Ngôn ngữ',
    vi: 'VI',
    en: 'EN',
    // Each language's own name, spoken with a matching lang attribute.
    viName: 'Tiếng Việt',
    enName: 'English',
  },
  controls: {
    close: 'Close',
    done: 'Done',
    filterLabel: 'Search the list',
    filterPlaceholder: 'Type a few letters',
    noMatch: 'Nothing matches “{{query}}”',
    clearFilter: 'Clear the search',
    tripDates: 'Trip dates',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    pickFirstDay: 'Pick the first day',
    pickLastDay: 'now pick the last day',
    rangeTo: 'to',
    dayCount_one: '{{count}} day',
    dayCount_other: '{{count}} days',
    delete: 'Delete',
  },
} as const
