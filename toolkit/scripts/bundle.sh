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
for f in "$PROJECT_DIR/project.json" "$ENGINE_DIR/app.js" "$ENGINE_DIR/index.html" "$ENGINE_DIR/styles.css"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: $f not found" >&2
    exit 1
  fi
done

# Verify slides directory and count
SLIDES_DIR="$PROJECT_DIR/data/slides"
if [ ! -d "$SLIDES_DIR" ]; then
  echo "ERROR: $SLIDES_DIR directory not found" >&2
  exit 1
fi
SLIDE_COUNT=$(find "$SLIDES_DIR" -name 'slide_*.json' | wc -l | tr -d ' ')
if [ "$SLIDE_COUNT" -eq 0 ]; then
  echo "ERROR: No slide_*.json files found in $SLIDES_DIR" >&2
  exit 1
fi

# Validate contiguous slide numbering (1...N with no gaps)
EXPECTED_NUMS=$(seq 1 "$SLIDE_COUNT" | tr '\n' ' ')
ACTUAL_NUMS=""
for f in "$SLIDES_DIR"/slide_*.json; do
  NUM=$(basename "$f" | sed 's/slide_0*\([0-9]*\)\.json/\1/')
  ACTUAL_NUMS="$ACTUAL_NUMS$NUM "
done
ACTUAL_SORTED=$(echo "$ACTUAL_NUMS" | tr ' ' '\n' | sort -n | tr '\n' ' ')
if [ "$ACTUAL_SORTED" != "$EXPECTED_NUMS" ]; then
  echo "ERROR: Slide numbering not contiguous 1-$SLIDE_COUNT. Found: $ACTUAL_SORTED" >&2
  exit 1
fi

# Read branding values from project.json
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

# Step 3: Assemble final HTML
{
  # Part A: Everything before </head>
  head -n $((HEAD_END - 1)) "$TMPFILE"

  # Part B: Inlined CSS with color overrides
  echo "<style>"
  sed \
    -e "s|--color-primary: #6366f1|--color-primary: ${PRIMARY_COLOR:-#6366f1}|g" \
    -e "s|--color-primary-hover: #4f46e5|--color-primary-hover: ${PRIMARY_COLOR_HOVER:-#4f46e5}|g" \
    "$ENGINE_DIR/styles.css"
  echo "</style>"
  echo "</head>"

  # Part C: Body content (between </head> and </body>)
  sed -n "$((HEAD_END + 1)),$((BODY_END - 1))p" "$TMPFILE"

  # Part D: Data scripts
  echo "<script>"
  echo "const CONFIG = $(cat "$PROJECT_DIR/project.json");"

  # Slide data array (sorted numerically to handle non-zero-padded names)
  echo "const SLIDE_DATA = ["
  FIRST=1
  for f in $(find "$SLIDES_DIR" -name 'slide_*.json' | sort -t_ -k2 -n); do
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

  # Domain data object (non-slide JSONs in data/)
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

# Step 4: Post-bundle validation
ERRORS=""
if ! grep -q 'const CONFIG' "$ASSEMBLED"; then
  ERRORS="${ERRORS}CONFIG not found in output. "
fi
if ! grep -q 'const SLIDE_DATA' "$ASSEMBLED"; then
  ERRORS="${ERRORS}SLIDE_DATA not found in output. "
fi
if ! grep -q 'kaltura-avatar-sdk' "$ASSEMBLED"; then
  ERRORS="${ERRORS}Avatar SDK CDN reference missing. "
fi
if ! grep -q 'pdf.js' "$ASSEMBLED" && ! grep -q 'pdfjs' "$ASSEMBLED"; then
  ERRORS="${ERRORS}PDF.js CDN reference missing. "
fi
if [ -n "$ERRORS" ]; then
  rm -f "$TMPFILE" "$ASSEMBLED"
  echo "ERROR: Post-bundle validation failed: $ERRORS" >&2
  exit 1
fi

# Atomic write
rm -f "$TMPFILE"
mv "$ASSEMBLED" "$PROJECT_DIR/dist.html"

SIZE=$(wc -c < "$PROJECT_DIR/dist.html" | tr -d ' ')
echo "Bundled: $PROJECT_DIR/dist.html (v${VERSION}, ${SLIDE_COUNT} slides, ${SIZE} bytes)"
