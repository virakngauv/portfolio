# Repository instructions

- This repository composes deployments; game application code stays in its existing repositories.
- Read each submodule's root AGENTS.md before working with it. Do not edit submodule contents as part of a portfolio-only change; change upstream first and update a reviewed gitlink separately.
- Keep the gateway free of application logic and root runtime dependencies. Use Node.js 22+ built-ins and pnpm for upstream installation.
- Preserve exact hostname routing, per-game origin isolation, sanitized IP forwarding, loopback-only children, and single-instance in-memory semantics.
- Run `node scripts/check.mjs` and `node --test tests/*.test.mjs` for runtime changes. Run container smoke checks when Docker/network access is available; report unverified checks accurately.
- Track meaningful changes with an issue and use `Closes #<number>` in the implementation PR.
- GitHub mutations require the user's authorization. Include the attribution below on GitHub posts and in commit messages; do not add it to read-only analysis.

Posted by ChatGPT Chat on behalf of @virakngauv.
