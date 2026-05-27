#!/bin/sh
# version-bump.sh — Semantic version management for avatar presentations
# Usage: sh toolkit/scripts/version-bump.sh ./project-dir/ [patch|minor|major]
# Default: patch
set -e

PROJECT_DIR="${1:?Usage: version-bump.sh <project-dir> [patch|minor|major]}"
BUMP_TYPE="${2:-patch}"

PROJECT_DIR="${PROJECT_DIR%/}"
PROJECT_JSON="$PROJECT_DIR/project.json"

if [ ! -f "$PROJECT_JSON" ]; then
  echo "ERROR: $PROJECT_JSON not found" >&2
  exit 1
fi

# Extract current version
CURRENT=$(grep '"version"' "$PROJECT_JSON" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9]*\.[0-9]*\.[0-9]*\)".*/\1/')

if [ -z "$CURRENT" ]; then
  echo "ERROR: Could not parse version from $PROJECT_JSON" >&2
  exit 1
fi

# Split into components
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)

# Bump
case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "ERROR: Invalid bump type '$BUMP_TYPE'. Use: patch, minor, or major" >&2
    exit 1
    ;;
esac

NEW="${MAJOR}.${MINOR}.${PATCH}"

# Write back via sed in-place
if [ "$(uname)" = "Darwin" ]; then
  sed -i '' "s/\"version\"[[:space:]]*:[[:space:]]*\"${CURRENT}\"/\"version\": \"${NEW}\"/" "$PROJECT_JSON"
else
  sed -i "s/\"version\"[[:space:]]*:[[:space:]]*\"${CURRENT}\"/\"version\": \"${NEW}\"/" "$PROJECT_JSON"
fi

echo "${CURRENT} → ${NEW}"
