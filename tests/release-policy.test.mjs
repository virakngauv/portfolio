import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleRun, assertPinOnly, assertProtected, assertPullRequestProtection, shouldDeferRelease, autoMergeArgs } from '../scripts/release-policy.mjs';

const project = { repository: 'owner/game', path: 'projects/game', branch: 'main', requiredJobs: ['Quality', 'End-to-end'] };
const sha = 'a'.repeat(40);
test('only exact main push revisions with every required job successful qualify', () => {
  const run = { event: 'push', head_branch: 'main', head_sha: sha, head_repository: { full_name: project.repository } };
  const jobs = project.requiredJobs.map((name) => ({ name, conclusion: 'success' }));
  assert.equal(eligibleRun(run, jobs, project, sha), true);
  for (const changed of [{ event: 'pull_request' }, { head_branch: 'feature' }, { head_sha: 'b'.repeat(40) }, { head_repository: { full_name: 'fork/game' } }]) {
    assert.equal(eligibleRun({ ...run, ...changed }, jobs, project, sha), false);
  }
  assert.equal(eligibleRun(run, jobs.slice(1), project, sha), false);
  for (const conclusion of ['failure', 'skipped', null, 'cancelled']) {
    assert.equal(eligibleRun(run, [{ ...jobs[0], conclusion }, jobs[1]], project, sha), false);
  }
});
test('release PR cannot carry unrelated edits or deletions', () => {
  assertPinOnly([{ filename: project.path, status: 'modified' }], [project]);
  for (const files of [[], [{ filename: 'README.md', status: 'modified' }], [{ filename: project.path, status: 'removed' }]]) {
    assert.throws(() => assertPinOnly(files, [project]));
  }
});
test('auto-merge fails closed without strict enforced integration checks', () => {
  const rule = { pattern: 'main', requiresStatusChecks: true, requiresStrictStatusChecks: true, isAdminEnforced: true, requiredStatusCheckContexts: ['unit', 'container-smoke'] };
  assertProtected(rule);
  for (const changed of [{ requiresStatusChecks: false }, { requiresStrictStatusChecks: false }, { isAdminEnforced: false }, { requiredStatusCheckContexts: ['unit'] }]) {
    assert.throws(() => assertProtected({ ...rule, ...changed }));
  }
});

test('release guard rejects missing PR protection, destructive updates, and bypass actors', () => {
  const protection = { allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, required_pull_request_reviews: { required_approving_review_count: 0 } };
  assertPullRequestProtection(protection);
  for (const changed of [{ allow_force_pushes: { enabled: true } }, { allow_deletions: { enabled: true } }, { required_pull_request_reviews: null }, { allow_deletions: undefined }]) {
    assert.throws(() => assertPullRequestProtection({ ...protection, ...changed }));
  }
  for (const kind of ['users', 'teams', 'apps']) {
    assert.throws(() => assertPullRequestProtection({ ...protection, required_pull_request_reviews: { bypass_pull_request_allowances: { [kind]: [{ id: 1 }] } } }));
  }
  assert.throws(() => assertPullRequestProtection(undefined));
});

test('pending batch retains tested pins while another upstream head is ineligible', () => {
  const files = [{ filename: 'projects/a' }, { filename: 'projects/b' }];
  assert.equal(shouldDeferRelease(files, [{ path: 'projects/b' }]), true);
  assert.equal(shouldDeferRelease(files, []), true);
  assert.equal(shouldDeferRelease(files, [{ path: 'projects/a' }, { path: 'projects/b' }]), false);
  assert.equal(shouldDeferRelease([], [{ path: 'projects/c' }]), false);
});

test('deferred candidate retries missing auto-merge on exactly its validated head', () => {
  const pr = { number: 7, state: 'open', head: { sha }, body: 'Closes #3', auto_merge: null };
  assert.equal(shouldDeferRelease([{ filename: project.path }], []), true);
  const args = autoMergeArgs(pr, sha, 'owner/portfolio', 'App attribution');
  assert.equal(args[args.indexOf('--match-head-commit') + 1], sha);
  assert.ok(args.includes('--auto'));
  assert.equal(autoMergeArgs({ ...pr, auto_merge: {} }, sha, 'owner/portfolio', ''), null);
  assert.throws(() => autoMergeArgs({ ...pr, head: { sha: 'b'.repeat(40) } }, sha, '', ''));
  assert.throws(() => autoMergeArgs({ ...pr, state: 'closed' }, sha, '', ''));
  assert.throws(() => autoMergeArgs({ ...pr, body: '' }, sha, '', ''));
});
