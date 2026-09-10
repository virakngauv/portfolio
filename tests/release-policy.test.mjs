import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDispatch, eligibleRun, assertPinOnly, assertProtected } from '../scripts/release-policy.mjs';

const project = { repository: 'owner/game', path: 'projects/game', branch: 'main', requiredJobs: ['Quality', 'End-to-end'] };
const sha = 'a'.repeat(40);
test('dispatch rejects unknown repositories and shell-like SHA payloads', () => {
  validateDispatch({ repository: project.repository, sha }, [project]);
  for (const payload of [null, { repository: 'evil/game', sha }, { repository: project.repository, sha: '$(id)' }]) {
    assert.throws(() => validateDispatch(payload, [project]));
  }
});
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
