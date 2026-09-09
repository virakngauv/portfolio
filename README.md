# Portfolio deployment foundation

This repository assembles **Pic Match and Secret Hitman 5's existing game servers** into one DigitalOcean App Platform service. It is deployment glue, not a migration of either product into a monorepo. The personal portfolio UI and static-site components are follow-up work.

```text
Pic Match web (separately hosted)       Secret Hitman web (separately hosted)
       |                                         |
game.pic-match.virakngauv.com             game.secrethitman.com
       +--------------------+--------------------+
                            |
                    App Platform TLS ingress
                            |
                   gateway + supervisor :8080
                       /              \
            127.0.0.1:3200       127.0.0.1:3225
             Pic Match          Secret Hitman 5
            server/index.ts      server/index.ts
```

## What is here

| Path | Purpose |
| --- | --- |
| `projects/pic-match`, `projects/secret-hitman-5` | HTTPS Git submodules pinned to specific commits, not copied source |
| `runtime/` | Dependency-free Node gateway, configuration validation and child-process supervision |
| `Dockerfile` | Installs upstream production dependencies; runs both servers as a non-root user |
| `.do/app.example.yaml` | Explicit, opt-in App Platform configuration for one 512 MiB service |
| `tests/` | Offline HTTP/tunnel/configuration/lifecycle tests using fixture processes |
| `scripts/smoke*.mjs` | Real-server Socket.IO transport/create/join/resume checks |
| `docs/deployment.md` | Domains, release/rollback, budget and memory-validation runbook |

Initial source pins are Pic Match `39e7dee11f4ef022aae43d8cf6b8941973d2d392` and Secret Hitman `338dae7cf549bfd89b35ea7db6fc607e0b1e2e76`. Gitlinks in the commit are the source of truth for subsequent releases.

## Local setup

Use Node.js 24 (Node.js 22+ is supported by the runtime) and pnpm 11.9.0, matching the initial upstream manifests. No root dependencies need installing.

```bash
git clone --recurse-submodules https://github.com/virakngauv/portfolio.git
cd portfolio
cp .env.example .env
pnpm run games:install
pnpm start
```

For an existing checkout, run `git submodule update --init --recursive` after switching parent commits. `games:install` installs **production dependencies from each upstream lockfile**. It does not execute `next build`, `next start`, or either frontend. The gateway launches `node --import tsx server/index.ts` in each project's own directory.

Local routing is by Host, not URL prefix:

```bash
curl http://127.0.0.1:8080/_runtime/healthz
curl -H 'Host: pic-match.localhost' http://127.0.0.1:8080/healthz
curl -H 'Host: secret-hitman.localhost' http://127.0.0.1:8080/healthz
```

Point the separately running **development** frontends at `http://pic-match.localhost:8080` and `http://secret-hitman.localhost:8080` using their `NEXT_PUBLIC_GAME_SERVER_URL` variables. Use their `dev:web` commands, not `dev`, which would start duplicate game servers. Run their web servers on ports 3000 and 3001 to match the example origin allowlists. If your local resolver does not resolve these `.localhost` names, map both to `127.0.0.1` in your hosts file. Production frontends need HTTPS endpoints.

## Checks

These do not require submodule dependencies or network access:

```bash
node scripts/check.mjs
node --test tests/*.test.mjs
```

With real submodules installed and the local runtime already running:

```bash
pnpm smoke
```

The smoke runner tests both games using polling-only, WebSocket-only, and polling-to-WebSocket upgrade transports; creates and joins rooms with independent tokens; resumes a disconnected host; and checks Secret Hitman's HTTP leave-intent route. It reads each project's actual protocol version. These are backend integration checks, **not two-player browser UI tests or sustained-load tests**.

CI also builds the image and runs the smoke checks against a container limited to 512 MiB with swap disabled. The test clients run in a separate container so their memory is not counted as server memory. A passing brief smoke run is not proof of production capacity.

## Runtime behavior

Only the gateway binds publicly. Children bind to loopback, have distinct ports, explicit origin allowlists, private-network origin exemptions disabled, and only the local gateway in their trusted-proxy lists. Parent secrets and arbitrary `NODE_OPTIONS` are not passed to children.

Both HTTP requests and WebSocket upgrades use the same exact-host and origin policy. Existing paths and query strings pass through unchanged, including `/socket.io/` and `/leave-intent`. Unknown hosts return 421; disallowed browser origins return 403. Missing Origin remains permitted for non-browser clients, matching upstream behavior; an origin allowlist is not authentication.

`/_runtime/healthz` returns 200 only when both child health checks pass. It is available on any Host for platform probes. During startup or shutdown it returns 503. Five consecutive failed check cycles after initial readiness stop the runtime. A child exit or spawn failure shuts down its sibling and produces a nonzero runtime exit. SIGTERM/SIGINT stop both children, allow bounded draining, then force termination if necessary.

**Every deployment or restart can end rooms in both games.** Keep one instance. Independent child processes still share CPU, memory, restart impact and deployment timing.

## Development and releases

Continue normal development in the original project repos. A push to either upstream repo does **not** advance this repo's submodule pin. To release a reviewed upstream commit, make a portfolio branch and update only that gitlink:

```bash
git switch -c deploy/pic-match-update
git -C projects/pic-match fetch origin main
# Replace REVIEWED_FULL_COMMIT_SHA with the exact commit approved for release.
git -C projects/pic-match checkout --detach REVIEWED_FULL_COMMIT_SHA
git diff --submodule=log
git add projects/pic-match
git commit -m 'chore: update Pic Match runtime pin' \
  -m 'Posted by ChatGPT Chat on behalf of @virakngauv.'
```

Reinstall dependencies, run checks and container smoke, and open a PR. Coordinate frontend deployment when the protocol changes. Do not use floating `main` checkouts or `git submodule update --remote` during production builds.

See [deployment and memory validation](docs/deployment.md) before importing the example spec. The $5 figure is a **base compute target**, not a measured safe player count or an all-in bill guarantee.

Posted by ChatGPT Chat on behalf of @virakngauv.
