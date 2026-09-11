export function eligibleRun(run, jobs, project, sha) {
  return run?.event === 'push' && run.head_branch === project.branch && run.head_sha === sha
    && run.head_repository?.full_name === project.repository
    && project.requiredJobs.length > 0
    && project.requiredJobs.every((name) => {
      const matching = jobs.filter((job) => job.name === name);
      return matching.length > 0 && matching.every((job) => job.conclusion === 'success');
    });
}

export function assertPinOnly(files, projects) {
  if (!files.length || files.some((file) => file.status !== 'modified'
    || !projects.some((p) => p.path === file.filename))) throw new Error('Release branch contains unexpected changes');
}

export function assertProtected(rule) {
  if (!rule || rule.pattern !== 'main' || !rule.requiresStatusChecks || !rule.requiresStrictStatusChecks
      || !rule.isAdminEnforced || !['unit', 'container-smoke'].every((name) => rule.requiredStatusCheckContexts.includes(name))) {
    throw new Error('Auto-merge requires enforced, up-to-date unit and container-smoke checks on main');
  }
}

export function assertPullRequestProtection(protection) {
  const reviews = protection?.required_pull_request_reviews;
  const bypass = reviews?.bypass_pull_request_allowances;
  if (protection?.allow_force_pushes?.enabled !== false
      || protection?.allow_deletions?.enabled !== false
      || !reviews
      || (bypass && ['users', 'teams', 'apps'].some((kind) => bypass[kind]?.length))) {
    throw new Error('Auto-merge requires pull requests without bypass allowances, force pushes, or deletions');
  }
}

export function retainedPins(files, candidateTree, baseTree, changes) {
  return files.filter((file) => !changes.some((change) => change.path === file.filename)).flatMap((file) => {
    const candidate = candidateTree.find((entry) => entry.path === file.filename);
    const base = baseTree.find((entry) => entry.path === file.filename);
    if (candidate?.mode !== '160000' || base?.mode !== '160000') throw new Error('Invalid retained gitlink');
    return candidate.sha === base.sha ? [] : [{ path: file.filename, sha: candidate.sha, previous: base.sha }];
  });
}

export function autoMergeArgs(pr, expectedHead, repo, attribution) {
  if (pr.state !== 'open' || pr.head.sha !== expectedHead) throw new Error('PR changed before auto-merge request');
  if (pr.auto_merge) return null;
  const issue = /Closes #(\d+)/.exec(pr.body ?? '')?.[1];
  if (!issue) throw new Error('Release PR has no tracking issue');
  return ['pr', 'merge', String(pr.number), '--repo', repo, '--auto', '--squash',
    '--match-head-commit', expectedHead, '--body', `Closes #${issue}\n\n${attribution}`];
}
