import { z } from 'zod'

export const role = z.enum(['admin', 'member'])
export type Role = z.infer<typeof role>

export const language = z.enum(['vi', 'en'])
export type Language = z.infer<typeof language>

// A phone keyboard capitalizes the first letter, and a person may type the
// spaces a generated password is shown with, so both are normalized here
// rather than failing a sign-in the person typed correctly.
export const signInRequest = z.strictObject({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z
    .string()
    .max(256)
    .transform((typed) => typed.replace(/\s+/g, ''))
    .pipe(z.string().min(1)),
})
export type SignInRequest = z.infer<typeof signInRequest>

/** An account as the API shows it, to its owner on `me` and to the admin. */
export const user = z.strictObject({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  role,
  canChat: z.boolean(),
  // Null until the person or the admin picks one, so the client falls back
  // to the device's choice.
  language: language.nullable(),
})
export type User = z.infer<typeof user>

// Strict, so a body naming another account's id fails rather than being
// ignored, and the write can only reach the caller's own row.
export const languageUpdate = z.strictObject({ language })
export type LanguageUpdate = z.infer<typeof languageUpdate>
