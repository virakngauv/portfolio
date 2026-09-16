import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const closingReference =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/giu;

export function closingIssueNumbers(body) {
  return [
    ...new Set(
      [...body.matchAll(closingReference)].map((match) => Number(match[1])),
    ),
  ];
}

export async function checkLinkedIssue({
  event,
  repository,
  token,
  fetchImpl = fetch,
}) {
  const defaultBranch = event.repository?.default_branch;
  const baseBranch = event.pull_request?.base?.ref;
  if (!defaultBranch || baseBranch !== defaultBranch)
    throw new Error(
      "Closing issue references require a pull request targeting the default branch.",
    );

  const numbers = closingIssueNumbers(event.pull_request?.body ?? "");
  if (numbers.length === 0)
    throw new Error(
      "Pull request body must include a closing reference such as `Closes #7`.",
    );

  for (const number of numbers) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}/issues/${number}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "portfolio-linked-issue-check",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok)
      throw new Error(
        `Closing reference #${number} does not resolve to an accessible issue.`,
      );
    const issue = await response.json();
    if (issue.pull_request)
      throw new Error(
        `Closing reference #${number} points to a pull request, not an issue.`,
      );
  }

  return numbers;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!eventPath || !repository || !token) {
    throw new Error(
      "GITHUB_EVENT_PATH, GITHUB_REPOSITORY, and GITHUB_TOKEN are required.",
    );
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const numbers = await checkLinkedIssue({ event, repository, token });
  console.log(
    `Verified closing issue reference${numbers.length === 1 ? "" : "s"}: ${numbers.map((n) => `#${n}`).join(", ")}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();

// Posted by ChatGPT Chat on behalf of @virakngauv.
