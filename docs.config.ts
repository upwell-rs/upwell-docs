import type { DocsConfig } from "@upwell/docs-core/config";
import { parseVersion, versionId } from "@upwell/docs-core/semver";

export const docsConfig: DocsConfig = {
  framework: {
    crate: "upwell",
    name: "Upwell",
    repository: "https://github.com/upwell-rs/upwell",
    releaseTag: (version) => `v${version}`,
  },

  // Newest first. Only explicit public releases belong in the picker.
  versions: [
    {
      id: versionId("1.0.0"),
      releaseVersion: parseVersion("1.0.0", "docsConfig release 1.0.0"),
      label: "1.0.0",
    },
    {
      id: versionId("0.20.0"),
      releaseVersion: parseVersion("0.20.0", "docsConfig release 0.20.0"),
      label: "0.20.0",
    },
  ],

  latest: versionId("1.0.0"),
  cacheDir: ".cache/upwell-docs",
  symbolEnrichmentVersions: [versionId("1.0.0"), versionId("0.20.0")],
  landingSlug: "getting-started",
  prerender: {
    routes: {
      // Serve cached symbols dynamically in dev; emit known symbol routes in production.
      symbols: { development: false, production: "auto" },
    },
  },
  topics: [
    {
      id: "framework",
      label: "Framework",
      description:
        "Application setup, components, dependency injection, and core framework APIs.",
      crates: ["upwell", "upwell-app", "upwell-macros", "upwell-core"],
    },
    {
      id: "web",
      label: "Web",
      description:
        "HTTP and WebSocket controllers, routes, messages, and topic APIs.",
      crates: ["upwell-axum", "upwell-axum-macros"],
    },
    {
      id: "rpc",
      label: "RPC",
      description: "RPC services, handlers, and generated clients.",
      crates: ["upwell-rpc-macros"],
    },
    {
      id: "jobs",
      label: "Jobs",
      description: "Scheduled jobs and their execution policies.",
      crates: ["upwell-jobs-macros"],
    },
    {
      id: "tooling",
      label: "Cargo Upwell",
      description:
        "Project inspection, automation, extensions, and command-line tooling.",
      crates: [],
    },
  ],
  // These are the first-tier external crates worth enriching when rust-docs-json is installed.
  rustdoc: {
    directDependencyCrates: "workspace",
    standardLibraryCrates: ["std", "core", "alloc"],
    symbolPages: true
  },
};
