import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: "doc",
      label: "Home",
      id: "index"
    },
    {
      type: "doc",
      id: "getting-started",
      label: "Getting Started"
    },
    {
      type: "doc",
      id: "contributing-guide",
      label: "Contributing to Maiar"
    },
    {
      type: "category",
      label: "Building Plugins",
      link: {
        type: "doc",
        id: "building-plugins/index"
      },
      items: [
        "building-plugins/philosophy",
        "building-plugins/executors",
        "building-plugins/triggers"
      ]
    },
    {
      type: "category",
      label: "Model Providers",
      link: {
        type: "doc",
        id: "model-providers/index"
      },
      items: ["model-providers/overview"]
    },
    {
      type: "category",
      label: "Memory Providers",
      link: {
        type: "doc",
        id: "memory-providers/index"
      },
      items: ["memory-providers/overview"]
    },
    {
      type: "category",
      label: "Core Utilities",
      link: {
        type: "doc",
        id: "core-utilities/index"
      },
      items: [
        "core-utilities/runtime",
        "core-utilities/getObject",
        "core-utilities/createEvent"
      ]
    }
  ]
};

export default sidebars;
