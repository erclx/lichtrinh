import { z } from 'zod'

// The person the app names when the assistant is unreachable. Null until the
// admin sets one, and the admin clears it by sending null.
export const contactSettings = z.strictObject({
  contactName: z.string().trim().min(1).max(60).nullable(),
})
export type ContactSettings = z.infer<typeof contactSettings>
