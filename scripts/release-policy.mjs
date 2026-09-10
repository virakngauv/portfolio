export function validateDispatch(payload, projects) {
  if (!payload || !projects.some((p) => p.repository === payload.repository)
      || !/^[a-f0-9]{40}$/.test(payload.sha ?? '')) throw new Error('Invalid upstream dispatch');
}

export function eligibleRun(run, jobs, project, sha) {
  return run?.event === 'push' && run.head_branch === project.branch && run.head_sha === sha
    && run.head_repository?.full_name === project.repository
    && project.requiredJobs.length > 0
    && project.requiredJobs.every((name) => jobs.some((job) => job.name === name && job.conclusion === 'success'));
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
