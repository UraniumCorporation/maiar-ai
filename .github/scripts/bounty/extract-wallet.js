import { appendFileSync } from "fs";

import { GithubService } from "../lib/github.js";

/**
 * Main function that calculates the bounty amount for a PR
 * @returns {Promise<{ total_bounty: number, issues_to_bounty_map: string }>} Object containing the total bounty amount and a map of issue numbers to bounty amounts
 */
async function main() {
  // Get PR information from environment variables
  const githubToken = process.env.GH_TOKEN;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.REPO; // UraniumCorporation/maiar-ai
  const prAuthor = process.env.PR_AUTHOR;

  if (!githubToken || !prNumber || !repo || !prAuthor) {
    throw new Error(
      "GH_TOKEN, PR_NUMBER, REPO, and PR_AUTHOR environment variables are required"
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

  const prComments = await githubService.getPRComments();

  let wallet;
  for (const comment of prComments.data) {
    const author = comment.user.login;
    const body = comment.body;

    // Check if the comment is from the PR author
    if (author === prAuthor) {
      // Look for Solana wallet address using regex
      const walletMatch = body.match(/solana:([A-Za-z0-9]{32,})/);
      if (walletMatch && walletMatch[1]) {
        const foundWallet = walletMatch[1];
        console.log(
          `Found wallet address in comment by PR author: ${foundWallet}`
        );

        // Keep updating the wallet variable to use the most recent one
        wallet = foundWallet;
      }
    }
  }

  if (!wallet) {
    console.log(
      "❌ No valid Solana wallet address found in PR author's comments"
    );
    console.log(
      "PR author must include a wallet address in a comment with the format:"
    );
    console.log("solana:<insert-wallet-address-here>");
    process.exit(1);
  }

  console.log(
    `Using wallet from the most recent comment by PR author: ${wallet}`
  );

  return { wallet };
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
