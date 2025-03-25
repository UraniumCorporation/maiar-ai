import { appendFileSync } from "fs";

import { BOUNTY_PAID_LABEL, GithubService } from "../lib/github.js";

/**
 * Main function that filters bounty issues that have not been paid
 * @returns {Promise<{ bounty_issues_to_pay: string }>} Object containing the filtered bounty issues to pay as a CSV string
 */
async function main() {
  // Get PR information from environment variables
  const githubToken = process.env.GH_TOKEN;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.REPO; // UraniumCorporation/maiar-ai
  const issuesClosed = process.env.ISSUES_CLOSED;

  // Validate required environment variables
  if (!githubToken || !prNumber || !repo || !issuesClosed) {
    throw new Error(
      "GH_TOKEN, PR_NUMBER, REPO, and ISSUES_CLOSED environment variables are required"
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

  if (issuesClosed === "none") {
    console.log("No issues closed by this PR");
    return {
      bounty_issues_to_pay: "none"
    };
  }

  const issues = issuesClosed.split(",");

  // Get all issues that have bounty labels
  const bountyIssues = await githubService.filterBountyIssues(issues);

  if (bountyIssues.length === 0) {
    console.log("No bounty issues found");
    return {
      bounty_issues_to_pay: "none"
    };
  }

  // Filter bounty issues that do not have bounty-paid label
  const bountyIssuesToPay = bountyIssues
    .filter(
      (issue) =>
        !issue.data.labels.some((label) =>
          label.name.includes(BOUNTY_PAID_LABEL)
        )
    )
    .map((issue) => issue.data.number);

  if (bountyIssuesToPay.length === 0) {
    console.log("No bounty issues to pay");
    return {
      bounty_issues_to_pay: "none"
    };
  }

  console.log(`Bounty issues to pay: ${bountyIssuesToPay.join(", ")}`);

  return {
    bounty_issues_to_pay: bountyIssuesToPay.join(",")
  };
}

// Execute the main function and handle outputs/errors
main()
  .then((outputs) => {
    console.log("\nOutputs:");
    // Set each output for GitHub Actions
    for (const [key, value] of Object.entries(outputs)) {
      console.log(`${key}="${value}"`);
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
