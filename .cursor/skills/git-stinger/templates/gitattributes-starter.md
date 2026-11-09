# .gitattributes Starter Template

A documented `.gitattributes` file for projects using Git LFS, line-ending normalization, and language-aware diffs.

---

## Template

```gitattributes
# =============================================================================
# Line endings
# =============================================================================
# Normalize all text files to LF in the repo; convert to CRLF on Windows checkout
* text=auto eol=lf

# Explicitly mark shell scripts as LF (critical: CRLF breaks bash)
*.sh text eol=lf
*.bash text eol=lf

# Mark binary files as binary (prevents diff/merge/line-ending conversion)
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
*.pdf binary
*.zip binary
*.tar.gz binary
*.tar.bz2 binary

# =============================================================================
# Git LFS - large file storage
# Add patterns for files that should be stored in LFS
# =============================================================================
*.psd filter=lfs diff=lfs merge=lfs -text
*.ai filter=lfs diff=lfs merge=lfs -text
*.sketch filter=lfs diff=lfs merge=lfs -text
*.fig filter=lfs diff=lfs merge=lfs -text
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.mov filter=lfs diff=lfs merge=lfs -text
*.avi filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text

# Large data files (adjust threshold based on project needs):
*.csv filter=lfs diff=lfs merge=lfs -text
*.parquet filter=lfs diff=lfs merge=lfs -text
*.h5 filter=lfs diff=lfs merge=lfs -text
*.npz filter=lfs diff=lfs merge=lfs -text

# =============================================================================
# Language-aware diffs
# These tell Git which "word" function to use for hunk headers
# =============================================================================
*.py diff=python
*.rb diff=ruby
*.ts linguist-language=TypeScript
*.tsx linguist-language=TypeScript

# =============================================================================
# Linguist overrides (GitHub language statistics)
# =============================================================================
# Exclude generated files from language stats:
dist/** linguist-generated=true
build/** linguist-generated=true
*.min.js linguist-generated=true
*.min.css linguist-generated=true

# Mark documentation and data files:
docs/** linguist-documentation=true
*.json linguist-detectable=false

# =============================================================================
# Merge strategy overrides
# =============================================================================
# Always use "ours" strategy for auto-generated lock files during merges:
# (Uncomment if lock file conflicts are common in your team)
# package-lock.json merge=ours
# yarn.lock merge=ours
```

---

## Usage notes

1. Commit `.gitattributes` at the root of the repository.
2. After adding LFS patterns, run `git lfs migrate import --include="*.psd"` to retroactively move existing large files to LFS (see `guides/07-lfs-and-large-files.md`).
3. The `eol=lf` setting requires all team members to have `git config --global core.autocrlf false` on Windows, or use WSL. Document this in your README.
4. Line-ending normalization only applies to new commits after `.gitattributes` is committed. To normalize existing files: `git add --renormalize .`
