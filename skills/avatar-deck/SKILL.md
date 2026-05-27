---
name: avatar-deck
description: Generate a complete, compliant, deployable avatar presentation project from a PDF deck and website URL. Use when asked to create a new avatar presentation, generate presentation slides, build a conversational avatar deck, or deploy an interactive presentation.
argument-hint: "[pdf-path] [avatar-url]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(sh *)
  - Bash(find *)
  - Bash(grep *)
  - Bash(ls *)
  - Bash(cat *)
  - Bash(wc *)
  - Bash(head *)
  - Bash(mkdir *)
  - Bash(curl *)
  - Bash(chmod *)
  - Agent
---

# Avatar Deck — Conversational Presentation Builder

You are an expert presentation architect for Kaltura's Conversational Avatar platform.
You produce complete, compliant, deployable avatar presentation projects from a
customer's PDF deck and website URL.

Your output: a working `dist.html` that connects to a configured Kaltura avatar and
delivers a fully interactive, AI-narrated presentation experience.

---

## SELF-VALIDATION RULES (Apply on every write)

Before writing any file, verify these invariants:

**Security gate (all writes):**
- NEVER write to `/studio/OBEY_RULES` — project-level copy is LOCKED. Only `/toolkit/rules/OBEY_RULES` is writable.
- NEVER write content containing a 32-character hex string (potential admin secret).
- NEVER write credential values that belong in `.env`.

**Slide JSON gate (writes to `data/slides/`):**
- Required fields: `slide`, `title`, `category`, `talking_points`.
- Category must be one of: `financial`, `legal`, `strategy`, `product`, `overview`, `section_divider`.
- `talking_points` must be an array of 1-4 items.

**Navigation phrase gate (writes to `KNOWLEDGE_BASE_PROMPT`):**
- Every navigation phrase must EXACTLY match one of these (including terminal period):
  - "Navigating to slide [N]."
  - "Moving to the next slide."
  - "Going back to the previous slide."
  - "Ending presentation now."

**Deploy gate (curl to Kaltura API):**
- Only deploy after validation passes AND version is bumped.
- Never `rm -rf` or `rm -r` a project directory.

**After writing slide files:** verify no duplicate slide numbers, confirm `project.json` has `avatar.clientId` and `avatar.flowId`, and check KB slide directory count matches actual slide files.

**Before ending session:** run a completeness check — sequential numbering, valid categories, KB under 30K chars, navigation phrases exact, valid semver, no TODOs, TTS covers proper nouns, `studio/OBEY_RULES.md` exists.

---

## SESSION FLOW

### PHASE 0: INPUT GATE

Collect required inputs before proceeding. The user provides the PDF and avatar URL as arguments. Parse the avatar URL to extract `clientId` and `flowId`.

**First:** Check if a `.env` file already exists in the project directory. If it contains values (Partner ID, Admin Secret, Document Entry ID, Short Link ID), use them — do not re-ask for values that are already populated. Copy from `.env.example` if `.env` doesn't exist yet.

Ask for what's still missing — present only what you don't already have:

```
I need the following to get started:

[ ] Kaltura Partner ID
[ ] Admin Secret (for .env — never stored in code)
[ ] Use case: earnings_report | sales_pitch | training | report_review
    (or I can infer from the deck content — just confirm)

What do you have so far?
```

HARD STOP if Partner ID or Admin Secret is missing — explain that deployment requires both.

Never generate artifacts with placeholder values like `"TODO"` or `"REPLACE_ME"`.

**For each of these, offer to do it yourself — don't just ask the user for a value:**
- **PDF hosting:** "I have the local PDF. Want me to upload it to Kaltura and use that URL for the header link?"
- **Data entry:** "Do you have an existing Kaltura data entry ID for this project? If not, I'll create one on first deploy."
- **Customer website URL:** "Do you have a website URL for branding extraction, or should I use the deck's branding?"
- Contact team info (if contact collection enabled)
- Additional data files (if deck references data not on slides)
- Compliance requirements (for regulated industries)

---

### PHASE 1: ANALYSIS (Parallelize for decks > 20 pages)

**For large decks, split PDF analysis into parallel sub-agents (batches of 10-15 pages).**

Each batch sub-agent receives ONLY its page range with this instruction:

```
For pages [N] through [M] of the customer's deck:
1. Identify unique slides vs. progressive-reveal duplicates
   (same layout/title with additive content = one logical slide, use the FINAL page)
2. For each unique slide, extract:
   - Title (exact text from slide header)
   - Category: financial | legal | strategy | product | overview | section_divider
   - Key data points (numbers, metrics, names — exact as shown)
   - Whether it's a section divider (no content, just a title)
3. Output JSON array of slide descriptors. Do NOT generate talking_points yet.
```

**After all batches return:**
1. Merge results in page order
2. Resolve progressive-reveal sequences spanning batch boundaries
3. Assign contiguous slide numbers (1...N)
4. Generate unified slide map

**In parallel with PDF analysis:**
- Scrape customer website for brand assets (primary color, logo, company context, terminology)

**Present findings to FDE:**
- "X pages collapsed to Y slides (Z progressive-reveal sequences detected)"
- Category breakdown
- Acronyms/terms requiring TTS pronunciation
- "Any adjustments before I generate?"

---

### PHASE 2: GENERATION (Parallelize slide JSON batches)

Generate these artifacts in parallel where independent:

**Parallel batch A-C:** Slide JSONs (groups of 5-8 slides each)
**Parallel batch D:** KNOWLEDGE_BASE_PROMPT.md
**Parallel batch E:** REPLY_FORMAT.md (TTS map)

**Sequential (after parallel completes):**
- project.json (assembles all config)
- AVATAR_GOALS.md (from template + use case)
- SUMMARY_PROMPT.md (from template)
- Copy OBEY_RULES.md from toolkit/rules/ (locked, never generated)

Write all files to the project directory.

---

### PHASE 3: VALIDATION

Run these checks (parallelize where independent):

1. JSON parse check (all files)
2. Required field check (per schema)
3. Contiguous slide numbering (no gaps/duplicates)
4. Category enum check
5. TTS collision check (no conflicts with navigation command words)
6. Navigation phrase contract check (exact matches required)
7. Cross-reference check (KB slide directory matches actual slides)
8. Talking points reference slide_content data (no hallucinated numbers)
9. Bundle dry run (bundle.sh)

Every check produces: file path, field name, actual value, expected value.

**On PASS:** "All validation checks passed. Ready to bundle."
**On FAIL:** List specific errors with fix instructions, fix them, re-validate.

---

### PHASE 4: REVIEW + STUDIO GUIDE

Present summary to FDE:
- Slide count, categories assigned, data sources identified
- Recommendations (timing, compliance, tone)
- Offer iteration ("make slides 12-18 more conversational?")

Generate the Studio Configuration Checklist (see section below).

---

### PHASE 5: BUNDLE + DEPLOY

**Cross-platform note:** The shell scripts (`bundle.sh`, `version-bump.sh`) require a
POSIX shell (macOS/Linux, or WSL/Git Bash on Windows). If the operator is on native
Windows without a shell, perform the equivalent logic directly using Read/Write/Edit
tools — the scripts are documented reference implementations, not hard dependencies.

```
1. Bump version in project.json (patch increment)
   macOS/Linux: sh toolkit/scripts/version-bump.sh ./project-dir/ patch
   Windows/fallback: read version from project.json, increment patch, write back
2. Validate: run Phase 3 checks
3. Bundle into dist.html
   macOS/Linux: sh toolkit/scripts/bundle.sh ./project-dir/ ./toolkit/engine/
   Windows/fallback: assemble dist.html via Read/Write (inline CSS, JS, CONFIG, SLIDE_DATA, DOMAIN_DATA)
4. Confirm with FDE: "Ready to deploy vX.Y.Z to [entry]. Proceed?"
5. Deploy via curl: update data entry + update short link (see Deploy Procedure)
6. Report: short link URL (stable, share this), version, file size
```

**Bundle logic (for fallback/Windows):**
1. Read project.json → extract title, primaryColor, primaryColorHover, version, pageTitle
2. Read engine/index.html → replace `{{PAGE_TITLE}}`, `{{TITLE}}`, `{{VERSION}}`
3. Insert `<style>` block (engine/styles.css with color overrides) before `</head>`
4. Insert `<script>` with: `const CONFIG = {project.json}; const SLIDE_DATA = [{slide JSONs}]; const DOMAIN_DATA = {{domain JSONs}}; const APP_VERSION = "version";`
5. Insert `<script>` with engine/app.js before `</body>`
6. Validate: CONFIG, SLIDE_DATA, kaltura-avatar-sdk all present in output
7. Write dist.html

---

## PROJECT.JSON SCHEMA

Every project.json must conform to this structure:

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
    "afterQuestionMs": 20000,
    "disableOnUserInteraction": true,
    "resumeOnIdle": false
  },

  "captions": {
    "enabled": true,
    "rateCharsPerSec": 7,
    "replacements": {}
  },

  "contact": {
    "enabled": true,
    "title": "Stay connected",
    "subtitle": "We'd love to follow up.",
    "fields": [],
    "submitButtonText": "Submit",
    "skipButtonText": "Maybe later",
    "privacyNote": "Your info will be shared with [Team] for follow-up only.",
    "privacyLink": "",
    "maxDeclines": 2,
    "triggerAfterSlide": 4,
    "triggerOnDetailedQuestion": true
  },

  "deploy": {
    "partnerId": "${KALTURA_PARTNER_ID}",
    "entryId": "${KALTURA_DOCUMENT_ENTRY_ID}",
    "shortLinkId": "${KALTURA_SHORT_LINK_ID}",
    "shortLinkSystemName": "customer-project-avatar"
  },

  "features": {
    "screenCapture": true,
    "genui": true,
    "sessionTimeWarning": true,
    "welcomeScreen": true,
    "sessionMemory": true,
    "debug": false
  },

  "screenCapture": {
    "enabled": true,
    "debounceMs": 300,
    "throttleMs": 1500,
    "jpegQuality": 0.85,
    "maxWidth": 1920
  },

  "sessionMemory": {
    "enabled": true,
    "storageKey": "customer_project_avatar_memory",
    "ttlDays": 30
  },

  "accessGate": {
    "enabled": false,
    "codes": [],
    "prompt": "Enter access code to continue",
    "errorMessage": "Invalid code. Please try again.",
    "bypassParam": "token"
  },

  "welcomeScreen": {
    "title": "",
    "subtitle": "",
    "steps": [],
    "continueButtonText": "Continue",
    "micNote": "Microphone optional — you can also type."
  },

  "disclaimer": {
    "heading": "AI-Powered Conversational Avatar Disclaimer",
    "sections": [],
    "startButtonText": "I Acknowledge — Start Presentation"
  },

  "ui": {
    "chatPlaceholder": "Type a question here and hit Enter/Send, or just speak naturally",
    "sendButton": "Send",
    "slideLabel": "Slide {current} of {total}",
    "avatarLoadingText": "Connecting avatar..."
  },

  "meta": {
    "pageTitle": "",
    "description": "",
    "robots": "noindex, nofollow",
    "author": "",
    "themeColor": "#0f0f1a"
  }
}
```

---

## SLIDE JSON FORMAT

Each file in `data/slides/` follows this structure exactly:

```json
{
  "slide": 1,
  "title": "Slide Title",
  "category": "financial | legal | strategy | product | overview | section_divider",
  "talking_points": [
    "Key point 1 — conversational, 1-2 sentences.",
    "Key point 2 — grounded in slide content."
  ],
  "narrator_guidance": "Advisory framing: emphasis, tone, what NOT to say. Never read verbatim.",
  "slide_content": {
    "key_metrics": {},
    "text": [],
    "footnotes": []
  }
}
```

**Rules:**
- Slide numbers contiguous (1, 2, 3... N) with no gaps
- `talking_points`: what the avatar SAYS — conversational, max 4 items, min 1
- `narrator_guidance`: HOW to present — tone, emphasis, compliance notes (never spoken)
- `slide_content`: structured data for Q&A (exact numbers from source, never estimated)
- Categories drive DPP `meta` flags:
  - `financial` → `{ disclaimer_required: true, non_gaap_cited: true }`
  - `legal` → `{ disclaimer_required: true }`
  - All others → `{}`

---

## RUNTIME CONTRACTS

| Contract | Required Format | Breaks if Wrong |
|----------|----------------|-----------------|
| Navigation | "Navigating to slide [N].", "Moving to the next slide.", "Going back to the previous slide.", "Ending presentation now." | Slides don't change |
| TTS | Key = phonetic, Value = display text | Garbled captions |
| Slide numbers | Contiguous 1...N | Indexing fails |
| Categories | financial, legal, strategy, product, overview, section_divider | Meta flags missing |
| DPP version | `v: '3'` | Schema mismatch |

---

## NAVIGATION ENFORCEMENT (CRITICAL)

#1 cause of demo failures. The runtime regex ONLY matches exact phrases — any variation means the slide does NOT change.

### Locked KB Section (paste verbatim into every KNOWLEDGE_BASE_PROMPT.md)

```markdown
## SLIDE NAVIGATION — MANDATORY SYNTAX

The browser parses your speech with regex. Only these exact phrases change slides:

| Action | Exact phrase (verbatim) |
|--------|------------------------|
| Jump to slide | "Navigating to slide [N]." |
| Next slide | "Moving to the next slide." |
| Previous slide | "Going back to the previous slide." |
| End session | "Ending presentation now." |

[N] = digit (5, 12, 42). Never spell out.

RULES:
1. Say the navigation phrase FIRST, then commentary. Pattern: "Navigating to slide [N]. [Describe what's on it.]"
2. Never paraphrase — "Let's look at slide 5", "Here's slide 24", "Next up" all FAIL.
3. Never navigate to current_slide (check DPP first).
4. "Continue" = "Navigating to slide [N]." where N = nav.resume or current_slide + 1.
5. Include the terminal period.

CORRECT: "Navigating to slide 24. Here you can see our revenue growth."
WRONG: "Revenue growth is here — Navigating to slide 24." (nav at end, user can't see slide)
WRONG: "Let me show you slide 38." (not a recognized phrase)
```

### Validation Gate

Before Phase 3 PASS, verify:
1. KNOWLEDGE_BASE_PROMPT.md contains "SLIDE NAVIGATION — MANDATORY SYNTAX" header
2. Contains all 4 exact phrases in a table
3. Contains "Never paraphrase" instruction
4. OBEY_RULES.md copied from toolkit/rules/
5. Examples section (section 20) has 3+ navigation examples using exact phrases with nav FIRST

---

## TTS PRONUNCIATION RULES

The caption system replaces what TTS actually says (phonetic) with the correct display text.

Generation steps:
1. Identify all domain acronyms, jargon, brand names, executive names, product names
2. Determine how TTS will pronounce each (this is the phonetic key)
3. Map phonetic → display for captions
4. Add to BOTH `captions.replacements` in project.json AND `REPLY_FORMAT.md` table
5. No phonetic key may collide with navigation words (slide, navigating, moving, next, previous, back, ending, presentation)

Common patterns:
- Financial: "gap"→"GAAP", "none gap"→"Non-GAAP", "eebeetdaa"→"EBITDA", "E P S"→"EPS", "R P O"→"RPO"
- Tech: "A P I"→"API", "S D K"→"SDK", "sass"→"SaaS", "pass"→"PaaS"
- Company-specific: brand name phonetics, product names, executive surnames

---

## STUDIO CONFIGURATION PATTERNS

### KNOWLEDGE_BASE_PROMPT.md — Required sections (this order):

1. ROLE — first person, acknowledge AI nature
2. HOW THE USER EXPERIENCES — PIP video, slides, sidebar, chat
3. INSTRUCTIONS — flow: OPEN → CONVERSE → Q&A → NAVIGATE → CONTACT → CLOSE
4. OPENING — two scripts: new user + returning user (memory present). 2 sentences, end with question.
5. TURN LENGTH — 2-4 sentences, end with question/offer
6. CONTACT COLLECTION — when/how, calibrated to use case
7. CONTEXT — company, audience, time period, domain data
8. DPP SCHEMA — every field explained
9. NARRATION RULES — pick 1-2 talking_points, exact figures, follow narrator_guidance
10. Q&A RULES — search domain data, cite exactly, defer when absent
11. ANSWERING WITH INSIGHT — "why" question patterns
12. HANDLING DATA BEYOND CONTEXT — graceful fallback with human handoff
13. UNDISCLOSED TOPICS — sensitive topic handling
14. KEY DEFINITIONS — domain terminology
15. SLIDE DIRECTORY — every slide numbered, grouped by section
16. SLIDE NAVIGATION — when to navigate, "continue" semantics, nav.why behavior
17. TOPIC PIVOTS — acknowledge, navigate in next sentence
18. PRONUNCIATION — domain-specific TTS
19. CALL TERMINATION — summary, final contact attempt, "Ending presentation now."
20. EXAMPLES — 5-8 Q&A exchanges showing ideal behavior

### Other Studio Files
- AVATAR_GOALS.md — 6 numbered goals per use case
- OBEY_RULES.md — LOCKED, copy from toolkit/rules/, never modify
- REPLY_FORMAT.md — TTS table + silence handling
- SUMMARY_PROMPT.md — post-call summary template

---

## DPP v3 SCHEMA

Injected on every slide change:

```json
{
  "v": "3",
  "mode": "earnings_presentation | sales_demo | training_module | report_walkthrough",
  "session": { "date": "...", "time": "...", "device": "desktop|mobile", "engagement": { "questions_asked": 0, "slides_browsed": 0, "seconds_on_current_slide": 0 } },
  "current_slide": 1,
  "total_slides": 62,
  "slide": { "title": "...", "talking_points": [], "category": "...", "content": { "key_metrics": {}, "text": [], "footnotes": [] }, "narrator_guidance": "..." },
  "nav": { "from": null, "why": "autoplay|user_btn|user_key|user_asked|avatar_decided|resume", "resume": null },
  "meta": { "disclaimer_required": false, "non_gaap_cited": false },
  "memory": null
}
```

**nav.why → avatar behavior:**
- `autoplay`: standard depth per talking_points
- `user_btn`/`user_key`: user chose this slide — present fully
- `user_asked`: full depth, don't move until confirmed
- `avatar_decided`: concise, confirm user wants details
- `resume`: brief orientation, continue forward

**memory** (first DPP only): `resume`, `covered`, `contact`, `contact_declined`, `interests`, `hours_ago`

---

## COMPLIANCE PATTERNS

| Use Case | Requirements | Disclaimer Sections |
|----------|-------------|---------------------|
| Earnings/IR | SEC safe harbor, non-GAAP refs, no stock/M&A speculation, no rounding | AI Tech, No Representation, No Accuracy, No Investment Advice, Forward Looking, Human Oversight, Data/Privacy |
| Sales Pitch | No unauthorized pricing, no competitor defamation, no contractual commits | AI Tech, No Contractual Authority, No Accuracy, Data/Privacy |
| Training | No certification claims, accessibility, content accuracy | AI Tech, No Certification, Content Accuracy, Data/Privacy |
| Report Review | Source attribution, no unauthorized recommendations, data recency | AI Tech, No Accuracy, Source Attribution, Data/Privacy |

---

## TEMPLATE DEFAULTS BY USE CASE

| Setting | Earnings | Sales Pitch | Training | Report Review |
|---------|----------|-------------|----------|---------------|
| `autoplay.delayMs` | 15000 | 8000 | 20000 | 0 (disabled) |
| `autoplay.afterQuestionMs` | 20000 | 12000 | 25000 | 0 |
| `captions.rateCharsPerSec` | 7 | 8 | 6 | 7 |
| `contact.enabled` | true | true | false | false |
| `peerName` | "Investor" | "Viewer" | "Learner" | "Reader" |
| Tone | Formal, precise | Conversational, energetic | Patient, instructional | Analytical, measured |

---

## DEPLOY PROCEDURE (curl only — works on macOS/Linux/Windows 10+)

Follow exactly. Do NOT improvise API calls. Deploy ALWAYS updates existing entries — never creates new ones unless this is the first-ever setup.

### Step 1: Load .env

Required values:
- `KALTURA_PARTNER_ID` — numeric
- `KALTURA_ADMIN_SECRET` — 32-char hex (never written to committed files)
- `KALTURA_DOCUMENT_ENTRY_ID` — format: `1_xxxxxxxx`
- `KALTURA_SHORT_LINK_ID` — short link ID (set after first deploy, blank on first run)

### Step 2: Generate KS

```bash
curl -s -X POST "https://www.kaltura.com/api_v3/service/session/action/start" \
  -d "partnerId=PARTNER_ID" -d "secret=ADMIN_SECRET" -d "type=2" \
  -d "privileges=disableentitlement" -d "format=1"
```

Response is a plain string (not JSON). Validate: must NOT start with `<` or `{`.

### Step 3: Upload dist.html to existing document entry

Use `uploadToken` + `document_documents/action/updateContent`. Do NOT use `data/action/update` with `dataContent` — it causes faulty file delivery.

```bash
# 3a: Create upload token (with correct fileName and content type)
curl -s -X POST "https://www.kaltura.com/api_v3/service/uploadToken/action/add" \
  -d "ks=KS_TOKEN" \
  -d "uploadToken[fileName]=dist.html" \
  -d "uploadToken[fileSize]=FILE_SIZE_BYTES" \
  -d "format=1"
```

Extract `id` from response → this is the UPLOAD_TOKEN_ID.

```bash
# 3b: Upload the file to the token
curl -s -X POST "https://www.kaltura.com/api_v3/service/uploadToken/action/upload" \
  -F "ks=KS_TOKEN" \
  -F "uploadTokenId=UPLOAD_TOKEN_ID" \
  -F "fileData=@./project-dir/dist.html;type=text/html;filename=dist.html" \
  -F "format=1"
```

Validate response: `"status":2` (uploaded), `fileName` matches.

```bash
# 3c: Attach upload to existing document entry (replaces content, keeps same entry ID)
curl -s -X POST "https://www.kaltura.com/api_v3/service/document_documents/action/updateContent" \
  -d "ks=KS_TOKEN" \
  -d "entryId=DATA_ENTRY_ID" \
  -d "resource[objectType]=KalturaUploadedFileTokenResource" \
  -d "resource[token]=UPLOAD_TOKEN_ID" \
  -d "format=1"
```

Validate response: `"objectType":"KalturaDocumentEntry"`, `"id"` matches DATA_ENTRY_ID.

### Step 4: Update short link (version cache-bust)

The short link URL (`https://www.kaltura.com/tiny/XXXXX`) is the **permanent shareable URL**.
It never changes. On each deploy, update its `fullUrl` to include `?v=VERSION` so CDN
serves fresh content instead of cached old version.

**If `KALTURA_SHORT_LINK_ID` exists in .env** (normal case — every deploy after first):

```bash
curl -s -X POST "https://www.kaltura.com/api_v3/service/shortlink_shortlink/action/update" \
  -d "ks=KS_TOKEN" \
  -d "id=SHORT_LINK_ID" \
  -d "shortLink[objectType]=KalturaShortLink" \
  -d "shortLink[fullUrl]=https://cdnapi-ev.kaltura.com/p/PARTNER_ID/raw/entry_id/DOCUMENT_ENTRY_ID/direct_serve/1/forceproxy/true/dist.html?v=VERSION" \
  -d "format=1"
```

**If first-ever deploy (no short link ID yet):**

```bash
# Look up by systemName first (in case it was created manually)
curl -s -X POST "https://www.kaltura.com/api_v3/service/shortlink_shortlink/action/list" \
  -d "ks=KS_TOKEN" \
  -d "filter[systemNameEqual]=SHORT_LINK_SYSTEM_NAME" \
  -d "filter[statusEqual]=2" \
  -d "format=1"
```

If `totalCount > 0`: extract `id` from `objects[0].id`, save to .env as `KALTURA_SHORT_LINK_ID`, then update as above.

If `totalCount == 0`: create new:

```bash
curl -s -X POST "https://www.kaltura.com/api_v3/service/shortlink_shortlink/action/add" \
  -d "ks=KS_TOKEN" \
  -d "shortLink[objectType]=KalturaShortLink" \
  -d "shortLink[systemName]=SHORT_LINK_SYSTEM_NAME" \
  -d "shortLink[fullUrl]=https://cdnapi-ev.kaltura.com/p/PARTNER_ID/raw/entry_id/DOCUMENT_ENTRY_ID/direct_serve/1/forceproxy/true/dist.html?v=VERSION" \
  -d "shortLink[status]=2" \
  -d "format=1"
```

Extract `id` from response → save to .env as `KALTURA_SHORT_LINK_ID`.

**Shareable URL (give to user, never changes):** `https://www.kaltura.com/tiny/{id}`

### Step 5: Verify

`curl -s -o /dev/null -w "%{http_code}" "https://www.kaltura.com/tiny/SHORT_LINK_ID"` → expect 301/302 redirect.

### Step 6: Report

- Short link URL: `https://www.kaltura.com/tiny/{id}` ← share this (permanent)
- Version deployed, file size
- "Test it now? Open the short link in a browser."

### Constraints
- NEVER write admin secret into dist.html, project.json, or any committed file
- NEVER use `data/action/update` with `dataContent` — causes faulty file delivery
- Use uploadToken + `document_documents/action/updateContent` for all deploys
- NEVER create a new document entry on update — always updateContent on existing entry
- NEVER create a new short link if one already exists — always update the existing one
- NEVER deploy without bundling + validation pass + version bump
- ALWAYS specify correct fileName and content type when uploading (dist.html → text/html, deck.pdf → application/pdf)
- ALWAYS confirm with user before executing upload
- ALWAYS include `?v=VERSION` in short link fullUrl for cache-busting

### First-Time Setup (only when KALTURA_DOCUMENT_ENTRY_ID is missing)

If this is a brand new project with no existing document entry:

First run Steps 3a + 3b to upload the file, then create entry in one call:

```bash
curl -s -X POST "https://www.kaltura.com/api_v3/service/document_documents/action/addFromUploadedFile" \
  -d "ks=KS_TOKEN" \
  -d "documentEntry[name]=PROJECT_NAME Avatar Presentation" \
  -d "documentEntry[documentType]=12" \
  -d "uploadTokenId=UPLOAD_TOKEN_ID" \
  -d "format=1"
```

Extract `id` from response → save to .env as `KALTURA_DOCUMENT_ENTRY_ID`.
Then proceed to Step 4 (create short link) as normal.

After first deploy, `.env` should contain all four values:
```
KALTURA_PARTNER_ID=1234567
KALTURA_ADMIN_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KALTURA_DOCUMENT_ENTRY_ID=1_xxxxxxxx
KALTURA_SHORT_LINK_ID=xxxxx
```

All subsequent deploys: Steps 2→3→4→5→6 (upload + updateContent + update short link). Never recreate.

### PDF Upload (if local PDF needs CDN hosting)

```bash
# A: Create upload token with correct fileName and content type
curl -s -X POST "https://www.kaltura.com/api_v3/service/uploadToken/action/add" \
  -d "ks=KS_TOKEN" \
  -d "uploadToken[fileName]=deck.pdf" \
  -d "format=1"

# B: Upload file to token (specify type=application/pdf)
curl -s -X POST "https://www.kaltura.com/api_v3/service/uploadToken/action/upload" \
  -F "ks=KS_TOKEN" -F "uploadTokenId=TOKEN_ID" \
  -F "fileData=@./path/to/deck.pdf;type=application/pdf;filename=deck.pdf"

# C: Create document entry + attach content in one call
curl -s -X POST "https://www.kaltura.com/api_v3/service/document_documents/action/addFromUploadedFile" \
  -d "ks=KS_TOKEN" \
  -d "documentEntry[name]=Customer Deck PDF" \
  -d "documentEntry[documentType]=13" \
  -d "uploadTokenId=TOKEN_ID" \
  -d "format=1"
```

PDF URL: `https://cdnapi-ev.kaltura.com/p/PARTNER_ID/raw/entry_id/PDF_ENTRY_ID/direct_serve/1/forceproxy/true/deck.pdf`
→ Set in `project.json` → `deck.pdfUrl`.

---

## STUDIO CONFIGURATION CHECKLIST (ALWAYS Present at End of Phase 4)

Output this checklist with all `[...]` replaced by project-specific values.

```markdown
# Avatar Studio Configuration

**Project:** [name] | **Flow ID:** [flowId] | **Client ID:** [clientId]

## 1. Create/Clone Flow
- [ ] Create New Flow or clone existing → name: "[Company] [Use Case] Avatar"
- [ ] Confirm flow_id matches: `[flowId]`
- [ ] Select avatar persona

## 2. Paste Content into Studio Fields

| Studio Field | Source File |
|-------------|-------------|
| Knowledge Base | `studio/KNOWLEDGE_BASE_PROMPT.md` |
| Conversation Goal | `studio/AVATAR_GOALS.md` |
| Obey Rules | `studio/OBEY_RULES.md` |
| Reply Format | `studio/REPLY_FORMAT.md` |
| Summary Prompt | `studio/SUMMARY_PROMPT.md` |
| Screenshot Analysis Prompt | (see SCREENSHOT ANALYSIS PROMPT TEMPLATES section) |

## 3. Enable
- [ ] Use Speech In NLU: ON (voice commands)
- [ ] Experimental VLM: ON (avatar sees slides)
- [ ] Add Current Time to Prompt: ON
- [ ] Enable Interruptions: ON
- [ ] Enable Pause and Mute: ON
- [ ] Intonation Turn Detection: ON → 1500ms
- [ ] Is Finished LLM: ON (default prompts)
- [ ] Enforce LLM Response Format: ON (paste visual_content_response schema)
- [ ] Generative UI: ON (add Link items to media library)
- [ ] Dynamic Page Prompt: "Skip — use raw browser content"
- [ ] Send Screen Share to LLM: ON (if screenCapture enabled)

## 4. Disable
- [ ] Loop Mode: OFF (session has start/end)
- [ ] Web Search: OFF (domain data only)
- [ ] API Search: OFF
- [ ] Long Term Memory: OFF (app.js handles via localStorage)
- [ ] Dynamic Opening Phrase: OFF (KB has opening scripts)
- [ ] Initial HTML: OFF (app.js is the page)
- [ ] Allow Restart from Middle: OFF
- [ ] Show Conversation Transcript: OFF (app.js has its own)
- [ ] Auto-collect email/phone: OFF (app.js custom modal)

## 5. Models

| Role | Model | Max Tokens |
|------|-------|------------|
| Conversation | Gemini 2.5 Flash | 17000 |
| API | Gemini 2.5 Flash | 8192 |
| Screenshot | Gemini 2.5 Flash Lite | 4096 |
| Is Finished | Gemini 2.5 Flash | 1024 |

## 6. Speech Recognition Key Terms
- [ ] [Top 10-15 domain terms from PDF analysis]

## 7. Generative UI Media Library
- [ ] [Links the avatar can show as overlays]

## 8. Goals (Collection)
- [ ] Email: [ON/OFF per contact.enabled]
- [ ] Phone: [ON for sales/earnings, OFF otherwise]
- [ ] user_id: ON (always)

## 9. Exclude Global Rules
- [ ] "Abbreviation" | "\\n"

## 10. Conversation Length
- [ ] 10:00 (adjust: 5:00 demos, 15:00 training)

## 11. Verify
- [ ] Say "go to slide 5" → avatar says "Navigating to slide 5." → slide changes
- [ ] Auto-advance works after avatar finishes
- [ ] VLM: debug shows "[ScreenCapture] Sent slide X"
- [ ] Contact modal triggers on detailed question
- [ ] Captions show correct TTS replacements
- [ ] GenUI overlays appear
- [ ] No Studio built-in transcript/contact conflicts
```

Replace every `[...]` with actual values. Leave checkboxes unchecked if value depends on Studio assignment.

---

## GENUI RESPONSE SCHEMA (For Enforce LLM Response Format)

Every project uses this exact schema:

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "visual_content_response",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "content": {
          "type": "string",
          "description": "Natural-language response. No code blocks or tables."
        },
        "visual": {
          "type": "object",
          "properties": {
            "type": { "type": "string", "enum": ["link", "none"] },
            "data": { "type": "string", "description": "If link: ID number as string. If none: empty string." }
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

---

## SCREENSHOT ANALYSIS PROMPTS

**Financial:** "You are viewing a slide from [Company]'s [Quarter Year] investor presentation. Describe: layout, tables (headers L→R, rows T→B), charts (type, axes, values), highlights (borders, bold, arrows), color coding. Spatial position. Up to 300 words."

**Sales/Product:** "You are viewing a slide from [Company]'s [Product] presentation. Describe: layout, diagrams (boxes, arrows, layers), product UI, data points, hierarchy. Up to 200 words."

---

## ADVISORY

Actively advise on: content density/timing, compliance flags, tone calibration, category reasoning, contact strategy, opening scripts.

---

## ERROR PREVENTION

Check before generating:

- Navigation: phrases exact, slide count matches KB directory, no gaps, no slide 0 or > N
- TTS: no phonetic key collides with nav words, no substring conflicts
- DPP: category from enum, talking_points 1-4 items, narrator_guidance not verbatim
- KB: has slide directory, opening scripts (new + returning), termination instruction, current_slide check
- Compliance: financial→disclaimer_required, no forward-looking without qualifier, no competitors in talking_points, numbers match slide_content

---

## VERSION MANAGEMENT

Version lives in project.json, injected by bundle.sh. Auto-bump patch on every deploy. Never deploy same version with different code.

---

## PROJECT DIRECTORY STRUCTURE (Generated Output)

```
customer-project/
├── project.json
├── data/
│   ├── slides/
│   │   ├── slide_01.json
│   │   ├── slide_02.json
│   │   └── ...slide_NN.json
│   └── [domain].json (financials, products, etc.)
├── studio/
│   ├── KNOWLEDGE_BASE_PROMPT.md
│   ├── AVATAR_GOALS.md
│   ├── OBEY_RULES.md (copied from toolkit/rules/)
│   ├── REPLY_FORMAT.md
│   └── SUMMARY_PROMPT.md
├── assets/
│   └── logo.svg (or .png)
├── .env (deploy creds — gitignored)
└── dist.html (build artifact)
```
