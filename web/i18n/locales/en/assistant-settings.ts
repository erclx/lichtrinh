export const assistantSettings = {
  title: 'Assistant',
  loading: 'Loading the assistant settings…',
  loadFailed: "Couldn't load the assistant settings.",
  homeComputer: 'Home computer',
  online: 'Online',
  offline: 'Offline',
  lastAnsweredToday: 'The assistant last answered at {{time}} today.',
  lastAnsweredOn: 'The assistant last answered on {{date}}.',
  neverAnswered: "The assistant hasn't answered yet.",
  modelHeading: 'Assistant model',
  modelQwen: 'Qwen',
  modelQwenHint: 'Default · understands most',
  modelGemma: 'Gemma',
  modelGemmaHint: 'Answers faster',
  modelSaved:
    'Saved. The next answer may take a little longer while this model loads.',
  contactLabel: 'Name shown when the assistant is offline',
  contactHint:
    'The traveler sees this name as whom to contact when the assistant is offline. Leave it empty to show Admin.',
  contactTooLong: 'Keep the name to 60 characters.',
  save: 'Save',
  saving: 'Saving…',
  contactSaved: 'Saved.',
  contactCleared: 'Cleared. The traveler sees Admin instead.',
  note: 'Only admins see this page. A model change applies from the next message.',
  notify: {
    heading: 'Notify me by',
    hint: 'When the assistant or voice is off and someone taps Notify.',
    push: 'Push',
    email: 'Email',
    on: 'On',
    off: 'Off',
    deviceOn:
      'On for this device. Each phone or computer is turned on separately.',
    deviceOff: 'Each phone or computer is turned on separately.',
    asking: 'Choose Allow on the question this device shows.',
    blocked:
      'Notifications are blocked for this app on this device. Allow them in the device settings, then choose On again.',
    install:
      'On an iPhone or iPad, add the app to the home screen first, then turn this on there.',
    addToHome: 'Add to home screen',
    unsupported:
      'This browser cannot show notices. Turn this on from another device.',
    none: 'No one gets a notice now. The traveler is told whom to ask instead.',
    address: 'Email address',
    invalid: 'Enter an email address like name@example.com',
    unconfirmed:
      'Confirm this address in Cloudflare first, then choose Save again',
    saved: 'Saved. A test email is on its way.',
    testFailed:
      'The test email did not go out, so the address was not saved. Try again later.',
  },
  speech: {
    heading: 'Speech recognition',
    qwen: 'Qwen3-ASR',
    qwenHint: 'Default',
    whisper: 'Whisper turbo',
    whisperHint: 'Fast',
    phowhisper: 'PhoWhisper',
    phowhisperHint: 'Hears Vietnamese · English speech uses Qwen3-ASR',
    unused: 'Not used yet',
    unsent_one: '{{count}} clip · none sent yet',
    unsent_other: '{{count}} clips · none sent yet',
    usage_one: '{{sent}} of {{count}} clip sent · {{share}} of words changed',
    usage_other:
      '{{sent}} of {{count}} clips sent · {{share}} of words changed',
    saved:
      'Saved. The next clip uses this model and may take a little longer while it loads.',
  },
} as const
