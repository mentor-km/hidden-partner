# Hidden Partner

Read SPEC.md before any work. It is the source of truth for rules, screens and
architecture. If code and SPEC.md disagree, stop and ask. If SPEC.md is
ambiguous, list the ambiguity instead of guessing.

## Stack
- pnpm workspace, TypeScript everywhere
- packages/rules: pure game engine (no network, no clock, no Math.random; the
  shuffle uses a seeded generator)
- apps/server: Cloudflare Worker + Durable Object (PartyServer), one room per code
- apps/web: React + Vite + Tailwind

## Rules for the code
- The rules engine is the only place game rules live. The browser may import it
  for hints; the server's answer always wins.
- Hidden information: hands, shuffle seed and partner seats never go to a
  browser, except each player's own hand.
- Every rule in SPEC.md has a test. Write the test first.
- Validate every incoming message with Zod.
- Small commits, one feature each. Run `pnpm test` before saying a task is done.
- Do not add libraries without saying why.
