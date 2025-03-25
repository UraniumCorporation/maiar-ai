import { BOUNTY_PAID_LABEL, GithubService } from "../lib/github.js";

/**
 * Main function that labels bounty issues on Github with the `bounty paid` label
 * @returns {Promise<void>}
 */
async function main() {
  // Get PR information from environment variables
  const githubToken = process.env.GH_TOKEN;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.REPO; // UraniumCorporation/maiar-ai
  const bountyIssuesToPay = process.env.BOUNTY_ISSUES_TO_PAY;

  if (!githubToken || !prNumber || !repo || !bountyIssuesToPay) {
    throw new Error(
      "GH_TOKEN, PR_NUMBER, REPO, and BOUNTY_ISSUES_TO_PAY environment variables are required"
    );
  }

  // Parse repository string into owner and repo components
  const [owner, repoName] = repo.split("/");

  console.log(`Repository: ${repo} (https://github.com/${repo})`);
  console.log(
    `Pull Request Number: #${prNumber} (https://github.com/${repo}/pull/${prNumber})`
  );

  const githubService = new GithubService(
    githubToken,
    owner,
    repoName,
    prNumber
  );

  let issuesError = [];
  const issues = bountyIssuesToPay.split(",");
  for (const issue of issues) {
    try {
      await githubService.labelIssue(issue, BOUNTY_PAID_LABEL);
      console.log(
        `Labeled issue #${issue} with label: ${BOUNTY_PAID_LABEL} (https://github.com/${repo}/issues/${issue})`
      );
    } catch (error) {
      console.error(`Error labeling issue #${issue}: ${error}`);
      issuesError.push(issue);
    }
  }

  if (issuesError.length > 0) {
    throw new Error(
      `Failed to label ${issuesError.length} issues: ${issuesError.join(", ")}`
    );
  }
}

// Execute the main function and handle outputs/errors
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
