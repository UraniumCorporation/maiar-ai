import type { UserConfig } from "@commitlint/types";

const commitlintConfig: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  parserPreset: "conventional-changelog-atom",
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
        "other", // Other changes
        "core", // core package
        "memory-filesystem", // memory-filesystem plugin
        "memory-sqlite", // memory-sqlite plugin
        "model-ollama", // model-ollama plugin
        "model-openai", // model-openai plugin
        "plugin-express", // plugin-express plugin
        "plugin-image", // plugin-image plugin
        "plugin-search", // plugin-search plugin
        "plugin-telegram", // plugin-telegram plugin
        "plugin-terminal", // plugin-terminal plugin
        "plugin-text", // plugin-text plugin
        "plugin-time", // plugin-time plugin
        "plugin-websocket", // plugin-websocket plugin,
        "plugin-x", // plugin-x plugin
        "maiar-starter", // maiar-starter directory
        "website" // documentation website
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
