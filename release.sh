#!/usr/bin/env bash
#
# release.sh — cut a new release.
#
# Usage:
#   ./release.sh patch   # 0.1.0 → 0.1.1
#   ./release.sh minor   # 0.1.0 → 0.2.0
#   ./release.sh major   # 0.1.0 → 1.0.0
#
# What it does:
#   1. Verifies working tree is clean
#   2. Typechecks and builds
#   3. Bumps version in package.json
#   4. Commits the bump and creates a git tag
#   5. Publishes to npm (with --access public for scoped pkg)
#   6. Pushes commits and tags to GitHub
#

set -euo pipefail

BUMP="${1:-}"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

if [[ ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  red "Usage: ./release.sh [patch|minor|major]"
  exit 1
fi

# Must be in a git repo
if [ ! -d ".git" ]; then
  red "✗ Not a git repository. Run ./bootstrap.sh first."
  exit 1
fi

# Must have a clean working tree
if [ -n "$(git status --porcelain)" ]; then
  red "✗ Working tree is dirty. Commit or stash changes first."
  git status --short
  exit 1
fi

# Must be on main
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  yellow "⚠ You're on branch '$CURRENT_BRANCH' (not 'main')."
  read -r -p "Continue anyway? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || exit 1
fi

# Check npm login status (for scoped package)
if ! npm whoami >/dev/null 2>&1; then
  red "✗ Not logged in to npm. Run 'npm login' first."
  exit 1
fi

cyan "▸ Typechecking..."
npm run typecheck

cyan "▸ Building..."
npm run build

cyan "▸ Bumping version ($BUMP)..."
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)
cyan "  new version: $NEW_VERSION"

# Stage package.json (and lockfile if present)
git add package.json
[ -f package-lock.json ] && git add package-lock.json
[ -f pnpm-lock.yaml ]    && git add pnpm-lock.yaml
[ -f yarn.lock ]         && git add yarn.lock

git commit -m "release: $NEW_VERSION"
git tag "$NEW_VERSION"

cyan "▸ Publishing to npm..."
npm publish

cyan "▸ Pushing commits and tags..."
git push
git push --tags

PKG_NAME=$(node -p "require('./package.json').name")
green "✓ Released $PKG_NAME@${NEW_VERSION#v}"
echo ""
echo "  npm:    https://www.npmjs.com/package/$PKG_NAME"
echo "  github: https://github.com/jugert-mucoimaj/maptiveui-dev/releases/tag/$NEW_VERSION"
