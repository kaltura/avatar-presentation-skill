# Avatar Deck — Conversational Presentation Builder

A Claude Code skill that turns any PDF deck into a fully interactive, AI-narrated presentation powered by a [Kaltura Conversational Avatar](https://corp.kaltura.com/agentic-avatars/).

Give it a PDF and an avatar URL — it produces a single deployable `dist.html` with voice navigation, real-time Q&A, slide-aware screen capture, and contact collection. Share via a stable short link that always serves the latest version.

## Quick Start

### Install

```
/install github.com/kaltura/avatar-presentation-skill
```

### Run

```
/avatar-deck path/to/deck.pdf https://your-avatar-url
```

The skill walks you through everything interactively:

1. **Collect inputs** — PDF, avatar URL, use case, partner ID, branding
2. **Analyze deck** — Slide extraction, progressive-reveal detection, brand scraping from website
3. **Generate project** — Slide JSONs, knowledge base, avatar studio config, TTS pronunciation maps
4. **Validate** — Schema checks, navigation contracts, cross-references, bundle dry-run
5. **Bundle** — Deterministic single-file HTML assembly
6. **Deploy** — Upload to Kaltura CDN, update short link with cache-bust

At the end you get a permanent shareable URL (`https://www.kaltura.com/tiny/XXXXX`).

## What the Viewer Experiences

- A conversational AI avatar narrates each slide in natural speech
- Voice commands ("go to slide 5", "next", "back") navigate instantly
- Viewers can ask questions — the avatar answers from slide data and domain knowledge
- Auto-advance moves the presentation forward when idle
- Session memory lets returning viewers pick up where they left off
- Contact collection (optional) gathers leads at the right moment
- Works on desktop and mobile, no install required

## Use Cases

| Template | Audience | Tone | Highlights |
|----------|----------|------|------------|
| `earnings_report` | Investors | Formal, precise | SEC safe harbor, non-GAAP handling, disclaimer gates |
| `sales_pitch` | Prospects | Conversational, energetic | CTA-driven, contact collection, fast autoplay |
| `training` | Learners | Patient, instructional | Slower pacing, no contact gate, accessibility-aware |
| `report_review` | Stakeholders | Analytical, measured | Source attribution, manual navigation (no autoplay) |

## What Gets Generated

```
your-project/
├── project.json              # Configuration (branding, avatar, features, deploy)
├── data/
│   ├── slides/
│   │   ├── slide_01.json     # Structured slide data (1...N, contiguous)
│   │   └── ...
│   └── [domain].json         # Supplementary data (financials, products, etc.)
├── studio/
│   ├── KNOWLEDGE_BASE_PROMPT.md   # Avatar's full context and behavior rules
│   ├── AVATAR_GOALS.md            # Conversation goals
│   ├── OBEY_RULES.md              # Locked behavior contract (from toolkit)
│   ├── REPLY_FORMAT.md            # TTS pronunciation + response structure
│   └── SUMMARY_PROMPT.md          # Post-session summary template
├── assets/
│   └── logo.svg              # Brand logo (or .png)
├── .env                      # Deploy credentials (gitignored, never in code)
└── dist.html                 # Bundled single-file artifact (gitignored)
```

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (CLI, desktop app, or IDE extension)
- A [Kaltura](https://corp.kaltura.com/) account with Avatar Studio access
- A PDF deck to convert
- Partner ID + Admin Secret (for deployment) — see [`.env.example`](.env.example)

## Architecture

```
toolkit/
├── engine/                  # Runtime (HTML + CSS + JS) — config-driven, zero hardcoded content
│   ├── index.html           # Template with {{TITLE}}, {{VERSION}} placeholders
│   ├── styles.css           # Themeable via primaryColor/primaryColorHover
│   └── app.js               # Reads CONFIG, SLIDE_DATA, DOMAIN_DATA globals at runtime
├── scripts/
│   ├── bundle.sh            # Deterministic HTML assembly + validation
│   └── version-bump.sh      # Semver patch/minor/major increment
├── templates/               # Per-use-case defaults (4 templates)
│   └── [use_case]/
│       ├── project.json.template
│       ├── AVATAR_GOALS.md
│       ├── REPLY_FORMAT.md
│       └── SUMMARY_PROMPT.md
└── rules/
    └── OBEY_RULES.md        # Locked avatar behavior contract (never generated, always copied)
```

**Key design decisions:**

- **Config-driven engine** — `app.js` is identical across all projects; behavior is entirely controlled by `CONFIG`, `SLIDE_DATA`, and `DOMAIN_DATA` injected at bundle time.
- **Single-file output** — `dist.html` bundles everything (HTML, CSS, JS, all slide data) into one file for CDN hosting. No server, no build tools, no runtime dependencies.
- **Cross-platform** — Bundle scripts use POSIX shell. On Windows without a shell, the skill performs equivalent logic inline via Read/Write/Edit tools.
- **Deploy via curl** — Upload uses Kaltura's document API (uploadToken + updateContent). Works identically on macOS, Linux, and Windows 10+.

## Extending

### Add a new template

1. Create `toolkit/templates/your_template/` with these files:
   - `project.json.template` — default config values for this use case
   - `AVATAR_GOALS.md` — 6 numbered conversation goals
   - `REPLY_FORMAT.md` — TTS pronunciation table + response structure
   - `SUMMARY_PROMPT.md` — post-session summary format
2. Add the template name to the `template` enum in SKILL.md's project.json schema
3. Add a row to the template defaults table in SKILL.md

The engine and bundle process are template-agnostic — they work with any valid `project.json`.

### Modify the engine

Edit files in `toolkit/engine/`. The engine expects three global constants at runtime:
- `CONFIG` — the full `project.json` object
- `SLIDE_DATA` — array of slide JSON objects in order
- `DOMAIN_DATA` — object keyed by filename (e.g., `{"financials": {...}, "products": {...}}`)

### Modify avatar behavior rules

`toolkit/rules/OBEY_RULES.md` is the locked behavior contract copied into every project's `studio/` directory. Changes here affect all future projects.

## Deployment Model

Every deploy updates the same document entry and short link — viewers always get the latest version at the same URL.

```
PDF → [Skill generates project] → bundle.sh → dist.html
                                                   ↓
                              uploadToken + document_documents/updateContent
                                                   ↓
                              Short link updated with ?v=VERSION (cache-bust)
                                                   ↓
                              https://www.kaltura.com/tiny/XXXXX ← share this
```

Credentials live in `.env` (gitignored). The admin secret never touches committed files.

## License

MIT
