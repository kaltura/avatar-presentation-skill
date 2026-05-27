# Avatar Deck — Conversational Presentation Builder

A Claude Code plugin that generates complete, compliant, deployable avatar presentations from a PDF deck and website URL.

**Output:** A working `dist.html` that connects to a configured Kaltura eSelf avatar and delivers an interactive, AI-narrated presentation experience.

## Install

```
/plugin marketplace add zoharbabin/avatar-presentation-skill
/plugin install avatar-deck@avatar-presentation-skill
```

## Usage

```
/avatar-deck path/to/deck.pdf
```

The skill guides you through:

1. **Input collection** — PDF, avatar URL, use case, partner ID
2. **Analysis** — Slide extraction, progressive-reveal detection, brand scraping
3. **Generation** — Slide JSONs, knowledge base, studio config, TTS maps
4. **Validation** — Schema checks, navigation contracts, cross-references
5. **Bundle & Deploy** — Deterministic HTML bundling, Kaltura CDN upload

## Use Cases

| Template | Audience | Key Features |
|----------|----------|--------------|
| `earnings_report` | Investors | SEC compliance, non-GAAP handling, formal tone |
| `sales_pitch` | Prospects | CTA-driven, contact collection, energetic tone |
| `training` | Learners | Patient pacing, assessment, no contact gate |
| `report_review` | Stakeholders | Source attribution, analytical depth |

## What Gets Generated

```
your-project/
├── project.json          # Full configuration
├── data/
│   ├── slides/           # Structured slide JSONs (1...N)
│   └── [domain].json     # Supplementary data
├── studio/
│   ├── KNOWLEDGE_BASE_PROMPT.md
│   ├── AVATAR_GOALS.md
│   ├── OBEY_RULES.md
│   ├── REPLY_FORMAT.md
│   └── SUMMARY_PROMPT.md
├── .env                  # Deploy credentials (gitignored)
└── dist.html             # Bundled artifact (gitignored)
```

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- A Kaltura account with eSelf Avatar Studio access
- A PDF deck to convert

## Architecture

Zero external dependencies. The toolkit uses only POSIX shell scripts and Claude as the executor/validator:

- `toolkit/scripts/bundle.sh` — Deterministic HTML assembly
- `toolkit/scripts/version-bump.sh` — Semver version management
- `toolkit/engine/` — Presentation runtime (HTML + CSS + JS)
- `toolkit/templates/` — Per-use-case defaults and studio prompts
- `toolkit/rules/OBEY_RULES.md` — Locked avatar behavior contract

## License

MIT
