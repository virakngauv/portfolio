import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  checkLinkedIssue,
  closingIssueNumbers,
} from "../scripts/check-linked-issue.mjs";

function pullRequestEvent(body, base = "main") {
  return {
    pull_request: { base: { ref: base }, body },
    repository: { default_branch: "main" },
  };
}

test("closing issue references use GitHub closing keywords", () => {
  assert.deepEqual(
    closingIssueNumbers("Closes #7\nFixes #12 and resolves #7"),
    [7, 12],
  );
  assert.deepEqual(closingIssueNumbers("Closes: #7"), [7]);
  assert.deepEqual(closingIssueNumbers("Related to #7"), []);
});

test("linked issue policy runs trusted base code", () => {
  const generalWorkflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  const policyWorkflow = readFileSync(
    new URL("../.github/workflows/linked-issue.yml", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(generalWorkflow, /check-linked-issue/);
  assert.match(policyWorkflow, /pull_request_target:/);
  assert.match(
    policyWorkflow,
    /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.match(policyWorkflow, /run: node scripts\/check-linked-issue\.mjs/);
});

test("linked issue check rejects missing references and pull-request references", async () => {
  await assert.rejects(
    checkLinkedIssue({
      event: pullRequestEvent("No closing link"),
      repository: "o/r",
      token: "x",
    }),
    /closing reference/,
  );

  await assert.rejects(
    checkLinkedIssue({
      event: pullRequestEvent("Closes #7"),
      repository: "o/r",
      token: "x",
      fetchImpl: async (_url, options) => {
        assert.ok(options.signal instanceof AbortSignal);
        return {
          ok: true,
          json: async () => ({ pull_request: {} }),
        };
      },
    }),
    /pull request/,
  );
});

test("linked issue check requires the repository default branch", async () => {
  await assert.rejects(
    checkLinkedIssue({
      event: pullRequestEvent("Closes #7", "release"),
      repository: "o/r",
      token: "x",
    }),
    /default branch/,
  );
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
