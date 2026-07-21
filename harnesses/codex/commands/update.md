---
description: Update the Hivemind plugin to the latest version
allowed-tools: Bash
---

Update Hivemind for Codex via the npm-distributed CLI (single canonical update channel; replaces the previous git-clone-from-main flow that required bundles to be tracked in the repo):

```bash
npm install -g @deeplake/hivemind@latest
hivemind install codex
```

After running, tell the user to restart Codex to pick up the new version.
