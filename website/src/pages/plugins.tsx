import React, { useEffect, useState } from "react";

import Layout from "@theme/Layout";
import clsx from "clsx";

import styles from "../css/plugins.module.css";

interface Plugin {
  name: string;
  description: string;
  author: string;
  authorAvatar: string;
  repository: string;
  version: string;
  tags: string[];
  isOfficial?: boolean;
  npmPackage?: string;
  stars: number;
  lastPublished: string;
}

interface CommunityPlugin {
  repo: string;
  owner: string;
  npm_package_name: string;
}

interface GithubRepo {
  html_url: string;
  organization: {
    login: string;
    avatar_url: string;
  };
  description?: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  topics: string[];
  stargazers_count: number;
}

interface GithubDirectory {
  name: string;
  path: string;
  type: string;
}

interface GithubRelease {
  tag_name: string;
}

export default function Plugins(): React.JSX.Element {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPlugins, setFilteredPlugins] = useState<Plugin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        setError(null);
        setIsLoading(true);
        // First, fetch the official packages directory contents
        const packagesResponse = await fetch(
          "https://api.github.com/repos/UraniumCorporation/maiar-ai/contents/packages"
        );
        const packagesData: GithubDirectory[] = await packagesResponse.json();

        // Get repository info for metadata
        const repoResponse = await fetch(
          "https://api.github.com/repos/UraniumCorporation/maiar-ai"
        );
        const repoData: GithubRepo = await repoResponse.json();

        // Get latest release version
        const releasesResponse = await fetch(
          "https://api.github.com/repos/UraniumCorporation/maiar-ai/releases/latest"
        );
        const releaseData: GithubRelease = await releasesResponse.json();
        const latestVersion = releaseData.tag_name.replace("v", "");

        // Filter for directories and transform them into plugins
        const pluginDirectories = packagesData.filter(
          (item) =>
            item.type === "dir" &&
            (item.name.startsWith("plugin-") ||
              item.name.startsWith("memory-") ||
              item.name.startsWith("model-") ||
              item.name.startsWith("monitor-"))
        );

        // Transform directory data into official plugin format
        const officialPlugins = await Promise.all(
          pluginDirectories.map(async (dir) => {
            // Fetch latest version from npm for official plugins
            const npmResponse = await fetch(
              `https://registry.npmjs.org/@maiar-ai/${dir.name}`
            );
            const npmData = await npmResponse.json();
            const npmLatestVersion =
              npmData["dist-tags"]?.latest || latestVersion;
            const lastPublished =
              npmData.time?.[npmLatestVersion] || releaseData.tag_name;

            return {
              name: dir.name,
              description: `Official ${dir.name.split("-")[1]} ${
                dir.name.startsWith("plugin-")
                  ? "plugin"
                  : dir.name.startsWith("memory-")
                    ? "memory package"
                    : dir.name.startsWith("monitor-")
                      ? "monitor package"
                      : "model package"
              } for Maiar framework`,
              author: repoData.organization.login,
              authorAvatar: `${repoData.organization.avatar_url}&s=48`,
              repository: `${repoData.html_url}/tree/main/packages/${dir.name}`,
              version: npmLatestVersion,
              tags: [
                "🟩 official",
                dir.name.startsWith("plugin-")
                  ? "plugin"
                  : dir.name.startsWith("memory-")
                    ? "memory"
                    : dir.name.startsWith("monitor-")
                      ? "monitor"
                      : "model",
                dir.name.split("-")[1]
              ],
              isOfficial: true,
              stars: repoData.stargazers_count,
              lastPublished
            };
          })
        );

        // Fetch community plugins from the official plugin registry
        const communityDataResponse = await fetch(
          "https://raw.githubusercontent.com/UraniumCorporation/plugin-registry/refs/heads/main/index.json"
        );
        const communityData: CommunityPlugin[] =
          await communityDataResponse.json();

        // Fetch additional data for each community plugin
        const communityPlugins = await Promise.all(
          communityData.map(async (plugin) => {
            try {
              const repoResponse = await fetch(
                `https://api.github.com/repos/${plugin.owner}/${plugin.repo}`,
                {
                  headers: {
                    Accept: "application/vnd.github.mercy-preview+json"
                  }
                }
              );
              const repoData: GithubRepo = await repoResponse.json();

              // Fetch latest version from npm
              const npmResponse = await fetch(
                `https://registry.npmjs.org/${plugin.npm_package_name}`
              );
              const npmData = await npmResponse.json();
              const latestVersion = npmData["dist-tags"]?.latest || "latest";
              const lastPublished = npmData.time?.[latestVersion] || "Unknown";

              return {
                name: plugin.repo,
                description:
                  repoData.description ||
                  `Community plugin for the Maiar framework: ${plugin.repo}`,
                author: plugin.owner,
                authorAvatar: `${repoData.owner?.avatar_url || `https://github.com/${plugin.owner}.png`}&s=48`,
                repository: `https://github.com/${plugin.owner}/${plugin.repo}`,
                version: latestVersion,
                tags: repoData.topics || [],
                isOfficial: false,
                npmPackage: plugin.npm_package_name,
                stars: repoData.stargazers_count,
                lastPublished
              };
            } catch (error) {
              console.error(`Error fetching data for ${plugin.repo}:`, error);
              return null;
            }
          })
        );

        // Combine official and valid community plugins
        const allPlugins = [
          ...communityPlugins.filter(
            (plugin): plugin is NonNullable<typeof plugin> => plugin !== null
          ),
          ...officialPlugins
        ];

        setPlugins(allPlugins);
        setFilteredPlugins(allPlugins);
      } catch (error) {
        console.error("Error fetching plugins:", error);
        setPlugins([]);
        setFilteredPlugins([]);
        setError("Failed to load plugins. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlugins();
  }, []);

  // Fuzzy search implementation
  useEffect(() => {
    if (!searchQuery) {
      setFilteredPlugins(plugins);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = plugins.filter((plugin) => {
      const officialNpmPackage = plugin.isOfficial
        ? `@maiar-ai/${plugin.name}`
        : null;
      const communityNpmPackage = plugin.npmPackage;

      return (
        plugin.name.toLowerCase().includes(query) ||
        plugin.description.toLowerCase().includes(query) ||
        plugin.author.toLowerCase().includes(query) ||
        plugin.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        officialNpmPackage?.toLowerCase().includes(query) ||
        communityNpmPackage?.toLowerCase().includes(query)
      );
    });
    setFilteredPlugins(filtered);
  }, [searchQuery, plugins]);

  return (
    <Layout title="Maiar Plugins" description="Browse and search Maiar plugins">
      <main className={clsx("container", styles.pluginsContainer)}>
        <div className={styles.searchContainer}>
          <input
            type="text"
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
          <div className={styles.registerPluginContainer}>
            <a
              href="https://github.com/UraniumCorporation/plugin-registry"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.registerPluginLink}
            >
              🔌 Register your plugin
            </a>
          </div>
          {error && <div className={styles.errorMessage}>{error}</div>}
        </div>

        {isLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Loading plugins...</p>
          </div>
        ) : (
          <div className={styles.pluginsList}>
            {filteredPlugins.map((plugin) => (
              <div key={plugin.name} className={styles.pluginItem}>
                <div className={styles.pluginHeader}>
                  <div className={styles.pluginNameVersion}>
                    <a
                      href={plugin.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.pluginName}
                    >
                      {plugin.name}
                    </a>
                    <p className={styles.versionLabel}>
                      ⭐ Starred {plugin.stars}
                    </p>
                  </div>
                  <div className={styles.metadataContainer}>
                    <div className={styles.authorInfo}>
                      <a
                        href={`https://github.com/${plugin.author}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={plugin.authorAvatar}
                          alt={`${plugin.author} avatar`}
                          className={styles.authorAvatar}
                        />
                      </a>
                      <a
                        href={`https://github.com/${plugin.author}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.authorLink}
                      >
                        Author: {plugin.author}
                      </a>
                    </div>
                    <div className={styles.metaInfo}>
                      <span className={styles.versionInfo}>
                        Version: {plugin.version}
                      </span>
                      <span className={styles.publishInfo}>
                        Last Published:{" "}
                        {new Date(plugin.lastPublished).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <p className={styles.pluginDescription}>{plugin.description}</p>
                <div className={styles.pluginFooter}>
                  <div className={styles.pluginTags}>
                    {plugin.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className={styles.buttonGroup}>
                    <a
                      href={plugin.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.pluginLink}
                    >
                      View Repository
                    </a>
                    <a
                      href={
                        plugin.isOfficial
                          ? `https://www.npmjs.com/package/@maiar-ai/${plugin.name}`
                          : `https://www.npmjs.com/package/${plugin.npmPackage}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.pluginLink}
                    >
                      View Package
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </Layout>
  );
}
