import type { UserConfig } from "@commitlint/types";

const commitlintConfig: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  formatter: "@commitlint/format",
  helpUrl:
    "https://github.com/conventional-changelog/commitlint/#what-is-commitlint",
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "docs", // Documentation changes
        "style", // Changes that do not affect the meaning of the code (white-space, formatting, etc.)
        "refactor", // Code changes that neither fix a bug nor add a feature
        "perf", // Performance improvement
        "test", // Adding missing tests or correcting existing tests
        "build", // Changes that affect the build system or external dependencies (example scopes: npm)
        "ci", // Changes to CI configuration files and scripts
        "cd", // Changes to CD configuration files and scripts
        "chore", // Other changes that don't modify src or test files
        "revert" // Reverts a previous commit
      ]
    ],
    "scope-enum": [
      2,
      "always",
      [
        "setup", // Project setup
        "config", // Configuration files
        "deps", // Dependency updates
        "feature", // Feature-specific changes
        "bug", // Bug fixes
        "docs", // Documentation
        "style", // Code style/formatting
        "refactor", // Code refactoring
        "test", // Tests
        "build", // Build scripts or configuration
        "ci", // Continuous integration
        "cd", // Continuous deployment
        "release", // Release related changes
        "bounty", // Bounty CI related changes
        "thank-you", // Thank you CI related changes
        "other", // Other changes
        "packages", // packages directory
        "core", // core package
        "memory-filesystem", // memory-filesystem memory provider
        "memory-postgres", // memory-postgres memory provider
        "memory-sqlite", // memory-sqlite memory provider
        "model-ollama", // model-ollama model provider
        "model-openai", // model-openai model provider
        "plugin-character", // plugin-character plugin
        "plugin-discord", // plugin-discord plugin
        "plugin-image", // plugin-image plugin
        "plugin-search", // plugin-search plugin
        "plugin-telegram", // plugin-telegram plugin
        "plugin-terminal", // plugin-terminal plugin
        "plugin-text", // plugin-text plugin
        "plugin-time", // plugin-time plugin
        "plugin-websocket", // plugin-websocket plugin,
        "plugin-x", // plugin-x plugin
        "apps", // apps directory
        "client", // maiar client app
        "starter", // maiar starter app
        "website", // maiar docs website app
        "nx" // nx related changes
      ]
    ],
    "header-max-length": [0],
    "subject-max-length": [0],
    "body-max-length": [0],
    "body-max-line-length": [0],
    "footer-max-length": [0],
    "footer-max-line-length": [0]
  }
};

export default commitlintConfig;
