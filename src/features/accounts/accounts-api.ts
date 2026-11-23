import {
  createdUser,
  type CreateUserRequest,
  oneTimePassword,
  userList,
} from '@shared/users.ts'

import { apiFetch } from '@/lib/api'

export async function listAccounts() {
  const { users } = await apiFetch('/admin/users', { schema: userList })
  return users
}

export function createAccount(request: CreateUserRequest) {
  return apiFetch('/admin/users', {
    method: 'POST',
    body: request,
    schema: createdUser,
  })
}

/** Ends every session the account holds and returns its new password. */
export async function resetPassword(id: string) {
  const { password } = await apiFetch(
    `/admin/users/${encodeURIComponent(id)}/password`,
    { method: 'POST', schema: oneTimePassword },
  )
  return password
}
