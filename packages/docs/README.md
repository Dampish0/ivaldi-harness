# Ivaldi Docs Source

This package is the source-of-truth for Ivaldi public docs content.

## Layout

- `content/docs/*.mdx` - English docs pages (source of truth)
- `content/docs/<locale>/*.mdx` - translations, mirroring the English filenames
  (e.g. `uk/`, `zh-cn/`, `pt-br/`, `fr/`); see `CONTRIBUTING.md` → Localization
- `sidebar.config.json` - docs navigation structure for Starlight sidebar
- `CONTRIBUTING.md` - authoring guide for adding pages, sections, and translations
- `DEPLOYMENT.md` - manual source packaging and website integration

## Local validation

Run from repo root:

```bash
bun run docs:validate
```

This validates:

- frontmatter (`title`, `description`) exists for every MDX page
- sidebar links resolve to existing MDX routes

## Deployment model

This repo owns docs content.

This package contains source content, not a hosted website. Package it locally
and publish it through the chosen Ivaldi website or release channel. There is no
GitHub Actions packaging, publishing, or upstream website sync. See
[DEPLOYMENT.md](DEPLOYMENT.md) for the manual procedure.
