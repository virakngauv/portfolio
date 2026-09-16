import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkLinkedIssue,
  closingIssueNumbers,
} from "../scripts/check-linked-issue.mjs";

test("closing issue references use GitHub closing keywords", () => {
  assert.deepEqual(
    closingIssueNumbers("Closes #7\nFixes #12 and resolves #7"),
    [7, 12],
  );
  assert.deepEqual(closingIssueNumbers("Related to #7"), []);
});

test("linked issue check rejects missing references and pull-request references", async () => {
  await assert.rejects(
    checkLinkedIssue({
      event: { pull_request: { body: "No closing link" } },
      repository: "o/r",
      token: "x",
    }),
    /closing reference/,
  );

  await assert.rejects(
    checkLinkedIssue({
      event: { pull_request: { body: "Closes #7" } },
      repository: "o/r",
      token: "x",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ pull_request: {} }),
      }),
    }),
    /pull request/,
  );
});

// Posted by ChatGPT Chat on behalf of @virakngauv.
