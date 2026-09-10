import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateDispatch, eligibleRun, assertPinOnly, assertProtected } from './release-policy.mjs';

const repo = 'virakngauv/portfolio';
const branch = 'codex-upstream-release';
const attribution = 'Automated by the portfolio release GitHub App on behalf of @virakngauv (workflow implemented by Codex).';
const projects = JSON.parse(readFileSync('.github/portfolio-projects.json', 'utf8'));
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
if (process.env.GITHUB_EVENT_NAME === 'repository_dispatch') validateDispatch(event.client_payload, projects);

function api(path, body, method = body ? 'POST' : 'GET') {
  const args = ['api', '--method', method, path];
  if (body) args.push('--input', '-');
  const result = execFileSync('gh', args, { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8' });
  return result.trim() ? JSON.parse(result) : null;
}
function pages(path, key) {
  const results = [];
  for (let page = 1; ; page++) {
    const value = api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const items = key ? value[key] : value;
    results.push(...items);
    if (items.length < 100) return results;
  }
}
const settings = api('graphql', { query: `query { repository(owner:"virakngauv", name:"portfolio") {
  autoMergeAllowed branchProtectionRules(first:100) { nodes {
    pattern requiresStatusChecks requiresStrictStatusChecks isAdminEnforced requiredStatusCheckContexts
  } }
} }` });
if (settings.errors) throw new Error(JSON.stringify(settings.errors));
if (!settings.data.repository.autoMergeAllowed) throw new Error('Enable repository auto-merge first');
assertProtected(settings.data.repository.branchProtectionRules.nodes.find((rule) => rule.pattern === 'main'));

const main = api(`repos/${repo}/git/ref/heads/main`).object.sha;
const base = api(`repos/${repo}/git/commits/${main}`);
const baseTree = api(`repos/${repo}/git/trees/${base.tree.sha}?recursive=1`);
if (baseTree.truncated) throw new Error('Base tree was truncated');
const changes = [];
for (const project of projects) {
  const pin = baseTree.tree.find((entry) => entry.path === project.path);
  if (pin?.mode !== '160000') throw new Error(`Missing gitlink: ${project.path}`);
  const sha = api(`repos/${project.repository}/commits/${project.branch}`).sha;
  if (sha === pin.sha) continue;
  if (process.env.GITHUB_EVENT_NAME === 'repository_dispatch'
      && event.client_payload.repository === project.repository && event.client_payload.sha !== sha) {
    console.log(`Ignoring stale dispatch SHA for ${project.repository}; reconciling current head`);
  }
  const runs = api(`repos/${project.repository}/actions/workflows/${project.workflow}/runs?event=push&branch=${project.branch}&head_sha=${sha}&per_page=1`).workflow_runs;
  const run = runs[0];
  if (!run) continue;
  // The sender is part of this CI run, so its overall conclusion may still be null.
  // Verify the required jobs on this exact run attempt instead.
  const jobs = pages(`repos/${project.repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
  if (!eligibleRun(run, jobs, project, sha)) continue;
  const comparison = api(`repos/${project.repository}/compare/${pin.sha}...${sha}`);
  if (comparison.status !== 'ahead') throw new Error(`Refusing non-forward pin update for ${project.repository}`);
  changes.push({ ...project, sha, previous: pin.sha, runUrl: run.html_url });
}
if (!changes.length) { console.log('No eligible pin updates'); process.exit(0); }

const pulls = api(`repos/${repo}/pulls?state=open&head=virakngauv:${branch}&base=main`);
if (pulls.length > 1) throw new Error('Multiple release PRs');
const existing = pulls[0];
if (existing) {
  if (existing.user.login !== process.env.PORTFOLIO_BOT_LOGIN) throw new Error('Release PR is not owned by this App');
  assertPinOnly(pages(`repos/${repo}/pulls/${existing.number}/files`), projects);
  // Never rewrite a human edit on the automation branch.
  const commits = pages(`repos/${repo}/pulls/${existing.number}/commits`);
  if (commits.some((commit) => commit.author?.login !== process.env.PORTFOLIO_BOT_LOGIN)) throw new Error('Release branch contains another author');
}
const refs = api(`repos/${repo}/git/matching-refs/heads/${branch}`);
const old = refs.find((ref) => ref.ref === `refs/heads/${branch}`)?.object.sha;
if (old && api(`repos/${repo}/commits/${old}`).author?.login !== process.env.PORTFOLIO_BOT_LOGIN) {
  throw new Error('Existing automation branch is not owned by this App');
}
if (old && existing && old !== existing.head.sha) throw new Error('Release branch changed during validation');
const tree = api(`repos/${repo}/git/trees`, {
  base_tree: base.tree.sha,
  tree: changes.map((change) => ({ path: change.path, mode: '160000', type: 'commit', sha: change.sha })),
});
const oldCommit = old ? api(`repos/${repo}/git/commits/${old}`) : null;
let head = old;
if (oldCommit?.tree.sha !== tree.sha || !existing) {
  // Including both parents advances the release branch without force-pushing and
  // keeps it up to date with main. Its tree is rebuilt from main + validated pins.
  const commit = api(`repos/${repo}/git/commits`, {
    message: `chore: release tested upstream revisions\n\n${attribution}`,
    tree: tree.sha, parents: [...new Set([main, ...(old ? [old] : [])])],
  });
  if (api(`repos/${repo}/git/ref/heads/main`).object.sha !== main) throw new Error('Main advanced; retry reconciliation');
  head = commit.sha;
  if (old) api(`repos/${repo}/git/refs/heads/${branch}`, { sha: head, force: false }, 'PATCH');
  else api(`repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: head });
}
let issueNumber;
if (existing) {
  issueNumber = /Closes #(\d+)/.exec(existing.body)?.[1];
  if (!issueNumber) throw new Error('Existing release PR has no tracking issue');
} else {
  const title = `Release tested upstream revisions ${head.slice(0, 12)}`;
  const openIssues = pages(`repos/${repo}/issues?state=open&creator=${encodeURIComponent(process.env.PORTFOLIO_BOT_LOGIN)}`);
  const issue = openIssues.find((item) => !item.pull_request && item.title === title)
    ?? api(`repos/${repo}/issues`, { title, body: `Track the automated backend pin update and integration checks.\n\n${attribution}` });
  issueNumber = issue.number;
}
const body = `Advance backend gitlinks to revisions with successful upstream quality and browser checks. Portfolio's required unit and container-smoke checks gate auto-merge.\n\n`
  + changes.map((change) => `- ${change.repository}: ${change.previous} → ${change.sha} ([CI](${change.runUrl}))`).join('\n')
  + `\n\nCloses #${issueNumber}\n\nDeployment restarts the shared service and can end active rooms.\n\n${attribution}`;
const pr = existing
  ? api(`repos/${repo}/pulls/${existing.number}`, { title: 'chore: release tested upstream revisions', body }, 'PATCH')
  : api(`repos/${repo}/pulls`, { title: 'chore: release tested upstream revisions', head: branch, base: 'main', body });
assertPinOnly(pages(`repos/${repo}/pulls/${pr.number}/files`), projects);
if (pr.head.sha !== head) throw new Error('PR head changed before auto-merge request');
if (!pr.auto_merge) {
  execFileSync('gh', ['pr', 'merge', String(pr.number), '--repo', repo, '--auto', '--squash',
    '--match-head-commit', head, '--body', `Closes #${issueNumber}\n\n${attribution}`], { stdio: 'inherit' });
}
console.log(`Release PR: ${pr.html_url}`);
