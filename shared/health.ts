import { z } from 'zod'

export const health = z.strictObject({ status: z.literal('ok') })
export type Health = z.infer<typeof health>
