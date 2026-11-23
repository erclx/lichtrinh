import { z } from 'zod'

export const apiErrorCode = z.enum([
  'not_found',
  'body_too_large',
  'internal_error',
  'unauthenticated',
  'forbidden',
  'invalid_credentials',
  'rate_limited',
  'validation_failed',
  'username_taken',
  'unsupported_media_type',
  'edit_conflict',
  'id_conflict',
  'undo_conflict',
  'already_undone',
  'entries_outside_range',
  'currency_has_costs',
  'assistant_unavailable',
  'assistant_busy',
  'assistant_failed',
  'no_trip',
  'last_admin',
])
export type ApiErrorCode = z.infer<typeof apiErrorCode>

// Every failure the API answers carries this shape. A caller maps `code` to a
// translation key for anything a person sees, since `message` is English text
// for developers and never copy for the traveler.
export const apiError = z.strictObject({
  error: z.strictObject({
    code: apiErrorCode,
    message: z.string(),
  }),
})
export type ApiError = z.infer<typeof apiError>
