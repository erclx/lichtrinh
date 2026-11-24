import type { CaptureCase } from '../../capture-types'
import { asAdmin, assistantOnline, lightAndDark } from '../page-setup'

export const CASES: CaptureCase[] = [
  ...lightAndDark('assistant', '/admin/assistant', async (page) => {
    await assistantOnline(page)
    await asAdmin(page)
  }),
  ...lightAndDark('assistant-offline', '/admin/assistant', asAdmin),
]
