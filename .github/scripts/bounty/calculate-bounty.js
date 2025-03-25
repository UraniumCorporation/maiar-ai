import { appendFileSync } from "fs";

import { GithubService, MAIAR_SYMBOL } from "../lib/github.js";

/**
 * Main function that calculates the bounty amount for a PR
 * @returns {Promise<{ total_bounty: number, issues_to_bounty_map: string }>} Object containing the total bounty amount and a map of issue numbers to bounty amounts
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

  // Fetch CODEOWNERS
  const codeowners = await githubService.getCodeowners();

  console.log("CODEOWNERS:", codeowners);

  const bountyIssues = bountyIssuesToPay.split(",");

  let total_bounty = 0;
  const issuesToBountyMap = new Map();
  for (const issueNumber of bountyIssues) {
    const comments = await githubService.getComments(issueNumber);

    for (const comment of comments.data) {
      const author = comment.user.login;
      const body = comment.body;

      // Check if comment is from CODEOWNERS
      if (codeowners.includes(author)) {
        // Look for bounty specification
        const bountyMatch = body.match(
          /[Bb][Oo][Uu][Nn][Tt][Yy]:\s*(\d+(?:\.\d+)?)\s*\$MAIAR/
        );
        if (bountyMatch && bountyMatch[1]) {
          const amount = parseFloat(bountyMatch[1]);
          console.log(
            `Found bounty amount: ${amount} ${MAIAR_SYMBOL} for issue #${issueNumber} (https://github.com/${repo}/issues/${issueNumber})`
          );

          total_bounty += amount;
          issuesToBountyMap.set(issueNumber, amount);
        }
      }
    }
  }

  // Convert Map to csv string
  const issues_to_bounty_csv = Array.from(issuesToBountyMap.entries())
    .map(([issueNumber, amount]) => `#${issueNumber}:${amount} ${MAIAR_SYMBOL}`)
    .join(",");

  return {
    total_bounty,
    issues_to_bounty_csv
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
