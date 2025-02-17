import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: "Maiar",
  tagline: "Build AI agents with ease",
  favicon: "img/favicon.ico",

  // Set the production url of your site here
  url: "https://maiar.dev",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "UraniumCorporation", // Usually your GitHub org/user name.
  projectName: "maiar-ai", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  trailingSlash: false,
  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebar-docs.ts",
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            "https://github.com/UraniumCorporation/maiar-ai/tree/main/website/docs"
        },
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],

  themeConfig: {
    colorMode: {
      defaultMode: "dark",
      disableSwitch: true,
      respectPrefersColorScheme: false
    },
    // Replace with your project's social card
    image: "img/maiar-social-card.png",
    navbar: {
      title: "Maiar",
      hideOnScroll: true,
      logo: {
        alt: "Maiar Logo",
        src: "img/logo.svg"
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Documentation",
          docsPluginId: "default"
        },
        {
          to: "/api",
          position: "left",
          label: "API"
        },
        {
          href: "https://github.com/UraniumCorporation/maiar-ai",
          label: "GitHub",
          position: "right"
        },
        {
          href: "https://maiar.dev/maiar.pdf",
          label: "Whitepaper",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Getting Started",
              to: "/docs/getting-started"
            },
            {
              label: "Contributing to Maiar",
              to: "/docs/contributing-guide"
            },
            {
              label: "API",
              to: "/api"
            },
            {
              label: "Whitepaper",
              href: "https://maiar.dev/maiar.pdf"
            }
          ]
        },
        {
          title: "Community",
          items: [
            {
              label: "Discord",
              href: "https://discord.gg/maiar"
            },
            {
              label: "X",
              href: "https://x.com/maiar_ai"
            }
          ]
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/UraniumCorporation/maiar-ai"
            }
          ]
        }
      ],
      copyright: `Maiar AI ${new Date().getFullYear()} - A Uranium Corporation Product`
    },
    prism: {
      theme: prismThemes.okaidia,
      darkTheme: prismThemes.okaidia
    },
    metadata: [
      {
        name: "description",
        content: "Build AI agents with ease using Maiar's powerful framework"
      },
      {
        property: "og:description",
        content: "Build AI agents with ease using Maiar's powerful framework"
      },
      {
        name: "twitter:description",
        content: "Build AI agents with ease using Maiar's powerful framework"
      },
      {
        property: "og:image",
        content: "https://maiar.dev/img/maiar-social-card.png"
      },
      {
        name: "twitter:image",
        content: "https://maiar.dev/img/maiar-social-card.png"
      },
      { name: "twitter:card", content: "summary_large_image" }
    ]
  } satisfies Preset.ThemeConfig,

  plugins: [
    [
      "docusaurus-plugin-typedoc",
      {
        entryPoints: ["../packages/core/src/index.ts"],
        tsconfig: "../packages/core/tsconfig.json",
        out: "api",
        plugin: ["typedoc-plugin-markdown"],
        hideGenerator: true,
        cleanOutputDir: true,
        categorizeByGroup: true,
        pretty: true,
        includeVersion: true,
        sort: ["source-order", "required-first", "visibility"],
        gitRevision: "main",
        readme: "none",
        commentStyle: "all",
        preserveAnchorCasing: false,
        hideBreadcrumbs: false,
        preserveWatchOutput: true,
        disableSources: false,
        validation: {
          notExported: true,
          invalidLink: true,
          notDocumented: false
        },
        exclude: [
          "**/_media/**",
          "**/node_modules/**",
          "**/dist/**",
          "**/*.test.ts",
          "**/*.spec.ts"
        ],
        watch: false,
        treatWarningsAsErrors: true,
        treatValidationWarningsAsErrors: true,
        searchInComments: true
      }
    ],
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "api",
        path: "api",
        routeBasePath: "api",
        sidebarPath: "sidebar-api.ts"
      }
    ]
  ]
};

export default config;
