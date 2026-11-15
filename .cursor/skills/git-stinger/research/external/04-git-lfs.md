---
source_url: https://www.grizzlypeaksoftware.com/library/managing-large-files-in-git-lfs-and-alternatives-59w8igxh + https://oneuptime.com/blog/post/2026-01-24-configure-git-lfs-large-files/view + https://oneuptime.com/blog/post/2026-02-16-how-to-set-up-azure-repos-git-lfs-for-managing-large-binary-files-in-repositories/view + https://help.github.com/en/repositories/working-with-files/managing-large-files/configuring-git-large-file-storage + https://docs.gitlab.com/topics/git/lfs + https://learn.microsoft.com/en-us/azure/devops/repos/git/manage-large-files + https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc
retrieved_on: 2026-05-20
source_type: blog + official-docs
authority: practitioner + official
relevance: critical
topic: git-lfs
stinger: git-stinger
---

# Git LFS: Large File Storage Best Practices

## Summary

Git was designed for text files, not large binaries. When you commit design assets, ML model weights, video files, or compiled binaries, Git's internal architecture works against you: every version of every large file is stored in the object database, bloating clone times and disk usage. Git LFS (Large File Storage) solves this by replacing large files in the repository with small text pointer files (~130 bytes) while storing the actual file content on a dedicated LFS server. The repository stays lean; developers get the files they need transparently.

---

## 1. How Git LFS Works

### The pointer mechanism

When you commit a file tracked by LFS:
1. Git's clean filter intercepts the file
2. The actual content is uploaded to the LFS server
3. A small pointer file is committed to Git in its place:

```
version https://git-lfs.github.com/spec/v1
oid sha256:b35c14a72a2a4568b00a7b8ed4c93d3e86d6ed2e37c5e3b7f28a60e56c2c1456
size 52428800
```

When you checkout:
1. Git's smudge filter detects the pointer file
2. The actual content is downloaded from the LFS server transparently
3. The binary file appears in your working directory

### Platform LFS support (2026)

| Platform | LFS Support | Notes |
|---|---|---|
| GitHub.com | Native, free tier included | 1 GB storage + 1 GB bandwidth free/month; paid plans available |
| GitLab.com | Native, enabled by default | Various storage tiers; can configure external object storage |
| Bitbucket | Native | 1 GB free LFS storage per account |
| Azure DevOps | Native, free | 1 GB free per organization; HTTPS only (no SSH for LFS) |
| Self-hosted | Requires LFS server | Use `git-lfs-server` or cloud object storage (S3, GCS, etc.) |

---

## 2. Installation

```bash
# macOS
brew install git-lfs

# Linux (Debian/Ubuntu)
sudo apt-get install git-lfs

# Linux (RHEL/Fedora)
sudo dnf install git-lfs

# Windows
winget install Git.Git-LFS
# or download from https://git-lfs.github.com/

# After installing, initialize LFS for your user (ONE TIME PER MACHINE)
git lfs install
# Adds smudge/clean filter hooks to your global .gitconfig
```

---

## 3. Setting Up LFS in a Repository

### Step 1: Initialize (if not done globally)

```bash
cd your-repo
git lfs install
```

### Step 2: Track file patterns

Each `git lfs track` call adds an entry to `.gitattributes`:

```bash
# Track by extension
git lfs track "*.psd"          # Photoshop files
git lfs track "*.ai"           # Illustrator files
git lfs track "*.png"          # Large images (consider threshold)
git lfs track "*.jpg"
git lfs track "*.gif"
git lfs track "*.mp4"          # Video
git lfs track "*.mov"
git lfs track "*.avi"
git lfs track "*.zip"          # Archives
git lfs track "*.tar.gz"
git lfs track "*.bin"          # Binary data
git lfs track "*.model"        # ML model files
git lfs track "*.onnx"         # ONNX models
git lfs track "*.pt"           # PyTorch models
git lfs track "*.pb"           # TensorFlow protobuf
git lfs track "*.dll"          # Compiled libraries (Windows)
git lfs track "*.so"           # Shared objects (Linux)
git lfs track "*.dylib"        # Dynamic libraries (macOS)

# Track entire directories
git lfs track "assets/**"
git lfs track "datasets/**"
git lfs track "models/**"

# View what is currently tracked
git lfs track
```

### Step 3: Commit .gitattributes FIRST

```bash
# Always commit .gitattributes before adding the large files
git add .gitattributes
git commit -m "Configure Git LFS tracking for binary files"
```

Why: If `.gitattributes` isn't committed first, the large files get added as regular Git objects and you'll need to migrate them.

### Step 4: Add and push large files

```bash
# Now add large files - they are automatically handled by LFS
git add large-file.psd
git commit -m "Add design asset"
git push

# During push, LFS uploads happen first:
# Uploading LFS objects: 100% (1/1), 52 MB | 5.2 MB/s, done.
# Sending objects: 100% (3/3), done.
```

---

## 4. The .gitattributes File

The `.gitattributes` file is the source of truth for LFS tracking. Commit it to the repo so all collaborators automatically track the same patterns.

```gitattributes
# LFS patterns added by git lfs track
*.psd filter=lfs diff=lfs merge=lfs -text
*.ai filter=lfs diff=lfs merge=lfs -text
*.png filter=lfs diff=lfs merge=lfs -text
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.bin filter=lfs diff=lfs merge=lfs -text
*.model filter=lfs diff=lfs merge=lfs -text

# Lockable files (unmergeable binary formats)
*.psd filter=lfs diff=lfs merge=lfs -text lockable
*.sketch filter=lfs diff=lfs merge=lfs -text lockable

# Line-ending normalization (non-LFS)
*.sh text eol=lf
*.bat text eol=crlf
*.ps1 text eol=crlf
Makefile text eol=lf

# Diff drivers for text files
*.json diff=json
```

The `lockable` attribute makes the file read-only by default in the working directory, forcing explicit locking before editing - which prevents two designers from overwriting each other's changes.

---

## 5. Selective Fetching

Not every developer needs every LFS file. Configure per-repo defaults in `.lfsconfig`:

```ini
# .lfsconfig (committed to repo)
[lfs]
    fetchinclude = models/**        # all developers need ML models to run the app
    fetchexclude = assets/designs/* # designers pull these manually; devs don't need them
```

```bash
# Designers fetch their files explicitly
git lfs pull --include="assets/designs/**"

# CI/CD: skip LFS entirely if not needed
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/user/repo.git

# Or skip smudge at clone time
git clone --no-checkout https://github.com/user/repo.git
cd repo
GIT_LFS_SKIP_SMUDGE=1 git checkout HEAD -- .
```

---

## 6. File Locking

For binary files that can't be three-way merged (PSD, Sketch, video files):

```bash
# Lock a file before editing
git lfs lock path/to/design.psd

# See who has files locked
git lfs locks

# Unlock after committing your changes
git lfs unlock path/to/design.psd

# Force unlock (admin operation)
git lfs unlock --force path/to/design.psd
```

The `lockable` attribute in `.gitattributes` makes files read-only by default, enforcing the lock workflow.

---

## 7. Common LFS Operations

### Listing tracked LFS files

```bash
# List all LFS-tracked files in current checkout (with sizes)
git lfs ls-files -s

# Sort by size to find what's consuming space
git lfs ls-files -s | sort -k1 -h

# List all LFS objects in the entire history (not just current branch)
git lfs ls-files --all
```

### Pruning old LFS objects

LFS keeps old versions of files in `.git/lfs/objects/` after branches are deleted or files change:

```bash
# Show what would be pruned
git lfs prune --dry-run

# Prune old objects not referenced by current branches
git lfs prune

# Prune but verify objects exist on server before deleting locally
git lfs prune --verify-remote

# After pruning, release disk space
git gc
```

### Fetching LFS content explicitly

```bash
# Fetch all LFS objects for current branch
git lfs fetch

# Fetch for all branches
git lfs fetch --all

# Fetch only specific patterns
git lfs fetch --include="models/**"

# Pull (fetch + checkout)
git lfs pull
```

---

## 8. Migrating Existing Files to LFS

If large files were already committed without LFS:

```bash
# Step 1: Analyze the repo to find large files
git lfs migrate info

# Step 2: Migrate specific patterns (rewrites history)
git lfs migrate import --include="*.psd,*.bin,*.mp4"

# Step 3: Migrate ALL large files (all refs, all branches)
git lfs migrate import --everything --include="*.psd,*.bin"

# Step 4: Force-push all branches (COORDINATE WITH TEAM FIRST)
git push --force --all
git push --force --tags

# ALL TEAM MEMBERS must re-clone after this
```

> "Warning: History migration rewrites commits. All collaborators must re-clone after a force push." - OneUptime (2026)

---

## 9. Partial Clone and Sparse Checkout (Git-Native Alternatives)

For repositories where you want to avoid downloading all file content without LFS:

### Partial clone (no blob content at clone time)

```bash
# Clone without downloading any file content (just the Git objects/tree)
git clone --filter=blob:none https://github.com/user/repo.git

# Files are downloaded on-demand when you first checkout or access them
# Good for: browsing history, CI that only needs specific files

# Fetch only small blobs (limit by size)
git clone --filter=blob:limit=1m https://github.com/user/repo.git
```

### Sparse checkout (check out only specific directories)

```bash
# Initialize sparse checkout in cone mode (Git 2.25+)
git sparse-checkout init --cone

# Specify which directories to check out
git sparse-checkout set src/ docs/ config/

# Add more directories
git sparse-checkout add tests/

# View current sparse checkout patterns
git sparse-checkout list

# Disable sparse checkout (restore full checkout)
git sparse-checkout disable
```

---

## 10. CI/CD Best Practices

```bash
# Option 1: Skip LFS entirely (fastest - use when large files aren't needed to build)
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/user/repo.git

# Option 2: Shallow clone + LFS (common for CI)
git clone --depth 1 https://github.com/user/repo.git
cd repo
git lfs pull

# Option 3: Cache LFS objects between runs
# Cache the .git/lfs directory keyed on .gitattributes + commit SHA
# GitHub Actions example:
# - uses: actions/cache@v4
#   with:
#     path: .git/lfs
#     key: ${{ runner.os }}-lfs-${{ hashFiles('.gitattributes') }}-${{ github.sha }}
#     restore-keys: |
#       ${{ runner.os }}-lfs-${{ hashFiles('.gitattributes') }}-
#       ${{ runner.os }}-lfs-
```

**LFS pointer validation in build scripts** - when LFS is misconfigured, you get a ~130-byte text pointer instead of the actual binary file:

```bash
# Add to your CI startup script to detect LFS pointer files accidentally committed:
# Check if a model file is a valid binary or an LFS pointer
if [ $(wc -c < model.onnx) -lt 1000 ]; then
  echo "ERROR: model.onnx appears to be an LFS pointer, not the actual model"
  cat model.onnx  # will show the pointer text if misconfigured
  exit 1
fi
```

---

## 11. Best Practices Summary

1. **Set up `.gitattributes` BEFORE committing any large files.** Retroactive migration via `git lfs migrate` works but requires a force push and team re-clone.

2. **Track patterns, not individual files.** Use `*.psd` so new files of the same type are automatically tracked.

3. **Commit `.gitattributes` immediately after `git lfs track`.** Without it in the repo, collaborators won't get LFS configuration.

4. **Use `fetchinclude`/`fetchexclude` in `.lfsconfig`.** Not every developer needs every large file. Keep clone times fast.

5. **Enable file locking for unmergeable formats.** Add `lockable` attribute for PSD, Sketch, video files to prevent concurrent edit conflicts.

6. **Cache LFS objects in CI/CD.** Without caching, every CI run downloads every LFS file from scratch.

7. **Run `git lfs prune` periodically.** Old versions accumulate in `.git/lfs/objects/`. Use `--verify-remote` to be safe.

8. **Add LFS pointer validation to build scripts.** Misconfigured LFS silently produces 130-byte pointer files instead of binaries - fail fast with a clear error.

9. **Document LFS setup in the README.** New developers need to know to `git lfs install` and which files are tracked.

10. **Communicate before migrating existing history.** `git lfs migrate import` rewrites all commits and forces a team re-clone.

---

## Key Quotations

- "Git LFS is an open-source extension maintained by GitHub. It intercepts Git's smudge and clean filters to swap large files for small pointer files in your repository while storing the actual content on a dedicated LFS server." - Grizzly Peak Software (2026)
- "When LFS is misconfigured or unavailable, you get tiny text pointer files instead of actual binary content. Check file sizes in your application startup or build process to fail fast with a clear error message." - Grizzly Peak Software (2026)
- "Set up `.gitattributes` before committing any large files. Retroactive migration works but is painful. Start tracking patterns from day one." - Grizzly Peak Software (2026)

---

## Citations

1. Grizzly Peak Software - "Managing Large Files in Git: LFS and Alternatives" (2026-02-13): https://www.grizzlypeaksoftware.com/library/managing-large-files-in-git-lfs-and-alternatives-59w8igxh
2. OneUptime - "How to Configure Git LFS for Large Files" (2026-01-24): https://oneuptime.com/blog/post/2026-01-24-configure-git-lfs-large-files/view
3. OneUptime - "How to Set Up Azure Repos Git LFS" (2026-02-16): https://oneuptime.com/blog/post/2026-02-16-how-to-set-up-azure-repos-git-lfs-for-managing-large-binary-files-in-repositories/view
4. GitHub Docs - "Configuring Git Large File Storage": https://help.github.com/en/repositories/working-with-files/managing-large-files/configuring-git-large-file-storage
5. GitLab Docs - "Git Large File Storage (LFS)": https://docs.gitlab.com/topics/git/lfs
6. Microsoft Learn - "Manage and store large files in Git" (2025-10-27): https://learn.microsoft.com/en-us/azure/devops/repos/git/manage-large-files
7. Git LFS Config Docs - git-lfs-config.adoc: https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc
