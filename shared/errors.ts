import { z } from 'zod'

export const apiErrorCode = z.enum([
  'not_found',
  'body_too_large',
  'internal_error',
])
export type ApiErrorCode = z.infer<typeof apiErrorCode>

// Every failure the API answers carries this shape, so a caller branches on
// `code` and shows `message` to a person.
export const apiError = z.strictObject({
  error: z.strictObject({
    code: apiErrorCode,
    message: z.string(),
  }),
})
export type ApiError = z.infer<typeof apiError>
