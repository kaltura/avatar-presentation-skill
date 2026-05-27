# Conversational Avatar Presentation Builder — MVP Architecture

## The One-Sentence Version

A Claude Code skill that lets a Kaltura FDE produce a complete, compliant, deployable avatar presentation project in a single session — given only a customer's PDF deck and website URL.

---

## What Problem We're Solving

Today, creating a new avatar presentation requires cloning the Q1 2026 Earnings Avatar project and manually untangling 62 slides of Kaltura-specific content. An FDE spends 4-8 hours understanding the architecture, writing slide JSONs, crafting studio configs, and debugging navigation/timing issues. Most of that time is spent on work that can be automated with the right guidance and validation.

**The MVP:** FDE opens a Claude Code session, runs `/avatar-deck`, provides the customer deck PDF and website. Claude Code guides them through generating every required artifact — slide JSONs, data files, studio configs, project.json — with deterministic validation at every step. Output is a working `dist.html` ready for deployment.

---

## Who This Is For

**Kaltura Field Engineers (FDEs)** — Technical professionals who know JSON, can run Node.js scripts, and understand the Kaltura platform. They need to produce avatar presentations for enterprise customers (AWS, NVIDIA, Broadridge, Bank of America) by Thursday's demo.

**What FDEs care about:**
- "I need this working by the customer demo on Thursday"
- "If I change this JSON field, will something else break?"
- "The customer wants their brand colors, not ours"
- "Will the avatar actually navigate correctly?"

---

## Architecture: KISS

```
┌─────────────────────────────────────────────────────────┐
│  Claude Code Session                                     │
│                                                          │
│  /avatar-deck skill                                      │
│  ├── Guides FDE through project creation                 │
│  ├── Analyzes PDF (vision) → generates slide JSONs       │
│  ├── Scrapes website → extracts branding + context       │
│  ├── Generates studio .md files                          │
│  ├── Generates project.json                              │
│  └── Runs validation at every step                       │
│                                                          │
│  Deterministic Tools (Node.js scripts, not AI):          │
│  ├── validate.js → contract testing                      │
│  ├── bundle.js → produces dist.html                      │
│  └── deploy.js → uploads to Kaltura CDN                  │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Output: A complete project directory                     │
│                                                          │
│  customer-project/                                        │
│  ├── project.json                                        │
│  ├── data/                                               │
│  │   ├── slides/*.json (per-slide talking points)        │
│  │   └── *.json (domain data: financials, products...)   │
│  ├── studio/                                             │
│  │   ├── KNOWLEDGE_BASE_PROMPT.md                        │
│  │   ├── AVATAR_GOALS.md                                 │
│  │   ├── OBEY_RULES.md (inherited, locked)               │
│  │   ├── REPLY_FORMAT.md                                 │
│  │   └── SUMMARY_PROMPT.md                               │
│  ├── assets/ (logo, OG image)                            │
│  ├── .env (deploy creds — gitignored)                    │
│  └── dist.html (build artifact)                          │
└─────────────────────────────────────────────────────────┘
```

**No cloud infrastructure.** No AgentCore. No microVMs. No MCP Gateway. Just Claude Code + proven Node.js scripts + the FDE's expertise.

---

## The Skill: `/avatar-deck`

### What It Does

A Claude Code skill that has deep knowledge of:

1. **The output format** — exact project.json schema, slide JSON structure, studio .md patterns, DPP v3 protocol, and how they all connect at runtime
2. **The runtime contracts** — navigation phrases must be exact English ("Navigating to slide [N]."), TTS phonetics map format, GenUI overlay schemas, autoplay timing semantics
3. **Compliance rules** — locked rules that every project inherits (security, navigation, format), category-driven metadata (financial→disclaimer_required), SEC language patterns
4. **The validation pipeline** — what bundle.js checks, what can go wrong, how to fix it

### Session Flow

```
FDE: /avatar-deck

Skill: "What do you have? I need:
       1. PDF deck (path or URL)
       2. Customer website (for branding/context)
       3. Use case: earnings | sales_pitch | training | report_review
       4. Avatar flow ID (from Kaltura Studio)
       Optional: specific data files, tone preferences, compliance requirements"

FDE: [provides inputs]

Skill: 
  Phase 1 — Analysis
    → Reads PDF (all pages via vision)
    → Scrapes website (brand colors, logo, company context)
    → Detects slide structure (sections, section dividers, content types)
    → Infers category per slide (financial, product, strategy, legal, etc.)
    → Identifies domain terminology for TTS phonetics map

  Phase 2 — Generation
    → Generates project.json (branding, avatar config, features, timing)
    → Generates data/slides/*.json (talking_points, narrator_guidance, category, slide_content)
    → Generates supplemental data files (domain-specific: financials, products, etc.)
    → Generates studio/KNOWLEDGE_BASE_PROMPT.md (role, context, DPP schema, slide directory, examples)
    → Generates studio/AVATAR_GOALS.md (6 goals tuned to use case)
    → Generates studio/REPLY_FORMAT.md (TTS pronunciation table)
    → Generates studio/SUMMARY_PROMPT.md (post-call summary template)
    → Inherits studio/OBEY_RULES.md (locked — never modified per project)

  Phase 3 — Validation
    → Runs validate.js (slide numbering, JSON schema, required fields)
    → Checks navigation phrases against contract patterns
    → Checks TTS map for phonetic collisions (billion/million)
    → Verifies category→metadata propagation
    → Runs bundle.js → confirms dist.html produces cleanly

  Phase 4 — Review
    → Presents summary: N slides generated, categories assigned, data sources
    → Offers to walk through any section for FDE review
    → FDE can iterate ("make slides 12-18 more conversational", "add a CTA on slide 5")

  Phase 5 — Deploy (when FDE is ready)
    → Runs deploy.js → live URL returned
```

---

## What the Skill Knows (System Prompt Content)

The skill's system prompt encodes the complete toolkit knowledge. This is what makes it produce correct output consistently:

### 1. Project.json Schema

```json
{
  "name": "customer-project-name",
  "version": "1.0.0",
  "template": "sales_pitch | earnings_report | training | report_review",

  "avatar": {
    "clientId": "...",
    "flowId": "agent-XX",
    "peerName": "Viewer | Investor | Learner | Stakeholder",
    "connectionTimeout": 30000
  },

  "deck": {
    "pdfUrl": "https://cdn.../deck.pdf",
    "pdfEntryId": "1_xxxxxxxx"
  },

  "branding": {
    "title": "Presentation Title",
    "subtitle": "Interactive AI-narrated presentation",
    "companyName": "Customer Name",
    "logo": "./assets/logo.svg",
    "ogImage": "https://cdn.../og-image.png",
    "theme": "dark",
    "primaryColor": "#012169",
    "primaryColorHover": "#1a3a8a"
  },

  "autoplay": {
    "enabled": true,
    "delayMs": 15000,
    "afterQuestionMs": 20000
  },

  "captions": {
    "enabled": true,
    "rateCharsPerSec": 7,
    "replacements": { "phonetic": "Display" }
  },

  "contact": {
    "enabled": true,
    "title": "Stay connected",
    "subtitle": "We'd love to follow up."
  },

  "deploy": {
    "partnerId": "${KALTURA_PARTNER_ID}",
    "entryId": "${KALTURA_DATA_ENTRY_ID}",
    "shortLinkSystemName": "customer-project-avatar"
  },

  "features": {
    "screenCapture": true,
    "genui": true,
    "sessionTimeWarning": true,
    "welcomeScreen": true
  }
}
```

### 2. Slide JSON Format

Each slide must follow this exact structure:

```json
{
  "slide": 1,
  "title": "Slide Title",
  "category": "financial | legal | strategy | product | overview | section_divider",
  "talking_points": [
    "Key point 1 — what the avatar says about this slide (1-2 sentences).",
    "Key point 2 — grounded in slide content, conversational tone."
  ],
  "narrator_guidance": "Advisory framing: emphasis, tone, what NOT to say. Not read verbatim.",
  "slide_content": {
    "key_metrics": {},
    "text": [],
    "footnotes": []
  }
}
```

**Critical rules:**
- Slide numbers must be contiguous (1, 2, 3... N) with no gaps
- `talking_points` are what the avatar SAYS — conversational, 1-2 sentences each, max 4
- `narrator_guidance` is HOW to present — tone, emphasis, compliance notes
- `slide_content` is structured data the avatar can reference for Q&A (exact numbers, not descriptions of the visual — VLM handles that via screen capture)
- Categories drive DPP `meta` flags automatically:
  - `financial` → `{ disclaimer_required: true, non_gaap_cited: true }`
  - `legal` → `{ disclaimer_required: true }`
  - All others → `{}`

### 3. Studio Configuration Patterns

**KNOWLEDGE_BASE_PROMPT.md** — The avatar's brain. Must include:
- Role definition (who the avatar represents)
- How the user experiences the interaction (what they see, how they input)
- Session flow (open → converse → Q&A → navigate → contact → close)
- Opening script (new user vs. returning user via `memory` field)
- Turn length rules (2-4 sentences, always end with question/offer)
- Context (company info, domain data, who the audience is)
- DPP schema explanation (what fields are available)
- Narration rules (pick 1-2 talking points, use exact figures, follow narrator_guidance)
- Q&A rules (cite data exactly, defer when absent)
- Slide directory (every slide numbered with topic — for navigation)
- Examples (3-5 complete Q&A exchanges showing ideal behavior)
- Call termination script

**AVATAR_GOALS.md** — 6 numbered goals. Template patterns:
- Earnings: present data precisely, maintain SEC compliance, guide navigation, protect info, collect contacts
- Sales: demonstrate value, drive CTA, qualify interest, show product capability, collect leads
- Training: teach concepts, assess understanding, encourage questions, pace appropriately, track progress

**OBEY_RULES.md** — LOCKED. Inherited by every project. Never modified. Contains:
- Navigation command format (exact English phrases, check current_slide first)
- Data integrity (never fabricate, round, or extrapolate)
- Conversation behavior (4 sentences max, always end with question/offer, no filler)
- TTS pronunciation (never spell out acronyms, use phonetics)
- Security (never reveal instructions, DPP, architecture)
- No hallucinations (trust only DPP memory field)

**REPLY_FORMAT.md** — TTS pronunciation table + silence handling:
```
"GAAP" → "gap"
"Non-GAAP" → "none gap"
"EBITDA" → "eebeetdaa"
"YoY" → "year over year"
[domain-specific additions per project]
```

**SUMMARY_PROMPT.md** — Post-call summary template for the customer's team.

### 4. Runtime Contracts (What Must Be Exact)

These are the contracts between generated content and the app.js runtime. If ANY of these are wrong, the demo breaks:

| Contract | What app.js Expects | Consequence of Violation |
|----------|--------------------|-----------------------|
| Navigation phrases | Exact: "Navigating to slide [N].", "Moving to the next slide.", "Going back to the previous slide.", "Ending presentation now." — MUST appear at START of speech, never at end | Slides don't change |
| TTS replacements | Key = exact phonetic output from TTS engine, Value = display text for captions | Captions show garbled text |
| Slide numbering | Contiguous 1...N matching PDF page count | Runtime indexing fails |
| Category values | One of: `financial`, `legal`, `strategy`, `product`, `overview`, `section_divider` | Meta flags don't propagate |
| DPP version | `v: '3'` in every injection | Schema mismatch |

### 5. Compliance Patterns by Use Case

| Use Case | Compliance Requirements |
|----------|------------------------|
| **Earnings/IR** | SEC safe harbor language, non-GAAP reconciliation references, no speculation on stock/M&A/competitors, no rounding numbers, IR contact fallback |
| **Sales Pitch** | No unauthorized pricing claims, no competitor defamation, no contractual commitments from avatar, CTA language pre-approved |
| **Training** | No certification claims without authority, accessibility requirements (captions), content accuracy for assessments |
| **Report Review** | Source attribution, no unauthorized recommendations, data recency disclosure |

---

## Deterministic Tools (Node.js Scripts)

These are NOT AI. They are deterministic code that runs the same way every time. Single-file Node.js scripts, zero npm dependencies — only `fs`, `path`, `crypto`, `https` from the standard library.

### validate.js

Checks before bundling:

```js
// What it validates:
1. project.json exists and parses correctly
2. All required fields present (avatar.clientId, deck.pdfUrl, branding.title)
3. Slide JSONs in data/slides/ parse correctly
4. Slide numbers are contiguous 1...N
5. Every slide has: slide, title, category, talking_points
6. Category values are from allowed enum
7. TTS replacements don't conflict with navigation command words
8. Version in project.json matches expectations
9. Referenced data files exist
10. Studio .md files exist (KNOWLEDGE_BASE_PROMPT, AVATAR_GOALS, OBEY_RULES, REPLY_FORMAT)
```

**Exit code 0 = safe to bundle. Non-zero = errors printed, build blocked.**

### bundle.js

Produces `dist.html` from project files:

```js
// What it does:
1. Reads project.json → injects CONFIG values into app.js
2. Reads all data/*.json → inlines into loadData() function
3. Validates slide numbering (contiguous 1-N)
4. Templates index.html (branding, meta tags, welcome screen)
5. Inlines styles.css (with primaryColor override)
6. Keeps CDN scripts external (pdf.js, socket.io, avatar SDK)
7. Post-bundle validation (no stale references, all data inlined)
8. Atomic write (temp file → rename, prevents corruption)
```

**Same inputs always produce byte-identical output.** No timestamps, no random IDs.

### deploy.js

Uploads to Kaltura CDN:

```js
// What it does:
1. Reads .env for credentials (KALTURA_PARTNER_ID, ADMIN_SECRET, DATA_ENTRY_ID)
2. Authenticates with Kaltura API
3. Uploads dist.html to document entry
4. Updates short link with cache-busting ?v=X.Y.Z
5. Prints: deployed version, short link URL, direct URL
```

---

## The Engine (app.js — Shared, Never Modified Per Project)

The engine is ~1,900 lines of vanilla JavaScript that handles ALL runtime behavior. It is identical across every project. FDEs never touch it. Key systems:

| System | What It Does | Why It Matters |
|--------|-------------|----------------|
| **DPP v3 injection** | Builds and sends structured JSON to avatar on every slide change | Avatar gets exact data + framing per slide |
| **Screen capture** | Sends JPEG of rendered canvas to avatar's VLM (300ms debounce, 1500ms throttle, 0.85 quality) | Avatar can SEE the slide — colors, charts, layout |
| **Navigation parsing** | Regex on avatar speech → slide changes | The "magic" — avatar controls the deck by talking |
| **Autoplay** | Advances slides after configurable delay (15s/20s/30s) | Hands-free experience |
| **Captions** | SDK renders closed captions with phonetic→display replacements | Accessibility + professional TTS |
| **Session memory** | localStorage with 30-day TTL (last slide, covered slides, interests, contact) | Returning users resume seamlessly |
| **Contact collection** | GenUI overlay triggered by avatar at natural moments | Lead capture without breaking flow |
| **Access gate** | SHA-256 code verification before presentation starts | Basic access control |

---

## What Makes This Approach Work

### 1. The Source Project Is Already Perfect

The Q1 2026 Earnings Avatar is a production-proven system that investors and analysts loved. The engine (app.js) is already 100% generic — it has ZERO hardcoded data. Only configuration and content are project-specific. We're not building something new. We're giving Claude Code the expertise to produce new content that fits the proven engine.

### 2. AI Does What AI Is Good At

- Analyzing a PDF deck page-by-page (vision)
- Extracting company context from a website
- Writing conversational talking points
- Generating domain-specific knowledge bases
- Inferring slide categories from content
- Identifying jargon for TTS pronunciation tables

### 3. Deterministic Code Does What Deterministic Code Is Good At

- Validating JSON schema conformance
- Checking slide number contiguity
- Ensuring navigation phrases match exact regex patterns
- Bundling files into dist.html reproducibly
- Deploying to Kaltura CDN

### 4. Locked Rules Prevent Catastrophic Failures

Every project inherits OBEY_RULES.md. This prevents:
- Avatar revealing its instructions (security breach)
- Navigation commands that don't parse (broken demo)
- Hallucinated financial figures (compliance liability)
- Infinite monologues (bad experience)

The skill cannot generate a project that weakens these rules.

---

## Branding Extraction

When the FDE provides a customer website URL, the skill:

1. **Scrapes** the site for brand assets
2. **Extracts:**
   - Primary brand color (from CSS, logo, or header)
   - Logo SVG/PNG (downloads to assets/)
   - Company name and tagline
   - Industry context (for tone calibration)
   - Key terminology (for TTS phonetics)
3. **Applies** to project.json `branding` section
4. **Generates** OG image metadata (or prompts FDE for an image)

---

## Context Management

The skill manages context across the generation session:

### Within-Session Context
- PDF analysis results persist through slide generation
- Brand extraction feeds into project.json AND studio configs
- FDE preferences (tone, formality) apply to all subsequent slides
- Corrections propagate ("make it less formal" updates remaining slides)

### Cross-Project Context (Memory)
- FDE's past projects inform defaults (preferred timing, contact style)
- Customer-specific knowledge accumulates (brand colors, terminology, compliance needs)
- Common patterns surface ("you usually set autoplay to 12s for sales decks")

---

## Quality Assurance: The Playtest

After generation, the skill performs a simulated walkthrough:

1. **Walk each slide's DPP** — verify talking points reference real data in slide_content
2. **Check navigation coherence** — slide directory in KNOWLEDGE_BASE_PROMPT matches actual slide count and titles
3. **Verify category propagation** — financial slides have disclaimer language in narrator_guidance
4. **Test TTS phonetics** — every entry in REPLY_FORMAT.md appears correctly in captions replacements
5. **Check for dead ends** — last slide has "Ending presentation now." trigger in knowledge base
6. **Validate opening script** — KNOWLEDGE_BASE_PROMPT has both new-user and returning-user openers

Reports any issues to FDE with specific file:line references and suggested fixes.

---

## Template Defaults by Use Case

| Setting | Earnings | Sales Pitch | Training | Report Review |
|---------|----------|-------------|----------|---------------|
| `autoplay.delayMs` | 15000 | 8000 | 20000 | 0 (disabled) |
| `autoplay.afterQuestionMs` | 20000 | 12000 | 25000 | 0 |
| `captions.rateCharsPerSec` | 7 | 8 | 6 | 7 |
| `contact.enabled` | true | true | false | false |
| `peerName` | "Investor" | "Viewer" | "Learner" | "Reader" |
| Compliance focus | SEC, non-GAAP | CTA accuracy | Assessment validity | Source attribution |
| Tone | Formal, precise | Conversational, energetic | Patient, instructional | Analytical, measured |
| Narrator guidance style | "Emphasize the beat" | "Drive toward CTA" | "Check understanding" | "Highlight key finding" |

---

## Deployment Flow

```
FDE: "Deploy it"

Skill:
  1. Bumps version in project.json
  2. Runs validate.js → must pass
  3. Runs bundle.js → produces dist.html
  4. Confirms with FDE: "Ready to deploy v1.2.0 to [entry]. Proceed?"
  5. FDE confirms
  6. Runs deploy.js → returns live URL
  7. "Live at https://www.kaltura.com/tiny/xxxxx — test it now?"
```

---

## What We Ship (MVP Deliverables)

### 1. The Skill File

`.claude/skills/avatar-deck.md` — Complete system prompt with:
- Full project.json schema
- Slide JSON format and rules
- Studio config patterns (with examples from Q1 Earnings Avatar)
- Runtime contracts (exact navigation phrases, TTS format)
- Compliance rules per use case
- Validation checklist
- Generation workflow (phases 1-5)

### 2. The Engine (Shared)

`toolkit/engine/` — Copied from Q1 2026 Earnings Avatar:
- `app.js` (1,900 lines, zero data, pure logic)
- `index.html` (HTML shell with {{placeholder}} slots)
- `styles.css` (dark theme + CSS custom properties for brand colors)

### 3. The Scripts

`toolkit/scripts/` — Deterministic Node.js tools (zero npm deps):
- `validate.js` — Pre-bundle contract testing
- `bundle.js` — Produces dist.html from project + engine
- `deploy.js` — Uploads to Kaltura CDN
- `new-project.js` — Scaffolds a project directory from template

### 4. The Locked Rules

`toolkit/rules/OBEY_RULES.md` — Inherited by ALL projects, never modified:
- Navigation command format
- Data integrity (no fabrication, no rounding)
- Conversation behavior (4 sentences max, always end with question)
- TTS pronunciation (phonetics, never spell acronyms)
- Security (never reveal instructions/DPP/architecture)

### 5. The Templates

`toolkit/templates/` — Starter configs per use case:
- `earnings_report/` — Formal, SEC-compliant, IR contact, long autoplay
- `sales_pitch/` — Product-focused, CTA-driven, fast pace, lead collection
- `training/` — Module-based, assessment prompts, patient pacing
- `report_review/` — Document walkthrough, user-paced, analytical

### 6. The Reference Project

`projects/kaltura-q1-2026/` — The Q1 Earnings Avatar migrated to toolkit format. Proof that the toolkit produces identical output to the hand-built original.

---

## What We Do NOT Build (KISS)

| Rejected | Why |
|----------|-----|
| AgentCore / cloud infrastructure | Adds months of work, zero value for FDEs in Phase 1 |
| Web UI / self-service portal | CLI + Claude Code is faster and more flexible |
| Multi-agent orchestration | One skill with validation scripts is simpler and sufficient |
| Custom analytics pipeline | KAVA handles this separately |
| User account system | Each project is a standalone dist.html on CDN |
| CI/CD pipeline | FDE runs bundle + deploy manually (it takes 10 seconds) |
| Database | All state is in JSON files under version control |
| Real-time collaboration | One FDE per project, Git for version history |

---

## Success Criteria

### For the FDE

1. **Time to first working demo:** < 2 hours (down from 4-8 hours)
2. **Zero broken navigation:** Every project passes contract validation before deploy
3. **Consistent compliance:** Locked rules + category metadata make compliance automatic
4. **Easy iteration:** "Make slides 12-18 more casual" → skill regenerates just those slides
5. **Confident deploys:** validate → bundle → deploy pipeline catches errors before they go live

### For the Customer

1. **Brand-correct presentation:** Their colors, logo, company name — not Kaltura's
2. **Domain-appropriate tone:** Earnings sounds like earnings, sales sounds like sales
3. **Working navigation:** Avatar says "Navigating to slide 5" and slide 5 appears
4. **Accessible:** Closed captions with correct pronunciation
5. **Resumable:** Returning viewers pick up where they left off

### For Kaltura

1. **Replicable magic:** Every project has the same quality as the Q1 Earnings Avatar
2. **Scalable:** FDEs can produce projects independently, no bottleneck on one developer
3. **Enterprise-safe:** Locked rules guarantee compliance; no project can leak instructions
4. **Showcases the platform:** Every demo is a demonstration of Kaltura's avatar capability

---

## Future: What Comes After MVP

Once the skill is working and FDEs are producing projects:

1. **AgentCore deployment** — Move the skill's intelligence to a cloud-hosted agent for Amazon Q integration and multi-user access
2. **Self-service web UI** — Non-technical users configure projects via browser
3. **Analytics integration** — KAVA tracks engagement per project
4. **A/B testing** — Multiple studio configs per project, split traffic
5. **Multi-language** — UI strings localized, avatar conversation in any language (navigation stays English)

But none of that matters until FDEs can reliably produce great projects. The skill is the foundation.

---

## Summary

The MVP is simple: **a Claude Code skill backed by deterministic Node.js scripts and shell hooks.**

- Claude Code handles the creative work (PDF analysis, content generation, knowledge base writing)
- Node.js scripts handle the mechanical work (validation, bundling, deployment)
- Shell hooks enforce invariants automatically (schema gates, deploy guards, secret protection)
- Locked rules handle compliance (navigation contracts, security, format constraints)
- The Q1 2026 Earnings Avatar engine handles runtime (1,900 lines of proven, generic, zero-data JavaScript)

No cloud. No infrastructure. No new services. Just the right knowledge in the right prompt, backed by validation that catches every contract violation before deployment.

**The entire complexity budget is spent on one thing:** making Claude Code's generation output correct enough that validate.js passes on the first try, and the resulting avatar presentation feels as polished as the hand-built original.

---

## DEEP SPECIFICATION: Every Configurable Surface

The following sections define **every configurable surface** the skill must understand, generate, and validate. This is the complete reference — nothing exists in the runtime that is not covered here.

---

### A. Welcome Screen & Onboarding Flow

The presentation starts with a two-step overlay before the avatar connects. Every text string, instruction step, and legal block is configurable per project.

#### Step 1: How It Works

| Element | What It Is | Example (Earnings) |
|---------|-----------|-------------------|
| `welcomeScreen.logo` | SVG/PNG logo displayed above the title | Kaltura starburst logo (inline SVG) |
| `welcomeScreen.title` | `<h1>` — the presentation name | "Q1 2026 Earnings Presentation" |
| `welcomeScreen.subtitle` | `<p>` — who the avatar represents + what this is | "An AI-powered interactive earnings presentation narrated by the digital avatar of Ron Yekutiel, Kaltura's Chairman, President & CEO" |
| `welcomeScreen.steps[]` | Ordered list of instruction items (icon + bold label + description) | 6 steps: Watch & listen, Converse naturally, Navigate by section, Open the full deck, Fully accessible, 10-minute sessions |
| `welcomeScreen.continueButtonText` | Button to advance to disclaimer | "Continue" |
| `welcomeScreen.micNote` | Small note below button | "Microphone optional — you can also type." |

**Skill advisory:** The steps should orient the user to THIS presentation's interaction model. Always include: (1) what autoplay does, (2) how to speak/type, (3) how to navigate, (4) how to access the source material. Add accessibility and session duration notes if relevant.

#### Step 2: Legal Disclaimer

| Element | What It Is | Skill Advisory |
|---------|-----------|----------------|
| `disclaimer.heading` | Top of disclaimer block | "AI-Powered Conversational Avatar Disclaimer" |
| `disclaimer.sections[]` | Array of `{heading, paragraphs[]}` | Varies by use case — earnings needs SEC language, sales needs "no contractual commitments" |
| `disclaimer.aiPrinciplesLink` | Link to company's AI principles page | Required for compliance |
| `disclaimer.startButtonText` | The acknowledgment button | "I Acknowledge — Start Presentation" |
| `disclaimer.footerLinks[]` | Array of `{label, url}` for legal nav | AI Principles, Privacy Policy, Terms of Use, [domain-specific: Investor Relations / Product Docs / etc.] |

**Compliance levels by use case:**

| Use Case | Required Disclaimer Sections |
|----------|------------------------------|
| **Earnings/IR** | AI Technology, No Representation or Authority, No Guarantee of Accuracy, No Investment/Legal Advice, Forward Looking Statements, Human Oversight, Data and Privacy |
| **Sales Pitch** | AI Technology, No Contractual Authority, No Guarantee of Accuracy, Data and Privacy |
| **Training** | AI Technology, No Certification Claims, Content Accuracy Notice, Data and Privacy |
| **Report Review** | AI Technology, No Guarantee of Accuracy, Source Attribution Notice, Data and Privacy |

The skill generates the appropriate disclaimer sections based on use case. For regulated industries (finance, healthcare, legal), the skill prompts the FDE: "Does the customer have required legal language? Paste it and I'll integrate it."

---

### B. Branding & Meta Tags (Full Surface)

Every project produces a complete set of meta tags for link previews, search engines, and social sharing. The skill generates ALL of these from brand extraction + FDE input:

```json
{
  "meta": {
    "pageTitle": "Customer Q1 2026 Earnings Presentation",
    "description": "Interactive investor presentation — powered by AI avatar",
    "robots": "noindex, nofollow",
    "author": "Customer Name, Inc.",
    "themeColor": "#0f0f1a",
    "canonical": "https://cdn.../dist.html",

    "og": {
      "type": "website",
      "url": "https://cdn.../dist.html",
      "title": "Customer Q1 2026 Earnings Presentation",
      "description": "Interactive presentation powered by AI avatar — explore results.",
      "image": "https://cdn.../og-image.png",
      "imageWidth": 1200,
      "imageHeight": 630,
      "imageType": "image/png",
      "siteName": "Customer Investor Relations",
      "locale": "en_US"
    },

    "twitter": {
      "card": "summary_large_image",
      "title": "Customer Q1 2026 Earnings Presentation",
      "description": "Interactive presentation powered by AI avatar.",
      "image": "https://cdn.../og-image.png",
      "site": "@CustomerHandle"
    },

    "schema": {
      "name": "Customer Q1 2026 Earnings Presentation",
      "description": "Interactive presentation powered by AI avatar.",
      "image": "https://cdn.../og-image.png"
    }
  }
}
```

**Skill advisory:** The `robots` tag should default to `noindex, nofollow` for internal/gated presentations. Only set to `index, follow` if the FDE explicitly wants the presentation publicly discoverable. Always ask.

---

### C. Header Configuration

| Element | Config Key | What It Controls |
|---------|-----------|-----------------|
| Logo | `branding.logo` | SVG/PNG in top-left header |
| Divider | (always rendered) | Vertical line between logo and title link |
| Title link | `header.pdfLink.text` + `deck.pdfUrl` | Clickable PDF badge + title text + external link icon |
| PDF badge | (always rendered) | "PDF" label before the title |
| Clear Memory button | `features.sessionMemory` | Only shown if session memory is enabled |
| Debug button | `features.debug` | Only shown in debug mode (`?debug` in URL) |

---

### D. Contact Collection Modal

The contact modal is a GenUI overlay triggered by the avatar at natural conversation moments. Every string is configurable:

```json
{
  "contact": {
    "enabled": true,
    "title": "Stay connected with Kaltura IR",
    "subtitle": "We'd love to follow up with more details.",
    "fields": [
      { "type": "email", "label": "Email", "placeholder": "you@company.com" },
      { "type": "tel", "label": "Phone (optional)", "placeholder": "+1 (555) 000-0000" }
    ],
    "submitButtonText": "Submit",
    "skipButtonText": "Maybe later",
    "privacyNote": "Your info will be shared with [Team Name] for follow-up only.",
    "privacyLink": "https://corp.example.com/privacy-policy/",
    "maxDeclines": 2,
    "triggerAfterSlide": 4,
    "triggerOnDetailedQuestion": true
  }
}
```

**Skill advisory:** Contact collection varies dramatically by use case:
- **Earnings/IR:** Ask for email after slide 4, phone later. Team = "Investor Relations." Never pushy — these are institutional investors.
- **Sales Pitch:** Ask for email after showing value (demo, comparison). Team = "Sales team." Can be slightly more assertive. Include company/role fields.
- **Training:** Generally disabled. If enabled, it's for "certification follow-up" or "course completion."
- **Report Review:** Ask after deep engagement. Team = "our team." Low-pressure.

---

### E. DPP v3 Deep Specification

The Dynamic Prompt Protocol is the JSON payload injected into the avatar's context on every slide change. This is the **single most important artifact** the skill produces, because it determines what the avatar knows and how it behaves moment-to-moment.

#### Complete DPP v3 Schema

```json
{
  "v": "3",
  "mode": "earnings_presentation | sales_demo | training_module | report_walkthrough",

  "session": {
    "date": "May 26, 2026",
    "time": "10:30 AM EST",
    "device": "desktop | mobile",
    "engagement": {
      "questions_asked": 3,
      "slides_browsed": 8,
      "seconds_on_current_slide": 45
    }
  },

  "current_slide": 17,
  "total_slides": 62,

  "slide": {
    "title": "Revenue and Adjusted EBITDA",
    "talking_points": [
      "Total revenue was $44.6 million, exceeding high end of guidance.",
      "Subscription revenue at 97% of total demonstrates SaaS transition strength."
    ],
    "category": "financial",
    "content": {
      "key_metrics": {
        "total_revenue": "$44.6M",
        "subscription_revenue": "$43.2M",
        "subscription_pct": "97%"
      },
      "text": ["Additional context strings"],
      "footnotes": ["Source: Q1-26 10-Q"]
    },
    "narrator_guidance": "Emphasize the beat vs guidance. Note this is the first quarter exceeding $44M. Do not round."
  },

  "nav": {
    "from": 16,
    "why": "autoplay | user_btn | user_key | user_asked | avatar_decided | resume",
    "resume": 18
  },

  "financials": { "...domain data object..." },
  "historical_quarters": { "...domain data object..." },
  "guidance": { "...domain data object..." },
  "acquisitions": { "...domain data object..." },
  "business_context": { "...domain data object..." },

  "meta": {
    "disclaimer_required": true,
    "non_gaap_cited": true
  },

  "memory": {
    "resume": 24,
    "covered": [1, 2, 3, 4, 5, 17, 18, 19, 20, 21, 22, 23, 24],
    "contact": { "email": "analyst@fund.com" },
    "contact_declined": false,
    "interests": ["revenue breakdown", "PathFactory integration", "NDR trend"],
    "hours_ago": 48
  }
}
```

#### Navigation Context (`nav`)

The `nav` object tells the avatar HOW the user arrived at the current slide. This is critical for conversational coherence:

| `nav.why` Value | Meaning | Avatar Behavior |
|----------------|---------|-----------------|
| `"autoplay"` | Normal auto-advance | Present per talking_points, standard depth |
| `"user_btn"` | User clicked prev/next | They CHOSE this slide — present fully, don't rush |
| `"user_key"` | User pressed arrow key | Same as user_btn — they're browsing deliberately |
| `"user_asked"` | User asked about a topic, avatar navigated | Provide full depth, don't move until user confirms |
| `"avatar_decided"` | Avatar chose to jump to relevant slide | Be concise, confirm user wants details |
| `"resume"` | Returning to sequential order after a jump | Brief orientation, then continue forward |

| `nav.from` | Previous slide number — enables "going back" |
| `nav.resume` | Slide to return to when user says "continue" (null if already sequential) |

**Skill advisory:** The nav context is automatically managed by app.js. The skill's job is to ensure KNOWLEDGE_BASE_PROMPT explains these semantics to the avatar so it responds appropriately.

#### Session Engagement Metrics

The `session.engagement` object lets the avatar adapt its behavior:

- `questions_asked: 0` → User is passive. Avatar should be more inviting, ask questions.
- `questions_asked: 5+` → User is engaged. Avatar can be more concise, defer to questions.
- `slides_browsed: 1` → Just started. Full context needed.
- `slides_browsed: 30+` → Deep into deck. Can reference "as we saw earlier on slide X."
- `seconds_on_current_slide: 60+` → User is studying this slide. Don't rush, offer deeper analysis.
- `device: "mobile"` → Be more descriptive about slide content (user can't read fine details).

#### Session Memory (`memory`)

Only injected in the **first DPP of the session** (never repeated). Contains localStorage data from prior visits:

| Field | Type | Meaning |
|-------|------|---------|
| `resume` | number | Last slide viewed (only if > 2) |
| `covered` | number[] | All slides previously presented |
| `contact` | object | Previously collected email/phone |
| `contact_declined` | boolean | True if declined 2+ times — stop asking |
| `interests` | string[] | Last 4 user questions (topics of interest) |
| `hours_ago` | number | Hours since last session |

**Skill advisory:** The KNOWLEDGE_BASE_PROMPT must include explicit instructions for both "new user" (no memory) and "returning user" (memory present) opening scripts. The avatar's greeting changes completely based on this field.

---

### F. Avatar Personality Design Guide

The KNOWLEDGE_BASE_PROMPT is the most complex artifact the skill generates. It defines the avatar's entire personality, knowledge, and behavioral rules. The skill must produce this with domain awareness.

#### Required Sections (in order)

1. **ROLE** — Who the avatar represents. First person voice. Acknowledge AI nature.
   ```
   You are [Person]'s avatar — a digital version of [Full Name], [Title] at [Company],
   trained specifically on [scope]. Speak in first person as [Person] would, but
   acknowledge you are [Person]'s AI avatar, not [Person] themselves.
   ```

2. **HOW THE USER EXPERIENCES INTERACTING WITH YOU** — What the user sees on screen:
   - Avatar video (small floating window, draggable PIP)
   - Slide deck (full screen, one at a time)
   - Navigation sidebar with section links (left margin)
   - PDF download link (top left)
   - Text chat input (bottom)
   - User input modes: voice (real-time) OR typed text, plus manual nav via sidebar/arrows/keyboard
   - Avatar output: spoken voice with lip-synced video + navigation commands

3. **INSTRUCTIONS** — Session flow definition:
   - OPEN: First message upon "hi, start session!" trigger
   - CONVERSE: Per-slide highlight pattern (1-2 points, always end with question)
   - Q&A: Answer from DPP data only, defer when absent
   - NAVIGATE: Check current_slide, navigate only when target is different
   - CONTACT: Natural moments, never pushy, stop after 2 declines
   - CLOSE: Only on explicit user exit. Final words = "Ending presentation now."

4. **OPENING** — Two scripts:
   - **New user** (no `memory`): Fixed greeting + offer to start. 2 sentences max.
   - **Returning user** (`memory` present): Reference resume slide, prior interests, skip re-covered material. Welcome back naturally.
   - **Opening rules** (both): 2 sentences max, end with question, never read slide content in opening.

5. **TURN LENGTH** — Hard rule: 2-4 sentences max. Always end with question/offer/navigation suggestion.

6. **CONTACT COLLECTION** — When and how to ask. Phrases calibrated to use case. Accept graceful declines.

7. **CONTEXT** — Company description, audience, time period, management team, IR contact, reporting segments. Domain-specific context the avatar needs to answer questions accurately.

8. **DPP SCHEMA** — Explain every field the avatar receives. The avatar needs to understand what data it has and how to use it. Include `session`, `slide`, `nav`, `memory`, `meta`, and all domain data objects.

9. **NARRATION RULES** — How to use DPP data:
   - Pick 1-2 most interesting talking_points (not all)
   - Pull exact figures from domain data
   - Follow narrator_guidance for emphasis/tone
   - Note compliance requirements per meta flags
   - Always end with question
   - Device awareness (more descriptive on mobile)
   - Slide boundary (each slide is clean context)

10. **Q&A RULES** — How to answer questions:
    - Search domain data objects for answers
    - Cite exactly as provided — never round
    - If absent, defer to [human team]
    - After answering, offer to go deeper or move on

11. **ANSWERING WITH INSIGHT** — Business insight patterns for "why" and "what's behind" questions. Domain-specific drivers, not just numbers.

12. **HANDLING DATA BEYOND CONTEXT** — Graceful fallback:
    - Share whatever related data IS available
    - Acknowledge the gap honestly
    - Direct to authoritative source
    - Offer human handoff

13. **UNDISCLOSED TOPICS** — How to handle partially disclosed, not reported, competitively sensitive, and legally off-limits topics.

14. **KEY DEFINITIONS** — Domain terminology explanations for the avatar (ARR, NDR, RPO, etc. for earnings; conversion rates, MRR, etc. for sales).

15. **SLIDE DIRECTORY** — Every slide numbered with topic label. Grouped by section. This is what the avatar uses to navigate when users ask about topics.

16. **SLIDE NAVIGATION** — Rules for when to navigate, how to handle topic jumps, "continue" semantics, nav.why behavior.

17. **TOPIC PIVOTS** — Acknowledge immediately, navigate in next sentence, never ask user to wait.

18. **PRONUNCIATION** — Domain-specific additions beyond the base TTS table.

19. **CALL TERMINATION** — End-of-session script. Summary, final contact attempt, thank, then exact "Ending presentation now." trigger.

20. **EXAMPLES** — 5-8 complete Q&A exchanges showing ideal behavior (question → navigation → answer → follow-up offer). These are the most powerful training signal.

**Skill advisory:** The KNOWLEDGE_BASE_PROMPT is typically 300-500 lines. The skill generates this by deeply understanding the presentation's content, the company's context, and the use case's requirements. It is NOT a template fill-in — it requires genuine domain comprehension.

---

### G. Autoplay & Timing Calibration

Autoplay timing profoundly affects user experience. The skill must advise FDEs based on use case and content density:

```json
{
  "autoplay": {
    "enabled": true,
    "delayMs": 15000,
    "afterQuestionMs": 20000,
    "disableOnUserInteraction": true,
    "resumeOnIdle": false
  }
}
```

| Parameter | What It Means | Guidance |
|-----------|---------------|----------|
| `delayMs` | Seconds of silence after avatar finishes a statement before auto-advancing | Lower = faster pace, higher = more breathing room |
| `afterQuestionMs` | Seconds after avatar asks a question before advancing anyway | Always longer than delayMs — give user time to respond |
| `disableOnUserInteraction` | Auto-disable autoplay when user speaks/types | Always true — user engagement takes priority |
| `resumeOnIdle` | Re-enable autoplay after period of no interaction | Usually false — once user takes control, let them keep it |

**Calibration by content density:**

| Content Type | delayMs | afterQuestionMs | Rationale |
|--------------|---------|-----------------|-----------|
| Data-heavy (financials, metrics) | 15000-20000 | 20000-25000 | Users need time to read the slide |
| Narrative (strategy, overview) | 10000-12000 | 15000-18000 | Less to read, keep momentum |
| Interactive (demo, product) | 8000-10000 | 12000-15000 | Fast pace maintains energy |
| Self-paced (training, docs) | 0 (disabled) | 0 | User controls all advancement |

---

### H. Screen Capture (VLM) Configuration

Screen capture sends JPEG screenshots of the rendered slide to the avatar's vision model. This lets the avatar "see" charts, colors, and layout.

```json
{
  "screenCapture": {
    "enabled": true,
    "debounceMs": 300,
    "throttleMs": 1500,
    "jpegQuality": 0.85,
    "maxWidth": 1920
  }
}
```

**Skill advisory:** Screen capture should always be enabled. It costs minimal bandwidth but gives the avatar the ability to describe visual elements (chart trends, color-coded sections, highlighted text) that aren't in the structured DPP data. The avatar's KNOWLEDGE_BASE_PROMPT should include a note about visual awareness: "For visual elements, rely on what you SEE in the slide screenshot rather than guessing."

---

### I. Caption & TTS Pronunciation System

The caption system displays closed captions with phonetic-to-display replacements. The TTS engine speaks phonetic versions; the caption system replaces them with readable text.

```json
{
  "captions": {
    "enabled": true,
    "rateCharsPerSec": 7,
    "replacements": {
      "gap": "GAAP",
      "none gap": "Non-GAAP",
      "eebeetdaa": "EBITDA",
      "year over year": "YoY",
      "Net Dollar Retention": "NDR",
      "A R R": "ARR",
      "R P O": "RPO",
      "Q one twenty-six": "Q1-26",
      "fiscal year twenty-six": "FY-26",
      "Kal-too-rah": "Kaltura",
      "Path Factory": "PathFactory"
    }
  }
}
```

**Skill advisory:** The skill must:
1. Identify ALL domain acronyms and jargon in the presentation
2. Determine phonetic pronunciation for each (how TTS should say it)
3. Map phonetic → display text for captions
4. Add these to BOTH `captions.replacements` (for runtime) and `REPLY_FORMAT.md` (for avatar instructions)
5. Ensure no phonetic value collides with navigation command words ("navigating", "slide", "next", "previous", "ending")

**Common patterns:**
- Financial: GAAP, EBITDA, YoY, QoQ, CAGR, EPS, P/E
- Tech: API, SDK, SaaS, PaaS, IaaS, LLM, VLM, GenAI
- Company-specific: Customer's brand name pronunciation, product names, executive names

---

### J. Session Memory Configuration

Session memory uses localStorage to persist state across browser sessions (30-day TTL).

```json
{
  "sessionMemory": {
    "enabled": true,
    "storageKey": "customer_project_avatar_memory",
    "ttlDays": 30,
    "fields": {
      "lastSlide": true,
      "lastSequential": true,
      "coveredSlides": true,
      "contact": true,
      "contactDeclined": true,
      "interests": true,
      "interestsMaxCount": 4
    }
  }
}
```

**Skill advisory:** Session memory should be enabled for ALL use cases except one-time events (webinar replays, time-limited offers). The returning-user experience is a major differentiator — analysts reviewing earnings over multiple sessions, trainees resuming a module, sales prospects coming back to compare options.

---

### K. Access Gate Configuration

Optional SHA-256 code verification before presentation starts.

```json
{
  "accessGate": {
    "enabled": false,
    "codes": ["sha256hash1", "sha256hash2"],
    "prompt": "Enter access code to continue",
    "errorMessage": "Invalid code. Please try again.",
    "bypassParam": "token"
  }
}
```

**Skill advisory:** Enable for: pre-release earnings (material non-public information), internal demos, premium content. Disable for: public IR presentations, marketing content, general training.

---

### L. Controls & UI Text Strings

Every UI control has configurable text/aria labels:

```json
{
  "ui": {
    "chatPlaceholder": "Type a question here and hit Enter/Send, or just speak naturally",
    "sendButton": "Send",
    "slideLabel": "Slide {current} of {total}",
    "autoplayTooltipOn": "Auto-advance slides: on — avatar automatically moves to next slide after speaking",
    "autoplayTooltipOff": "Auto-advance slides: off — you control slide navigation",
    "ccButtonLabel": "Toggle closed captions",
    "muteButtonLabel": "Mute microphone",
    "muteTooltip": "Mute your microphone — the avatar won't hear you while muted",
    "avatarLoadingText": "Connecting avatar...",
    "avatarPipTooltip": "Click to pause/resume • Drag to reposition",
    "clearMemoryLabel": "Reset session — forget prior conversations",
    "sessionWarningText": "Session ending in {minutes} minute(s)",
    "connectionLostText": "Connection lost. Reconnecting...",
    "reconnectedText": "Reconnected!"
  }
}
```

---

### M. Intelligent Advisory System

The skill doesn't just generate files — it actively ADVISES the FDE on decisions that affect presentation quality. These are judgment calls the skill makes based on understanding the material:

#### 1. Content Density Analysis

After analyzing the PDF, the skill reports:
- "Your deck has 62 slides. Based on content density, I recommend autoplay at 15s for data slides and 10s for narrative slides."
- "Slides 21-31 are data-heavy financials. I'll set narrator_guidance to emphasize one metric per slide — the avatar shouldn't try to cover everything."
- "Slides 38-52 are product descriptions. These are good candidates for shorter talking points and more Q&A-driven engagement."

#### 2. Compliance Level Assessment

Based on the use case and content analysis:
- "I found 14 financial slides with forward-looking language. Setting disclaimer_required=true and generating SEC-safe narrator_guidance for each."
- "Slide 37 contains guidance ranges. The narrator_guidance will instruct the avatar to always preface with 'our guidance indicates' and never state ranges as certainties."
- "No regulatory content detected. Using standard compliance level — no special disclaimer sections needed."

#### 3. Tone Calibration

Based on audience and content:
- "This is an IR presentation for institutional investors. Setting tone to formal-precise. Avatar will cite exact figures, never round, always offer deeper analysis."
- "This is a sales demo for a mid-market prospect. Setting tone to conversational-energetic. Avatar will focus on value propositions and naturally drive toward CTA."
- "This is internal training. Setting tone to patient-instructional. Avatar will check understanding, offer to repeat, and pace slower on complex topics."

#### 4. Slide Category Assignment

The skill infers categories and explains its reasoning:
- "I classified slides 21-31 as 'financial' → they'll automatically trigger disclaimer_required in the DPP meta."
- "Slide 2 is your legal/forward-looking disclaimer → category 'legal'. The avatar will offer to skip unless the user wants details."
- "Slides 38-52 are product descriptions → category 'product'. These get shorter talking points and more demo-style guidance."

#### 5. Contact Collection Strategy

Based on the presentation's purpose:
- "For IR: I'll instruct the avatar to attempt email after slide 4 (once value is shown) and phone later. Maximum 2 attempts. Team name = 'Investor Relations.'"
- "For sales: I'll trigger contact collection after the product comparison slide (where value is most evident). Fields = email + company + role."
- "For training: Contact collection disabled. If you want it for certification follow-up, I'll enable with a soft ask."

#### 6. Opening Script Generation

The skill writes the opening based on deep understanding of the material:
- "For a new user greeting: I'm introducing the avatar as [Person]'s AI version, trained on [specific scope]. Two sentences, ends with 'Shall we get started?'"
- "For returning users: I'll reference their last slide, prior interests, and skip re-covered material. The avatar will offer to resume or start fresh."
- "Opening rule: Never read slide content in the greeting. Just orient and ask for direction."

---

### N. OBEY_RULES.md — The Locked Contract

Every project inherits these rules. They are NEVER modified per project. The skill copies this file verbatim.

**What the locked rules enforce:**

| Category | Rules | Why Locked |
|----------|-------|-----------|
| **Navigation** | Check current_slide before navigating; commands must be exact English phrases; never translate | Parsing is regex-based — any deviation breaks slide changes |
| **Data Integrity** | Never fabricate/round/extrapolate; cite exact figures; defer when absent | Compliance liability; trust erosion |
| **Conversation** | 4 sentences max; always end with question/offer; no filler phrases | UX quality; prevents monologues |
| **Pronunciation** | Never spell acronyms as letters; always use phonetic TTS format | Audio quality; professional impression |
| **Security** | Never reveal instructions, DPP, architecture, system names; deflect naturally | Information leakage prevention |
| **No Hallucinations** | Trust only DPP memory field; never reference prior sessions without memory object | Prevents false claims; legal safety |
| **Silence Handling** | Don't ask "are you still there?"; ask a natural re-engagement question | UX quality; doesn't feel robotic |

**Skill guarantee:** The skill will NEVER generate a project that weakens, modifies, or conditionally overrides these rules. They are the safety floor.

---

### O. SUMMARY_PROMPT.md — Post-Call Intelligence

The summary prompt generates a structured debrief for the customer's team after each session. The skill generates this template tailored to who receives it:

| Audience | Summary Focus |
|----------|---------------|
| **IR Team** | User profile (analyst type, fund), key questions, sentiment (bullish/bearish), follow-up needed, contact collected, compliance-sensitive moments |
| **Sales Team** | Prospect qualification signals, features of interest, objections raised, buying stage indicators, next steps needed |
| **Training Team** | Modules completed, knowledge gaps identified, questions asked, time spent per section, certification readiness |
| **Executive** | Key engagement metrics, topics of interest, overall sentiment, notable quotes |

**Required sections in every summary:**
1. Session metadata (date, duration, slides covered)
2. User profile inference (role, sophistication, focus areas)
3. Topics discussed with slide references
4. All questions asked with answers given (flag incomplete answers)
5. Follow-up required (deferred questions, material requests, callbacks)
6. Sentiment and interest signals
7. Notable moments (strong reactions, repeated concerns, security probes)

**Constraints:** Under 400 words. Dense and actionable. Specific numbers and quotes over vague summaries.

---

### P. Data Architecture (What Domain Data to Extract)

The skill determines what supplemental data files to create based on the presentation content. These are JSON files that give the avatar precise data for Q&A beyond what's in the talking points.

| Use Case | Typical Data Files | Content |
|----------|-------------------|---------|
| **Earnings** | financials.json, guidance.json, historical_quarters.json, acquisitions.json, business_context.json | Exact revenue/EBITDA/margin figures, guidance ranges, 5-8 quarter history, deal terms, market position |
| **Sales** | product_comparison.json, pricing_tiers.json, customer_stories.json, competitive.json | Feature matrices, tier structures, case study metrics, win/loss data |
| **Training** | module_structure.json, assessments.json, prerequisites.json | Learning objectives, quiz answers, dependency trees |
| **Report** | findings.json, methodology.json, appendix_data.json | Key metrics, source attribution, detailed supporting data |

**Skill advisory:** The skill extracts these from the PDF + website analysis. For earnings presentations, it should identify every financial figure on every slide and structure them into queryable JSON. The avatar's Q&A quality depends entirely on the completeness of this data.

**Critical rule:** Data files contain EXACT figures from the source material. Never round, estimate, or infer. If a number appears as "$44.6M" on a slide, it appears as `"$44.6M"` in the JSON. If a figure is not explicitly stated in the source material, it is not included.

---

### Q. GenUI Overlays (Contact Forms, Videos, Links)

The avatar can trigger visual overlays during conversation via specific phrases. The skill must configure which overlays are available and document them in the KNOWLEDGE_BASE_PROMPT.

| Overlay Type | Trigger | Configuration |
|-------------|---------|---------------|
| **Contact Form** | Avatar says "showContactForm" GenUI command | Fields, labels, team name, privacy note |
| **Video Embed** | Avatar triggers video overlay | Video entry ID, title, autoplay behavior |
| **Link Card** | Avatar shares a URL | URL, title, description, icon, open behavior |

**Skill advisory:** The KNOWLEDGE_BASE_PROMPT must document available overlays and when to use them. For example: "On slide 3, if the user wants the video, trigger the Link overlay with the video URL."

---

### R. Keyboard Shortcuts & Accessibility

The presentation supports full keyboard navigation. These are not configurable per project (they're in app.js), but the skill must ensure the welcome screen instructions reference them:

| Key | Action |
|-----|--------|
| ← / → | Previous / Next slide |
| C | Toggle closed captions |
| Tab | Navigate controls |
| Enter | Submit chat / Activate focused button |
| Escape | Close modals / Debug panel |

The skill ensures:
- Welcome screen step mentions "press C for captions"
- All interactive elements have aria-labels
- Skip link is present (`<a href="#presentation-container" class="skip-link">`)
- Caption container has `aria-live="polite"`
- Progress bar has proper `role="progressbar"` attributes

---

### S. Version Management & Cache Busting

Every deployment must have a unique version. The skill enforces this:

```json
{
  "version": "1.0.0"
}
```

**Rules (non-negotiable):**
1. Version appears in project.json
2. Version is injected into app.js `APP_VERSION` constant by bundle.js
3. Version is appended to SDK script URL as `?v=X.Y.Z` for cache busting
4. Version is displayed in the UI (small opacity text in welcome overlay)
5. deploy.js uses version for short link cache busting
6. **NEVER deploy the same version with different code** — always bump before deploy

The skill auto-bumps patch version on every deploy. FDE bumps minor/major for significant changes.

---

### T. How the Skill Guides the FDE (Interaction Model)

The skill is not a passive generator. It is an expert advisor that:

1. **Asks smart questions** — "Is this an internal demo or public-facing? That changes the disclaimer requirements and robots meta."
2. **Explains trade-offs** — "I can make autoplay faster (8s) for higher energy, but your financial slides have 6+ metrics — users might miss data. I recommend 15s for those sections."
3. **Catches problems early** — "I notice slide 14 references a competitor by name. For an IR presentation, the avatar should never speculate on competitors. I'll add narrator_guidance to deflect competitor questions to IR."
4. **Offers domain expertise** — "For SEC compliance, every financial slide's narrator_guidance should instruct the avatar to qualify forward-looking statements and note non-GAAP measures require reconciliation references."
5. **Suggests iterations** — "After reviewing the generated slides, would you like me to: make the talking points more conversational? Add more Q&A examples to the knowledge base? Adjust the contact collection timing?"
6. **Validates exhaustively** — Before bundling, the skill walks through every contract requirement and reports violations with specific file:line references and fixes.

The skill's goal is: **FDE provides the deck and URL, walks away with a working production deployment in under 2 hours, confident that compliance, branding, and quality are all handled.**

---

## OPERATIONAL GUARANTEES: Parallelism, Error Prevention, Input Validation, and Studio Configuration

These four mechanisms ensure the skill operates efficiently, correctly, and completely — regardless of deck size or FDE expertise level.

---

### U. Parallel Sub-Agent Architecture

The skill uses Claude Code's Agent tool to parallelize expensive work. This is not optional — for any deck over 20 pages, serial processing would blow through context limits or take unreasonably long.

#### When to Parallelize

| Phase | What Runs in Parallel | Why |
|-------|----------------------|-----|
| PDF Analysis | Pages split into batches of 10-15, each analyzed by a separate sub-agent | A 60-page deck analyzed serially consumes 10-15 minutes; in parallel it's 2-3 minutes |
| Slide JSON Generation | After structure is determined, groups of 5-8 slides generated simultaneously | Each slide is independent — no cross-slide dependencies in talking_points |
| TTS Map + Knowledge Base | TTS pronunciation extraction runs alongside knowledge base drafting | These read from the same analysis but produce independent outputs |
| Validation | Schema validation, navigation contract check, and TTS collision check run simultaneously | Each checks a different concern with no shared mutable state |

#### Parallel PDF Analysis Protocol

The skill splits PDF analysis into parallel sub-agents with this exact instruction template:

```
For pages [N] through [M] of the customer's deck:
1. Identify which pages are unique slides vs. progressive-reveal duplicates
   (same layout/title with additive content = one logical slide, use the FINAL page)
2. For each unique slide, extract:
   - Title (exact text from slide header)
   - Category: financial | legal | strategy | product | overview | section_divider
   - Key data points (numbers, metrics, names — exact as shown)
   - Whether it's a section divider (no content, just a title)
3. Output JSON array of slide descriptors. Do NOT generate talking_points yet.
```

Each batch sub-agent receives ONLY its page range (no cross-batch context — this prevents anchoring). After all batches return, the skill's main thread:
1. Merges results in page order
2. Resolves progressive-reveal sequences that span batch boundaries
3. Assigns contiguous slide numbers (1...N)
4. Generates a unified slide map for Phase 2

#### Parallel Slide JSON Generation

Once the slide map exists (slide N = PDF pages X-Y, title, category), the skill spawns generation sub-agents:

```
Generate slide JSONs for slides [A] through [B].
For each slide, you have:
- slide number, title, category, source pages, extracted data points
- The use case is: [sales_pitch | earnings_report | training | report_review]
- Tone: [formal-precise | conversational-energetic | patient-instructional | analytical-measured]

Generate:
- talking_points: 2-4 bullet points, conversational, cite exact data
- narrator_guidance: how to present (emphasis, what NOT to say, compliance notes)
- slide_content: key_metrics object + text array + footnotes

Output JSON array. Do NOT number slides yourself — use the numbers provided.
```

#### Guardrails for Parallel Execution

1. **No sub-agent sees another's output** — prevents convergence/anchoring
2. **Main thread always reconciles** — merge, re-number, validate after join
3. **Batch boundaries are conservative** — progressive reveals are detected FIRST (serial quick scan), then clean splits are made
4. **Failure isolation** — if one batch fails, only that batch retries; successful batches are cached

---

### V. Deterministic Error Prevention (Common Mistakes Registry)

The skill maintains a hardcoded registry of known failure modes — things that have broken demos in the past. Before generating each artifact, it checks against this list. These are not AI judgment calls — they are mechanical checks.

#### Navigation Contract Violations (Demo-Breaking)

| Mistake | Detection | Prevention |
|---------|-----------|------------|
| Navigation phrase not exact English | Regex `^(Navigating to slide \d+\.|Moving to the next slide\.|Going back to the previous slide\.|Ending presentation now\.)$` | Knowledge base includes EXACT phrases with the instruction "NEVER paraphrase, translate, or vary these — navigation phrase MUST be FIRST word of response" |
| Slide count mismatch | count(data/slides/*.json) != total_slides in KNOWLEDGE_BASE_PROMPT slide directory | validate.js checks, skill also cross-references during generation |
| Slide numbers have gaps | [1, 2, 4, 5] — missing 3 | Sequential integer check in validate.js |
| Navigation to slide 0 or > N | Knowledge base slide directory lists invalid slide | Skill bounds-checks slide directory against actual slide count |

#### TTS Pronunciation Collisions (Caption Corruption)

| Mistake | Detection | Prevention |
|---------|-----------|------------|
| TTS phonetic key matches a navigation command word | "slide" → "slyde" in TTS map | TTS map generation explicitly excludes: "slide", "navigating", "moving", "next", "previous", "back", "ending", "presentation", "show" |
| Phonetic key is substring of another | "AI" → "A I" would corrupt "EBITDA" → "eebeetdaa" | Longest-match ordering enforced; skill warns if any key is a substring of another key |
| Same display value for different phonetics | Two entries both display as "revenue" | Dedup check in validate.js |

#### DPP Schema Errors (Avatar Gets Wrong Data)

| Mistake | Detection | Prevention |
|---------|-----------|------------|
| Missing `v: "3"` in DPP | Schema validation | Hardcoded in app.js — not a generation concern, but knowledge base must reference v3 |
| Category not from enum | Category "technical" instead of "product" | validate.js checks against `["financial", "legal", "strategy", "product", "overview", "section_divider"]` |
| talking_points empty array | `[]` in slide JSON | validate.js requires min 1, max 4 |
| narrator_guidance read verbatim | Avatar speaks narrator_guidance text directly | OBEY_RULES + KNOWLEDGE_BASE_PROMPT both state "narrator_guidance is HOW to present, not WHAT to say — never read it verbatim" |

#### Knowledge Base Structural Failures (Avatar Misbehavior)

| Mistake | Detection | Prevention |
|---------|-----------|------------|
| No slide directory in KNOWLEDGE_BASE | Avatar can't navigate by topic | Skill validates KNOWLEDGE_BASE has a section containing every slide number and title |
| No opening script for new users | Avatar starts with random content | Template requires both "memory present" and "memory absent" openings |
| No "Ending presentation now." instructions | Session never terminates cleanly | Skill validates KNOWLEDGE_BASE contains the exact termination phrase |
| Missing `current_slide` check before nav | Avatar says "Navigating to slide N" when already on N | OBEY_RULES handles this, but skill validates it's present |
| Slide directory count != slide JSON count | Avatar's map disagrees with reality | Cross-validation in Phase 3 |

#### Compliance Traps (Legal/Reputational Risk)

| Mistake | Detection | Prevention |
|---------|-----------|------------|
| Financial slide without disclaimer_required | Slide has numbers but category isn't "financial" | Skill flags any slide with $ amounts or % metrics for review |
| Forward-looking language without qualifier | "Revenue will be..." without "we expect" | narrator_guidance template for financial slides always includes "qualify forward-looking statements" |
| Competitor mentioned in talking_points | Avatar may editorialize about competitors | Skill scans for known competitor names, adds "defer competitor questions" to narrator_guidance |
| Fabricated data (hallucinated numbers) | Number in talking_points not in slide_content | Cross-reference check: every metric cited in talking_points must exist in slide_content.key_metrics |

#### The Validation Chain (Order Matters)

```
1. JSON parse check (all files)           → catches syntax errors
2. Required field check (per schema)      → catches omissions  
3. Contiguous numbering check             → catches gaps/duplicates
4. Category enum check                    → catches invalid categories
5. TTS collision check                    → catches pronunciation conflicts
6. Navigation phrase contract check       → catches non-exact phrases
7. Cross-reference check (KB ↔ slides)    → catches mismatches
8. Talking points ↔ slide_content check   → catches hallucinated data
9. bundle.js dry run                      → catches template errors
```

Every check produces a specific error message with file path, line number, field name, actual value, and expected value. No generic "validation failed" — always actionable.

---

### W. Input Completeness Gate (Required Data Checklist)

The skill REFUSES to proceed past Phase 1 until all required inputs are confirmed. This is a hard gate, not a suggestion. The skill cannot generate correct output without these.

#### Required Inputs (Non-Negotiable)

| Input | Why Required | How Skill Asks |
|-------|-------------|----------------|
| **PDF deck** (file path or URL) | Source material for all slide content | "Where's the deck? Local path or URL." |
| **Avatar URL** (or clientId + flowId separately) | Needed for project.json avatar config and testing | "What's the avatar URL? I need the clientId and flowId." |
| **Use case** | Determines template, compliance level, tone, timing, contact strategy | "What type of presentation? earnings_report / sales_pitch / training / report_review" |
| **Kaltura Partner ID** | Required for deployment | "What's the PID? (check your .env or KMC dashboard)" |
| **Kaltura Admin Secret** | Required for deployment (stored in .env, never in code) | "I'll need the admin secret for deploy. Add it to .env — I won't store it in any generated file." |

#### Conditionally Required (Skill Asks Based on Context)

| Input | Required When | How Skill Asks |
|-------|--------------|----------------|
| **Customer website URL** | Always (for branding extraction) — but can be skipped with manual branding | "What's the customer's website? I'll extract brand colors and logo. Or provide: primary color hex, logo file, company name." |
| **Additional data files** | When deck references data not on slides (detailed financials, product specs) | "Your deck references quarterly results but I only see summary slides. Do you have a supplementary data file (10-Q extract, CSV, etc.)?" |
| **Compliance requirements** | For regulated industries (finance, healthcare) | "Is this presentation for a regulated industry? Any required legal language from the customer's legal team?" |
| **PDF hosted URL** | For the header link (users click to view full PDF) | "Where will this PDF be hosted? I need a public URL for the header link. If you want, I can upload it to Kaltura as a document entry." |
| **Data entry ID** | For deployment target | "What Kaltura data entry should I deploy to? Existing entry ID, or should I create a new one?" |
| **Contact team info** | If contact collection is enabled | "Who should contacts go to? Team name (e.g., 'AWS Solutions Architecture team') and what follow-up looks like." |

#### The Gate Mechanism

```
FDE: /avatar-deck

Skill: "I need the following to get started:

  ✓ or ✗ for each:
  [ ] PDF deck (path or URL)
  [ ] Avatar URL (e.g., https://meet.avatar.us.kaltura.ai/.../talk-to-agent?...&flow_id=agent-XX)
  [ ] Use case (earnings_report | sales_pitch | training | report_review)
  [ ] Kaltura Partner ID
  [ ] Admin Secret (for .env — I won't store this in code)
  
  What do you have so far?"
```

After the FDE provides inputs, the skill:
1. Parses the avatar URL → extracts clientId and flowId
2. Validates PID looks correct (numeric, reasonable length)
3. Confirms the PDF is readable (path exists / URL resolves)
4. Confirms use case is a valid enum value
5. Reports what it has and what's still missing

**If any required input is missing:** "I still need [X] before I can proceed. Without it, [consequence]. Can you provide it, or should we work around it?" — and explains the specific workaround if one exists.

**The skill never generates artifacts with placeholder values.** If it doesn't have the clientId, it doesn't write `"clientId": "TODO"` — it asks for it or fails clearly.

#### Progressive Disclosure for Optional Inputs

The skill doesn't front-load all questions. It asks for essentials first, then reveals conditionally required inputs as it discovers them during analysis:

1. **Before analysis:** PDF, avatar URL, use case, PID, secret
2. **During analysis:** "I notice your deck has 40+ product names — should I generate a comprehensive TTS pronunciation table? This adds ~5 minutes but prevents garbled captions."
3. **During generation:** "Your slides reference customer logos (Uber, Intuit, Genesys). Should the avatar discuss ALL customers, or should some be restricted?"
4. **Before deploy:** "You haven't provided a hosted PDF URL. Should I upload to Kaltura, or skip the header PDF link?"

---

### X. eSelf Avatar Studio Configuration Guide

The skill must guide the FDE through configuring the avatar in the eSelf Avatar Studio. The studio has specific fields that must align with the generated project files. Here's the complete mapping:

#### Studio Fields → Project Artifacts Mapping

| Studio Section | Studio Field | What to Put There | Generated By |
|---------------|-------------|-------------------|--------------|
| **Knowledge Base** | Main textarea | Full contents of `studio/KNOWLEDGE_BASE_PROMPT.md` | Skill generates this — the avatar's complete brain |
| **Conversation Goal** | Goal textarea | Contents of `studio/AVATAR_GOALS.md` — 6 numbered goals | Skill generates per use case template |
| **Obey Rules** | Rules textarea | Contents of `studio/OBEY_RULES.md` — LOCKED, same for every project | Inherited from toolkit, never modified |
| **Reply Format** | Format textarea | Contents of `studio/REPLY_FORMAT.md` — TTS pronunciation table + navigation commands | Skill generates domain-specific TTS entries |
| **Set Goals** | Collect email | ✓ Checked if `contact.enabled: true` | project.json config |
| **Set Goals** | Collect phone number | ✓ Checked if contact includes phone field | project.json config |
| **Set Goals** | Collect user id | ✓ Checked (always — for session tracking) | Always enabled |
| **Dynamic Page Prompt** | Enable + Mode | ✓ Enabled, mode = **"Custom Prompt (process through LLM)"** with radio on "Skip (use raw browser content)" | The DPP is injected by app.js via SDK postMessage — studio must accept it raw |
| **Experimental VLM** | Checkbox | ✓ Checked — enables screen capture visual understanding | Required for avatar to SEE slides |
| **Screenshot Analysis Prompt** | Prompt textarea | Customized for the deck type — describes what to look for in screenshots | Skill generates based on deck content type |
| **Screenshot Analysis Model** | Provider + Model | Vertex AI / Gemini 3.1 Flash Lite (or current fast VLM) | Recommended default |
| **Select LLM Models** | Conversation Model | Vertex AI / Gemini 2.5 Flash (or current best for conversation) | Recommended for latency/quality balance |
| **Select LLM Models** | Max Tokens | 17000 (conversation) / 8192 (API/summaries) | Tuned for deck length |
| **Use Speech In NLU** | Checkbox | ✓ Checked — enables voice input | Required for voice interaction |
| **Key Terms for Speech Recognition** | Terms list | Domain-specific terms (company names, product names, financial terms) | Skill generates from deck analysis — up to 10 most important terms |
| **Enable Interruptions** | Checkbox | ✓ Checked — allows user to interrupt avatar | Standard for all projects |
| **Enable Pause and Mute** | Checkbox | ✓ Checked — user can pause/mute conversation | Standard for all projects |
| **Intonation Turn Detection** | Enable + Timeout | ✓ Enabled, 1500ms timeout | Standard — better end-of-speech detection |
| **Is Finished LLM** | Enable + Prompts | ✓ Enabled with standard isFinished system/user prompts | Standard configuration |
| **Enforce LLM Response Format** | Enable + Schema | ✓ Enabled with visual_content_response JSON schema | Required for GenUI (link overlays, contact forms) |
| **Generative UI** | Enable + Media Library | ✓ Enabled with Link items configured | Skill generates link entries per project needs |
| **Conversation Length** | Slider | 10:00 (10 minutes) for standard presentations | Adjust per deck length |
| **Summary Prompt** | Prompt textarea | Contents of `studio/SUMMARY_PROMPT.md` or "Store as is the entire transcript without any filters." | Skill generates or uses default |
| **Loop Mode** | Toggle | OFF — one session per connection | Standard |
| **Web Search** | Checkbox | Unchecked — avatar should NOT search the web | Keep avatar grounded in provided data only |
| **API Search** | Checkbox | Unchecked — no external API calls | Keep avatar grounded in provided data only |
| **Final URL** | URL field | Leave empty (defaults to eself.ai) or set to customer's post-session page | FDE decides |
| **Permanent Links** | Link list | The playground link is auto-generated; production link added after deploy | After first deploy |
| **Exclude Global Rules** | Multi-select | Exclude "Abbreviation" and "\n" rules (these conflict with our custom TTS and formatting) | Always exclude these two |
| **Show YouTube Video** | Checkbox | Unchecked unless deck has video content | FDE decides |
| **TTS V2** | Checkbox | Unchecked (standard TTS unless voice quality issues) | Default off |
| **Allow Restart from Middle** | Checkbox | Unchecked (session memory handles resumption) | Standard |
| **Show Conversation Transcript** | Checkbox | Unchecked (captions handle this; transcript clutters UI) | Standard |
| **Long Term Memory** | Checkbox | Unchecked — app.js handles memory via localStorage + DPP injection | CRITICAL: the app manages its own memory system |
| **Dynamic Opening Phrase** | Checkbox | Unchecked — KNOWLEDGE_BASE_PROMPT handles the opening script | CRITICAL: app.js sends "hi, start session!" as first DPP trigger |
| **Initial HTML** | Checkbox | Unchecked — app.js handles the full UI | CRITICAL: the presentation IS the HTML page |
| **External Functions** | Section | Empty — no external function calls needed | Standard |
| **Client Events** | Section | Empty — no custom client events | Standard |
| **Add External Resources** | PDFs/URLs | Upload the deck PDF here for RAG fallback (optional) | FDE can add the deck PDF for enhanced Q&A |

#### Studio Screenshot Analysis Prompt (Template)

The skill generates this based on deck content type:

**For financial/earnings decks:**
```
You are viewing a slide from [Company]'s [Quarter Year] investor presentation. Analyze the screenshot with precision:
LAYOUT: Identify the slide title, section headers, and overall structure (table, chart, diagram, or text-based).
TABLES: If a table is present, describe the column headers (left to right) and row labels (top to bottom). Identify which column or row is visually highlighted and by what color/style.
CHARTS: Identify chart type, axes, data series, and any annotated values or growth percentages shown on the chart.
HIGHLIGHTS: Describe any visual emphasis — colored borders, shaded cells, bold text, arrows, or callout boxes. State precisely WHAT element is highlighted.
COLOR CODING: Note the color scheme used.
Be specific about spatial position: "the rightmost column" not "a column"; "the bottom row" not "a row".
Up to 300 words.
```

**For sales/product decks:**
```
You are viewing a slide from [Company]'s [Product/Platform] technical presentation. Analyze the screenshot:
LAYOUT: Identify slide title, architecture diagrams, product screenshots, or comparison tables.
DIAGRAMS: Describe the flow — boxes, arrows, layers, connections. Name each component visible.
PRODUCT UI: If showing a product interface, describe what's being demonstrated.
DATA POINTS: Extract any visible numbers, percentages, customer names, or feature lists.
HIERARCHY: Note visual layering — what's the primary message vs. supporting detail?
Be specific about what's prominent vs. secondary.
Up to 200 words.
```

#### Studio Configuration Checklist (FDE Handoff)

After generating all project files, the skill produces a step-by-step checklist for the FDE:

```markdown
## Avatar Studio Configuration Checklist

### 1. Create or Clone the Flow
- [ ] In eSelf Avatar Studio, create a new flow (or clone an existing presentation flow)
- [ ] Note the flow_id (e.g., "agent-XX") — must match project.json

### 2. Paste Generated Content
- [ ] Knowledge Base → paste contents of `studio/KNOWLEDGE_BASE_PROMPT.md`
- [ ] Conversation Goal → paste contents of `studio/AVATAR_GOALS.md`  
- [ ] Obey Rules → paste contents of `studio/OBEY_RULES.md`
- [ ] Reply Format → paste contents of `studio/REPLY_FORMAT.md`
- [ ] Summary Prompt → paste contents of `studio/SUMMARY_PROMPT.md` (or use default "Store as is the entire transcript without any filters.")
- [ ] Screenshot Analysis Prompt → paste the generated VLM prompt

### 3. Enable Required Features
- [ ] ✓ Use Speech In NLU
- [ ] ✓ Experimental VLM
- [ ] ✓ Add Current Time to Prompt
- [ ] ✓ Enable Interruptions
- [ ] ✓ Enable Pause and Mute
- [ ] ✓ Intonation Turn Detection (1500ms)
- [ ] ✓ Is Finished LLM (with standard prompts)
- [ ] ✓ Enforce LLM Response Format (visual_content_response schema)
- [ ] ✓ Generative UI (with configured link items)
- [ ] ✓ Dynamic Page Prompt → mode: "Skip (use raw browser content)"

### 4. Disable Features That Conflict
- [ ] ✗ Loop Mode (OFF)
- [ ] ✗ Web Search (OFF — avatar stays grounded)
- [ ] ✗ API Search (OFF)
- [ ] ✗ Long Term Memory (OFF — app.js handles this)
- [ ] ✗ Dynamic Opening Phrase (OFF — KB handles opening)
- [ ] ✗ Initial HTML (OFF — app.js is the page)
- [ ] ✗ Allow Restart from Middle (OFF)
- [ ] ✗ Show Conversation Transcript (OFF)
- [ ] ✗ TTS V2 (OFF unless needed)
- [ ] ✗ Show YouTube Video (OFF unless deck has video)

### 5. Configure Models
- [ ] Conversation Model: Vertex AI / Gemini 2.5 Flash / Max Tokens: 17000
- [ ] API Model: Vertex AI / Gemini 2.5 Flash / Max Tokens: 8192
- [ ] Screenshot Model: Vertex AI / Gemini 3.1 Flash Lite
- [ ] Web Search Model: Vertex AI / Gemini 3.1 Flash Lite (if enabled)
- [ ] IsFinished Model: Vertex AI / Gemini 2.5 Flash

### 6. Configure Speech Recognition
- [ ] Key Terms: Add top 10 domain terms (company name, product names, key financial terms)
- [ ] Intermediate Transcription Strategy: "Confidence only – send only if confidence > 0.50"

### 7. Configure Generative UI
- [ ] Add Link items to Media Library (per project needs):
  - Link 1: [Primary CTA URL] — "[CTA text]" — when_to_use: "[trigger description]"
  - Link 2: [Secondary resource] — "[label]" — when_to_use: "[trigger description]"
  - (Add more as needed per project — IR page, product docs, demo request form, etc.)

### 8. Configure Goals
- [ ] Collect email: ✓
- [ ] Collect phone number: ✓ (or ✗ for non-sales)
- [ ] Collect user id: ✓

### 9. Exclude Conflicting Global Rules
- [ ] Exclude: "Abbreviation" (we handle TTS ourselves)
- [ ] Exclude: "\n" (we need multiline content in DPP)

### 10. Set Conversation Length
- [ ] 10:00 for standard decks (adjust for longer presentations)

### 11. Save and Test
- [ ] Save the flow in Avatar Studio
- [ ] Test via playground link before deploying the presentation
- [ ] Verify: avatar speaks opening script, navigation works, TTS pronunciation is clean
```

#### Critical Studio Misconfigurations (What Breaks Demos)

| Misconfiguration | Symptom | Fix |
|-----------------|---------|-----|
| Long Term Memory ON | Avatar uses eSelf's memory instead of app.js localStorage memory → contradicts session state | Turn OFF — app.js manages memory via DPP `memory` field |
| Dynamic Opening Phrase ON | Avatar generates a random greeting instead of following KB opening script | Turn OFF — KB defines exact opening behavior based on DPP memory field |
| Dynamic Page Prompt mode = "Identify" or "URL" | DPP content not added to conversation → avatar has no slide data | Set to "Skip (use raw browser content)" — app.js sends pre-formatted DPP |
| Web Search ON | Avatar searches the internet mid-conversation → hallucinated or outdated data | Turn OFF — all data comes from DPP |
| Exclude Global Rules missing "Abbreviation" | Platform's abbreviation expansion conflicts with our TTS pronunciation table | Always exclude "Abbreviation" |
| Exclude Global Rules missing "\n" | Platform strips newlines from DPP content → JSON parsing breaks | Always exclude "\n" |
| VLM OFF | Avatar cannot see slides → can't answer "what color is highlighted?" questions | Turn ON — required for screen capture |
| Enforce Response Format OFF | Avatar output is plain text → GenUI link/contact overlays don't render | Turn ON with visual_content_response schema |
| Max Tokens too low (< 8000) | Avatar truncates mid-sentence on complex slides | Set conversation to 17000, API to 8192 |

#### The JSON Response Schema (For Enforce LLM Response Format)

Every project uses this exact schema — it enables GenUI overlays:

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "visual_content_response",
    "strict": true,
    "schema": {
      "type": "object",
      "description": "Return natural-language 'content' and a 'visual' payload.",
      "properties": {
        "content": {
          "type": "string",
          "description": "Natural-language response. Do not include code blocks or tables."
        },
        "visual": {
          "type": "object",
          "description": "Visual payload to accompany the content.",
          "properties": {
            "type": {
              "type": "string",
              "enum": ["link", "none"],
              "description": "Type of visual to render"
            },
            "data": {
              "type": "string",
              "description": "If 'link' → ID number as a string only. If 'none' → empty string."
            }
          },
          "required": ["type", "data"],
          "additionalProperties": false
        }
      },
      "required": ["content", "visual"],
      "additionalProperties": false
    }
  }
}
```

**This schema NEVER changes per project.** The `visual.data` value references the Media Library item ID (1, 2, 3...) configured in the Generative UI section.

---

### Y. Skill Execution Flow (Complete Orchestration)

Putting it all together — this is the exact sequence from `/avatar-deck` invocation to live deployment:

```
PHASE 0: INPUT GATE
├── Collect: PDF path, avatar URL, use case, PID, secret
├── Parse avatar URL → extract clientId, flowId
├── Validate all required inputs present
├── HARD STOP if missing — explain why, ask for it
└── Display checklist with ✓/✗ status

PHASE 1: ANALYSIS (Parallel)
├── [Main Thread] Quick serial scan for progressive-reveal sequences
├── [Sub-Agent 1..4] PDF batch analysis (pages split into ~15-page batches)
├── [Sub-Agent 5] Website brand extraction (colors, logo, context)
├── [Main Thread] Merge batch results, resolve cross-boundary reveals
├── [Main Thread] Assign contiguous slide numbers
├── [Main Thread] Determine slide map: slide N = {pages, title, category, data}
└── [Main Thread] Present findings to FDE:
    ├── "X pages collapsed to Y slides (Z progressive-reveal sequences detected)"
    ├── "Detected: A product slides, B strategy slides, C section dividers"
    ├── "Found N acronyms/terms requiring TTS pronunciation"
    └── "Any adjustments before I generate?"

PHASE 2: GENERATION (Parallel)
├── [Sub-Agent A] Slide JSONs batch 1 (slides 1-N/3)
├── [Sub-Agent B] Slide JSONs batch 2 (slides N/3+1 - 2N/3)
├── [Sub-Agent C] Slide JSONs batch 3 (slides 2N/3+1 - N)
├── [Sub-Agent D] KNOWLEDGE_BASE_PROMPT.md (uses slide map + company context)
├── [Sub-Agent E] REPLY_FORMAT.md (TTS map from detected terms)
├── [Main Thread after join] AVATAR_GOALS.md (template + use case)
├── [Main Thread] project.json (all config assembled)
├── [Main Thread] SUMMARY_PROMPT.md (template)
├── [Main Thread] Copy OBEY_RULES.md (locked, never generated)
└── [Main Thread] Write all files to project directory

PHASE 3: VALIDATION (Parallel)
├── [Check 1] JSON schema validation (all files parse, required fields)
├── [Check 2] Navigation contract validation (exact phrases present)
├── [Check 3] TTS collision detection (no conflicts with nav commands)
├── [Check 4] Cross-reference validation (KB slide directory ↔ actual slides)
├── [Check 5] Talking points ↔ slide_content data integrity
├── [Main Thread] Report results:
│   ├── PASS: "All 9 validation checks passed. Ready to bundle."
│   └── FAIL: "[N] issues found:" + specific errors with fix instructions
└── [If FAIL] Fix and re-validate (targeted — only re-run failed checks)

PHASE 4: REVIEW + STUDIO GUIDE
├── Present summary to FDE (slide count, categories, recommendations)
├── Generate Studio Configuration Checklist
├── Walk FDE through what to paste where:
│   ├── "Copy KNOWLEDGE_BASE_PROMPT.md into the Knowledge Base field"
│   ├── "Set Dynamic Page Prompt to 'Skip' mode"
│   ├── "Disable Long Term Memory and Dynamic Opening Phrase"
│   └── (Full checklist per Section X above)
├── FDE configures studio (may ask questions — skill answers with exact field names)
└── FDE confirms studio is configured

PHASE 5: BUNDLE + DEPLOY
├── Bump version in project.json
├── Run bundle.js → produces dist.html
├── Run deploy.js → uploads to Kaltura CDN
├── Return live URL + short link
└── Suggest: "Test it now — verify opening, navigation, TTS, and contact collection"
```

#### Time Budget (Target: Under 2 Hours Total)

| Phase | Time | Notes |
|-------|------|-------|
| Phase 0: Input Gate | 5 min | FDE provides known info |
| Phase 1: Analysis | 10-15 min | Parallel PDF analysis + brand extraction |
| Phase 2: Generation | 15-20 min | Parallel slide + studio content generation |
| Phase 3: Validation | 2-3 min | Automated checks |
| Phase 4: Review + Studio | 30-45 min | FDE reviews, configures studio, iterates |
| Phase 5: Bundle + Deploy | 5 min | Automated |
| **Total** | **~70-90 min** | **Well under 2-hour target** |

---

## DETERMINISTIC TOOLS AND HOOKS

The skill's reliability comes from three complementary layers:

1. **Claude-as-Validator (Hooks)** — Agent and prompt-based hooks that use Claude itself to verify correctness. Zero runtime dependencies — runs inside Claude Code with no external tools.
2. **Shell Scripts (Tools)** — Minimal POSIX shell for purely mechanical operations (file concatenation, version bumping). Uses only `curl`, `cat`, `sed`, `grep` — universally available.
3. **Claude-as-Executor (Instructions)** — For API calls (Kaltura deploy, KS generation), the skill instructs Claude to execute `curl` commands directly. Claude reads JSON responses natively — it IS a JSON parser.

The philosophy: **AI does creative work AND semantic validation (it understands meaning). Shell scripts do mechanical text manipulation (concatenation, string replacement). API interaction is done directly by Claude via curl — no wrapper scripts needed because Claude can read JSON natively.**

#### Why No Runtime Dependencies (Not Node, Not Python, Not jq)

The deciding factor is **zero assumptions about the FDE's machine**.

Claude Code CLI can be installed via native installer (`curl | bash`), Homebrew cask, WinGet, or as a desktop app. None of these guarantee Node.js is present. The desktop app explicitly states: "You don't need to install Node.js."

| Concern | Our Approach | Node.js Scripts | Python Scripts |
|---------|-------------|-----------------|----------------|
| **Runtime dependency** | NONE — shell + Claude itself | Requires Node on PATH | Requires Python on PATH |
| **JSON parsing** | Claude reads JSON natively (it's an LLM) | `JSON.parse` | `import json` |
| **JSON construction** | Claude writes JSON natively | `JSON.stringify` | `json.dumps` |
| **API calls** | `curl` (present on all platforms) | `https` module | `requests` (pip dependency) |
| **Cross-platform** | Yes (shell + curl universal) | Yes if Node present | Yes if Python present |
| **Semantic validation** | Agent/prompt hooks (Claude reasons about correctness) | Code can only check syntax | Code can only check syntax |
| **Install step** | None | `npm install` or Node version management | `pip install` or Python version management |
| **Maintenance** | Zero — skill instructions are the logic | Scripts rot: API changes break them | Same |

**Decision:** No scripts that parse JSON or call APIs. Claude handles those natively. Shell scripts ONLY for mechanical operations where Claude's involvement would be wasteful (concatenating 3 files, incrementing a version string). Claude Code hooks use `type: "agent"` and `type: "prompt"` — meaning Claude itself is the validator.

#### The Key Insight: Claude IS the Tool

Traditional approach: write a `deploy.js` script that calls Kaltura API, parses JSON response, handles errors.

Our approach: the skill's instructions tell Claude exactly what `curl` commands to run, in what order, and what to look for in the response. Claude executes `curl` via Bash tool, reads the JSON response directly (it's text — Claude understands it natively), and makes decisions.

This eliminates an entire class of problems:
- No "script works on my machine but not yours" (different Node versions, missing modules)
- No JSON escaping bugs (Python/Node generating JS strings with backticks)
- No stale scripts when Kaltura API evolves (update the instructions, not code)
- No error handling code (Claude handles errors by reasoning about them)

The only things that MUST be scripts are operations where determinism matters more than intelligence: concatenating files in exact order, incrementing a semver string, computing a SHA-256 hash.

---

### Z. Tools and Operations (Scriptless Architecture)

The skill uses three types of operations, each matched to the right execution model:

#### Category 1: Shell Scripts (Mechanical Text Operations)

These are the ONLY scripts in the toolkit. They do purely mechanical work where determinism matters more than intelligence. Each is a POSIX shell script (works on macOS, Linux, Windows via Git Bash).

##### `bundle.sh` — Deterministic HTML Bundling

**What it does:**
```
sh toolkit/scripts/bundle.sh ./aws-ai-l200/ ./toolkit/engine/
```

Produces `dist.html` by assembling engine + project content via file concatenation and `sed` substitution:

1. Reads `project.json` → injects into `app.js` as `const CONFIG = {...}` (literal file embed)
2. Reads all `data/slides/*.json` → concatenates into `const SLIDE_DATA = [...]`
3. Reads all `data/*.json` (domain data) → embeds as `const DOMAIN_DATA = {...}`
4. Templates `index.html` with branding values via `sed` replacement of `{{placeholder}}` tokens
5. Inlines `styles.css` with `primaryColor` CSS variable override
6. Keeps external CDN scripts as `<script src>` (pdf.js, socket.io, avatar SDK)
7. Atomic write: writes to temp file then `mv` (prevents serving corrupted file)

**Why it's a script:** Produces byte-identical output from identical inputs. No AI judgment involved. File concatenation + sed substitution is exactly what shell is built for.

**Why it's shell, not Node:** `cat`, `sed`, and `mv` are universally available. No runtime dependency. The operation is ~20 lines of shell — simple enough to audit by reading.

##### `version-bump.sh` — Semantic Version Management

**What it does:**
```
sh toolkit/scripts/version-bump.sh ./aws-ai-l200/ [patch|minor|major]
```

1. Reads current version from `project.json` via `grep`
2. Increments the specified component (default: patch) via arithmetic
3. Writes back via `sed` in-place replacement
4. Outputs: `1.0.2 → 1.0.3`

**Why it's a script:** Incrementing `1.0.2` → `1.0.3` is arithmetic + string replacement. Two lines of meaningful logic.

---

#### Category 2: Claude-as-Executor (API Calls via curl)

For Kaltura API interaction, the skill provides INSTRUCTIONS that Claude follows directly. No wrapper scripts. Claude executes curl commands and reads JSON responses natively.

##### Deploy Procedure (Skill Instructions)

The skill's SKILL.md contains this exact procedure. Claude follows it step by step:

```markdown
## Deploy to Kaltura

### Step 1: Load credentials
Read `.env` and extract: KALTURA_PARTNER_ID, KALTURA_ADMIN_SECRET, KALTURA_DATA_ENTRY_ID

### Step 2: Generate Kaltura Session (KS)
Execute:
  curl -s -X POST "https://www.kaltura.com/api_v3/service/session/action/start" \
    -d "partnerId=$KALTURA_PARTNER_ID" \
    -d "secret=$KALTURA_ADMIN_SECRET" \
    -d "type=2" \
    -d "privileges=disableentitlement"

Extract the KS value from the JSON response (it's in the top-level string response).

### Step 3: Upload dist.html to data entry
Execute:
  curl -s -X POST "https://www.kaltura.com/api_v3/service/data/action/update" \
    -F "ks=$KS" \
    -F "entryId=$KALTURA_DATA_ENTRY_ID" \
    -F "dataEntry[dataContent]=<dist.html"

Verify response contains "objectType":"KalturaDataEntry" and "status":2.

### Step 4: Report success
Print the deployment details:
  - Entry ID
  - Direct URL: https://cdn.kaltura.com/p/$PID/sp/0/raw/entry_id/$ENTRY_ID
  - Version deployed
```

**Why instructions, not a script:**
- Claude reads JSON responses natively — no `jq` or JSON parsing library needed
- Claude handles errors by reasoning ("got a 403 — the KS may have expired, regenerating")
- Claude can adapt if the API response format changes slightly
- No runtime dependency whatsoever — just `curl` (universal)
- The admin secret stays in `.env` and in shell variables — Claude knows not to write it to files (enforced by hooks)

**Why curl specifically:**
- Present on macOS (built-in), Linux (built-in), Windows 10+ (built-in)
- The Kaltura API accepts both form-encoded (`-d`) and multipart (`-F`) POST
- Responses are single JSON objects — Claude reads them as text

##### KS Generation for Other API Calls

Any time the skill needs Kaltura API access (creating a new data entry, uploading a PDF, checking entry status), it follows the same pattern: generate KS → curl the endpoint → read the JSON response. No scripts. Just instructions.

---

#### Category 3: Claude-as-Validator (Prompt and Agent Hooks)

All validation logic runs inside Claude Code hooks using `type: "prompt"` (single-turn judgment) or `type: "agent"` (multi-step verification with file reading). These require ZERO runtime dependencies — they use Claude itself as the validator.

This is covered in detail in Section AA below.

---

#### What Was Eliminated (And Why)

| Original Script | Eliminated Because | Replaced By |
|---|---|---|
| `new-project.js` | Directory scaffolding is trivial for Claude to do directly via Write tool | Skill instructions ("create these directories and files") |
| `validate.js` | 9 validation checks split between mechanical (hooks) and semantic (agent hook at Stop) | Agent hook + prompt hooks + shell `grep` checks |
| `deploy.js` | 5-step curl sequence that Claude executes directly + reads JSON responses natively | Skill instructions (see above) |
| `tts-audit.js` | Collision/coverage analysis is perfect for an agent hook (read files, reason about content) | Agent hook at Phase 3 |
| `studio-export.js` | Character counting + file concatenation — Claude does this naturally when reading files | Skill instructions ("read each studio file, count characters, warn if over 30K") |
| `version-bump.js` | Kept as shell (see above) — arithmetic is not Claude's job | `version-bump.sh` |
| `bundle.js` | Kept as shell (see above) — deterministic concatenation is not Claude's job | `bundle.sh` |

**The principle:** If the operation requires JUDGMENT or API interaction, Claude does it directly (it's better at both than any script). If the operation requires EXACT DETERMINISTIC output (byte-identical bundling, version arithmetic), a shell script does it.

---

### AA. Claude Code Hooks (Prompt and Agent Hooks)

Hooks are defined in the skill's YAML frontmatter and fire automatically on Claude Code lifecycle events. They enforce invariants that the AI might forget during a long session. The AI cannot bypass them — hooks operate outside the agent's control loop.

All hooks use Claude itself as the validator — either `type: "prompt"` (single-turn LLM judgment, no tools, ~30s) or `type: "agent"` (multi-turn subagent with Read/Grep/Glob/Bash access, up to 50 tool calls, ~60s). Zero runtime dependencies. No scripts. No Node.js. No Python.

#### Hook Architecture

Hooks live in the skill's YAML frontmatter, scoped to the skill's lifetime:

```yaml
---
name: avatar-deck
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: prompt
          prompt: |
            You are a security gate for avatar presentation files.
            Analyze this file write operation: $ARGUMENTS
            
            BLOCK (return {"ok": false, "reason": "..."}) if ANY of these are true:
            1. The file path matches **/OBEY_RULES* — this file is LOCKED
            2. The content contains a 32-character hex string (potential admin secret)
            3. The content contains any value that looks like a Kaltura partner ID in a credential context
            4. The file is a slide JSON and is missing required fields: slide, title, category, talking_points
            5. The file is a slide JSON and category is not one of: financial, strategic, operational, market, guidance
            6. The file is a slide JSON and talking_points is not an array of 1-4 items
            
            Otherwise return {"ok": true}
    - matcher: "Write|Edit"
      if: "Write(**/KNOWLEDGE_BASE_PROMPT*)|Edit(**/KNOWLEDGE_BASE_PROMPT*)"
      hooks:
        - type: prompt
          prompt: |
            You are a navigation phrase linter for avatar presentations.
            Analyze this knowledge base write: $ARGUMENTS
            
            Navigation commands are parsed by EXACT regex in app.js. Near-misses silently fail.
            
            Check the content for any string that LOOKS like a navigation command but doesn't
            EXACTLY match one of these formats (including the terminal period):
            - "Navigating to slide [N]."
            - "Moving to the next slide."
            - "Going back to the previous slide."
            
            Common errors to catch:
            - "Navigate to slide" (wrong tense — must be "Navigating")
            - "Go to the next slide" (wrong — must be "Moving to the next slide.")
            - Missing terminal period on any navigation phrase
            - Navigation phrases in non-English
            
            If you find near-misses, return {"ok": false, "reason": "Line contains near-miss navigation phrase: found '[X]', expected '[Y]'"}
            If all navigation phrases are correct (or none exist), return {"ok": true}
    - matcher: "Bash"
      if: "Bash(*deploy*)|Bash(*rm -rf*)|Bash(*rm -r*)"
      hooks:
        - type: prompt
          prompt: |
            You are a deploy safety gate for avatar presentations.
            Analyze this bash command: $ARGUMENTS
            
            BLOCK if ANY of these are true:
            1. Command contains "rm -rf" or "rm -r" targeting a project directory — return {"ok": false, "reason": "Destructive delete blocked. Use git to discard changes instead."}
            2. Command is a deploy operation (curl to kaltura.com/api_v3/service/data/action/update) — this is allowed ONLY if the skill has already run validation and version bump in this session.
            
            For deploy commands: return {"ok": false, "reason": "Deploy blocked — must run validation and bump version first."} unless you can see from context that these steps completed.
            Otherwise return {"ok": true}
  PostToolUse:
    - matcher: "Write|Edit"
      if: "Write(data/slides/*)|Edit(data/slides/*)"
      hooks:
        - type: agent
          prompt: |
            A slide file was just written or edited. Verify cross-reference integrity.
            $ARGUMENTS
            
            Check:
            1. List all files in data/slides/ — verify no duplicate slide numbers exist
            2. Read project.json — verify avatar.clientId and avatar.flowId are still present
            3. If KNOWLEDGE_BASE_PROMPT.md exists, count the slide directory entries and compare to actual slide file count
            
            Return {"ok": true} if everything is consistent.
            Return {"ok": false, "reason": "..."} with specifics if you find mismatches.
          timeout: 45
  Stop:
    - hooks:
        - type: agent
          prompt: |
            Before this session ends, perform a completeness check on the avatar presentation project.
            $ARGUMENTS
            
            Read the project files and verify:
            1. All slide JSONs in data/slides/ have sequential numbering (no gaps, no duplicates)
            2. Each slide's category is from the allowed enum: financial, strategic, operational, market, guidance
            3. KNOWLEDGE_BASE_PROMPT.md total character count is under 30,000
            4. Every navigation phrase in KNOWLEDGE_BASE_PROMPT.md exactly matches the regex contract (terminal period, correct tense)
            5. project.json version field exists and is valid semver
            6. No TODO or FIXME markers remain in any project file
            7. TTS pronunciation entries in studio/ cover all proper nouns from the slide content
            
            Return {"ok": true} if all checks pass.
            Return {"ok": false, "reason": "..."} listing each issue found. Be specific about file names and line numbers.
          timeout: 60
---
```

#### Hook 1: Schema Gate + Secret Guard + OBEY Lock (PreToolUse prompt hook on Write|Edit)

**Fires:** Before any Write or Edit tool call

**What it validates (single LLM judgment, no tools needed):**
- OBEY_RULES lock: path matches `**/OBEY_RULES*` → unconditional block
- Secret leakage: content contains 32-char hex strings, partner IDs in credential contexts, or patterns matching `.env` values → block
- Slide schema: required fields present, category from enum, talking_points is 1-4 item array → block if invalid
- Project.json: parses as JSON, required top-level keys present → block if invalid

**On block:** Returns `{"ok": false, "reason": "..."}`. Claude Code shows the reason, the write is denied, and the AI must fix content before retrying.

**Why a prompt hook (not an agent hook):** All these checks operate on the CONTENT BEING WRITTEN — which is already in `$ARGUMENTS`. No file reading needed. A single-turn prompt judgment (Haiku-speed, ~2s) is fast enough to run on every write without degrading the authoring flow.

**Why this exists at all:** Over a 28-slide generation session, the AI WILL produce at least one invalid category, one malformed array, or one accidentally-inlined secret. The hook makes each error impossible to persist to disk.

---

#### Hook 2: Navigation Phrase Lint (PreToolUse prompt hook on KB writes)

**Fires:** Before any Write or Edit to `**/KNOWLEDGE_BASE_PROMPT*` (filtered via `if` field)

**What it validates:** Navigation commands must EXACTLY match the regex contract in app.js:
- Correct tense: "Navigating" not "Navigate"
- Correct phrase: "Moving to the next slide." not "Go to the next slide."
- Terminal period required on all navigation phrases
- English only

**On block:** Returns the specific near-miss found and the expected correct phrase.

**Why this is separate from Hook 1:** The navigation lint requires domain-specific reasoning about natural language near-misses that's different from the mechanical JSON/secret checks. Keeping it as its own prompt hook means the prompt can be focused and precise. The `if` field ensures it only fires on KB writes (not on every file write), avoiding unnecessary LLM calls.

**Why this matters:** Navigation commands are parsed by regex. A single missing period = the slide doesn't change. This is the #1 cause of "worked in testing, broke live."

---

#### Hook 3: Deploy Safety Gate (PreToolUse prompt hook on Bash)

**Fires:** Before any Bash tool call containing deploy-related commands or destructive deletes (filtered via `if` field)

**What it validates:**
- `rm -rf` / `rm -r` targeting project directory → unconditional block
- Deploy commands (curl to Kaltura data/action/update) → block unless validation and version bump have been completed in this session

**On block:** Returns specific reason ("must validate first" or "destructive delete blocked").

**Why a prompt hook (not a command hook):** The prompt hook can reason about WHETHER the bash command is actually a deploy (even if the exact curl syntax varies) and WHETHER the session context suggests validation has passed. A rigid regex match would miss variations.

---

#### Hook 4: Cross-Reference Integrity (PostToolUse agent hook on slide writes)

**Fires:** After any successful Write or Edit to `data/slides/*`

**What it does (multi-step, with file access):**
1. Lists all files in `data/slides/` to check for duplicate slide numbers
2. Reads `project.json` to verify critical fields weren't accidentally deleted
3. Reads `KNOWLEDGE_BASE_PROMPT.md` to verify slide directory count matches actual files

**On failure:** Returns `{"ok": false, "reason": "..."}` — shown as a warning. The write already happened (PostToolUse), but the AI is alerted to fix the inconsistency before proceeding.

**Why an agent hook (not a prompt hook):** Cross-reference checks require READING OTHER FILES beyond what was just written. The agent hook has access to Read, Grep, Glob, and Bash tools — it can `ls data/slides/`, read project.json, and count entries in the KB. A prompt hook only sees the `$ARGUMENTS` of the current operation.

---

#### Hook 5: Session Completeness Gate (Stop agent hook)

**Fires:** When the AI signals it's done (Stop event)

**What it does (comprehensive multi-step verification):**
1. Reads all slide JSONs — checks sequential numbering, valid categories
2. Reads KNOWLEDGE_BASE_PROMPT.md — character count, navigation phrase integrity
3. Reads project.json — version validity
4. Greps for TODO/FIXME markers across project files
5. Cross-references TTS entries against proper nouns in slide content

**On failure:** Returns `{"ok": false, "reason": "..."}` with specific issues. When a Stop hook returns `ok: false`, Claude Code tells the AI to keep working — it cannot end the session until the issues are resolved or the user explicitly dismisses.

**Why this is the most important hook:** Everything else catches errors at the moment of creation. This hook catches errors of OMISSION — things the AI forgot to do, things that fell through the cracks during a long session. It's the final safety net before the user thinks the work is complete.

**Timeout:** 60 seconds. This hook reads multiple files and performs 7 distinct checks. The extended timeout ensures it doesn't get cut off mid-verification.

---

#### Hook Behavior Summary

| Hook | Event | Type | Timeout | Effect on Failure |
|------|-------|------|---------|-------------------|
| Schema/Secret/Lock gate | PreToolUse | prompt | 30s | Write DENIED — AI must fix and retry |
| Navigation phrase lint | PreToolUse | prompt | 30s | Write DENIED — AI must fix phrasing |
| Deploy safety gate | PreToolUse | prompt | 30s | Bash DENIED — AI must validate/bump first |
| Cross-reference integrity | PostToolUse | agent | 45s | WARNING shown — AI should fix before continuing |
| Session completeness | Stop | agent | 60s | Session CONTINUES — AI must resolve issues |

---

### AB. Hook Type Decision Matrix

| Concern | Hook Type | Why This Type? |
|---------|-----------|---------------|
| Slide JSON schema | **prompt** | Content is in `$ARGUMENTS` — no file reading needed, pure validation logic |
| OBEY_RULES immutability | **prompt** | Path check + unconditional block — simplest possible judgment |
| Secret leakage | **prompt** | Pattern matching on content being written — already in `$ARGUMENTS` |
| Navigation phrase lint | **prompt** | Linguistic near-miss detection on content being written — LLM excels at this |
| Deploy preconditions | **prompt** | Reasoning about command intent + session context — no file reads needed |
| Cross-reference integrity | **agent** | Must READ OTHER FILES (ls slides/, read project.json, read KB) to compare |
| Session completeness | **agent** | Must read MULTIPLE files, count things, grep for patterns — full verification sweep |
| TTS coverage audit | **agent** (in Stop hook) | Must cross-reference two file sets (slides vs TTS entries) |
| Bundling | **shell script** | Deterministic file concatenation — no judgment needed |
| Version bump | **shell script** | Arithmetic + file write — exact output required |
| Deploy execution | **Claude directly** | API call + JSON response reading — Claude does this natively via curl |
| Project scaffolding | **Claude directly** | Directory creation + template writes — trivial for the Write tool |

**The decision rule:**
- If it operates ONLY on the content being written → `prompt` hook (fast, ~2s)
- If it needs to READ OTHER FILES to validate → `agent` hook (thorough, 30-60s)
- If it produces DETERMINISTIC OUTPUT where exact bytes matter → shell script
- If it requires JUDGMENT or API interaction → Claude executes directly (no hook, just instructions)

---

### AC. Hook and Tool Failure Modes

What happens when things go wrong:

| Failure | System Behavior | FDE Experience |
|---------|----------------|----------------|
| Prompt hook blocks a write (schema) | AI sees `{"ok": false, "reason": "..."}`, adjusts content, retries | "Fixed the category — writing again" |
| Prompt hook blocks a write (secret) | AI sees the specific secret pattern detected, removes it, retries | "Removed credential from line 14, using .env reference" |
| Prompt hook blocks OBEY_RULES edit | AI sees "file is LOCKED" message, redirects to KNOWLEDGE_BASE_PROMPT.md | "Adding that constraint to the KB instead" |
| Prompt hook blocks deploy | AI sees "must validate first", runs completeness check, bumps version | "Running validation and version bump before deploy" |
| Agent hook warns on cross-ref | AI sees specific mismatch (e.g., "slide_15 duplicates slide_15"), fixes | "Renumbering to slide_16" |
| Stop agent hook finds issues | Session continues — AI addresses each issue listed in the reason | "Found 3 issues — fixing sequential gap, adding missing TTS, removing TODO" |
| `bundle.sh` fails | Exit code + stderr shown — usually a missing file | "Slide 12 referenced but not found — creating it now" |
| `version-bump.sh` fails | Exit code — usually invalid current version format | "project.json version is malformed — fixing to valid semver" |
| curl deploy returns error | AI reads JSON error response, reasons about cause | "Got 403 — KS expired. Regenerating session." |

**Recovery principle:** Every failure produces a specific, actionable error. Prompt hooks are fast (retry costs ~2s). Agent hooks give detailed diagnostics. The AI can self-correct in one iteration for any single failure.

**Cascading failure handling:** If the Stop hook finds 5+ issues, the AI addresses them in priority order (security → correctness → completeness). Each fix may trigger PreToolUse hooks on the corrective writes — this is intentional and ensures fixes are themselves validated.

---

### AD. The Complete Toolkit Directory Structure

```
toolkit/
├── engine/                          # Shared runtime (never modified per project)
│   ├── app.js                       # 1,900 lines — generic presentation engine
│   ├── index.html                   # HTML template with {{placeholders}}
│   └── styles.css                   # Dark theme + CSS custom properties
│
├── scripts/                         # Shell scripts (only 2 — deterministic operations)
│   ├── bundle.sh                    # Concatenate engine + project files → dist.html
│   └── version-bump.sh             # Semver arithmetic on project.json
│
├── rules/                           # Locked rules (inherited by all projects)
│   └── OBEY_RULES.md               # Security, navigation, format — never modified
│
└── templates/                       # Starter configs per use case
    ├── earnings_report/
    │   ├── project.json.template
    │   ├── AVATAR_GOALS.md
    │   ├── REPLY_FORMAT.md
    │   └── SUMMARY_PROMPT.md
    ├── sales_pitch/
    │   ├── project.json.template
    │   ├── AVATAR_GOALS.md
    │   ├── REPLY_FORMAT.md
    │   └── SUMMARY_PROMPT.md
    ├── training/
    │   └── ...
    └── report_review/
        └── ...
```

**No `hooks/` directory.** All hook logic lives in the skill's YAML frontmatter as prompt and agent hook definitions. When the skill is active, Claude Code registers the hooks automatically. When the skill finishes, hooks are cleaned up. No files to maintain, no scripts to keep in sync, no runtime to install.

**No `scripts/` bloat.** Two shell scripts for two deterministic operations. Everything else — validation, deployment, scaffolding, auditing — is handled by Claude directly (via skill instructions) or by Claude-as-validator (via hooks).

#### What Lives Where

| Concern | Location | Format |
|---------|----------|--------|
| Hook definitions | Skill YAML frontmatter | `type: prompt` / `type: agent` with inline prompts |
| Engine code | `toolkit/engine/` | Static HTML/JS/CSS — never modified per project |
| Deterministic ops | `toolkit/scripts/` | 2 shell scripts (~30 lines each) |
| Security rules | `toolkit/rules/OBEY_RULES.md` | Locked markdown — hooks prevent modification |
| Project templates | `toolkit/templates/` | Starter configs per use case |
| Deploy procedure | Skill instructions (Level 2) | Markdown steps that Claude executes via curl |
| Validation logic | Hook prompts (in frontmatter) | LLM reasoning over `$ARGUMENTS` or file reads |

#### Why This Is Better Than the Original 10-File Approach

1. **Zero runtime dependencies.** No Node.js, no Python, no npm, no package.json. Works on any machine with Claude Code installed.
2. **Hooks can't drift from intent.** A prompt hook IS the validation logic — there's no translation layer between "what we want to check" and "what the code actually checks." If the intent changes, you edit the prompt.
3. **Agent hooks are smarter than scripts.** An agent hook can reason about WHY a cross-reference is broken, not just THAT it's broken. It can suggest the fix, not just report the error.
4. **No maintenance surface.** Scripts accumulate bugs, need updates when APIs change, need testing. Prompt hooks are declarative intent that Claude interprets fresh each time.
5. **Graceful degradation.** If a prompt hook's reasoning is slightly off, it errs on the side of blocking (safe failure). If a script has a bug, it might silently pass invalid content (unsafe failure).
