# Tooling Integration: adr-tools and Log4brains

Two lightweight tools cover 95% of ADR log needs. `adr-tools` is the original CLI for authoring and linking ADRs. Log4brains is a static-site generator that renders the corpus as a searchable HTML knowledge base.

---

## adr-tools (npryce/adr-tools)

### Installation

```bash
# macOS
brew install adr-tools

# or via npm wrapper (cross-platform)
npm install -g adr-tools
```

### Key commands

```bash
# Initialize a new ADR log in the current project
adr init docs/decisions

# Create a new ADR (opens $EDITOR)
adr new "Fall back to BM25 when embeddings are disabled"
# -> creates docs/decisions/0001-bm25-fallback-when-embeddings-off.md

# Create an ADR that supersedes ADR-0001
adr new -s 1 "Append-only version-bump for embedding rows"
# → creates 0002-..., adds "Supersedes: 0001" to header

# Regenerate table of contents
adr generate toc

# List all ADRs
adr list
```

### Custom templates

adr-tools uses the Nygard format by default. To switch to MADR, create a custom template at `.adr-dir/template.md` (or the directory set during `adr init`) and adr-tools will use it for `adr new`.

### Limitations

adr-tools does NOT:
- Render HTML (use Log4brains for that)
- Update the superseded ADR's Status automatically (must be done manually)
- Support mono-repo layouts with multiple ADR logs

---

## Log4brains (thomvaill/log4brains), v1.1.0, December 2024

Log4brains converts a markdown ADR corpus into a searchable, filterable HTML site. It supports mono-repo and multi-package layouts, and can be integrated into a CI/CD pipeline to publish the site on every merge.

### Installation and initialization

```bash
# npx (no global install required)
npx log4brains init
# Interactive setup: prompts for project name, package name (mono-repo), 
# ADR directory path, and ADR format. Generates .log4brains.yml.

# Or install globally
npm install -g log4brains
log4brains init
```

### .log4brains.yml (single-package example)

```yaml
project:
  name: "My Project ADR Log"
  authors:
    - name: "Engineering Team"
packages:
  - name: "Main"
    slug: main
    path: "."
    adrFolder: "docs/decisions"
```

### Key commands

```bash
# Live preview (localhost:4004)
npx log4brains preview

# Create a new ADR (opens editor, then regenerates preview)
npx log4brains adr new "Adopt trunk-based development"

# Build static site for deployment
npx log4brains build
# Output: .log4brains/out/, deploy this folder to GitHub Pages, Netlify, or Vercel

# Superscede using Log4brains UI
# (Use the "Supersede" button in the preview UI, or run adr-tools -s N and 
#  update the superseded record manually)
```

### CI/CD integration (GitHub Actions)

```yaml
# .github/workflows/adr-site.yml
name: Publish ADR Site
on:
  push:
    branches: [main]
    paths:
      - 'docs/decisions/**'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx log4brains build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .log4brains/out
```

### Maintenance note (2026)

Log4brains v1.1.0 was released December 2024. The project has slowed maintenance pace since then. For teams with complex multi-package needs or requiring active support, consider self-hosting the rendered output and using the build command only, or evaluate alternatives like Backstage TechDocs (heavier but more actively maintained for enterprise use).

---

## Tooling decision matrix

| Need | Tool |
|---|---|
| CLI for authoring and linking ADRs | adr-tools |
| HTML site rendered from ADR corpus | Log4brains |
| Both authoring and HTML, tight integration | Log4brains (has own `adr new` command) |
| Mono-repo with multiple ADR logs | Log4brains (multi-package support) |
| CI/CD lint of ADR format | Custom script or Log4brains build in CI |

For most teams starting fresh: initialize with Log4brains (it covers what adr-tools does, plus HTML rendering), then wire the build step into CI.
