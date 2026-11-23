import type { D1Migration } from 'cloudflare:test'

declare global {
  // A Wrangler secret, declared by hand since `wrangler types` writes it
  // only where `.dev.vars` exists, which CI lacks.
  interface Env {
    BRIDGE_SECRET: string
  }

  namespace Cloudflare {
    interface Env {
      BRIDGE_SECRET: string
      // Bound by the worker test project alone, never by wrangler.jsonc.
      TEST_MIGRATIONS: D1Migration[]
      TEST_ROLLBACKS: D1Migration[]
    }
  }
}

export {}
