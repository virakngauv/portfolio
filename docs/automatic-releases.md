# Automatic backend releases

Portfolio polls upstream main-branch quality and browser checks once daily, or on demand using **Run workflow**. Upstream repositories need no notification jobs or portfolio credentials. Portfolio reconciles registered projects into one pin-only PR, runs its own integration checks, and requests squash auto-merge. DigitalOcean deploy-on-push then deploys portfolio's main branch. A failed check stops this sequence. Frontend deployments and protocol compatibility remain separate concerns; each backend deployment can end rooms in all games.

## Activation order

1. Install a release GitHub App on portfolio with Contents, Pull requests, and Issues read/write, plus Administration read-only so the receiver can verify branch protection. Store its App ID as `PORTFOLIO_APP_ID` and PEM key as `PORTFOLIO_APP_PRIVATE_KEY` in portfolio Actions variables/secrets only. Never copy the receiver key to upstream repositories. Never commit the private key or reuse a personal CLI login token as a workflow secret.
2. Merge the portfolio receiver. In portfolio, enable repository auto-merge and protect main with required `unit` and `container-smoke` checks, strict/up-to-date branches, enforcement for administrators, no force pushes, and no deletions. Require PRs; zero required human approvals allows automated pin PRs. The receiver verifies status checks through GraphQL and the PR requirement, absence of bypass actors, and disabled force pushes/deletions through the branch-protection REST API. It fails closed when any required protection is absent. It currently expects a classic branch-protection rule whose pattern is exactly `main`.
3. Configure the actual DigitalOcean App Spec to use `deploy_on_push: true`, preserving the deployed environment, domains, and origins. The checked-in example does not update the live app. Keep one instance, domain/deployment failure alerts, and verify both public health endpoints after deployment. DigitalOcean credentials are not needed in GitHub for this approach.
4. Set portfolio's Actions variable `PORTFOLIO_RELEASES_ENABLED=true`. Until then, receiver jobs are skipped. Open **Actions → Reconcile upstream releases → Run workflow**, select **main**, and click **Run workflow** once and inspect its logs, release PR, required checks, merge, and DigitalOcean deployment before treating automation as live.
5. Reconciliation runs once daily at 2:20 AM Pacific (`America/Los_Angeles`, randomly selected once). Scheduled Actions can be delayed or disabled by GitHub; use **Run workflow** for an immediate check. Remove obsolete sender jobs and portfolio credentials from upstream repos before activation.

## Receiver policy

`.github/portfolio-projects.json` registers repository, gitlink path, branch, workflow filename, and required job display names. Update it when adding a backend or renaming CI jobs. The receiver reads GitHub metadata; it does not check out or execute upstream code with its write token. Upstream job status is checked for the current branch head and exact run attempt. Only forward pin updates qualify. Explicit rollback remains a separate reviewed PR.

The receiver uses one App-owned branch/PR for the batch and refuses unexpected paths or human-authored commits. It rebuilds the release tree from current main plus validated gitlinks and advances the branch without force-pushing. If an existing candidate contains a project whose current upstream head is not eligible, reconciliation leaves the entire candidate unchanged and defers new batch updates. Before deferring, it retries a missing auto-merge request for the validated, unchanged PR head. This preserves already-tested pins while newer upstream CI runs; other updates may wait until the candidate merges or all replacements qualify. Changes refresh CI before auto-merge. Manual edits belong on separate branches.

The App creates visibly attributed tracking issues and PRs, including `Closes #...`. Enable GitHub Actions failure notifications for the account operating the App and DigitalOcean deployment failure alerts. A successful check does not guarantee an update: there may be no eligible revisions. A merged PR still needs a successful DigitalOcean deployment.

## Pause and recovery

Set `PORTFOLIO_RELEASES_ENABLED=false` to stop new reconciliation. Also disable auto-merge on any already-pending release PR: the variable does not cancel an existing merge request. Disable DigitalOcean deploy-on-push if production deployments must pause. Re-run reconciliation after correcting credentials, missing checks, or permission failures. If an upstream repository becomes private, install the App there with Actions/Contents read access and adapt the receiver token scope before enabling it again; the initial setup assumes the registered upstream repositories are public.

Posted by Codex acting on behalf of @virakngauv.
