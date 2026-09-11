# Deployment and validation

## Scope and cost

The example provisions one `apps-s-1vcpu-0.5gb` service with one instance. DigitalOcean currently lists that as $5/month, 512 MiB, one shared vCPU and 50 GiB outbound allowance. Bandwidth overage, domains and other providers may add charges. Check [current pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) before creating anything.

This service contains only the gateway and the two game servers. The root portfolio site and additional static projects can later be separate static components in the same App, each sourced directly from its own repo. Next.js frontends remain separately hosted; this initialization does not make them static exports. No DNS, accounts or deployments are created by the repository or its CI.

Installed Next.js/React dependencies occupy image space but do not mean those servers are running. Docker's build resources and the service's runtime memory limit are separate concerns. Start with the upstream lockfiles, measure actual runtime use, and only then consider server-only dependency packaging as a separate optimization.

## Validate the container first

Prerequisites: Docker, recursive submodule checkout and internet access to obtain base images and upstream dependencies.

```bash
git submodule update --init --recursive
docker build -t portfolio-runtime:local .
docker run -d --name portfolio-runtime \
  --memory=512m --memory-swap=512m --cpus=1 \
  --env-file .env.example -p 127.0.0.1:8080:8080 portfolio-runtime:local
# Wait for "healthy" before proceeding.
docker inspect --format '{{.State.Health.Status}}' portfolio-runtime
docker logs portfolio-runtime
# Test clients are outside the limited server container, sharing only its network.
docker run --rm --network container:portfolio-runtime --env-file .env.example \
  portfolio-runtime:local node scripts/smoke.mjs
docker stats --no-stream portfolio-runtime
```

Then test representative simultaneous rooms, reconnects, idle rooms, scoring/game commands and a long-running session in **both** games. Record the image identifier, parent commit and gitlink SHAs, Node version, room/player counts, duration, peak memory, CPU, errors and latency. Observe container memory, not just one Node process's heap. Leave headroom below 512 MiB for all processes and traffic bursts. A local one-CPU limit is not an exact simulation of DigitalOcean's shared-vCPU performance.

```bash
docker inspect --format '{{.Id}}' portfolio-runtime:local
git rev-parse HEAD
git submodule status
docker stats portfolio-runtime
# Separate terminal: after testing, verify graceful shutdown and absence of OOM.
docker stop --time 15 portfolio-runtime
docker inspect --format 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' portfolio-runtime
docker rm portfolio-runtime
```

Expected clean shutdown: exit 0 and `oom=false`. A startup failure, health-check failure, upstream child exit or OOM is a release blocker. Increase instance size or revise the runtime based on measurements; do not assume a package/install optimization fixes active-room memory use. Browser UI verification and a representative sustained-load run remain required before a public launch.

## App Platform setup

Use `.do/app.example.yaml` as an **example to review and import manually**. It now has `deploy_on_push: true` for the protected automatic-release flow. Keep this false in the live app until the credentials and branch checks in [automatic releases](automatic-releases.md) are configured; do not enable it on an unprotected branch.

1. Authorize DigitalOcean's GitHub integration to read `portfolio`, `pic-match` and `secret-hitman-5`. Submodules use HTTPS and are in the same account, as required by [App Platform's source-repository documentation](https://docs.digitalocean.com/products/app-platform/how-to/manage-source-repo/). A private future submodule also requires explicit access; never embed credentials in `.gitmodules`.
2. Verify the desired region, source branch, Dockerfile, instance size/count, health checks, domains and origin lists. Import only after accepting the displayed cost. App Platform builds from the parent checkout and its pinned submodules. Changing a spec file in Git alone does not update an existing App's settings.
3. Add the backend domains you actually own, and apply the DNS targets supplied by the App Platform domain setup. The example backend domains are `game.pic-match.virakngauv.com` and `game.secrethitman.com`; frontend domains are separate. Configure both exact Host ingress rules and matching `*_HOSTS` values. The gateway does not route unknown domains to a default game.
4. Keep `CLIENT_IP_MODE=digitalocean` only behind the managed ingress. The gateway reads the provider's [do-connecting-ip header](https://docs.digitalocean.com/support/where-can-i-find-the-client-ip-address-of-a-request-connecting-to-my-app/), validates it and replaces all client-supplied forwarding headers with one sanitized address. Both children trust only the loopback gateway. Missing or malformed provider IPs reject game requests rather than accepting spoofable forwarding chains. Health probes are exempt. Use `direct` locally or on a server directly reachable by clients; never enable provider mode on a public direct listener.
5. Set Pic Match's `NEXT_PUBLIC_GAME_SERVER_URL=https://game.pic-match.virakngauv.com` and Secret Hitman's `NEXT_PUBLIC_GAME_SERVER_URL=https://game.secrethitman.com` in their frontend hosts, then rebuild those frontends. Set each runtime `*_ALLOWED_ORIGINS` to the exact corresponding frontend origin; explicitly add `www` or preview origins only when intended. No paths, trailing slash, wildcard or shared catch-all origins.
6. Verify each public `/healthz`, aggregate `/_runtime/healthz` through an allowed domain, Socket.IO polling and WSS upgrade, reconnect and Secret Hitman's `/leave-intent`. Preserve incoming Host and paths in ingress. Keep the two internal game ports unexposed. Only the gateway's HTTP port is public; App Platform terminates TLS.

See the [App specification reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/) for ingress, termination and health-check fields. The gateway gives children 8 seconds to stop; the example gives the container 15 seconds after TERM. Recheck behavior behind actual ingress, particularly client IP recovery and WSS, before public testing.

## Release and rollback

A release is the parent commit plus its gitlinks, the effective App spec/environment, and compatible frontend versions. Record all of them. With auto-deploy disabled, merge a tested pin-update PR, then explicitly deploy the approved revision from App Platform. With [automatic releases](automatic-releases.md) activated, a validated pin-update PR merges after required checks and triggers deployment. Recheck the selected revision and deployment outcome in App Platform.

Rollback either selects a known-good previous deployment in App Platform or reverts the relevant parent commit in a new reviewed PR, restoring its gitlinks. For a local rollback checkout, always run `git submodule update --init --recursive` and reinstall the pinned dependencies. Rebuild/redeploy the matching frontend if its protocol changed. Rollback also ends active rooms; room memory is not restored.

Do not horizontally scale this service or use separate rolling replicas as a capacity fix. The games do not share room state. Even a one-instance replacement can temporarily overlap old/new containers while the platform drains traffic; users should be told to recreate rooms after a deployment. Schedule updates to both games together.

## Initialization validation status

The initialization was tested with offline fixture-based gateway/configuration/lifecycle tests and Node syntax checks. These fixtures verify transport forwarding and process behavior, not the full games. Docker was unavailable and the local execution environment could not resolve GitHub/npm, so an actual image build, real-server smoke run, representative 512 MiB load test and DigitalOcean ingress validation could not be completed there. The PR's GitHub Actions results must be checked separately; CI configuration is not evidence that a run passed.

Posted by ChatGPT Chat on behalf of @virakngauv.
