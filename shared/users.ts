import { z } from 'zod'

import { language, role, user } from './auth.ts'

/** The rule a new username meets, shared by the API, the screens, and the CLI. */
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{1,31}$/)

// Role and chat default to the least access, so an admin who names neither
// makes a member who cannot chat.
export const createUserRequest = z.strictObject({
  username,
  displayName: z.string().trim().min(1).max(60),
  role: role.default('member'),
  canChat: z.boolean().default(false),
  language: language.default('vi'),
})
export type CreateUserRequest = z.input<typeof createUserRequest>

// Strict and never empty, so a body naming the username, the id, or the hash
// fails rather than being ignored. Language takes no null, since null means a
// person who never picked one.
export const updateUserRequest = z
  .strictObject({
    displayName: createUserRequest.shape.displayName,
    role,
    canChat: z.boolean(),
    language,
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0)
export type UpdateUserRequest = z.infer<typeof updateUserRequest>

export const updatedUser = z.strictObject({ user })
export type UpdatedUser = z.infer<typeof updatedUser>

/**
 * A generated password, returned once and never stored in the clear. It comes
 * without grouping spaces, and sign-in accepts it with or without them.
 */
export const oneTimePassword = z.strictObject({ password: z.string() })
export type OneTimePassword = z.infer<typeof oneTimePassword>

export const createdUser = z.strictObject({ user, password: z.string() })
export type CreatedUser = z.infer<typeof createdUser>

export const userList = z.strictObject({ users: z.array(user) })
export type UserList = z.infer<typeof userList>
