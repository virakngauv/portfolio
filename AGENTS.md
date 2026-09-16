# Repository instructions

- This repository composes deployments; game application code stays in its existing repositories.
- The portfolio frontend is dependency-light semantic HTML and CSS under `site/`. Do not add a client-side framework, backend, authentication, analytics, or third-party assets without a product requirement.
- Use Node.js 24 and pnpm 11.9.0. `pnpm dev` previews the portfolio, `pnpm start` runs the game runtime, `pnpm check` runs the complete non-browser quality suite, and `pnpm test:e2e` runs the isolated browser suite.
- Keep local development loopback-only unless `DEV_LAN=true` is explicitly set. That flag may expose the static portfolio preview only; it must not relax production origin or gateway security.
- Read each submodule's root AGENTS.md before working with it. Do not edit submodule contents as part of a portfolio-only change; change upstream first and update a reviewed gitlink separately.
- Keep the gateway free of application logic and root runtime dependencies. Use Node.js 22+ built-ins and pnpm for upstream installation.
- Preserve exact hostname routing, per-game origin isolation, sanitized IP forwarding, loopback-only children, and single-instance in-memory semantics.
- Run `node scripts/check.mjs` and `node --test tests/*.test.mjs` for runtime changes. Run container smoke checks when Docker/network access is available; report unverified checks accurately.
- Track meaningful changes with an issue and use `Closes #<number>` in the implementation PR.
- Every pull request, including dependency updates, must reference an actual issue with a GitHub closing keyword. Required checks must pass before merge; checked-in workflows do not by themselves prove that repository rulesets enforce them.
- GitHub mutations require the user's authorization. Include the attribution below on GitHub posts and in commit messages; do not add it to read-only analysis.

Posted by ChatGPT Chat on behalf of @virakngauv.
