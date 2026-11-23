import type { D1Migration } from 'cloudflare:test'

declare global {
  // A Wrangler secret in production and a `.dev.vars` line locally, which
  // the test project binds a fixed value for. Declared here because
  // `wrangler types` writes it only where `.dev.vars` exists, and CI has
  // none. The relay binding comes from wrangler.jsonc.
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
