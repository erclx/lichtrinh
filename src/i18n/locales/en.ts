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
} as const
