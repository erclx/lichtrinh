# Contributing to Lichtrinh

This page covers getting a working checkout, how to test a change, and the commit and pull request rules the hooks enforce.

## Setup

Install [Bun](https://bun.sh) 1.3 or later.

```bash
git clone https://github.com/erclx/lichtrinh.git
cd lichtrinh
bun install
bun run check
```

`bun install` activates the git hooks in `.husky/`. `bun run check` runs every check, the unit tests, and the build, and the pre-push hook runs the shorter `bun run check:changed`. Neither writes.

## Layout

| Path       | What it holds                                    |
| ---------- | ------------------------------------------------ |
| `web/`     | The React front end                              |
| `canon/`   | Requirements, design record, and context entries |
| `e2e/`     | Playwright end-to-end tests                      |
| `scripts/` | The shell scripts behind the package scripts     |

## Tests

`bun run test:run` runs the unit and component tests once with Vitest. `bun run test:e2e` runs the Playwright suite against a built app.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org), and release-please reads them to cut each release.

- The header reads `<type>(<scope>): <subject>`, such as `fix(server): close the socket on shutdown`
- The header is at most 72 characters
- The first word of the subject is lowercase, and the subject ends with no period

The types are `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`, `style`, `build`, `ci`, and `revert`.

## Pull requests

Branch from `main` and open the pull request against it. Say what the change does and why, which files it touches, and how you tested it.

CI runs on every pull request, and a pull request merges once it passes. Keep each one to a single concern. A refactor that a feature needs reads better as its own pull request ahead of the feature.

## Releases

release-please cuts every release from the conventional commits on `main`. Each push to `main` keeps one release pull request open, holding the next version and its `CHANGELOG.md` entry. Merging that pull request tags the release.

Every merge to `main` also updates the staging copy, which holds invented data. Merging the release pull request updates staging first and then production.

## AI-assisted contributions

Contributions written with a coding agent are welcome. You are the author of what you submit, so read every line before you open the pull request and be ready to explain it.
