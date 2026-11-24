import type { CaptureCase } from '../../capture-types'
import { asAdmin, lightAndDark } from '../page-setup'

export const CASES: CaptureCase[] = [
  ...lightAndDark('accounts', '/admin/accounts', asAdmin),
  ...lightAndDark('accounts-new', '/admin/accounts/new', asAdmin),
  ...lightAndDark('accounts-edit', '/admin/accounts/fixture-traveler', asAdmin),
  {
    section: 'accounts-edit-own',
    theme: 'default',
    route: '/admin/accounts/fixture-admin',
    evidence: true,
    setup: asAdmin,
  },
]
