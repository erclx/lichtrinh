import { z } from 'zod'

/** What can be down, each with its own outage and its own one notice. */
export const noticeKind = z.enum(['assistant', 'voice'])
export type NoticeKind = z.infer<typeof noticeKind>

/** The notice sent in an outage, with the sender by display name. */
export const sentNotice = z.strictObject({
  sentAt: z.iso.datetime(),
  byName: z.string(),
  byMe: z.boolean(),
})
export type SentNotice = z.infer<typeof sentNotice>

/**
 * What the traveler's cards read. `reachable` is whether a notice would reach
 * an admin now, and each kind holds the notice of the outage under way, or
 * null with none sent or nothing down.
 */
export const noticeState = z.strictObject({
  reachable: z.boolean(),
  assistant: sentNotice.nullable(),
  voice: sentNotice.nullable(),
})
export type NoticeState = z.infer<typeof noticeState>

/** A send, which a repeat in the same outage answers with the one notice. */
export const noticeSend = z.strictObject({ kind: noticeKind })
export type NoticeSend = z.infer<typeof noticeSend>

/**
 * The push subscription a browser made for this device. The keys are fixed
 * lengths, being an uncompressed P-256 point and 16 random bytes, so a
 * malformed one is refused here rather than at the send.
 */
export const pushDevice = z.strictObject({
  endpoint: z.url().max(2048),
  keys: z.strictObject({
    p256dh: z.string().regex(/^B[\w-]{86}$/),
    auth: z.string().regex(/^[\w-]{22}$/),
  }),
})
export type PushDevice = z.infer<typeof pushDevice>

/** The admin's address, with the time zone its notices tell the time in. */
export const noticeEmailWrite = z.strictObject({
  address: z.string().trim().max(254).pipe(z.email()),
  timeZone: z.string().min(1).max(64).refine(isTimeZone),
})
export type NoticeEmailWrite = z.infer<typeof noticeEmailWrite>

/**
 * The signed-in admin's own setting, which every write answers. A null `push`
 * or `email` is one this copy cannot send by, a null address is email off, and
 * `deviceOn` is this session's device, where `reachable` counts every admin.
 */
export const noticeSetting = z.strictObject({
  reachable: z.boolean(),
  push: z
    .strictObject({ publicKey: z.string(), deviceOn: z.boolean() })
    .nullable(),
  email: z.strictObject({ address: z.string().nullable() }).nullable(),
})
export type NoticeSetting = z.infer<typeof noticeSetting>

function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}
