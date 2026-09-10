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

Use Node.js 24 (Node.js 22.13+ is supported by the runtime) and pnpm 11.9.0, matching the initial upstream manifests. No root dependencies need installing.

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

## Deployment lessons and troubleshooting

For automatic releases after upstream merges, follow [automatic backend releases](docs/automatic-releases.md). The receiver batches validated gitlink updates into a tested PR; activate it only after credentials and required branch checks are configured. During initial manual setup, set `deploy_on_push: false`. After GitHub App credentials and required branch protections are configured, enable `deploy_on_push: true` in the live DigitalOcean App Spec as part of activation. The checked-in example uses the activated state; copying it does not update the live app.

The September 9, 2026 validation passed all 21 offline tests, an ARM64 Docker image build, and both games' real-server smoke checks under a 512 MiB / one-CPU limit with swap disabled. Shutdown completed with exit 0 and no OOM. Container memory snapshots were 135.2 MiB after smoke testing and 142.6 MiB after manual use; these are snapshots, not peak measurements or capacity guarantees. The user also reported successful local multiplayer/reconnect checks and both deployed games working after correcting the origin allowlist. Sustained-load and maximum-player capacity remain unverified. This supplements the earlier initialization status in [the deployment runbook](docs/deployment.md).

### Know which URL does what

| Game | Local browser UI | Local backend | Production backend |
| --- | --- | --- | --- |
| Pic Match | `http://localhost:3000` | `http://pic-match.localhost:8080` | `https://game.pic-match.virakngauv.com` |
| Secret Hitman | `http://localhost:3001` | `http://secret-hitman.localhost:8080` | `https://game.secrethitman.com` |

The container runs the backends and gateway only. A backend's `/` can return `not_found` normally; use `/healthz` to check it, and open the separately hosted frontend to play. Frontend hosting must set `NEXT_PUBLIC_GAME_SERVER_URL` to the corresponding backend URL **and rebuild/redeploy**. Changing the variable alone does not update an existing frontend build.

For local browser testing, start the backend container using [the runbook](docs/deployment.md#validate-the-container-first), then run these frontend commands in separate terminals from the repository root:

```bash
cd projects/pic-match
pnpm install --frozen-lockfile
NEXT_PUBLIC_GAME_SERVER_URL=http://pic-match.localhost:8080 pnpm dev:web --port 3000
```

```bash
cd projects/secret-hitman-5
pnpm install --frozen-lockfile
NEXT_PUBLIC_GAME_SERVER_URL=http://secret-hitman.localhost:8080 pnpm dev:web --port 3001
```

### DigitalOcean and Cloudflare setup

1. Create one App Platform web service from this repository's reviewed revision, with source directory `/`, `Dockerfile`, HTTP port 8080, one instance, and health path `/_runtime/healthz`. Leave the run-command override empty. Review the region and displayed cost; keep deploy-on-push disabled. Grant source access for the parent repository and its submodules.
2. Apply the runtime environment and exact-host ingress rules from [`.do/app.example.yaml`](.do/app.example.yaml), adjusted to the actual frontend domains. Use `CLIENT_IP_MODE=digitalocean` behind App Platform. Keep internal child ports unexposed and preserve request paths. The example file is not automatically synchronized with a running app.
3. In App Platform, open **Networking → Domains → Add domain**, add each backend hostname, and select **You manage your domain**. Keep Cloudflare nameservers. Copy the exact CNAME target DigitalOcean supplies for each domain.
4. In Cloudflare **DNS → Records**, add the records below. Use **DNS only** (gray cloud) for this setup and TTL Auto. Enter only a target hostname, without `https://`, a port, or a path. Inspect any conflicting record at the same name before replacing it; preserve existing frontend and mail records.
5. Wait for DigitalOcean domain validation and HTTPS issuance. If restrictive CAA records exist, they must permit both `letsencrypt.org` and `pki.goog`. Verify both backend `/healthz` URLs, then deploy the frontends with the matching HTTPS backend values and test real room connections.

| Cloudflare zone | Type | Name | Target |
| --- | --- | --- | --- |
| `virakngauv.com` | CNAME | `game.pic-match` | Exact alias supplied by DigitalOcean |
| `secrethitman.com` | CNAME | `game` | Exact alias supplied by DigitalOcean |

DigitalOcean builds the image from Git; local Docker is only needed to reproduce container tests. Buildpacks also produce containers, so switching to buildpacks alone does not remove container runtime overhead. On macOS, Docker CLI needs a local engine in a Linux VM or a remote engine; Docker Desktop bundles the local pieces. The Mac VM's memory is separate from the deployed service's memory limit.

Provider references: [create an app](https://docs.digitalocean.com/products/app-platform/how-to/create-apps/), [edit the effective App Spec](https://docs.digitalocean.com/products/app-platform/how-to/update-app-spec/), [domains and certificates](https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/), [Cloudflare nameservers](https://developers.cloudflare.com/registrar/faq/), [DNS proxy status](https://developers.cloudflare.com/dns/proxy-status/), [buildpacks](https://docs.digitalocean.com/products/app-platform/reference/buildpacks/), and [Docker Desktop's VM](https://docs.docker.com/desktop/features/networking/).

### “Connecting to the game server…” with a healthy backend

Check the **actual frontend origin in the browser address bar**, including redirects. `https://secrethitman.com` and `https://www.secrethitman.com` are different origins. Our deployed backend returned 200 for the first origin and 403 for the second, while DNS and `/healthz` were working correctly. The fix was to allow both intended frontend origins in DigitalOcean:

```dotenv
SECRET_HITMAN_ALLOWED_ORIGINS=https://secrethitman.com,https://www.secrethitman.com
```

Save and deploy the backend configuration, then refresh the frontend. This fix needs neither a DNS change nor a frontend rebuild. The checked-in App Spec example now includes both origins. Preview frontend domains also need explicit permission; setting a frontend variable for “All Environments” does not authorize preview origins on the backend.

Use these diagnostics, replacing the hostname and Origin when testing another game:

```bash
dig +short game.secrethitman.com
curl -i https://game.secrethitman.com/healthz
curl -i -H 'Origin: https://www.secrethitman.com' \
  'https://game.secrethitman.com/socket.io/?EIO=4&transport=polling'
```

The last command opens a short-lived Engine.IO polling session; expect HTTP 200 and an opening packet containing a session ID. It does not verify gameplay or WebSocket upgrade by itself.

| Result | Next check |
| --- | --- |
| DNS lookup fails | Cloudflare record name/target and propagation |
| TLS certificate error | DigitalOcean domain validation, DNS, and any CAA restrictions |
| Backend `/` returns `not_found` | Use `/healthz`; `/` is not a frontend page |
| HTTP 403 for the browser Origin | Exact per-game allowed origins, including `www` |
| HTTP 421 | Backend hostname in gateway configuration and App Platform ingress |
| Health succeeds but UI still cannot connect | Frontend's built backend URL, browser Network errors, origin test, and backend logs |

## Adding a project to the portfolio

Use this checklist for each new repository. Static sites and frontends can be hosted as separate components without joining the game runtime. A new backend in this shared container currently requires explicit integration work; adding a submodule alone does not register a server.

1. **Record the deployment contract.** Identify the upstream repository and reviewed commit, server start command, health endpoint, protocol/smoke scenario, required runtime variables, frontend host, backend host, exact allowed origins, and unique local frontend/backend ports. Confirm whether its state model fits one shared instance and coordinated restarts.
2. **Prepare upstream first.** Read that repository's root `AGENTS.md`. Make any application changes there and get the revision reviewed before pinning it here. For a backend, verify loopback binding, explicit origins, trusted-proxy behavior, and graceful shutdown. Keep application logic upstream.
3. **Track and pin the integration.** Create a tracking issue before publishing the implementation PR. Add an HTTPS submodule under `projects/<id>` at the reviewed commit, and ensure DigitalOcean can fetch it. Do not copy application source or use floating branch tips in builds.
4. **Register the backend explicitly.** Update the project list in `runtime/config.mjs`, including the distinct-port validation (currently hardcoded for three total ports). Update `scripts/install-games.mjs`, the smoke runner/protocol adapter as needed, and configuration tests. Check the server-entry-point and child-environment contract; arbitrary parent environment variables are intentionally not inherited. The Dockerfile copies `projects/`, but installation still uses an explicit project list.
5. **Wire local and production configuration.** Add the new prefix's hosts/origins/port settings to `.env.example`; add runtime variables, the domain, and an exact-host ingress rule to `.do/app.example.yaml`. Document the new URL mapping above. Add its Cloudflare CNAME and rebuild the separately hosted frontend with its backend URL.
6. **Validate before release.** Run syntax checks, offline tests, the full real-server container smoke suite under the shared memory limit, and two independent browser sessions. Exercise the new project alongside existing games, reconnects, allowed/rejected origins, and shutdown. Re-measure total container memory after each addition; today's headroom is not a reservation for future projects.
7. **Release the complete configuration.** Include `Closes #<issue>` in the implementation PR. Record the parent commit, gitlinks, effective App Spec/environment, and compatible frontend versions. Apply the reviewed spec to DigitalOcean, verify HTTPS/health and browser connections, and retain a known-good deployment for rollback. Keep one instance while state remains in memory.

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
