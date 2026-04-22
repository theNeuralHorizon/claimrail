# Contributing to ClaimRail

Thanks for your interest. This document covers what you need to know to get a
change accepted quickly.

## Ground rules

- **Solve a real user problem.** Drive-by style tweaks without a clear user-facing benefit will be closed.
- **Tests must pass.** CI runs `typecheck + lint + test (with coverage threshold) + build + smoke migration`.
- **Keep PRs small.** Under 400 changed lines is ideal. Split larger changes into a stack.
- **One concern per PR.** Refactors separate from features separate from docs.
- **No new dependencies without justification.** We have a deliberately small dependency tree.

## Local setup

```bash
git clone git@github.com:theNeuralHorizon/claimrail.git
cd claimrail
npm install --legacy-peer-deps
cp .env.example .env.local
npm run prepare-data   # migrate + seed demo data
npm run dev            # http://localhost:3000
```

Demo login: `demo@claimrail.io` / `demo1234`.

## Project structure

See the "Architecture" section in [README.md](README.md). In short:

- **`lib/sla/`** — pure business logic. Unit-test heavy. No DB, no I/O.
- **`lib/probes/`** — HTTP probing + SSRF guard + incident reconciliation.
- **`lib/ai/`** — SLA parser (Claude API + heuristic fallback).
- **`lib/claims/`** — claim email generator.
- **`lib/db/`** — Drizzle schema + client + migrate + seed.
- **`lib/auth/`** — password hashing, JWT sessions, server actions.
- **`app/`** — Next.js App Router: landing, auth, dashboard, API routes.
- **`components/ui/`** — shared design-system primitives.
- **`components/features/`** — feature-specific components.
- **`tests/`** — Vitest suite.

## Before you push

```bash
npm run lint         # must be clean
npm run typecheck    # must be clean
npm run test         # must pass, coverage >= 70% on tested modules
npm run build        # must succeed
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add multi-probe support
fix: clamp uptime bar to minimum visible width
refactor: extract SLA engine tier sort
docs: explain straddle-safe incident math
test: cover claim generator source excerpt branch
chore: bump Next.js to 14.2.36
```

## Pull requests

1. Open against `main`.
2. Fill out the PR template (summary + test plan).
3. Include screenshots for any UI change.
4. Mark as draft until CI is green.
5. At least one review from a maintainer before merge.

## Architecture decisions

Non-trivial changes to `lib/sla/engine.ts`, `lib/probes/`, or the claim
generator require a one-paragraph **why** in the PR description. The SLA math
has been carefully studied against real-world vendor contracts — please don't
change it without showing your work.

## Security

If you find a security issue, **don't open a public issue**. Email us or use
GitHub's private vulnerability reporting feature on the repo.

## License

By contributing you agree that your changes are licensed under the [MIT
license](LICENSE) alongside the rest of the project.
