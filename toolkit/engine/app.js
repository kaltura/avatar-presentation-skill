/**
 * Avatar Presentation Engine v2.0
 * Generic runtime — all behavior driven by CONFIG, SLIDE_DATA, and DOMAIN_DATA
 * injected by bundle.sh. This file contains ZERO hardcoded content.
 */

(function () {
  'use strict';

  // ─── Globals (injected by bundle.sh) ─────────────────────────────────────────
  // const CONFIG = {...};       // project.json contents
  // const SLIDE_DATA = [...];   // array of slide objects
  // const DOMAIN_DATA = {...};  // keyed domain data files
  // const APP_VERSION = "X.Y.Z";

  if (typeof CONFIG === 'undefined') {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#fff;background:#0f0f1a;padding:24px;text-align:center"><div><h2>Engine Error</h2><p style="color:#9b9bb0">CONFIG not found — was this file bundled correctly?</p></div></div>';
    return;
  }

  var isDebug = CONFIG.features && CONFIG.features.debug || location.search.indexOf('debug') !== -1;

  function log() {
    if (isDebug) console.log.apply(console, arguments);
    addDebugEntry(Array.prototype.slice.call(arguments).join(' '));
  }

  // ─── State ─────────────────────────────────────────────────────────────────────

  var pdfDoc = null;
  var currentPage = 1;
  var sdk = null;
  var renderGeneration = 0;
  var isMuted = false;
  var isPaused = false;
  var avatarReady = false;
  var lastSentText = '';
  var contactCollected = { email: null, phone: null };
  var contactModalOpen = false;
  var contactDeclinedCount = 0;
  var currentContactType = 'email';
  var autoPlayEnabled = CONFIG.autoplay ? CONFIG.autoplay.enabled !== false : true;
  var autoPlayAutoDisabled = false;
  var autoPlayTimer = null;
  var avatarSpeaking = false;
  var userInteractedRecently = false;
  var userInteractionTimer = null;
  var AUTO_PLAY_DELAY_MS = (CONFIG.autoplay && CONFIG.autoplay.delayMs) || 15000;
  var AUTO_PLAY_AFTER_QUESTION_MS = (CONFIG.autoplay && CONFIG.autoplay.afterQuestionMs) || 20000;
  var lastAvatarResponseEndedWithQuestion = false;
  var lastDPPSlide = 0;
  var screenCaptureEnabled = false;
  var lastScreenCaptureSentAt = 0;
  var pendingScreenCapture = null;
  var SCREEN_CAPTURE_MIN_INTERVAL_MS = (CONFIG.screenCapture && CONFIG.screenCapture.throttleMs) || 1500;
  var SCREEN_CAPTURE_JPEG_QUALITY = (CONFIG.screenCapture && CONFIG.screenCapture.jpegQuality) || 0.85;
  var SCREEN_CAPTURE_MAX_WIDTH = (CONFIG.screenCapture && CONFIG.screenCapture.maxWidth) || 1920;
  var micStream = null;
  var totalSlides = SLIDE_DATA.length;

  // ─── Slide History & Navigation Context ─────────────────────────────────────────

  var slideHistory = [];
  var currentSlideEnteredAt = 0;
  var lastSequentialSlide = 1;
  var userTurnActive = false;
  var lastUserSpeechTime = 0;
  var nextNavReason = null;
  var lastResumeTime = 0;
  var resumeNavSuppressed = false;
  var lastUserSpeechText = '';
  var pendingSequentialCheck = null;
  var commandHandledNavAt = 0;
  var lastChatMsg = '';
  var lastChatRole = '';

  // ─── Session Memory (localStorage) ─────────────────────────────────────────────

  var STORAGE_KEY = (CONFIG.sessionMemory && CONFIG.sessionMemory.storageKey) || 'avatar_presentation_memory';
  var SESSION_TTL_MS = ((CONFIG.sessionMemory && CONFIG.sessionMemory.ttlDays) || 30) * 24 * 60 * 60 * 1000;
  var sessionMemory = null;
  var sessionMemoryInjected = false;
  var sessionMemoryCleared = false;
  var slidesPresented = new Set();
  var userQuestions = [];

  function loadSessionMemory() {
    if (CONFIG.sessionMemory && CONFIG.sessionMemory.enabled === false) return null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.lastSlide || !data.timestamp) return null;
      if (Date.now() - data.timestamp > SESSION_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch (e) { return null; }
  }

  function saveSessionMemory() {
    if (sessionMemoryCleared) return;
    if (CONFIG.sessionMemory && CONFIG.sessionMemory.enabled === false) return;
    if (!avatarReady && slidesPresented.size <= 1) return;
    try {
      var covered = Array.from(slidesPresented).sort(function (a, b) { return a - b; });
      var data = {
        timestamp: Date.now(),
        lastSlide: currentPage,
        lastSequential: lastSequentialSlide,
        covered: covered,
        contact: contactCollected.email || contactCollected.phone ? contactCollected : null,
        contactDeclined: contactDeclinedCount,
        interests: userQuestions.slice(-4)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function buildMemoryForDPP() {
    if (!sessionMemory) return null;
    var coveredMeaningful = sessionMemory.covered && sessionMemory.covered.filter(function (s) { return s > 2; }).length > 0;
    if (!coveredMeaningful && (!sessionMemory.interests || sessionMemory.interests.length === 0) && !sessionMemory.contact) {
      return null;
    }
    var mem = {};
    if (sessionMemory.lastSlide && sessionMemory.lastSlide > 2) mem.resume = sessionMemory.lastSlide;
    if (sessionMemory.covered && sessionMemory.covered.length > 0) mem.covered = sessionMemory.covered;
    if (sessionMemory.contact) mem.contact = sessionMemory.contact;
    if (sessionMemory.contactDeclined >= 2) mem.contact_declined = true;
    if (sessionMemory.interests && sessionMemory.interests.length > 0) mem.interests = sessionMemory.interests;
    mem.hours_ago = Math.round((Date.now() - sessionMemory.timestamp) / 3600000);
    return mem;
  }

  // ─── DOM References ────────────────────────────────────────────────────────────

  var els = {};

  function cacheDOMRefs() {
    els.startOverlay = document.getElementById('start-overlay');
    els.btnStart = document.getElementById('btn-start');
    els.canvas = document.getElementById('slide-canvas');
    els.annotationLayer = document.getElementById('annotation-layer');
    els.container = document.getElementById('presentation-container');
    els.wrapper = document.getElementById('presentation-wrapper');
    els.slideCounter = document.getElementById('slide-counter');
    els.slideLabel = document.getElementById('slide-label');
    els.slideJumpInput = document.getElementById('slide-jump-input');
    els.progressBar = document.getElementById('progress-bar');
    els.progressFill = document.getElementById('progress-fill');
    els.autoplayRing = document.getElementById('autoplay-ring');
    els.btnPrev = document.getElementById('btn-prev');
    els.btnNext = document.getElementById('btn-next');
    els.btnAutoplay = document.getElementById('btn-autoplay');
    els.iconAutoplayOn = document.getElementById('icon-autoplay-on');
    els.iconAutoplayOff = document.getElementById('icon-autoplay-off');
    els.btnCC = document.getElementById('btn-cc');
    els.btnMute = document.getElementById('btn-mute');
    els.btnClearMemory = document.getElementById('btn-clear-memory');
    els.btnTranscript = document.getElementById('btn-transcript');
    els.btnCloseTranscript = document.getElementById('btn-close-transcript');
    els.btnDownloadTranscript = document.getElementById('btn-download-transcript');
    els.transcriptPanel = document.getElementById('transcript-panel');
    els.transcriptBody = document.getElementById('transcript-body');
    els.chatForm = document.getElementById('chat-form');
    els.chatInput = document.getElementById('chat-input');
    els.avatarPip = document.getElementById('avatar-pip');
    els.avatarPauseOverlay = document.getElementById('avatar-pause-overlay');
    els.avatarLoading = document.getElementById('avatar-loading');
    els.iconMicOn = document.getElementById('icon-mic-on');
    els.iconMicOff = document.getElementById('icon-mic-off');
    els.videoOverlay = document.getElementById('video-overlay-container');
    els.statusToast = document.getElementById('status-toast');
    els.statusMessage = document.getElementById('status-message');
    els.contactModal = document.getElementById('contact-modal');
    els.contactForm = document.getElementById('contact-form');
    els.contactEmail = document.getElementById('contact-email');
    els.contactPhone = document.getElementById('contact-phone');
    els.contactEmailGroup = document.getElementById('contact-email-group');
    els.contactPhoneGroup = document.getElementById('contact-phone-group');
    els.contactTitle = document.getElementById('contact-modal-title');
    els.contactSubtitle = document.getElementById('contact-modal-subtitle');
    els.btnCloseContact = document.getElementById('btn-close-contact');
    els.btnContactSkip = document.getElementById('btn-contact-skip');
    els.btnContactSubmit = document.getElementById('btn-contact-submit');
    els.tocSidebar = document.getElementById('toc-sidebar');
    els.btnTocToggle = document.getElementById('btn-toc-toggle');
    els.chatLog = document.getElementById('chat-log');
    els.chatLogWrapper = document.getElementById('chat-log-wrapper');
    els.btnChatToggle = document.getElementById('btn-chat-toggle');
  }

  // ─── PDF Rendering ─────────────────────────────────────────────────────────────

  async function loadPDF() {
    var pdfUrl = CONFIG.deck && CONFIG.deck.pdfUrl;
    if (!pdfUrl) {
      log('[PDF] No pdfUrl in CONFIG — slide rendering disabled');
      return;
    }
    var cacheBust = typeof APP_VERSION !== 'undefined' ? APP_VERSION : (CONFIG.version || '');
    if (cacheBust && pdfUrl.indexOf('?') === -1) {
      pdfUrl += '?v=' + cacheBust;
    } else if (cacheBust) {
      pdfUrl += '&v=' + cacheBust;
    }
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
      if (pdfDoc.numPages !== totalSlides) {
        console.error('[PDF] MISMATCH: PDF has ' + pdfDoc.numPages + ' pages but SLIDE_DATA has ' + totalSlides + ' entries.');
      }
      await renderPage(1);
      showToast('Presentation loaded', 'success');
    } catch (err) {
      showToast('Failed to load presentation PDF', 'error');
      console.error('[PDF] Load error:', err);
    }
  }

  var currentRenderTask = null;

  async function renderPage(pageNum) {
    if (!pdfDoc) return;
    if (pageNum < 1 || pageNum > pdfDoc.numPages) return;

    var thisGeneration = ++renderGeneration;

    if (currentRenderTask) {
      try { currentRenderTask.cancel(); } catch (e) {}
      currentRenderTask = null;
    }

    try {
      var page = await pdfDoc.getPage(pageNum);
      if (thisGeneration !== renderGeneration) return;

      var containerWidth = els.container.clientWidth;
      var containerHeight = els.container.clientHeight;
      var unscaledViewport = page.getViewport({ scale: 1 });
      var scaleW = containerWidth / unscaledViewport.width;
      var scaleH = containerHeight / unscaledViewport.height;
      var scale = Math.min(scaleW, scaleH);
      var viewport = page.getViewport({ scale: scale });

      var dpr = window.devicePixelRatio || 1;
      els.canvas.width = viewport.width * dpr;
      els.canvas.height = viewport.height * dpr;
      els.canvas.style.width = viewport.width + 'px';
      els.canvas.style.height = viewport.height + 'px';

      var ctx = els.canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      currentRenderTask = page.render({ canvasContext: ctx, viewport: viewport });
      await currentRenderTask.promise;
      currentRenderTask = null;

      renderAnnotations(page, viewport);
    } catch (err) {
      currentRenderTask = null;
      if (err && err.name === 'RenderingCancelledException') return;
      if (thisGeneration === renderGeneration) {
        console.error('[PDF] Render error for page ' + pageNum + ':', err);
      }
    }
  }

  async function renderAnnotations(page, viewport) {
    var layer = els.annotationLayer;
    if (!layer) return;
    layer.innerHTML = '';

    try {
      var annotations = await page.getAnnotations();
      annotations.forEach(function (ann) {
        if (ann.subtype !== 'Link' || (!ann.dest && !ann.url)) return;
        var rect = ann.rect;
        var p1 = viewport.convertToViewportPoint(rect[0], rect[1]);
        var p2 = viewport.convertToViewportPoint(rect[2], rect[3]);
        var left = Math.min(p1[0], p2[0]);
        var top = Math.min(p1[1], p2[1]);
        var width = Math.abs(p2[0] - p1[0]);
        var height = Math.abs(p2[1] - p1[1]);

        var link = document.createElement('a');
        link.style.position = 'absolute';
        link.style.left = left + 'px';
        link.style.top = top + 'px';
        link.style.width = width + 'px';
        link.style.height = height + 'px';
        link.style.display = 'block';

        if (ann.url) {
          link.href = ann.url;
          link.target = '_blank';
          link.rel = 'noopener';
        } else if (ann.dest) {
          link.href = '#';
          link.addEventListener('click', function (e) {
            e.preventDefault();
            var dest = ann.dest;
            if (Array.isArray(dest)) {
              pdfDoc.getPageIndex(dest[0]).then(function (idx) {
                goToSlide(idx + 1, true);
              });
            } else {
              pdfDoc.getDestination(dest).then(function (resolved) {
                if (!resolved) return;
                pdfDoc.getPageIndex(resolved[0]).then(function (idx) {
                  goToSlide(idx + 1, true);
                });
              });
            }
          });
        }
        layer.appendChild(link);
      });
    } catch (err) {
      log('[PDF] Annotation render error:', err.message);
    }
  }

  // ─── Navigation Helpers ──────────────────────────────────────────────────────

  function speechExplicitlyNamesSlide(text, targetPage) {
    if (!text) return false;
    var speech = text.toLowerCase();
    var slideNumMatch = speech.match(/slide\s+([\w\s-]+?)(?:\.|,|!|\?|$)/);
    if (!slideNumMatch) return false;
    var parsed = parseSlideNumber(slideNumMatch[1].trim());
    return parsed === targetPage;
  }

  function resolvePendingSequentialCheck(userText) {
    if (!pendingSequentialCheck) return;
    var check = pendingSequentialCheck;
    pendingSequentialCheck = null;
    if (Date.now() - check.time > 10000) return;
    if (speechExplicitlyNamesSlide(userText, check.page)) {
      lastSequentialSlide = check.page;
      log('[Nav] lastSequentialSlide →', check.page, '(deferred)');
    }
  }

  // ─── Avatar Notification ─────────────────────────────────────────────────────

  var userNavTimer = null;

  function scheduleAvatarNotification(delay) {
    if (userNavTimer) {
      clearTimeout(userNavTimer);
      userNavTimer = null;
    }
    if (isPaused) return;

    var targetPage = currentPage;
    if (delay === undefined) delay = avatarSpeaking ? 3000 : 600;

    userNavTimer = setTimeout(function () {
      userNavTimer = null;
      if (currentPage !== targetPage) return;
      if (currentPage === lastDPPSlide) {
        log('[Nav] Settled on slide avatar is already presenting — no action');
        return;
      }
      notifyAvatarOfSlideChange();
    }, delay);
  }

  function notifyAvatarOfSlideChange() {
    var wasInterrupt = avatarSpeaking;
    injectDPP();
    scheduleScreenCapture();
    var slide = SLIDE_DATA[currentPage - 1];
    var msg = wasInterrupt
      ? '[SLIDE CHANGE] User navigated away. Now on slide ' + currentPage + ': "' + slide.title + '". Stop current topic. Present THIS slide only.'
      : '[SLIDE CHANGE] Now on slide ' + currentPage + ': "' + slide.title + '". Present THIS slide only — disregard prior slide content.';
    lastSentText = msg;
    sdk.sendText(msg);
    log('[Nav]', wasInterrupt ? 'Interrupt:' : 'Notify:', 'slide', currentPage);
  }

  // ─── Slide Navigation ─────────────────────────────────────────────────────────

  function goToSlide(pageNum, userInitiated) {
    if (pageNum < 1 || pageNum > totalSlides) return;
    if (pageNum === currentPage) return;

    var reason = nextNavReason || 'nav';
    nextNavReason = null;
    if (currentSlideEnteredAt > 0) {
      slideHistory.push({
        s: currentPage,
        t: Math.round((Date.now() - currentSlideEnteredAt) / 1000),
        r: reason
      });
    }
    currentSlideEnteredAt = Date.now();

    var updatesSequential = (pageNum === currentPage + 1) ||
      (reason === 'user_btn') || (reason === 'user_key') || (reason === 'resume');
    if (updatesSequential) {
      lastSequentialSlide = pageNum;
      log('[Nav] lastSequentialSlide →', pageNum, '(reason:', reason + ')');
    } else if (reason === 'user_asked') {
      pendingSequentialCheck = { page: pageNum, time: Date.now() };
    }

    cancelAutoPlay();
    if (userInitiated && reason !== 'autoplay' && autoPlayEnabled) {
      autoPlayEnabled = false;
      autoPlayAutoDisabled = true;
      setAutoPlayUI(false);
      lastAvatarResponseEndedWithQuestion = false;
      log('[AutoPlay] Disabled — user navigated manually');
    }
    currentPage = pageNum;
    slidesPresented.add(pageNum);
    if (videoOverlayActive) {
      hideVideoOverlay();
      if (sdk && typeof sdk.hideGenUI === 'function') sdk.hideGenUI();
    }
    renderPage(currentPage);
    updateSlideUI();
    updateTOCHighlight(currentPage);

    if (userInitiated && sdk && avatarReady) {
      scheduleAvatarNotification(reason === 'autoplay' ? 0 : undefined);
    } else if (!userInitiated) {
      injectDPP();
      scheduleScreenCapture();
    }
  }

  function updateSlideUI() {
    if (els.slideCounter) els.slideCounter.textContent = 'Slide ' + currentPage + ' of ' + totalSlides;
    if (els.slideLabel) els.slideLabel.textContent = currentPage + ' / ' + totalSlides;
    if (els.progressBar) {
      els.progressBar.setAttribute('aria-valuemax', totalSlides);
      els.progressBar.setAttribute('aria-valuenow', currentPage);
    }
    if (els.progressFill) els.progressFill.style.width = ((currentPage / totalSlides) * 100) + '%';
    if (els.btnPrev) els.btnPrev.disabled = currentPage === 1;
    if (els.btnNext) els.btnNext.disabled = currentPage === totalSlides;
    if (els.slideJumpInput) els.slideJumpInput.max = totalSlides;
  }

  // ─── DPP (Dynamic Prompt Protocol) ────────────────────────────────────────────

  function buildSlideDPP(slideIndex) {
    var slide = SLIDE_DATA[slideIndex];
    if (!slide) return null;
    var isFinancial = slide.category === 'financial';
    var isLegal = slide.category === 'legal';
    var content = slide.slide_content ? Object.assign({}, slide.slide_content) : null;
    if (content) delete content.visual;

    var nav = null;
    if (slideHistory.length > 0) {
      var last = slideHistory[slideHistory.length - 1];
      var currentSlideNum = slideIndex + 1;
      var resumeAt = (currentSlideNum !== lastSequentialSlide) ? lastSequentialSlide : null;
      nav = { from: last.s, why: last.r, resume: resumeAt };
    }

    var memory = null;
    if (!sessionMemoryInjected && sessionMemory) {
      memory = buildMemoryForDPP();
      sessionMemoryInjected = true;
    }

    var dpp = {
      v: '3',
      mode: CONFIG.template || 'presentation',
      session: {
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
        device: window.innerWidth <= 768 ? 'mobile' : 'desktop',
        engagement: {
          questions_asked: userQuestions.length,
          slides_browsed: slidesPresented.size,
          seconds_on_current_slide: Math.round((Date.now() - currentSlideEnteredAt) / 1000)
        }
      },
      current_slide: slideIndex + 1,
      total_slides: totalSlides,
      slide: {
        title: slide.title,
        talking_points: slide.talking_points,
        category: slide.category,
        content: content,
        narrator_guidance: slide.narrator_guidance || null
      },
      nav: nav,
      meta: {
        disclaimer_required: isFinancial || isLegal,
        non_gaap_cited: isFinancial
      }
    };

    // Add all domain data
    if (DOMAIN_DATA) {
      Object.keys(DOMAIN_DATA).forEach(function (key) {
        dpp[key] = DOMAIN_DATA[key];
      });
    }

    if (memory) dpp.memory = memory;
    return dpp;
  }

  function injectDPP() {
    if (!sdk || !avatarReady) return;
    try {
      var dpp = buildSlideDPP(currentPage - 1);
      if (dpp) {
        sdk.injectDPP(dpp);
        lastDPPSlide = currentPage;
      }
    } catch (err) {
      console.error('[DPP] Injection error:', err);
    }
  }

  // ─── Screen Capture (VLM) ──────────────────────────────────────────────────────

  async function captureAndSendSlide() {
    if (!screenCaptureEnabled || !sdk || !avatarReady || !pdfDoc) return;
    try { if (!sdk.isInConversation()) return; } catch (e) { return; }

    var now = Date.now();
    if (now - lastScreenCaptureSentAt < SCREEN_CAPTURE_MIN_INTERVAL_MS) return;

    try {
      var page = await pdfDoc.getPage(currentPage);
      var unscaled = page.getViewport({ scale: 1 });
      var scale = SCREEN_CAPTURE_MAX_WIDTH / unscaled.width;
      var viewport = page.getViewport({ scale: scale });

      var offscreen = document.createElement('canvas');
      offscreen.width = viewport.width;
      offscreen.height = viewport.height;
      var offCtx = offscreen.getContext('2d');

      await page.render({ canvasContext: offCtx, viewport: viewport }).promise;

      var imageDataUrl = offscreen.toDataURL('image/jpeg', SCREEN_CAPTURE_JPEG_QUALITY);
      sdk.sendScreenCapture(imageDataUrl);
      lastScreenCaptureSentAt = Date.now();
      log('[ScreenCapture] Sent slide', currentPage, '(' + Math.round(imageDataUrl.length / 1024) + ' KB)');
    } catch (err) {
      console.error('[ScreenCapture] Error:', err);
    }
  }

  function scheduleScreenCapture() {
    if (pendingScreenCapture) { clearTimeout(pendingScreenCapture); pendingScreenCapture = null; }
    if (!screenCaptureEnabled || !sdk || !avatarReady) return;
    var debounce = (CONFIG.screenCapture && CONFIG.screenCapture.debounceMs) || 300;
    pendingScreenCapture = setTimeout(function () {
      pendingScreenCapture = null;
      captureAndSendSlide();
    }, debounce);
  }

  // ─── Avatar SDK ────────────────────────────────────────────────────────────────

  function initAvatar() {
    if (typeof KalturaAvatarSDK === 'undefined') {
      showToast('Avatar SDK not loaded — check network connection', 'error');
      return;
    }

    var captionReplacements = (CONFIG.captions && CONFIG.captions.replacements) || {};

    sdk = new KalturaAvatarSDK({
      clientId: CONFIG.avatar.clientId,
      flowId: CONFIG.avatar.flowId,
      container: '#avatar-pip',
      genui: {
        enabled: !!(CONFIG.features && CONFIG.features.genui),
        container: '#video-overlay-container',
        autoHide: false,
        dismissible: true
      },
      captions: {
        enabled: false,
        container: '#caption-container',
        render: true,
        maxCharsPerLine: 47,
        maxLines: 2,
        replacements: captionReplacements
      },
      debug: false,
      autoReconnect: true,
      maxReconnectAttempts: (CONFIG.avatar && CONFIG.avatar.reconnectAttempts) || 5,
      connectionTimeout: (CONFIG.avatar && CONFIG.avatar.connectionTimeout) || 30000,
      transcriptEnabled: true,
      peerName: (CONFIG.avatar && CONFIG.avatar.peerName) || 'Viewer',
      queue: { enabled: true, maxWaitMs: 120000 }
    });

    try {
      var rate = (CONFIG.captions && CONFIG.captions.rateCharsPerSec) || 7;
      sdk._captions._rate._charsPerSec = rate;
    } catch (e) {}

    registerEvents();
    registerCommands();

    sdk.connect().catch(function (err) {
      console.error('[Avatar] Connection failed:', err);
      var code = (err && err.code) || 0;
      if (code === 1006) {
        showToast('Server busy — retrying...', 'info');
        els.avatarLoading.innerHTML = '<span style="text-align:center;padding:0 12px;">Server busy&hellip;<br>Retrying connection.</span>';
        setTimeout(function () { sdk.connect().catch(handleFinalConnectionFailure); }, 5000);
      } else {
        handleFinalConnectionFailure(err);
      }
    });

    function retryConnection() {
      log('[Avatar] Retrying connection...');
      showToast('Reconnecting...', 'info');
      els.avatarLoading.classList.remove('hidden');
      els.avatarLoading.innerHTML = '<span style="text-align:center;padding:0 12px;">Reconnecting&hellip;</span>';
      sdk.connect().catch(handleFinalConnectionFailure);
    }
    window._retryAvatarConnection = retryConnection;

    function handleFinalConnectionFailure(err) {
      console.error('[Avatar] Final connection failure:', err);
      showToast('Avatar connection failed — you can still browse slides', 'error');
      els.avatarLoading.classList.remove('hidden');
      els.avatarLoading.innerHTML =
        '<span style="color:var(--color-danger,#CA1C2D);text-align:center;padding:0 12px;">' +
        'Connection failed.<br>' +
        '<a href="#" onclick="window._retryAvatarConnection();return false" style="color:var(--color-primary,#006EFA)">Retry</a>' +
        ' &middot; Slides still work.</span>';
    }
  }

  function registerEvents() {
    sdk.on('connecting', function () {
      log('[Avatar] Connecting...');
      showToast('Connecting to avatar...', 'info');
    });

    sdk.on('connected', function () {
      log('[Avatar] Connected (socket established)');
    });

    var showingAgentFired = false;
    var initialDPPSent = false;

    function sendInitialDPP() {
      if (initialDPPSent || !avatarReady || !showingAgentFired) return;
      initialDPPSent = true;
      injectDPP();
      log('[Avatar] Initial DPP injected');
      setTimeout(function () {
        if (sdk && avatarReady) {
          lastSentText = 'hi, start session!';
          sdk.sendText('hi, start session!');
          log('[Avatar] Sent greeting trigger');
        }
      }, 1000);
    }

    sdk.on('showing-agent', function () {
      log('[DPP] SHOWING_AGENT fired');
      showingAgentFired = true;
      setTimeout(sendInitialDPP, 500);
    });

    sdk.on('ready', function () {
      log('[Avatar] Ready — in conversation');
      avatarReady = true;
      currentSlideEnteredAt = Date.now();
      els.avatarLoading.classList.add('hidden');
      showToast('Avatar connected', 'success');
      try {
        var features = sdk.getFeatures();
        screenCaptureEnabled = !!(features && features.screenShare);
        log('[ScreenCapture] Feature enabled:', screenCaptureEnabled);
      } catch (e) { screenCaptureEnabled = false; }
      if (screenCaptureEnabled) scheduleScreenCapture();
      if (showingAgentFired) setTimeout(sendInitialDPP, 500);
      sdk.setCaptionToggleVisible(false);
      var ccOn = sdk.isCaptionsEnabled();
      if (els.btnCC) {
        els.btnCC.setAttribute('aria-pressed', String(ccOn));
      }
    });

    sdk.on('video-ready', function () {
      log('[Avatar] Video stream ready');
      els.avatarLoading.classList.add('hidden');
    });

    sdk.on('disconnected', function (payload) {
      saveSessionMemory();
      avatarReady = false;
      isPaused = false;
      if (els.avatarPauseOverlay) els.avatarPauseOverlay.classList.add('hidden');
      screenCaptureEnabled = false;
      if (pendingScreenCapture) { clearTimeout(pendingScreenCapture); pendingScreenCapture = null; }
      var reason = (payload && payload.reason) || 'unknown';
      log('[Avatar] Disconnected:', reason);
      showToast('Avatar disconnected: ' + reason, 'error');
    });

    sdk.on('reconnecting', function (payload) {
      var attempt = (payload && payload.attempt) || '?';
      var max = (payload && payload.maxAttempts) || '?';
      showToast('Reconnecting (' + attempt + '/' + max + ')...', 'info');
    });

    sdk.on('reconnected', function () {
      avatarReady = true;
      showToast('Reconnected', 'success');
      injectDPP();
      try {
        var features = sdk.getFeatures();
        screenCaptureEnabled = !!(features && features.screenShare);
      } catch (e) { screenCaptureEnabled = false; }
      if (screenCaptureEnabled) scheduleScreenCapture();
    });

    sdk.on('queue-started', function () {
      log('[Avatar] Queued');
      showToast('All agents busy — waiting for availability...', 'info');
      els.avatarLoading.innerHTML = '<span style="text-align:center;padding:0 12px;">All agents busy&hellip;<br>Waiting for availability.</span>';
    });

    sdk.on('queue-position-check', function (payload) {
      var waited = payload && payload.waitedMs ? Math.round(payload.waitedMs / 1000) : 0;
      var nextIn = payload && payload.nextCheckMs ? Math.round(payload.nextCheckMs / 1000) : '?';
      log('[Avatar] Queue check — waited ' + waited + 's, next in ' + nextIn + 's');
      els.avatarLoading.innerHTML = '<span style="text-align:center;padding:0 12px;">Still waiting&hellip; (' + waited + 's)<br>Checking again in ' + nextIn + 's.</span>';
    });

    sdk.on('queue-available', function () {
      log('[Avatar] Queue: slot available');
      showToast('Agent available — connecting...', 'success');
      els.avatarLoading.innerHTML = '';
    });

    sdk.on('queue-timeout', function (payload) {
      var waited = payload && payload.waitedMs ? Math.round(payload.waitedMs / 1000) : '?';
      log('[Avatar] Queue timeout after ' + waited + 's');
      showToast('Service unavailable — please try again later', 'error');
      els.avatarLoading.classList.remove('hidden');
      els.avatarLoading.innerHTML =
        '<span style="color:var(--color-danger,#CA1C2D);text-align:center;padding:0 12px;">' +
        'Service busy.<br>' +
        '<a href="#" onclick="window._retryAvatarConnection();return false" style="color:var(--color-primary,#006EFA)">Retry</a>' +
        ' &middot; Slides still work.</span>';
    });

    sdk.on('time-warning', function (payload) {
      var remaining = (payload && payload.remainingSeconds) || 60;
      var mins = Math.floor(remaining / 60);
      var label = mins > 0 ? mins + ' minute' + (mins > 1 ? 's' : '') : remaining + ' seconds';
      log('[Avatar] Time warning: ' + remaining + 's remaining');
      showToast(label + ' remaining in this session', 'info');
    });

    sdk.on('time-expired', function () {
      log('[Avatar] Session time expired');
      avatarReady = false;
      showToast('Session ended — time limit reached', 'info');
      els.avatarLoading.classList.remove('hidden');
      els.avatarLoading.innerHTML =
        '<span style="text-align:center;padding:0 12px;">' +
        'Session ended (time limit).<br>' +
        '<a href="#" onclick="location.reload();return false" style="color:var(--color-primary,#006EFA)">Start new session</a>' +
        ' &middot; Slides still work.</span>';
    });

    sdk.on('error', function (err) {
      var code = (err && err.code) || 'unknown';
      var msg = (err && err.message) || 'Unknown error';
      console.error('[Avatar] Error:', code, msg);
      if (!err || !err.recoverable) {
        showToast('Avatar error: ' + msg, 'error');
      }
    });

    sdk.on('avatar-speaking-start', function () {
      log('[Avatar] Speaking started');
      avatarSpeaking = true;
      cancelAutoPlay();
    });

    sdk.on('avatar-text-ready', function (payload) {
      var text = (payload && payload.fullText) || (payload && payload.text) || '';
      log('[Avatar] Text ready:', text.substring(0, 80));
      if (Date.now() - commandHandledNavAt < 500) {
        log('[Avatar] Skipping parseAvatarNavigation — command already handled');
        return;
      }
      parseAvatarNavigation(text);
    });

    sdk.on('avatar-speech', function (payload) {
      var text = (payload && payload.text) || '';
      log('[Avatar] Speech:', text.substring(0, 80));
      addTranscriptEntry('Avatar', text);
      addChatMessage('avatar', text);
      detectContactAsk(text);
      lastAvatarResponseEndedWithQuestion = /\?\s*$/.test(text.trim());
    });

    sdk.on('avatar-speaking-end', function () {
      log('[Avatar] Speaking ended');
      avatarSpeaking = false;
      userTurnActive = false;
      resumeNavSuppressed = false;
      scheduleAutoPlay();
    });

    sdk.on('user-speaking-start', function () {
      log('[Avatar] User speaking (VAD)');
      resumeNavSuppressed = false;
      if (userNavTimer) {
        clearTimeout(userNavTimer);
        userNavTimer = null;
        injectDPP();
        scheduleScreenCapture();
        log('[Nav] User spoke — cancelled pending nav timer');
      }
      markUserInteraction();
    });

    var lastUserSpeech = '';
    sdk.on('user-speech', function (payload) {
      if (payload && payload.isFinal) {
        userTurnActive = true;
        lastUserSpeechTime = Date.now();
        lastUserSpeechText = payload.text;
        log('[Avatar] User said:', payload.text);
        if (lastSentText && payload.text === lastSentText) { lastSentText = ''; return; }
        if (payload.text === lastUserSpeech) return;
        resolvePendingSequentialCheck(payload.text);
        lastUserSpeech = payload.text;
        addTranscriptEntry('User', payload.text);
        addChatMessage('user', payload.text);
        if (!avatarSpeaking) scheduleAutoPlay();
        if (payload.text.length > 10 && /\?|tell me|what|how|why|show me|explain/i.test(payload.text)) {
          userQuestions.push(payload.text.substring(0, 100));
          if (userQuestions.length > 8) userQuestions.shift();
        }
      }
    });

    sdk.on('mic-granted', function (payload) {
      log('[Avatar] Microphone access granted');
      if (payload && payload.stream) micStream = payload.stream;
    });

    sdk.on('mic-denied', function () {
      log('[Avatar] Microphone access denied');
      showToast('Microphone access denied — use text input instead', 'error');
    });

    sdk.on('genui', function (payload) {
      if (!payload || !payload.type) return;
      log('[GenUI] Received:', payload.type);
      handleGenUI(payload.type, payload.data || {});
    });

    sdk.on('state-change', function (payload) {
      var from = (payload && payload.from) || '?';
      var to = (payload && payload.to) || '?';
      log('[Avatar] State: ' + from + ' → ' + to);
    });
  }

  // ─── Navigation Parsing ────────────────────────────────────────────────────────

  var lastNavTarget = 0;
  var lastNavTime = 0;

  function parseAvatarNavigation(text) {
    if (!text) return;
    if (resumeNavSuppressed) return;
    var lower = text.toLowerCase();

    var sameSlideMatch = lower.match(/navigat(?:e|ing)\s+to\s+slide\s+([\w\s-]+?)(?:\.|,|!|$)/);
    if (sameSlideMatch) {
      var parsedSameTarget = parseSlideNumber(sameSlideMatch[1].trim());
      if (parsedSameTarget && parsedSameTarget === currentPage) {
        log('[Nav Parse] BLOCKED same-slide navigation to slide', parsedSameTarget);
        return;
      }
    }

    var userSpokeRecently = userTurnActive || (Date.now() - lastUserSpeechTime < 15000);
    var avatarReason = userSpokeRecently ? 'user_asked' : 'avatar_decided';

    if (/ending presentation now/i.test(text)) {
      endSession();
      return;
    }

    if (/continu(?:e|ing)\s+(?:the\s+)?(?:presentation|deck|course)|resum(?:e|ing)\s+(?:the\s+)?(?:presentation|deck)|pick(?:ing)?\s+up\s+where/i.test(text) &&
        !/should\s+we|shall\s+we|would\s+you\s+like|want\s+(?:me\s+)?to/i.test(text)) {
      var now = Date.now();
      if (now - lastResumeTime < 5000) return;
      var resumeTarget = lastSequentialSlide;
      if (resumeTarget === currentPage) resumeTarget = currentPage + 1;
      if (resumeTarget >= 1 && resumeTarget <= totalSlides && !isRecentDuplicate(resumeTarget)) {
        log('[Nav Parse] resume → slide', resumeTarget);
        lastResumeTime = now;
        resumeNavSuppressed = true;
        nextNavReason = 'resume';
        goToSlide(resumeTarget);
        setTimeout(function () {
          if (sdk && avatarReady && currentPage === resumeTarget) {
            var slide = SLIDE_DATA[resumeTarget - 1];
            var msg = 'Now on slide ' + resumeTarget + ': "' + slide.title + '". Please present this slide.';
            lastSentText = msg;
            sdk.sendText(msg);
          }
        }, 800);
      }
      return;
    }

    var allGotoMatches = lower.match(/(?:navigat(?:e|ing)(?:\s+back)?|(?:let(?:'|')?s\s+)?mov(?:e|ing)|go(?:ing)?\s+back|skipp(?:ing)?)\s+to\s+slide\s+([\w\s-]+?)(?:\.|,|!|$)/g);
    if (allGotoMatches) {
      var lastGoto = allGotoMatches[allGotoMatches.length - 1];
      var capture = lastGoto.match(/to\s+slide\s+([\w\s-]+?)(?:\.|,|!|$)/);
      if (capture) {
        var target = parseSlideNumber(capture[1].trim());
        if (target && !isRecentDuplicate(target)) {
          nextNavReason = avatarReason;
          goToSlide(target);
          return;
        }
      }
    }

    if (/mov(?:e|ing)\s+(?:to\s+|forward\s+to\s+)?(?:the\s+)?next\s+slide/i.test(text) &&
        !/should\s+we|shall\s+we|would\s+you\s+like|want\s+(?:me\s+)?to/i.test(text)) {
      var nextTarget = currentPage + 1;
      if (!isRecentDuplicate(nextTarget)) {
        nextNavReason = avatarReason;
        goToSlide(nextTarget);
      }
      return;
    }

    if (/(?:go(?:ing)?\s+back\s+to\s+(?:the\s+)?previous\s+slide|(?:the\s+)?previous\s+slide(?:\s+please)?(?:\.|$))/i.test(text) &&
        !/should\s+we|shall\s+we|would\s+you\s+like|want\s+(?:me\s+)?to/i.test(text)) {
      var prevTarget = currentPage - 1;
      if (lastSequentialSlide !== currentPage && lastSequentialSlide < currentPage) {
        prevTarget = lastSequentialSlide;
      }
      if (!isRecentDuplicate(prevTarget)) {
        nextNavReason = (prevTarget === lastSequentialSlide) ? 'resume' : avatarReason;
        goToSlide(prevTarget);
      }
      return;
    }

    var showMatch = lower.match(/let me show you[\w\s]*?slide\s+([\w\s-]+?)(?:\.|,|!|$)/);
    if (showMatch) {
      var showTarget = parseSlideNumber(showMatch[1].trim());
      if (showTarget && !isRecentDuplicate(showTarget)) {
        nextNavReason = avatarReason;
        goToSlide(showTarget);
        return;
      }
    }
  }

  function isRecentDuplicate(target) {
    var now = Date.now();
    if (target === lastNavTarget && (now - lastNavTime) < 3000) return true;
    lastNavTarget = target;
    lastNavTime = now;
    return false;
  }

  function registerCommands() {
    if (typeof sdk.registerCommand !== 'function') {
      log('[Avatar] sdk.registerCommand not available');
      return;
    }
    try {
      sdk.registerCommand('navigate-slide', 'navigating to slide', function (match) {
        commandHandledNavAt = Date.now();
        var navMatch = match.text.toLowerCase().match(/slide\s*([\w\s-]+?)(?:\.|,|!|$)/);
        if (navMatch) {
          var cmdTarget = parseSlideNumber(navMatch[1].trim());
          if (cmdTarget && cmdTarget === currentPage) return;
        }
        parseAvatarNavigation(match.text);
      }, { timing: 'before', debounce: 150 });

      sdk.registerCommand('next-slide', 'next slide', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('prev-slide', 'previous slide', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('going-back-slide', 'going back to slide', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('skipping-slide', 'skipping to slide', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('move-to-slide', 'move to slide', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('let-me-show', 'let me show you', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('continue-pres', 'continuing the presentation', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('resume-pres', 'resuming the presentation', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('picking-up', 'picking up where', function (match) { commandHandledNavAt = Date.now(); parseAvatarNavigation(match.text); }, { timing: 'before', debounce: 150 });
      sdk.registerCommand('end-session', 'ending presentation now', function (match) { commandHandledNavAt = Date.now(); endSession(); }, { timing: 'before' });

      log('[Avatar] Commands registered');
    } catch (err) {
      log('[Avatar] registerCommand failed:', err.message);
    }
  }

  // ─── Word-to-Number Parsing ─────────────────────────────────────────────────────

  var WORD_TO_NUM = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    'twenty-one': 21, 'twenty one': 21, 'twenty-two': 22, 'twenty two': 22,
    'twenty-three': 23, 'twenty three': 23, 'twenty-four': 24, 'twenty four': 24,
    'twenty-five': 25, 'twenty five': 25, 'twenty-six': 26, 'twenty six': 26,
    'twenty-seven': 27, 'twenty seven': 27, 'twenty-eight': 28, 'twenty eight': 28,
    'twenty-nine': 29, 'twenty nine': 29, thirty: 30,
    'thirty-one': 31, 'thirty one': 31, 'thirty-two': 32, 'thirty two': 32,
    'thirty-three': 33, 'thirty three': 33, 'thirty-four': 34, 'thirty four': 34,
    'thirty-five': 35, 'thirty five': 35, 'thirty-six': 36, 'thirty six': 36,
    'thirty-seven': 37, 'thirty seven': 37, 'thirty-eight': 38, 'thirty eight': 38,
    'thirty-nine': 39, 'thirty nine': 39, forty: 40,
    'forty-one': 41, 'forty one': 41, 'forty-two': 42, 'forty two': 42,
    'forty-three': 43, 'forty three': 43, 'forty-four': 44, 'forty four': 44,
    'forty-five': 45, 'forty five': 45, 'forty-six': 46, 'forty six': 46,
    'forty-seven': 47, 'forty seven': 47, 'forty-eight': 48, 'forty eight': 48,
    'forty-nine': 49, 'forty nine': 49, fifty: 50,
    'fifty-one': 51, 'fifty one': 51, 'fifty-two': 52, 'fifty two': 52,
    'fifty-three': 53, 'fifty three': 53, 'fifty-four': 54, 'fifty four': 54,
    'fifty-five': 55, 'fifty five': 55, 'fifty-six': 56, 'fifty six': 56,
    'fifty-seven': 57, 'fifty seven': 57, 'fifty-eight': 58, 'fifty eight': 58,
    'fifty-nine': 59, 'fifty nine': 59, sixty: 60,
    'sixty-one': 61, 'sixty one': 61, 'sixty-two': 62, 'sixty two': 62,
    'sixty-three': 63, 'sixty three': 63, 'sixty-four': 64, 'sixty four': 64,
    'sixty-five': 65, 'sixty five': 65, 'sixty-six': 66, 'sixty six': 66,
    'sixty-seven': 67, 'sixty seven': 67, 'sixty-eight': 68, 'sixty eight': 68,
    'sixty-nine': 69, 'sixty nine': 69, seventy: 70,
    'seventy-one': 71, 'seventy one': 71, 'seventy-two': 72, 'seventy two': 72,
    'seventy-three': 73, 'seventy three': 73, 'seventy-four': 74, 'seventy four': 74,
    'seventy-five': 75, 'seventy five': 75, 'seventy-six': 76, 'seventy six': 76,
    'seventy-seven': 77, 'seventy seven': 77, 'seventy-eight': 78, 'seventy eight': 78,
    'seventy-nine': 79, 'seventy nine': 79, eighty: 80,
    'eighty-one': 81, 'eighty one': 81, 'eighty-two': 82, 'eighty two': 82,
    'eighty-three': 83, 'eighty three': 83, 'eighty-four': 84, 'eighty four': 84,
    'eighty-five': 85, 'eighty five': 85, 'eighty-six': 86, 'eighty six': 86,
    'eighty-seven': 87, 'eighty seven': 87, 'eighty-eight': 88, 'eighty eight': 88,
    'eighty-nine': 89, 'eighty nine': 89, ninety: 90,
    'ninety-one': 91, 'ninety one': 91, 'ninety-two': 92, 'ninety two': 92,
    'ninety-three': 93, 'ninety three': 93, 'ninety-four': 94, 'ninety four': 94,
    'ninety-five': 95, 'ninety five': 95, 'ninety-six': 96, 'ninety six': 96,
    'ninety-seven': 97, 'ninety seven': 97, 'ninety-eight': 98, 'ninety eight': 98,
    'ninety-nine': 99, 'ninety nine': 99, hundred: 100
  };

  function parseSlideNumber(str) {
    var trimmed = str.trim().replace(/[.,!;:]/g, '').replace(/^number\s+/i, '');
    var asInt = parseInt(trimmed, 10);
    if (!isNaN(asInt) && asInt >= 1 && asInt <= totalSlides) return asInt;
    var lower = trimmed.toLowerCase();
    if (WORD_TO_NUM[lower] && WORD_TO_NUM[lower] <= totalSlides) return WORD_TO_NUM[lower];
    var words = lower.split(/\s+/);
    if (words[0] === 'number') words.shift();
    if (words.length >= 2) {
      var twoWord = words[0] + ' ' + words[1];
      if (WORD_TO_NUM[twoWord] && WORD_TO_NUM[twoWord] <= totalSlides) return WORD_TO_NUM[twoWord];
      var hyphenated = words[0] + '-' + words[1];
      if (WORD_TO_NUM[hyphenated] && WORD_TO_NUM[hyphenated] <= totalSlides) return WORD_TO_NUM[hyphenated];
    }
    if (words.length >= 1 && WORD_TO_NUM[words[0]] && WORD_TO_NUM[words[0]] <= totalSlides) return WORD_TO_NUM[words[0]];
    return null;
  }

  // ─── Session End ───────────────────────────────────────────────────────────────

  function endSession() {
    saveSessionMemory();
    avatarReady = false;
    isPaused = false;
    if (els.avatarPauseOverlay) els.avatarPauseOverlay.classList.add('hidden');
    cancelAutoPlay();
    if (sdk) {
      try { sdk.disconnect(); } catch (e) {}
    }
    els.avatarPip.innerHTML =
      '<div class="avatar-loading">' +
      '<span style="color:var(--color-text-muted,#CCC);text-align:center;padding:0 16px;line-height:1.5;">' +
      'Session ended.<br>Thank you.</span></div>';
    els.chatInput.disabled = true;
    els.chatInput.placeholder = 'Session ended';
    showToast('Presentation ended. Thank you.', 'success');
  }

  // ─── Transcript & Debug ────────────────────────────────────────────────────────

  function addTranscriptEntry(role, text) {
    addDebugEntry('[' + role + '] ' + text);
  }

  function addDebugEntry(text) {
    var body = els.transcriptBody || document.getElementById('transcript-body');
    if (!body) return;

    var entry = document.createElement('div');
    entry.className = 'transcript-entry';
    var now = new Date();
    var timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    entry.innerHTML = '<span style="color:var(--color-text-muted,#999)">' + timeStr + '</span> ' + escapeHtml(text);
    body.appendChild(entry);
    body.scrollTop = body.scrollHeight;
  }

  // ─── Toast Notifications ───────────────────────────────────────────────────────

  var toastTimer = null;

  function showToast(message, type) {
    if (!els.statusToast || !els.statusMessage) return;
    if (toastTimer) clearTimeout(toastTimer);
    els.statusMessage.textContent = message;
    els.statusToast.className = 'status-toast visible' + (type ? ' ' + type : '');
    toastTimer = setTimeout(function () {
      els.statusToast.className = 'status-toast hidden';
    }, 4000);
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────────

  function bindEvents() {
    els.btnPrev.addEventListener('click', function () {
      nextNavReason = 'user_btn';
      goToSlide(currentPage - 1, true);
    });

    els.btnNext.addEventListener('click', function () {
      nextNavReason = 'user_btn';
      goToSlide(currentPage + 1, true);
    });

    function showSlideJump() {
      els.slideLabel.classList.add('hidden');
      els.slideJumpInput.classList.remove('hidden');
      els.slideJumpInput.value = currentPage;
      els.slideJumpInput.focus();
      els.slideJumpInput.select();
    }

    function hideSlideJump() {
      els.slideJumpInput.classList.add('hidden');
      els.slideLabel.classList.remove('hidden');
    }

    function commitSlideJump() {
      var val = parseInt(els.slideJumpInput.value, 10);
      if (!isNaN(val) && val >= 1 && val <= totalSlides && val !== currentPage) {
        nextNavReason = 'user_btn';
        goToSlide(val, true);
      }
      hideSlideJump();
    }

    els.slideLabel.addEventListener('click', showSlideJump);
    els.slideLabel.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showSlideJump(); }
    });
    els.slideJumpInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commitSlideJump(); }
      if (e.key === 'Escape') { e.preventDefault(); hideSlideJump(); }
    });
    els.slideJumpInput.addEventListener('blur', hideSlideJump);

    function toggleAutoplay() {
      autoPlayAutoDisabled = false;
      autoPlayEnabled = !autoPlayEnabled;
      setAutoPlayUI(autoPlayEnabled);
      if (autoPlayEnabled) {
        if (!avatarSpeaking && !userInteractedRecently) scheduleAutoPlay();
      } else {
        cancelAutoPlay();
      }
    }

    function toggleCaptions() {
      if (!sdk) return;
      var isOn = sdk.isCaptionsEnabled();
      sdk.setCaptionsEnabled(!isOn);
      var nowOn = !isOn;
      els.btnCC.setAttribute('aria-pressed', String(nowOn));
      els.btnCC.title = nowOn ? 'Hide closed captions (C)' : 'Show closed captions (C)';
      log('[Captions] ' + (nowOn ? 'enabled' : 'disabled'));
    }

    els.btnAutoplay.addEventListener('click', toggleAutoplay);
    els.btnAutoplay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAutoplay(); }
    });

    els.btnMute.addEventListener('click', function () {
      if (!sdk || !avatarReady) return;
      isMuted = !isMuted;
      if (isMuted) {
        sdk.muteMic();
        if (micStream) micStream.getAudioTracks().forEach(function (t) { t.enabled = false; });
        els.btnMute.classList.add('muted');
        els.btnMute.setAttribute('aria-pressed', 'true');
        els.btnMute.setAttribute('aria-label', 'Unmute microphone');
        els.iconMicOn.classList.add('hidden');
        els.iconMicOff.classList.remove('hidden');
      } else {
        sdk.unmuteMic();
        if (micStream) micStream.getAudioTracks().forEach(function (t) { t.enabled = true; });
        els.btnMute.classList.remove('muted');
        els.btnMute.setAttribute('aria-pressed', 'false');
        els.btnMute.setAttribute('aria-label', 'Mute microphone');
        els.iconMicOn.classList.remove('hidden');
        els.iconMicOff.classList.add('hidden');
      }
    });

    els.btnCC.addEventListener('click', toggleCaptions);

    els.chatInput.addEventListener('focus', function () { cancelAutoPlay(); });

    els.chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var question = els.chatInput.value.trim();
      if (!question) return;
      if (sdk && avatarReady) {
        markUserInteraction();
        lastUserSpeechTime = Date.now();
        lastUserSpeechText = question;
        resolvePendingSequentialCheck(question);
        userTurnActive = true;
        lastSentText = question;
        sdk.sendText(question);
        addTranscriptEntry('User', question);
        addChatMessage('user', question);
        els.chatInput.value = '';
      } else {
        showToast('Avatar not connected — cannot send question', 'error');
      }
    });

    if (isDebug && els.btnClearMemory) {
      els.btnClearMemory.classList.remove('hidden');
      els.btnClearMemory.addEventListener('click', function () {
        localStorage.removeItem(STORAGE_KEY);
        sessionMemory = null;
        sessionMemoryInjected = true;
        sessionMemoryCleared = true;
        showToast('Session memory cleared — reload to start fresh', 'success');
      });
    }

    if (!isDebug && els.btnTranscript) {
      els.btnTranscript.classList.add('hidden');
    }
    if (els.btnTranscript) {
      els.btnTranscript.addEventListener('click', function () { els.transcriptPanel.classList.toggle('hidden'); });
    }
    if (els.btnCloseTranscript) {
      els.btnCloseTranscript.addEventListener('click', function () { els.transcriptPanel.classList.add('hidden'); });
    }
    if (els.btnDownloadTranscript) {
      els.btnDownloadTranscript.addEventListener('click', function () {
        var text = els.transcriptBody.innerText;
        var blob = new Blob([text], { type: 'text/plain' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Avatar_Debug_Log_' + new Date().toISOString().slice(0, 10) + '.txt';
        a.click();
        URL.revokeObjectURL(a.href);
      });
    }

    if (els.contactForm) els.contactForm.addEventListener('submit', function (e) { e.preventDefault(); submitContact(); });
    if (els.btnContactSkip) els.btnContactSkip.addEventListener('click', skipContact);
    if (els.btnCloseContact) els.btnCloseContact.addEventListener('click', skipContact);
    var backdrop = els.contactModal && els.contactModal.querySelector('.contact-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', skipContact);

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (els.transcriptPanel) els.transcriptPanel.classList.add('hidden');
        els.chatInput.blur();
        return;
      }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown':
          e.preventDefault(); nextNavReason = 'user_key'; goToSlide(currentPage + 1, true); break;
        case 'ArrowLeft': case 'ArrowUp':
          e.preventDefault(); nextNavReason = 'user_key'; goToSlide(currentPage - 1, true); break;
        case 'Home':
          e.preventDefault(); nextNavReason = 'user_key'; goToSlide(1, true); break;
        case 'End':
          e.preventDefault(); nextNavReason = 'user_key'; goToSlide(totalSlides, true); break;
        case 'c':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); toggleCaptions(); } break;
        case 't':
          if (!e.metaKey && !e.ctrlKey && els.btnTranscript) { e.preventDefault(); els.btnTranscript.click(); } break;
      }
    });

    // Responsive re-render
    var resizeTimer = null;
    if (els.container) {
      new ResizeObserver(function () {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { renderPage(currentPage); }, 100);
      }).observe(els.container);
    }
  }

  // ─── Avatar Pause/Resume ─────────────────────────────────────────────────────

  function togglePause() {
    if (!sdk || !avatarReady) return;
    isPaused = !isPaused;
    els.avatarPip.classList.toggle('paused', isPaused);
    if (isPaused) {
      sdk.pause();
      cancelAutoPlay();
      els.avatarPauseOverlay.classList.remove('hidden');
      log('[Pause] Avatar paused');
    } else {
      sdk.resume();
      els.avatarPauseOverlay.classList.add('hidden');
      if (currentPage !== lastDPPSlide) {
        scheduleAvatarNotification(0);
      } else {
        injectDPP();
        var slide = SLIDE_DATA[currentPage - 1];
        var msg = '[RESUMED] User unpaused. Still on slide ' + currentPage + ': "' + slide.title + '". Continue.';
        lastSentText = msg;
        sdk.sendText(msg);
      }
      if (!avatarSpeaking) scheduleAutoPlay();
      log('[Pause] Avatar resumed');
    }
  }

  // ─── Avatar PIP Drag ────────────────────────────────────────────────────────

  function initDrag() {
    var pip = els.avatarPip;
    if (!pip) return;
    var dragging = false;
    var offsetX = 0, offsetY = 0;
    var startX = 0, startY = 0;
    var didDrag = false;

    function onStart(e) {
      var ev = e.touches ? e.touches[0] : e;
      dragging = true;
      didDrag = false;
      startX = ev.clientX;
      startY = ev.clientY;
      var rect = pip.getBoundingClientRect();
      offsetX = ev.clientX - rect.left;
      offsetY = ev.clientY - rect.top;
      pip.classList.add('dragging');
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      var ev = e.touches ? e.touches[0] : e;
      if (!didDrag && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
        didDrag = true;
      }
      var container = pip.parentElement.getBoundingClientRect();
      var x = ev.clientX - container.left - offsetX;
      var y = ev.clientY - container.top - offsetY;
      x = Math.max(0, Math.min(x, container.width - pip.offsetWidth));
      y = Math.max(0, Math.min(y, container.height - pip.offsetHeight));
      pip.style.left = x + 'px';
      pip.style.top = y + 'px';
      pip.style.right = 'auto';
      pip.style.bottom = 'auto';
      e.preventDefault();
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      pip.classList.remove('dragging');
      if (!didDrag) togglePause();
    }

    pip.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    pip.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    pip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePause(); }
    });
  }

  // ─── GenUI Handling ─────────────────────────────────────────────────────────────

  var videoOverlayActive = false;

  function handleGenUI(type, data) {
    switch (type) {
      case 'showVisualLink': showLinkOverlay(data); break;
      case 'showVisualVideo': case 'showMedia': case 'showIFrame': showVideoOverlay(); break;
      case 'contactEmail': showContactModal('email'); break;
      case 'contactPhone': showContactModal('phone'); break;
      case 'hideVisuals': case 'hideMedia': hideVideoOverlay(); break;
      default: log('[GenUI] Type:', type);
    }
  }

  function createOverlayCloseBtn() {
    var btn = document.createElement('button');
    btn.className = 'video-overlay-close';
    btn.setAttribute('aria-label', 'Close');
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    btn.addEventListener('click', function () {
      hideVideoOverlay();
      if (sdk && typeof sdk.hideGenUI === 'function') sdk.hideGenUI();
    });
    return btn;
  }

  function showVideoOverlay() {
    cancelAutoPlay();
    els.videoOverlay.classList.remove('hidden');
    videoOverlayActive = true;
    if (!els.videoOverlay.querySelector('.video-overlay-close')) {
      els.videoOverlay.appendChild(createOverlayCloseBtn());
    }
    log('[GenUI] Video overlay shown');
  }

  function hideVideoOverlay() {
    if (!videoOverlayActive) return;
    els.videoOverlay.classList.add('hidden');
    els.videoOverlay.style.background = '';
    videoOverlayActive = false;
    log('[GenUI] Video overlay closed');
    scheduleAutoPlay();
  }

  function showLinkOverlay(data) {
    cancelAutoPlay();
    var url = data.linkUrl || data.mediaUrl || data.url || '';
    var text = data.linkText || data.title || url || 'Open Link';
    if (!url) return;
    els.videoOverlay.innerHTML = '';
    els.videoOverlay.classList.remove('hidden');
    els.videoOverlay.style.background = 'transparent';
    videoOverlayActive = true;
    var card = document.createElement('div');
    card.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:16px;padding:20px 16px 60px;pointer-events:none;';
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    link.style.cssText = 'pointer-events:all;color:#fff;font-size:clamp(14px, 2.5vw, 18px);font-weight:600;text-decoration:none;padding:12px 24px;background:rgba(0,110,250,0.9);border-radius:8px;box-shadow:0 4px 20px rgba(0,110,250,0.5);transition:all 0.2s;text-align:center;max-width:90%;';
    card.appendChild(link);
    els.videoOverlay.appendChild(card);
    els.videoOverlay.appendChild(createOverlayCloseBtn());
    log('[GenUI] Link overlay:', url);
  }

  // ─── Auto-Play ─────────────────────────────────────────────────────────────────

  function setAutoPlayUI(enabled) {
    if (!els.btnAutoplay) return;
    if (enabled) {
      els.btnAutoplay.classList.add('active');
      els.btnAutoplay.title = 'Auto-advance slides: on';
      els.btnAutoplay.setAttribute('aria-checked', 'true');
      if (els.iconAutoplayOn) els.iconAutoplayOn.classList.remove('hidden');
      if (els.iconAutoplayOff) els.iconAutoplayOff.classList.add('hidden');
    } else {
      els.btnAutoplay.classList.remove('active');
      els.btnAutoplay.title = 'Auto-advance slides: off';
      els.btnAutoplay.setAttribute('aria-checked', 'false');
      if (els.iconAutoplayOn) els.iconAutoplayOn.classList.add('hidden');
      if (els.iconAutoplayOff) els.iconAutoplayOff.classList.remove('hidden');
    }
  }

  function markUserInteraction() {
    if (!autoPlayEnabled && autoPlayAutoDisabled) {
      autoPlayAutoDisabled = false;
      autoPlayEnabled = true;
      setAutoPlayUI(true);
      log('[AutoPlay] Re-enabled — user re-engaged');
    }
    userInteractedRecently = true;
    cancelAutoPlay();
    if (userInteractionTimer) clearTimeout(userInteractionTimer);
    userInteractionTimer = setTimeout(function () {
      userInteractedRecently = false;
      if (!avatarSpeaking) scheduleAutoPlay();
    }, 10000);
  }

  function cancelAutoPlay() {
    if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; }
    hideCountdown();
  }

  function showCountdown(durationMs) {
    var ring = els.autoplayRing;
    if (!ring) return;
    var circle = ring.querySelector('circle');
    if (!circle) return;
    circle.style.transition = 'none';
    circle.style.strokeDashoffset = '157';
    void circle.offsetWidth;
    circle.style.transition = 'stroke-dashoffset ' + durationMs + 'ms linear';
    circle.style.strokeDashoffset = '0';
    ring.classList.add('active');
  }

  function hideCountdown() {
    var ring = els.autoplayRing;
    if (!ring) return;
    var circle = ring.querySelector('circle');
    if (!circle) return;
    ring.classList.remove('active');
    circle.style.transition = 'none';
    circle.style.strokeDashoffset = '157';
  }

  function scheduleAutoPlay() {
    cancelAutoPlay();
    if (!autoPlayEnabled || !avatarReady || avatarSpeaking || userInteractedRecently || contactModalOpen || videoOverlayActive || isPaused) return;
    var delay = lastAvatarResponseEndedWithQuestion ? AUTO_PLAY_AFTER_QUESTION_MS : AUTO_PLAY_DELAY_MS;
    showCountdown(delay);
    autoPlayTimer = setTimeout(function () {
      if (!autoPlayEnabled || !avatarReady || avatarSpeaking || userInteractedRecently || contactModalOpen || videoOverlayActive || isPaused) return;
      hideCountdown();
      lastAvatarResponseEndedWithQuestion = false;
      if (currentPage < totalSlides) {
        log('[AutoPlay] Advancing to slide', currentPage + 1);
        nextNavReason = 'autoplay';
        goToSlide(currentPage + 1, true);
      }
    }, delay);
  }

  // ─── Contact Collection ────────────────────────────────────────────────────────

  var EMAIL_ASK_PATTERNS = /what email|email works best|send that.*email|follow up.*email|email.*follow up|what.+good email|grab your email|need.*email/i;
  var PHONE_ASK_PATTERNS = /what.+good number|phone number|reach you.*(?:phone|number)|connect you.*number|best number|grab your.*(?:phone|number)/i;

  function detectContactAsk(text) {
    if (!CONFIG.contact || !CONFIG.contact.enabled) return;
    if (contactModalOpen) return;
    var maxDeclines = (CONFIG.contact && CONFIG.contact.maxDeclines) || 2;
    if (contactDeclinedCount >= maxDeclines) return;
    if (!contactCollected.email && EMAIL_ASK_PATTERNS.test(text)) {
      showContactModal('email');
    } else if (!contactCollected.phone && PHONE_ASK_PATTERNS.test(text)) {
      showContactModal('phone');
    }
  }

  function showContactModal(mode) {
    if (!els.contactModal) return;
    currentContactType = mode || 'email';
    contactModalOpen = true;
    cancelAutoPlay();
    els.contactModal.classList.remove('hidden');

    var contactConfig = CONFIG.contact || {};
    if (els.contactTitle) els.contactTitle.textContent = contactConfig.title || 'Stay connected';
    if (els.contactSubtitle) els.contactSubtitle.textContent = contactConfig.subtitle || '';
    if (els.btnContactSubmit) els.btnContactSubmit.textContent = contactConfig.submitButtonText || 'Submit';
    if (els.btnContactSkip) els.btnContactSkip.textContent = contactConfig.skipButtonText || 'Maybe later';
    var privacyNote = document.getElementById('contact-privacy-note');
    if (privacyNote && contactConfig.privacyNote) privacyNote.textContent = contactConfig.privacyNote;

    if (mode === 'phone') {
      els.contactEmailGroup.classList.add('hidden');
      els.contactPhoneGroup.classList.remove('hidden');
      setTimeout(function () { els.contactPhone.focus(); }, 100);
    } else {
      els.contactEmailGroup.classList.remove('hidden');
      els.contactPhoneGroup.classList.add('hidden');
      setTimeout(function () { els.contactEmail.focus(); }, 100);
    }
  }

  function hideContactModal() {
    contactModalOpen = false;
    if (els.contactModal) els.contactModal.classList.add('hidden');
    if (els.contactEmail) els.contactEmail.value = '';
    if (els.contactPhone) els.contactPhone.value = '';
  }

  function submitContact() {
    var email = els.contactEmail ? els.contactEmail.value.trim() : '';
    var phone = els.contactPhone ? els.contactPhone.value.trim() : '';
    var submitted = false;

    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      contactCollected.email = email;
      if (sdk && avatarReady) { sdk.submitContact('email', email); submitted = true; }
    }
    if (phone && phone.length >= 7) {
      contactCollected.phone = phone;
      if (sdk && avatarReady) { sdk.submitContact('phone', phone); submitted = true; }
    }

    if (submitted) {
      showToast('Contact info shared — thank you', 'success');
    } else if (!contactCollected.email && !contactCollected.phone) {
      showToast('Please enter a valid email or phone', 'error');
      return;
    }
    hideContactModal();
  }

  function skipContact() {
    contactDeclinedCount++;
    hideContactModal();
    if (sdk && avatarReady) {
      sdk.rejectContact(currentContactType || 'email');
      sdk.sendText('[User declined to share ' + (currentContactType || 'email') + '. Do not ask again this session.]');
    }
  }

  // ─── Welcome Screen Setup ──────────────────────────────────────────────────────

  function setupWelcomeScreen() {
    var title = document.getElementById('start-title');
    var subtitle = document.getElementById('start-subtitle');
    var stepsContainer = document.getElementById('welcome-steps');
    var btnStartText = document.getElementById('btn-start-text');
    var disclaimerContent = document.getElementById('disclaimer-content');
    var disclaimerLinks = document.getElementById('disclaimer-links');

    if (title && CONFIG.branding) title.textContent = CONFIG.branding.title || '';
    if (subtitle && CONFIG.welcomeScreen) subtitle.textContent = CONFIG.welcomeScreen.subtitle || '';

    if (stepsContainer && CONFIG.welcomeScreen && CONFIG.welcomeScreen.steps) {
      CONFIG.welcomeScreen.steps.forEach(function (step) {
        var li = document.createElement('li');
        li.className = 'start-step';
        li.innerHTML = '<span class="start-step-text"><strong>' + escapeHtml(step.title || '') + '</strong> &mdash; ' + escapeHtml(step.description || '') + '</span>';
        stepsContainer.appendChild(li);
      });
    }

    if (btnStartText && CONFIG.disclaimer) {
      btnStartText.textContent = CONFIG.disclaimer.startButtonText || 'I Acknowledge — Start';
    }

    if (disclaimerContent && CONFIG.disclaimer && CONFIG.disclaimer.sections) {
      var html = '<h2 class="disclaimer-heading">' + escapeHtml(CONFIG.disclaimer.heading || 'Disclaimer') + '</h2>';
      CONFIG.disclaimer.sections.forEach(function (section) {
        html += '<h3>' + escapeHtml(section.title || '') + '</h3>';
        if (Array.isArray(section.paragraphs)) {
          section.paragraphs.forEach(function (p) { html += '<p>' + p + '</p>'; });
        } else if (section.text) {
          html += '<p>' + section.text + '</p>';
        }
      });
      disclaimerContent.innerHTML = html;
    }

    if (disclaimerLinks && CONFIG.disclaimer && CONFIG.disclaimer.links) {
      CONFIG.disclaimer.links.forEach(function (link) {
        var a = document.createElement('a');
        a.href = link.url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = link.text || '';
        disclaimerLinks.appendChild(a);
      });
    }

    // PDF link in header
    var pdfLink = document.getElementById('btn-download-pdf');
    if (pdfLink && CONFIG.deck && CONFIG.deck.pdfUrl) {
      var pdfHref = CONFIG.deck.pdfUrl;
      var ver = typeof APP_VERSION !== 'undefined' ? APP_VERSION : (CONFIG.version || '');
      if (ver) pdfHref += (pdfHref.indexOf('?') === -1 ? '?' : '&') + 'v=' + ver;
      pdfLink.href = pdfHref;
    }

    // Version tag
    var versionTag = document.getElementById('version-tag');
    if (versionTag) versionTag.textContent = 'v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : CONFIG.version || '');
  }

  // ─── Access Gate ────────────────────────────────────────────────────────────────

  function checkAccessGate() {
    if (!CONFIG.accessGate || !CONFIG.accessGate.enabled) return true;

    var bypassParam = CONFIG.accessGate.bypassParam || 'token';
    var urlParams = new URLSearchParams(window.location.search);
    var token = urlParams.get(bypassParam);
    var codes = CONFIG.accessGate.codes || [];
    if (token && codes.indexOf(token) !== -1) return true;

    var gate = document.getElementById('access-gate');
    var gatePrompt = document.getElementById('gate-prompt');
    var gateInput = document.getElementById('gate-input');
    var gateSubmit = document.getElementById('gate-submit');
    var gateError = document.getElementById('gate-error');

    if (!gate) return true;
    gate.classList.remove('hidden');
    if (els.startOverlay) els.startOverlay.classList.add('hidden');
    if (gatePrompt) gatePrompt.textContent = CONFIG.accessGate.prompt || 'Enter access code';

    gateSubmit.addEventListener('click', function () {
      var val = gateInput.value.trim();
      if (codes.indexOf(val) !== -1) {
        gate.classList.add('hidden');
        if (els.startOverlay) els.startOverlay.classList.remove('hidden');
      } else {
        gateError.classList.remove('hidden');
        gateError.textContent = CONFIG.accessGate.errorMessage || 'Invalid code.';
      }
    });
    gateInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') gateSubmit.click();
    });

    return false;
  }

  // ─── TOC Sidebar ──────────────────────────────────────────────────────────────

  function initTOC() {
    if (!els.tocSidebar || !els.btnTocToggle) return;
    if (CONFIG.features && CONFIG.features.toc === false) {
      els.tocSidebar.style.display = 'none';
      return;
    }

    els.btnTocToggle.addEventListener('click', function () {
      els.tocSidebar.classList.toggle('open');
    });

    var sections = els.tocSidebar.querySelectorAll('.toc-section');
    if (!sections.length) return;

    sections.forEach(function (section) {
      var start = parseInt(section.dataset.start, 10);
      var end = parseInt(section.dataset.end, 10);
      var titleEl = section.querySelector('.toc-section-title');
      var slidesEl = section.querySelector('.toc-slides');
      if (!titleEl || !slidesEl) return;

      titleEl.addEventListener('click', function () {
        var wasExpanded = section.classList.contains('expanded');
        sections.forEach(function (s) { s.classList.remove('expanded'); });
        if (!wasExpanded) section.classList.add('expanded');
      });

      for (var i = start; i <= end; i++) {
        var slide = SLIDE_DATA[i - 1];
        if (!slide) continue;
        var item = document.createElement('div');
        item.className = 'toc-slide-item';
        item.dataset.slide = i;
        item.textContent = i + '. ' + (slide.title || 'Slide ' + i);
        item.addEventListener('click', (function (num) {
          return function () {
            nextNavReason = 'user_btn';
            goToSlide(num, true);
            if (window.innerWidth < 768) els.tocSidebar.classList.remove('open');
          };
        })(i));
        slidesEl.appendChild(item);
      }
    });

    updateTOCHighlight(currentPage);
  }

  function updateTOCHighlight(slideNum) {
    if (!els.tocSidebar) return;
    els.tocSidebar.querySelectorAll('.toc-slide-item.current').forEach(function (el) {
      el.classList.remove('current');
    });
    var item = els.tocSidebar.querySelector('.toc-slide-item[data-slide="' + slideNum + '"]');
    if (item) {
      item.classList.add('current');
      var section = item.closest('.toc-section');
      if (section && !section.classList.contains('expanded')) {
        els.tocSidebar.querySelectorAll('.toc-section').forEach(function (s) { s.classList.remove('expanded'); });
        section.classList.add('expanded');
      }
      els.tocSidebar.querySelectorAll('.toc-section').forEach(function (s) { s.classList.remove('active'); });
      if (section) section.classList.add('active');
    }
  }

  // ─── Chat Log ────────────────────────────────────────────────────────────────

  function addChatMessage(role, text) {
    if (!els.chatLog || !text) return;
    if (CONFIG.features && CONFIG.features.chatLog === false) return;
    var cleaned = text.trim().replace(/<[^>]+>/g, '');
    if (!cleaned || cleaned.length < 3) return;
    if (role === lastChatRole && cleaned === lastChatMsg) return;
    lastChatMsg = cleaned;
    lastChatRole = role;

    var msg = document.createElement('div');
    msg.className = 'chat-msg chat-msg-' + role;
    msg.textContent = cleaned;
    els.chatLog.appendChild(msg);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;

    while (els.chatLog.children.length > 6) {
      els.chatLog.removeChild(els.chatLog.firstChild);
    }
  }

  function initChatToggle() {
    if (!els.btnChatToggle || !els.chatLogWrapper) return;
    if (CONFIG.features && CONFIG.features.chatLog === false) {
      els.chatLogWrapper.style.display = 'none';
      return;
    }
    els.chatLogWrapper.classList.add('visible');
    els.btnChatToggle.addEventListener('click', function () {
      els.chatLogWrapper.classList.toggle('visible');
    });
  }

  // ─── Initialization ──────────────────────────────────────────────────────────

  function handleStart() {
    els.startOverlay.classList.add('hidden');
    if (els.wrapper) els.wrapper.classList.remove('hidden');
    initAvatar();
  }

  function handleContinueToDisclaimer() {
    var welcomeStep = document.getElementById('welcome-step');
    var disclaimerStep = document.getElementById('disclaimer-step');
    if (welcomeStep) welcomeStep.classList.add('hidden');
    if (disclaimerStep) disclaimerStep.classList.remove('hidden');
  }

  async function init() {
    cacheDOMRefs();
    setupWelcomeScreen();

    if (!checkAccessGate()) return;

    currentSlideEnteredAt = Date.now();
    sessionMemory = loadSessionMemory();
    if (sessionMemory) {
      log('[Memory] Loaded prior session — last slide:', sessionMemory.lastSlide);
      if (sessionMemory.contact) contactCollected = sessionMemory.contact;
      if (sessionMemory.contactDeclined) contactDeclinedCount = sessionMemory.contactDeclined;
      if (sessionMemory.lastSequential && sessionMemory.lastSequential > 1) {
        lastSequentialSlide = sessionMemory.lastSequential;
      } else if (sessionMemory.lastSlide && sessionMemory.lastSlide > 1) {
        lastSequentialSlide = sessionMemory.lastSlide;
      }
    }
    slidesPresented.add(1);
    bindEvents();
    initDrag();
    initTOC();
    initChatToggle();
    updateSlideUI();
    await loadPDF();

    window.addEventListener('beforeunload', saveSessionMemory);

    var btnContinue = document.getElementById('btn-continue');
    if (btnContinue) btnContinue.addEventListener('click', handleContinueToDisclaimer);
    if (els.btnStart) els.btnStart.addEventListener('click', handleStart);

    // If welcome screen is disabled, skip directly to presentation
    if (CONFIG.features && CONFIG.features.welcomeScreen === false) {
      handleStart();
    }
  }

  if (isDebug) {
    window.__DEBUG__ = {
      getState: function () { return { slideHistory: slideHistory, lastSequentialSlide: lastSequentialSlide, currentPage: currentPage, userTurnActive: userTurnActive }; },
      getMemory: function () { return { stored: sessionMemory, current: { slidesPresented: Array.from(slidesPresented), userQuestions: userQuestions, contactCollected: contactCollected } }; },
      buildDPP: function () { return buildSlideDPP(currentPage - 1); },
      parseNav: parseAvatarNavigation
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
