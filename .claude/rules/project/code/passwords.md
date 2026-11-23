---
description: Hold password hashing to PBKDF2 at a count the Worker's free CPU cap allows, with every password server-generated
paths:
  - 'shared/password-hash.ts'
  - 'shared/generated-password.ts'
  - 'worker/auth/**/*.ts'
  - 'cli/admin/**/*.ts'
---

# Password standards

## Hash

- Hash every password through `shared/password-hash.ts` with PBKDF2-SHA256, never Argon2id, scrypt, or bcrypt, over `security-server.md`. Revisit when the Worker leaves the free plan's 10 ms CPU cap.
- Keep `PBKDF2_ITERATIONS` at a count a deployed sign-in spends under 10 ms of CPU on. Locally 100k took 7 ms, 210k took 15 ms, and bcrypt cost 10 took 41 ms.

## Passwords

- Generate every password through `shared/generated-password.ts`, never one a person types, since its 59 bits and the rate limit carry what the low count gives up.
