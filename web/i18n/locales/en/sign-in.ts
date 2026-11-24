export const signIn = {
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
} as const
