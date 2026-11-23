import {
  createdUser,
  type CreateUserRequest,
  oneTimePassword,
  updatedUser,
  type UpdateUserRequest,
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

/** Sends only the fields that changed, since the API refuses an empty body. */
export async function updateAccount(id: string, changes: UpdateUserRequest) {
  const { user } = await apiFetch(`/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: changes,
    schema: updatedUser,
  })
  return user
}

/** Ends every session the account holds and returns its new password. */
export async function resetPassword(id: string) {
  const { password } = await apiFetch(
    `/admin/users/${encodeURIComponent(id)}/password`,
    { method: 'POST', schema: oneTimePassword },
  )
  return password
}
