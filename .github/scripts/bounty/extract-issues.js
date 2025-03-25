import { appendFileSync } from "fs";

import { GithubService } from "../lib/github.js";

/**
 * Main function that extracts issue numbers from CODEOWNER comments from a PR
 * @returns {Promise<{ issues_closed: string }>} Object containing the extracted issues as a CSV string
 */
async function main() {
  // Get PR information from environment variables
  const githubToken = process.env.GH_TOKEN;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.REPO; // UraniumCorporation/maiar-ai

  // Validate required environment variables
  if (!githubToken || !prNumber || !repo) {
    throw new Error(
      "GH_TOKEN, PR_NUMBER, and REPO environment variables are required"
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

  // Fetch CODEOWNERS and PR comments
  const codeowners = await githubService.getCodeowners();
  const prComments = await githubService.getPRComments();

  console.log("CODEOWNERS:", codeowners);

  // Array to store unique issue numbers
  const issueNumbers = [];

  // Loop through each comment to find those from CODEOWNERS that mention closing issues
  for (let i = 0; i < prComments.data.length; i++) {
    const comment = prComments.data[i];
    const author = comment.user.login;
    const body = comment.body;

    // Check if the author is a CODEOWNER
    if (codeowners.includes(author)) {
      // Look for closing keywords followed by issue numbers
      // Matches: "closes #123", "fixes #456", "resolves #789" (case insensitive)
      const closingKeywordsRegex = /(?:closes|fixes|resolves)\s+#(\d+)/gi;
      let match;

      // Extract all issue numbers from the comment
      while ((match = closingKeywordsRegex.exec(body)) !== null) {
        const issueNumber = match[1];
        console.log(
          `Found issue #${issueNumber} mentioned by CODEOWNER ${author}`
        );
        // Add issue number if not already in the array
        if (!issueNumbers.includes(issueNumber)) {
          issueNumbers.push(issueNumber);
        }
      }
    }
  }

  // Convert array to comma-separated string or empty string if empty
  const issuesCsv = issueNumbers.length > 0 ? issueNumbers.join(",") : "none";

  // Log results for visibility in GitHub Actions logs
  if (!issuesCsv) {
    console.log(
      "⚠️ No issues found that this PR closes (based on CODEOWNER comments)"
    );
  } else {
    console.log(
      `Found ${issueNumbers.length} issue(s) that PR #${prNumber} closes (from CODEOWNER comments):`
    );
    // Log each issue with its GitHub URL
    issueNumbers.forEach((issueNumber) => {
      console.log(
        `- Issue #${issueNumber} (https://github.com/${repo}/issues/${issueNumber})`
      );
    });
  }

  // Return output for GitHub Actions
  return {
    issues_closed: issuesCsv
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
