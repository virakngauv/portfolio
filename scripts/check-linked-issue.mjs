import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const closingIssuesQuery = `
  query ClosingIssues(
    $owner: String!
    $name: String!
    $number: Int!
    $cursor: String
  ) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        closingIssuesReferences(
          first: 100
          after: $cursor
          excludeUserLinked: true
        ) {
          nodes {
            number
            repository {
              nameWithOwner
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

function repositoryCoordinates(repository) {
  const [owner, name, extra] = repository.split("/");
  if (!owner || !name || extra)
    throw new Error("GITHUB_REPOSITORY must use the owner/name form.");
  return { owner, name };
}

async function githubClosingIssueNumbers({
  repository,
  pullRequestNumber,
  token,
  fetchImpl,
}) {
  const { owner, name } = repositoryCoordinates(repository);
  const numbers = new Set();
  let cursor = null;

  do {
    const response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "portfolio-linked-issue-check",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        query: closingIssuesQuery,
        variables: { owner, name, number: pullRequestNumber, cursor },
      }),
    });

    if (!response.ok)
      throw new Error("Unable to read GitHub's closing issue relationships.");

    const payload = await response.json();
    if (payload.errors?.length)
      throw new Error("GitHub could not evaluate closing issue relationships.");

    const pullRequest = payload.data?.repository?.pullRequest;
    if (!pullRequest) throw new Error("Pull request was not found.");

    const connection = pullRequest.closingIssuesReferences;
    for (const issue of connection.nodes ?? []) {
      if (issue.repository?.nameWithOwner === repository)
        numbers.add(issue.number);
    }

    cursor = connection.pageInfo?.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (cursor);

  return [...numbers];
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

  const pullRequestNumber = event.pull_request?.number ?? event.number;
  if (!Number.isInteger(pullRequestNumber))
    throw new Error("Pull request number is required.");

  const numbers = await githubClosingIssueNumbers({
    repository,
    pullRequestNumber,
    token,
    fetchImpl,
  });
  if (numbers.length === 0)
    throw new Error(
      "Pull request must include a GitHub-recognized closing keyword such as `Closes #7` for an issue in this repository.",
    );

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
