import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkLinkedIssue } from "../scripts/check-linked-issue.mjs";

function pullRequestEvent(body, base = "main") {
  return {
    number: 8,
    pull_request: { base: { ref: base }, body, number: 8 },
    repository: { default_branch: "main" },
  };
}

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

test("CI preserves the required release check contexts", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /\n {4}name: unit\n/);
  assert.match(workflow, /\n {4}name: container-smoke\n/);
});

test("linked issue check uses GitHub's parsed keyword relationships", async () => {
  let requestBody;
  const numbers = await checkLinkedIssue({
    event: pullRequestEvent("Closes #7"),
    repository: "o/r",
    token: "x",
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          data: {
            repository: {
              pullRequest: {
                closingIssuesReferences: {
                  nodes: [{ number: 7, repository: { nameWithOwner: "o/r" } }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
      };
    },
  });

  assert.deepEqual(numbers, [7]);
  assert.match(requestBody.query, /excludeUserLinked: true/);
  assert.deepEqual(requestBody.variables, {
    owner: "o",
    name: "r",
    number: 8,
    cursor: null,
  });
});

test("linked issue check rejects missing GitHub keyword relationships", async () => {
  await assert.rejects(
    checkLinkedIssue({
      event: pullRequestEvent("`Closes #7`"),
      repository: "o/r",
      token: "x",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          data: {
            repository: {
              pullRequest: {
                closingIssuesReferences: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        }),
      }),
    }),
    /closing keyword/,
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
