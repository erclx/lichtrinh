# Lichtrinh

A shared trip calendar a non-technical traveler plans by talking to Claude in Vietnamese. The name is lịch trình, Vietnamese for itinerary.

## Context

- Before non-trivial work in a domain, read its entry under `canon/context/`. Find it from the index anchor below.

@canon/REQUIREMENTS.md
@canon/context/index.md

## Commands

- Run `bun run check` to verify and `bun run format` to fix before committing. The pre-push hook runs `check`, which writes nothing.

## Key paths

### Code

The web app the traveler and the family open in a browser.

- `src/`: the React front end, styled with Tailwind v4
- `src/components/ui/`: the shadcn kit on Base UI, owned and edited in place, added with `bunx --bun shadcn@latest add <component>`
- `src/lib/`: shared helpers, including `cn` for merging classes
- `e2e/`: Playwright specs and the screenshot harness, with its cases in `e2e/capture/`

### Server and tooling

The API behind the app, the shapes both sides share, the owner's command, and the voice tooling.

- `worker/`: the Cloudflare Worker serving the app and the Hono API under `/api`, with its D1 schema, migrations, and rollbacks in `worker/db/`
- `shared/`: zod schemas the app, the API, and the assistant's tools all parse with, imported as `@shared/*`
- `cli/`: the `lichtrinh` command the owner runs by hand for product services, one file per verb group under `cli/commands/`, installed once with `bun link`
- `voice/`: the Python project measuring speech recognition candidates, run from inside its folder

### Content

The product and design record every session reads.

- `canon/REQUIREMENTS.md`: what the app does and for whom, its non-goals, and its constraints
- `canon/DESIGN.md`: visual intent, pointing at the stylesheet that holds the values
