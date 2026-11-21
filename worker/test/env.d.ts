import type { D1Migration } from 'cloudflare:test'

// Bound by the worker test project alone, never by wrangler.jsonc.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[]
      TEST_ROLLBACKS: D1Migration[]
    }
  }
}

export {}
