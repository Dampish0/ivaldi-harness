# Docs source packaging

This package contains Ivaldi documentation source. Build artifacts and website
updates are prepared manually. There are no GitHub Actions workflows or automatic
cross-repository publishing requests.

## Validate and package

From the repository root:

```bash
bun run docs:validate
mkdir -p artifacts
tar -czf artifacts/ivaldi-docs-source.tar.gz -C packages/docs .
```

The archive contains the content, sidebar configuration, and authoring guidance.
Record its source commit and SHA-256 hash with the release evidence. Attach it
manually to an Ivaldi release or transfer it to the intended website repository.

## Website integration

Copy `content/docs` and its locale directories into the website's content
collection. Map `sidebar.config.json` into its navigation, then validate, build,
and publish from that website's own tooling. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the Starlight layout used by the documentation package.

This repository does not configure an Ivaldi website deployment or require
cross-repository dispatch credentials.
