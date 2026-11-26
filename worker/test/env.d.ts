import type { D1Migration } from 'cloudflare:test'

declare global {
  // The Wrangler secrets, declared by hand since `wrangler types` writes them
  // only where `.dev.vars` exists, which CI lacks. A copy can run with the
  // optional ones unset, which turns that way of notifying off.
  interface Env {
    BRIDGE_SECRET: string
    // The owner panel's own secret, which an unset value turns off.
    PANEL_SECRET?: string
    VAPID_PUBLIC_KEY?: string
    VAPID_PRIVATE_KEY?: string
    NOTICE_FROM?: string
  }

  namespace Cloudflare {
    interface Env {
      BRIDGE_SECRET: string
      PANEL_SECRET?: string
      VAPID_PUBLIC_KEY?: string
      VAPID_PRIVATE_KEY?: string
      NOTICE_FROM?: string
      // Bound by the worker test project alone, never by wrangler.jsonc.
      TEST_MIGRATIONS: D1Migration[]
      TEST_ROLLBACKS: D1Migration[]
    }
  }
}

export {}
