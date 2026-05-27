#!/bin/sh
# bundle.sh — Deterministic HTML bundling for avatar presentations
# Usage: sh toolkit/scripts/bundle.sh ./project-dir/ ./toolkit/engine/
# Produces: project-dir/dist.html
set -e

PROJECT_DIR="${1:?Usage: bundle.sh <project-dir> <engine-dir>}"
ENGINE_DIR="${2:?Usage: bundle.sh <project-dir> <engine-dir>}"

# Normalize paths (remove trailing slash)
PROJECT_DIR="${PROJECT_DIR%/}"
ENGINE_DIR="${ENGINE_DIR%/}"

# Verify required files exist
if [ ! -f "$PROJECT_DIR/project.json" ]; then
  echo "ERROR: $PROJECT_DIR/project.json not found" >&2
  exit 1
fi
if [ ! -f "$ENGINE_DIR/app.js" ]; then
  echo "ERROR: $ENGINE_DIR/app.js not found" >&2
  exit 1
fi
if [ ! -f "$ENGINE_DIR/index.html" ]; then
  echo "ERROR: $ENGINE_DIR/index.html not found" >&2
  exit 1
fi
if [ ! -f "$ENGINE_DIR/styles.css" ]; then
  echo "ERROR: $ENGINE_DIR/styles.css not found" >&2
  exit 1
fi

# Read branding values from project.json (non-greedy match with [^"]*)
TITLE=$(grep '"title"' "$PROJECT_DIR/project.json" | head -1 | sed 's/.*"title"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
PRIMARY_COLOR=$(grep '"primaryColor"' "$PROJECT_DIR/project.json" | head -1 | sed 's/.*"primaryColor"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
PRIMARY_COLOR_HOVER=$(grep '"primaryColorHover"' "$PROJECT_DIR/project.json" | head -1 | sed 's/.*"primaryColorHover"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
VERSION=$(grep '"version"' "$PROJECT_DIR/project.json" | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
PAGE_TITLE=$(grep '"pageTitle"' "$PROJECT_DIR/project.json" | head -1 | sed 's/.*"pageTitle"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

TMPFILE="$PROJECT_DIR/dist.html.tmp"
ASSEMBLED="$PROJECT_DIR/dist.html.assembled"

# Step 1: Template index.html with branding placeholders
sed \
  -e "s|{{PAGE_TITLE}}|${PAGE_TITLE:-$TITLE}|g" \
  -e "s|{{TITLE}}|${TITLE}|g" \
  -e "s|{{VERSION}}|${VERSION}|g" \
  "$ENGINE_DIR/index.html" > "$TMPFILE"

# Step 2: Find split points
HEAD_END=$(grep -n '</head>' "$TMPFILE" | head -1 | cut -d: -f1)
BODY_END=$(grep -n '</body>' "$TMPFILE" | tail -1 | cut -d: -f1)

# Step 3: Assemble final HTML (writes directly to file, avoids shell variable limits)
{
  # Part A: Everything before </head>
  head -n $((HEAD_END - 1)) "$TMPFILE"

  # Part B: Inlined CSS with color overrides (only hex values, safe for sed)
  echo "<style>"
  sed \
    -e "s|--color-primary: #6366f1|--color-primary: ${PRIMARY_COLOR:-#6366f1}|g" \
    -e "s|--color-primary-hover: #4f46e5|--color-primary-hover: ${PRIMARY_COLOR_HOVER:-#4f46e5}|g" \
    "$ENGINE_DIR/styles.css"
  echo "</style>"
  echo "</head>"

  # Part C: Body content (between </head> and </body>)
  sed -n "$((HEAD_END + 1)),$((BODY_END - 1))p" "$TMPFILE"

  # Part D: Data scripts (written directly from files, no shell variables)
  echo "<script>"
  echo "const CONFIG = $(cat "$PROJECT_DIR/project.json");"

  # Slide data array — concatenate JSONs directly
  echo "const SLIDE_DATA = ["
  FIRST=1
  for f in "$PROJECT_DIR"/data/slides/slide_*.json; do
    if [ -f "$f" ]; then
      if [ $FIRST -eq 1 ]; then
        FIRST=0
      else
        echo ","
      fi
      cat "$f"
    fi
  done
  echo "];"

  # Domain data object — concatenate non-slide data JSONs
  echo "const DOMAIN_DATA = {"
  FIRST=1
  for f in "$PROJECT_DIR"/data/*.json; do
    if [ -f "$f" ]; then
      BASENAME=$(basename "$f" .json)
      if [ $FIRST -eq 1 ]; then
        FIRST=0
      else
        echo ","
      fi
      printf '"%s": ' "$BASENAME"
      cat "$f"
    fi
  done
  echo "};"

  echo "const APP_VERSION = \"${VERSION}\";"
  echo "</script>"

  # Part E: App engine script
  echo "<script>"
  cat "$ENGINE_DIR/app.js"
  echo ""
  echo "</script>"
  echo "</body>"
  echo "</html>"
} > "$ASSEMBLED"

# Atomic write
rm -f "$TMPFILE"
mv "$ASSEMBLED" "$PROJECT_DIR/dist.html"

echo "Bundled: $PROJECT_DIR/dist.html (v${VERSION})"
