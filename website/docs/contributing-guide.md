# Contributing to Maiar

## Prerequisites

> **_IMPORTANT_**
>
> **Please make sure to checkout the [contributing guide](https://github.com/UraniumCorporation/maiar-ai/blob/main/.github/CONTRIBUTING.md) first and foremost**

1. Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v22.13.1) - We recommend using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) to manage Node.js versions:

```bash
nvm install 22.13.1
nvm use 22.13.1
```

- The [pnpm](https://pnpm.io/) package manager explicitly - Required for managing the monorepo workspace and its dependencies efficiently

2. Install the project dependencies:

From the root of the repository

```bash
pnpm install
```

3. Start the development environment. You'll need two terminal windows:

### Terminal 1 - Core Packages

**From the root of the repository**

```bash
pnpm dev
```

This command watches for changes in the core packages (`packages/**/*.ts`) and automatically rebuilds them. It:

1. Cleans any previous build state
2. Builds all core packages
3. Creates a `.build-complete` marker file to indicate the core packages build is finished as a state file to communicate with the starter project
4. Watches for changes and repeats the process

### Terminal 2 - Starter Project

**From the root of the repository**

```bash
cd maiar-starter
pnpm dev
```

This command runs the starter project in development mode. It:

1. Watches for changes in both the starter project's source files and core package builds
2. Waits for core packages to finish building (using the `.build-complete` marker)
3. Rebuilds the starter project
4. Restarts the application automatically

This setup ensures that changes to either the core packages or the starter project are automatically rebuilt and reflected in your running application, providing a seamless development experience.

> **_NOTE_**
>
> The `maiar-starter` project serves as a reference implementation demonstrating how to develop against the core Maiar packages. You can apply this same development setup to any project that depends on Maiar packages - simply mirror the dev script configuration and `.build-complete` marker file handling shown in the starter project's package.json. The key focus of this repository is the core packages in `packages/*`, with `maiar-starter` serving as an example consumer.
