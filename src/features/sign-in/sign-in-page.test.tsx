import '@/i18n/setup'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SignInPage } from '@/features/sign-in/sign-in-page'
import { applyLanguage } from '@/i18n/setup'
import { SessionProvider } from '@/session/provider'
import { useSession } from '@/session/session-context'
import { aUser, failure, fakeApi, json, offline } from '@/test/fake-api'

function Status() {
  return <p>status: {useSession().status}</p>
}

async function renderSignIn() {
  render(
    <SessionProvider>
      <Status />
      <SignInPage />
    </SessionProvider>,
  )
  await screen.findByText('status: signed-out')
}

async function submit(
  user: ReturnType<typeof userEvent.setup>,
  username: string,
  password: string,
) {
  await user.type(screen.getByLabelText('Username'), username)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(async () => {
  localStorage.clear()
  await applyLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SignInPage', () => {
  it('signs in with the username trimmed', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': () => json(aUser()),
    })
    await renderSignIn()

    await submit(user, '  mai ', 'abcdefghjkmn')

    expect(await screen.findByText('status: signed-in')).toBeInTheDocument()
    expect(api.requests.at(-1)?.body).toEqual({
      username: 'mai',
      password: 'abcdefghjkmn',
    })
  })

  it('shows one message for a wrong password, naming neither field', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': () => failure('invalid_credentials', 401),
    })
    await renderSignIn()

    await submit(user, 'mai', 'wrongpassword')

    const message = await screen.findByRole('alert')
    expect(message).toHaveTextContent("That username and password don't match")
    expect(screen.getByLabelText('Username')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('moves focus to the message when the server refuses', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': () => failure('invalid_credentials', 401),
    })
    await renderSignIn()

    await submit(user, 'mai', 'wrongpassword')

    expect(await screen.findByRole('alert')).toHaveFocus()
  })

  it('shows the paused message and keeps the fields and the button', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': () =>
        failure('rate_limited', 429, { 'Retry-After': '600' }),
    })
    await renderSignIn()

    await submit(user, 'mai', 'wrongpassword')

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in paused')
    expect(screen.getByLabelText('Username')).toHaveValue('mai')
    expect(screen.getByLabelText('Password')).toHaveValue('wrongpassword')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('shows the connection line when the network is down', async () => {
    const user = userEvent.setup()
    fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
      'POST /auth/sign-in': offline,
    })
    await renderSignIn()

    await submit(user, 'mai', 'abcdefghjkmn')

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't connect")
  })

  it('refuses empty fields without asking the server', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      'GET /auth/me': () => failure('unauthenticated', 401),
    })
    await renderSignIn()

    await user.type(screen.getByLabelText('Username'), '   ')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByText('Enter your username.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveFocus()
    expect(api.requests.map((request) => request.path)).toEqual(['/auth/me'])
  })

  it('clears a field error as soon as the field is filled', async () => {
    const user = userEvent.setup()
    fakeApi({ 'GET /auth/me': () => failure('unauthenticated', 401) })
    await renderSignIn()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await user.type(screen.getByLabelText('Username'), 'm')

    expect(screen.queryByText('Enter your username.')).not.toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  })

  it('accepts a pasted username and password', async () => {
    const user = userEvent.setup()
    fakeApi({ 'GET /auth/me': () => failure('unauthenticated', 401) })
    await renderSignIn()

    await user.click(screen.getByLabelText('Username'))
    await user.paste('mai')
    await user.click(screen.getByLabelText('Password'))
    await user.paste('abcd efgh jkmn')

    expect(screen.getByLabelText('Username')).toHaveValue('mai')
    expect(screen.getByLabelText('Password')).toHaveValue('abcd efgh jkmn')
  })

  it('offers the fields to a password manager', async () => {
    fakeApi({ 'GET /auth/me': () => failure('unauthenticated', 401) })
    await renderSignIn()

    expect(screen.getByLabelText('Username')).toHaveAttribute(
      'autocomplete',
      'username',
    )
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
  })

  it('shows the password as text on Show', async () => {
    const user = userEvent.setup()
    fakeApi({ 'GET /auth/me': () => failure('unauthenticated', 401) })
    await renderSignIn()

    await user.click(screen.getByRole('button', { name: 'Show password' }))

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(
      screen.getByRole('button', { name: 'Show password' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
