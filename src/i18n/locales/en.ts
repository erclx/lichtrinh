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
    from: 'From',
    to: 'To',
    noDate: 'Pick a date',
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
  signIn: {
    lead: 'Sign in once and the app remembers you for months.',
    username: 'Username',
    password: 'Password',
    show: 'Show',
    showLabel: 'Show password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    forgot: 'Forgot it? Message the admin.',
    usernameRequired: 'Enter your username.',
    passwordRequired: 'Enter your password.',
    // One message for both fields, so a stranger learns nothing about which
    // usernames exist.
    wrong: "That username and password don't match. Check both and try again.",
    pausedTitle: 'Sign-in paused',
    pausedBody:
      'Too many wrong passwords. Wait a few minutes and try again, or message the admin.',
  },
  nav: {
    label: 'Main',
    today: 'Today',
    trips: 'Trips',
    calendar: 'Calendar',
    accounts: 'Accounts',
    settings: 'Settings',
    hide: 'Hide sidebar',
    show: 'Show sidebar',
  },
  shell: {
    back: 'Back',
    placeholder: 'This page is on its way.',
    notFoundTitle: 'Page not found',
    notFoundBody: "There's nothing at this address.",
    goToday: 'Go to Today',
    unreachableTitle: "Can't connect",
    unreachableBody:
      'Check the internet and try again. If it still fails, message the admin.',
    retry: 'Try again',
    loading: 'Loading',
  },
  errors: {
    network: "Can't connect. Check the internet and try again.",
    generic: 'Something went wrong. Try again in a few minutes.',
  },
} as const
