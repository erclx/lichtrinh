import { createUserRequest } from '@shared/users.ts'

export type DisplayNameError = 'required' | 'tooLong'

// The API's own rule, so the form refuses what the API would answer with
// validation_failed.
export function displayNameError(name: string): DisplayNameError | undefined {
  if (name === '') return 'required'
  return createUserRequest.shape.displayName.safeParse(name).success
    ? undefined
    : 'tooLong'
}
