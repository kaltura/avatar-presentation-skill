/**
 * Avatar Presentation Engine
 * Generic runtime — all behavior driven by CONFIG, SLIDE_DATA, and DOMAIN_DATA
 * injected by bundle.sh. This file contains ZERO hardcoded data.
 *
 * This is a placeholder for the production engine (~1,900 lines).
 * The actual app.js is copied from the Q1 2026 Earnings Avatar source project.
 *
 * Systems implemented in the full engine:
 * - DPP v3 injection (builds/sends structured JSON on every slide change)
 * - Screen capture (JPEG of rendered canvas → avatar VLM, 300ms debounce, 1500ms throttle)
 * - Navigation parsing (regex on avatar speech → slide changes)
 * - Autoplay (configurable delay, disabled on user interaction)
 * - Captions (phonetic→display replacements from CONFIG)
 * - Session memory (localStorage with TTL, resume, interests, contact)
 * - Contact collection (GenUI overlay triggered by avatar)
 * - Access gate (SHA-256 code verification)
 * - PDF rendering (pdf.js canvas)
 * - Keyboard shortcuts (arrows, C for captions, Escape)
 * - Welcome screen + disclaimer flow
 * - Session time warning
 * - Avatar PIP (draggable, pause/resume on click)
 * - Debug panel (?debug URL param)
 */

(function() {
    'use strict';

    // These globals are injected by bundle.sh:
    // const CONFIG = {...};
    // const SLIDE_DATA = [...];
    // const DOMAIN_DATA = {...};
    // const APP_VERSION = "X.Y.Z";

    if (typeof CONFIG === 'undefined') {
        console.error('[Engine] CONFIG not found — was this file bundled correctly?');
        return;
    }

    // ========== State ==========
    let currentSlide = 1;
    let totalSlides = SLIDE_DATA.length;
    let autoplayEnabled = CONFIG.autoplay?.enabled ?? true;
    let autoplayTimer = null;
    let captionsEnabled = CONFIG.captions?.enabled ?? true;
    let sessionMemory = null;
    let avatarConnected = false;

    // ========== Navigation Regex ==========
    const NAV_PATTERNS = [
        { regex: /Navigating to slide (\d+)\./, handler: (m) => goToSlide(parseInt(m[1])) },
        { regex: /Moving to the next slide\./, handler: () => goToSlide(currentSlide + 1) },
        { regex: /Going back to the previous slide\./, handler: () => goToSlide(currentSlide - 1) },
        { regex: /Let me show you slide (\d+)\./, handler: (m) => goToSlide(parseInt(m[1])) },
        { regex: /Ending presentation now\./, handler: () => endSession() }
    ];

    // ========== Core Functions ==========

    function goToSlide(n) {
        if (n < 1 || n > totalSlides || n === currentSlide) return;
        const from = currentSlide;
        currentSlide = n;
        renderSlide(n);
        injectDPP(n, from, determineNavWhy());
        updateProgress();
        resetAutoplay();
    }

    function renderSlide(n) {
        // PDF.js renders page N to #slide-canvas
        // Implementation in full engine
    }

    function injectDPP(slideNum, fromSlide, navWhy) {
        const slide = SLIDE_DATA[slideNum - 1];
        if (!slide) return;

        const dpp = {
            v: '3',
            mode: CONFIG.template,
            session: {
                date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
                device: window.innerWidth < 768 ? 'mobile' : 'desktop',
                engagement: getEngagementMetrics()
            },
            current_slide: slideNum,
            total_slides: totalSlides,
            slide: {
                title: slide.title,
                talking_points: slide.talking_points,
                category: slide.category,
                content: slide.slide_content,
                narrator_guidance: slide.narrator_guidance
            },
            nav: {
                from: fromSlide,
                why: navWhy,
                resume: null
            },
            meta: getCategoryMeta(slide.category)
        };

        // Add domain data
        Object.keys(DOMAIN_DATA).forEach(key => {
            dpp[key] = DOMAIN_DATA[key];
        });

        // Add memory on first DPP only
        if (!sessionMemory?._injected) {
            dpp.memory = loadMemory();
            if (sessionMemory) sessionMemory._injected = true;
        }

        sendToAvatar(dpp);
    }

    function getCategoryMeta(category) {
        switch (category) {
            case 'financial': return { disclaimer_required: true, non_gaap_cited: true };
            case 'legal': return { disclaimer_required: true };
            default: return {};
        }
    }

    function determineNavWhy() {
        // Determined by the event that triggered navigation
        return 'autoplay'; // Placeholder — full engine tracks the trigger source
    }

    function getEngagementMetrics() {
        return { questions_asked: 0, slides_browsed: 0, seconds_on_current_slide: 0 };
    }

    function parseAvatarSpeech(text) {
        for (const pattern of NAV_PATTERNS) {
            const match = text.match(pattern.regex);
            if (match) {
                pattern.handler(match);
                return true;
            }
        }
        return false;
    }

    function resetAutoplay() {
        if (autoplayTimer) clearTimeout(autoplayTimer);
        if (!autoplayEnabled) return;
        const delay = CONFIG.autoplay?.delayMs ?? 15000;
        autoplayTimer = setTimeout(() => goToSlide(currentSlide + 1), delay);
    }

    function updateProgress() {
        const label = document.getElementById('slide-label');
        if (label) {
            label.textContent = `Slide ${currentSlide} of ${totalSlides}`;
        }
        const bar = document.getElementById('slide-progress');
        if (bar) {
            bar.setAttribute('aria-valuenow', currentSlide);
            bar.setAttribute('aria-valuemax', totalSlides);
        }
    }

    function loadMemory() {
        const key = CONFIG.sessionMemory?.storageKey;
        if (!key) return null;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const data = JSON.parse(raw);
            const ttl = (CONFIG.sessionMemory?.ttlDays ?? 30) * 86400000;
            if (Date.now() - data.timestamp > ttl) {
                localStorage.removeItem(key);
                return null;
            }
            return data;
        } catch { return null; }
    }

    function sendToAvatar(dpp) {
        // Sends DPP to eSelf SDK via postMessage
        // Implementation in full engine
    }

    function endSession() {
        // Clean up, show summary, disconnect avatar
    }

    // ========== Keyboard Shortcuts ==========
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch (e.key) {
            case 'ArrowLeft': goToSlide(currentSlide - 1); break;
            case 'ArrowRight': goToSlide(currentSlide + 1); break;
            case 'c': case 'C': toggleCaptions(); break;
            case 'Escape': closeModals(); break;
        }
    });

    function toggleCaptions() {
        captionsEnabled = !captionsEnabled;
        const el = document.getElementById('captions-container');
        if (el) el.classList.toggle('hidden', !captionsEnabled);
    }

    function closeModals() {
        document.querySelectorAll('.genui-container, .debug').forEach(el => el.classList.add('hidden'));
    }

    // ========== Init ==========
    function init() {
        sessionMemory = loadMemory();
        updateProgress();
        console.log(`[Engine] v${APP_VERSION} loaded. ${totalSlides} slides.`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
