import { getOctokit } from "@actions/github";
import { readFileSync } from "fs";

// Constants
export const MAIAR_SYMBOL = "$MAIAR";
export const BOUNTY_LABEL = "bounty";
export const BOUNTY_PAID_LABEL = "bounty paid";

/**
 * Service class to interact with GitHub API
 */
export class GithubService {
  /**
   * Initialize the GitHub service
   * @param {string} githubToken - GitHub API token
   * @param {string} owner - Repository owner
   * @param {string} repoName - Repository name
   * @param {number} prNumber - Pull request number
   */
  constructor(githubToken, owner, repoName, prNumber) {
    this.github = getOctokit(githubToken);
    this.owner = owner;
    this.repoName = repoName;
    this.prNumber = prNumber;
  }

  /**
   * Get the list of CODEOWNERS from the CODEOWNERS file
   * @returns {Promise<Array<string>>} Array of GitHub usernames who are CODEOWNERS
   */
  async getCodeowners() {
    let codeowners = [];
    try {
      const codeownersFile = readFileSync(".github/CODEOWNERS", "utf8");
      // Extract usernames from CODEOWNERS file, removing @ symbols
      codeowners = codeownersFile
        .trim()
        .split(/\s+/)
        .map((username) => username.replace("@", "").trim());
    } catch (error) {
      console.log(`Error reading CODEOWNERS file: ${error.message}`);
    }
    return codeowners;
  }

  /**
   * Get all comments on the PR
   */
  async getComments(issueNumber) {
    const comments = await this.github.rest.issues.listComments({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber
    });
    return comments;
  }

  /**
   * Get the details of an issue
   * @param {string} issueNumber - Issue number
   */
  async getIssueDetails(issueNumber) {
    const issueDetails = await this.github.rest.issues.get({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber
    });
    return issueDetails;
  }

  /**
   * Label an issue
   * @param {number} issueNumber - Issue number
   * @param {string} label - Label to add
   */
  async labelIssue(issueNumber, label) {
    const labeled = await this.github.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber,
      labels: [label]
    });
    return labeled;
  }

  /**
   * Create a comment on an issue
   * @param {number} issueNumber - Issue number
   * @param {string} comment - Comment to create
   */
  async comment(issueNumber, comment) {
    const commentCreated = await this.github.rest.issues.createComment({
      owner: this.owner,
      repo: this.repoName,
      issue_number: issueNumber,
      body: comment
    });
    return commentCreated;
  }

  /**
   * Filter issues that have bounty labels
   * @param {Array<string>} issues - Array of issue numbers
   */
  async filterBountyIssues(issues) {
    const bountyIssues = [];
    for (const issue of issues) {
      const issueDetails = await this.getIssueDetails(issue);
      const hasBountyLabel = issueDetails.data.labels.some((label) =>
        label.name.includes(BOUNTY_LABEL)
      );

      if (hasBountyLabel) bountyIssues.push(issueDetails);
    }

    return bountyIssues;
  }

  /**
   * Get all comments on this PR
   */
  async getPRComments() {
    const comments = await this.getComments(this.prNumber);
    return comments;
  }

  /**
   * Generates a footer message with information about the GitHub Action run that created the comment
   * @param {number} runId - Github Action run ID
   * @param {string} runDate - Github Action run date
   * @returns {string} - Formatted footer text with run ID link and timestamp
   */
  generateActionInfo(runId, runDate) {
    return `<sub>This comment was created by GitHub Actions workflow run [#${runId}](https://github.com/${this.owner}/${this.repoName}/actions/runs/${runId}) on ${runDate}</sub>`;
  }
}
