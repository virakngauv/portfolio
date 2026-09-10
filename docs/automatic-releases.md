# Automatic backend releases

Upstream CI sends an `upstream-ready` event after successful main-branch quality and browser checks. Portfolio reconciles registered projects into one pin-only PR, runs its own integration checks, and requests squash auto-merge. DigitalOcean deploy-on-push then deploys portfolio's main branch. A failed check stops this sequence. Frontend deployments and protocol compatibility remain separate concerns; each backend deployment can end rooms in all games.

## Activation order

1. Install a release GitHub App on portfolio with Contents, Pull requests, and Issues read/write, plus Administration read-only so the receiver can verify branch protection. Store its App ID as `PORTFOLIO_APP_ID` and PEM key as `PORTFOLIO_APP_PRIVATE_KEY` in Actions variables/secrets in all participating repositories. Sender jobs request only Contents: write on portfolio. Never commit the private key or reuse a personal CLI login token as a workflow secret.
2. Merge the portfolio receiver before upstream senders. In portfolio, enable repository auto-merge and protect main with required `unit` and `container-smoke` checks, strict/up-to-date branches, enforcement for administrators, no force pushes, and no deletions. Require PRs; zero required human approvals allows automated pin PRs. The receiver verifies status checks through GraphQL and the PR requirement, absence of bypass actors, and disabled force pushes/deletions through the branch-protection REST API. It fails closed when any required protection is absent. It currently expects a classic branch-protection rule whose pattern is exactly `main`.
3. Configure the actual DigitalOcean App Spec to use `deploy_on_push: true`, preserving the deployed environment, domains, and origins. The checked-in example does not update the live app. Keep one instance, domain/deployment failure alerts, and verify both public health endpoints after deployment. DigitalOcean credentials are not needed in GitHub for this approach.
4. Set portfolio's Actions variable `PORTFOLIO_RELEASES_ENABLED=true`. Until then, receiver jobs are skipped. Run `Reconcile upstream releases` manually once and inspect its logs, release PR, required checks, merge, and DigitalOcean deployment before treating automation as live.
5. Merge upstream sender PRs after credentials exist. Missing sender credentials produce a visible failure, rather than silently losing notifications. Reconciliation also runs at minutes 17 and 47 each hour to recover missed/coalesced events; scheduled Actions can be delayed or disabled by GitHub, so this is not a guaranteed delivery time.

## Receiver policy

`.github/portfolio-projects.json` registers repository, gitlink path, branch, workflow filename, and required job display names. Update it when adding a backend or renaming CI jobs. The receiver reads GitHub metadata; it does not check out or execute upstream code with its write token. Upstream job status is checked for the current branch head and exact run attempt, since the notifying workflow may still be running. Only forward pin updates qualify. Explicit rollback remains a separate reviewed PR.

Notifications are hints to reconcile current eligible heads, not commands to trust a supplied SHA. Unknown repositories and malformed SHAs are rejected; stale notifications cannot roll pins backward. The receiver uses one App-owned branch/PR for the batch and refuses unexpected paths or human-authored commits. It rebuilds the release tree from current main plus validated gitlinks and advances the branch without force-pushing. Changes refresh CI before auto-merge. Manual edits belong on separate branches.

The App creates visibly attributed tracking issues and PRs, including `Closes #...`. Enable GitHub Actions failure notifications for the account operating the App and DigitalOcean deployment failure alerts. A dispatch success means only that GitHub accepted the event; a merged PR still needs a successful DigitalOcean deployment.

## Pause and recovery

Set `PORTFOLIO_RELEASES_ENABLED=false` to stop new reconciliation. Also disable auto-merge on any already-pending release PR: the variable does not cancel an existing merge request. Disable DigitalOcean deploy-on-push if production deployments must pause. Re-run reconciliation after correcting credentials, missing checks, or permission failures. If an upstream repository becomes private, install the App there with Actions/Contents read access and adapt the receiver token scope before enabling it again; the initial setup assumes the registered upstream repositories are public.

Posted by Codex acting on behalf of @virakngauv.
