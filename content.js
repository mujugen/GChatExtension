(function () {
  'use strict';

  const STORAGE_KEY = 'gchat_pinned_chats_v1';
  const SECTION_ID  = 'gchat-pinned-section';
  const DIVIDER_ID  = 'gchat-pinned-divider';
  const MENU_ID     = 'gchat-pin-context-menu';
  const LAST_CLASS  = 'gchat-pinned-last';
  const CHAT_ID_RE  = /^(space|dm)\//;
  const CHAT_SEL    = 'span[id^="space/"], span[id^="dm/"]';

  let pinnedIds        = new Set();
  let chatListParent   = null;
  let observer         = null;
  let anchorObserver   = null;
  let recoveryObserver = null; // watches document.body when chat list is gone
  let observedTarget   = null;
  let isApplying       = false;
  let applyPending     = false;
  let activeMenu       = null;

  // ── Storage ───────────────────────────────────────────────────────────────────

  function loadPinned() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      pinnedIds = new Set(
        Array.isArray(raw) ? raw.filter(id => typeof id === 'string' && CHAT_ID_RE.test(id)) : []
      );
    } catch { pinnedIds = new Set(); }
  }

  function savePinned() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]));
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  const getSection = () => document.getElementById(SECTION_ID);
  const getDivider = () => document.getElementById(DIVIDER_ID);

  function chatSpanAt(el) {
    while (el && el !== document.body) {
      if (el.tagName === 'SPAN' && CHAT_ID_RE.test(el.id || '')) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Find the div that directly parents all chat spans.
  // Uses max-count heuristic to pick the main list over search panels etc.
  // Spans inside #i5 are excluded — that element is Google Chat's sidebar
  // tooltip/mini panel which duplicates the same span IDs as the real list.
  function resolveChatListParent() {
    const i5 = document.getElementById('i5');
    const spans = [...document.querySelectorAll(CHAT_SEL)]
      .filter(s => !i5 || !i5.contains(s));
    if (!spans.length) return null;

    const counts = new Map();
    for (const s of spans) {
      const p = s.parentElement;
      if (p) counts.set(p, (counts.get(p) || 0) + 1);
    }

    let best = null, bestCount = 0;
    for (const [p, c] of counts) {
      if (c > bestCount) { best = p; bestCount = c; }
    }
    return best;
  }

  // ── Health check ──────────────────────────────────────────────────────────────

  function stateIsHealthy() {
    if (!chatListParent?.isConnected) return false;
    const section = getSection(), divider = getDivider();
    if (!section?.isConnected || !divider?.isConnected) return false;
    if (section.parentElement !== chatListParent) return false;
    if (section.previousElementSibling !== null) return false; // chat promoted above section

    const i5 = document.getElementById('i5');
    for (const id of pinnedIds) {
      const span = [...document.querySelectorAll(`span[id="${CSS.escape(id)}"]`)]
        .find(s => !i5 || !i5.contains(s));
      if (!span?.isConnected) continue;
      if (span.parentElement !== chatListParent) return false;
      if (!(span.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
    }
    return true;
  }

  // ── Section / divider elements ────────────────────────────────────────────────

  function ensureSection() {
    let s = getSection();
    if (!s) {
      s = document.createElement('div');
      s.id = SECTION_ID;
      const h = document.createElement('div');
      h.className = 'gchat-pinned-header';
      h.textContent = 'Pinned';
      s.appendChild(h);
      chatListParent.insertBefore(s, chatListParent.firstChild);
    }
    return s;
  }

  function ensureDivider() {
    let d = getDivider();
    if (!d) { d = document.createElement('div'); d.id = DIVIDER_ID; }
    return d;
  }

  // ── Core ──────────────────────────────────────────────────────────────────────

  function apply() {
    if (isApplying) return;
    isApplying   = true;
    applyPending = false;

    try {
      if (!chatListParent?.isConnected) {
        const fresh = resolveChatListParent();
        if (!fresh) return;
        chatListParent = fresh;
        startObserver();
      }

      if (pinnedIds.size === 0) {
        getSection()?.remove();
        getDivider()?.remove();
        return;
      }

      const section = ensureSection();
      const divider = ensureDivider();
      let cursor = section;

      const i5 = document.getElementById('i5');
      for (const id of pinnedIds) {
        const esc = CSS.escape(id);
        const all = [...document.querySelectorAll(`span[id="${esc}"]`)]
          .filter(s => !i5 || !i5.contains(s));
        if (!all.length) continue;

        const span = all.find(s => s.parentElement === chatListParent)
                  || all.find(s => chatListParent.contains(s))
                  || all[0];

        if (span.parentElement === chatListParent && cursor.nextElementSibling === span) {
          cursor = span;
          continue;
        }

        // Use cursor.after() rather than insertBefore(span, cursor.nextSibling) —
        // avoids NotFoundError when synchronous DOM events fire mid-insertBefore
        // and move cursor out of chatListParent before nextSibling is read.
        cursor.after(span);
        if (span.parentElement !== chatListParent) chatListParent.appendChild(span);
        cursor = span;
      }

      if (cursor.nextElementSibling !== divider || divider.parentElement !== chatListParent) {
        cursor.after(divider);
        if (divider.parentElement !== chatListParent) chatListParent.appendChild(divider);
      }

      const wantsLast = cursor !== section ? cursor : null;
      const hasLast   = chatListParent.querySelector('.' + LAST_CLASS);
      if (hasLast !== wantsLast) {
        hasLast?.classList.remove(LAST_CLASS);
        wantsLast?.classList.add(LAST_CLASS);
      }

      // Evict unpinned spans that Google Chat pushed above the divider.
      let scan = section.nextElementSibling;
      while (scan && scan !== divider) {
        const next = scan.nextElementSibling;
        if (CHAT_ID_RE.test(scan.id || '') && !pinnedIds.has(scan.id)) {
          divider.after(scan);
          if (scan.parentElement !== chatListParent) chatListParent.appendChild(scan);
        }
        scan = next;
      }

      // Also evict chats that Google Chat promoted above the pinned section itself
      // (e.g. a new message arriving in an unpinned chat, or a first-time contact).
      let pre = chatListParent.firstElementChild;
      while (pre && pre !== section) {
        const next = pre.nextElementSibling;
        if (CHAT_ID_RE.test(pre.id || '')) {
          divider.after(pre);
          if (pre.parentElement !== chatListParent) chatListParent.appendChild(pre);
        }
        pre = next;
      }

    } catch (e) {
      console.warn('[gchat-pins]', e);
    } finally {
      isApplying = false;
    }
  }

  function scheduleApply() {
    if (applyPending) return;
    applyPending = true;
    setTimeout(apply, 80);
  }

  // ── Pin / Unpin / Reorder ─────────────────────────────────────────────────────

  function pin(id)   { pinnedIds.add(id);    savePinned(); apply(); }
  function unpin(id) { pinnedIds.delete(id); savePinned(); apply(); }

  function movePin(id, dir) {
    const arr = [...pinnedIds];
    const i   = arr.indexOf(id);
    if (i === -1) return;
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    pinnedIds = new Set(arr);
    savePinned();
    apply();
  }

  // ── Recovery observer ─────────────────────────────────────────────────────────
  // Watches document.body for chat spans to re-appear after the sidebar has been
  // removed from the DOM (e.g. opening a chat full-screen). Fires within ~50ms
  // of spans re-appearing rather than waiting for the next 750ms watchdog tick.

  function startRecovery() {
    if (recoveryObserver) return; // already watching

    let pending = false;
    recoveryObserver = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        const p = resolveChatListParent();
        if (!p) return;
        // Found a parent — hand off to the normal init path.
        stopRecovery();
        initChatList(p);
      }, 50);
    });

    recoveryObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopRecovery() {
    recoveryObserver?.disconnect();
    recoveryObserver = null;
  }

  // ── Main MutationObserver ─────────────────────────────────────────────────────

  function startObserver() {
    observer?.disconnect();
    anchorObserver?.disconnect();
    stopRecovery(); // no longer needed once the main observer is live
    if (!chatListParent) return;

    const target = chatListParent.parentElement || chatListParent;
    observedTarget = target;

    observer = new MutationObserver((mutations) => {
      if (isApplying || pinnedIds.size === 0) return;

      outer: for (const { type, addedNodes, removedNodes } of mutations) {
        if (type !== 'childList') continue;

        for (const node of addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Use node.id (not node === getSection()) — getSection() returns null
          // after removal, making the reference-equality check always false.
          if (node.id === SECTION_ID || node.id === DIVIDER_ID) continue;
          if (CHAT_ID_RE.test(node.id || '')) { scheduleApply(); break outer; }
          if (typeof node.querySelector === 'function') {
            for (const id of pinnedIds) {
              if (node.querySelector(`span[id="${CSS.escape(id)}"]`)) {
                scheduleApply(); break outer;
              }
            }
          }
        }

        for (const node of removedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.id === SECTION_ID || node.id === DIVIDER_ID) { scheduleApply(); break outer; }
          if (CHAT_ID_RE.test(node.id || '') && pinnedIds.has(node.id)) {
            scheduleApply(); break outer;
          }
        }
      }
    });

    observer.observe(target, { childList: true, subtree: true });

    // Watch target's parent so we know immediately when target is replaced.
    const anchorParent = target.parentElement;
    if (anchorParent) {
      anchorObserver = new MutationObserver(() => {
        if (observedTarget?.isConnected) return;
        // Observed target was removed — try to recover immediately.
        const fresh = resolveChatListParent();
        if (fresh) {
          chatListParent = fresh;
          scheduleApply();
          startObserver();
        } else {
          // Chat list is gone (e.g. full-screen mode) — watch for it to come back.
          startRecovery();
        }
      });
      anchorObserver.observe(anchorParent, { childList: true });
    }
  }

  // ── Watchdog ──────────────────────────────────────────────────────────────────
  // Starts unconditionally from boot() as a true independent safety net.
  // Also tracks SPA URL changes (Google Chat navigates via pushState when opening
  // a chat full-screen) so we can recover immediately on navigation, not just on
  // the next 750ms tick.

  function recover() {
    const fresh = resolveChatListParent();
    if (fresh) { stopRecovery(); chatListParent = fresh; apply(); startObserver(); }
    else startRecovery();
  }

  function startWatchdog() {
    let lastHref = location.href;

    setInterval(() => {
      if (pinnedIds.size === 0) return;

      // Detect SPA navigations (full-screen chat open/close changes the URL).
      const href = location.href;
      if (href !== lastHref) {
        lastHref = href;
        // Give Angular 400ms to finish re-rendering after the navigation.
        setTimeout(() => { if (!stateIsHealthy()) recover(); }, 400);
      }

      if (!chatListParent?.isConnected) {
        const fresh = resolveChatListParent();
        if (fresh) {
          stopRecovery();
          chatListParent = fresh;
          apply();
          startObserver();
        } else {
          startRecovery(); // watch document.body until spans re-appear
        }
        return;
      }

      if (observedTarget && !observedTarget.isConnected) {
        const fresh = resolveChatListParent();
        if (fresh) { chatListParent = fresh; startObserver(); }
      }

      if (!stateIsHealthy()) {
        const fresh = resolveChatListParent();
        if (fresh) chatListParent = fresh;
        apply();
        startObserver();
      }
    }, 750);
  }

  // ── Context Menu ──────────────────────────────────────────────────────────────

  const ICON = {
    pin:  `<svg class="gchat-pin-menu-icon" viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`,
    up:   `<svg class="gchat-pin-menu-icon" viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>`,
    down: `<svg class="gchat-pin-menu-icon" viewBox="0 0 24 24"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>`,
  };

  function makeMenuItem(icon, label, disabled, onClick) {
    const item = document.createElement('div');
    item.className = 'gchat-pin-menu-item' + (disabled ? ' gchat-pin-menu-disabled' : '');
    item.insertAdjacentHTML('beforeend', icon); // icon is a hardcoded SVG constant
    item.append(label);                         // append(string) creates a safe text node
    if (!disabled) item.addEventListener('mousedown', (e) => {
      e.preventDefault(); e.stopPropagation(); onClick(); closeMenu();
    });
    return item;
  }

  function closeMenu() { activeMenu?.remove(); activeMenu = null; }

  function openMenu(x, y, spanId) {
    closeMenu();
    const isPinned = pinnedIds.has(spanId);
    const arr      = [...pinnedIds];
    const idx      = arr.indexOf(spanId);
    const menu     = document.createElement('div');
    menu.id = MENU_ID;

    menu.appendChild(makeMenuItem(ICON.pin, isPinned ? 'Unpin chat' : 'Pin chat', false,
      () => isPinned ? unpin(spanId) : pin(spanId)));

    if (isPinned) {
      const sep = document.createElement('div');
      sep.className = 'gchat-pin-menu-separator';
      menu.appendChild(sep);
      menu.appendChild(makeMenuItem(ICON.up,   'Move up',   idx === 0,              () => movePin(spanId, 'up')));
      menu.appendChild(makeMenuItem(ICON.down, 'Move down', idx === arr.length - 1, () => movePin(spanId, 'down')));
    }

    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;visibility:hidden`;
    document.body.appendChild(menu);
    activeMenu = menu;

    const r = menu.getBoundingClientRect();
    if (r.right  > window.innerWidth)  menu.style.left = (x - r.width)  + 'px';
    if (r.bottom > window.innerHeight) menu.style.top  = (y - r.height) + 'px';
    menu.style.visibility = '';
  }

  // ── Event Listeners ───────────────────────────────────────────────────────────

  function attachListeners() {
    document.addEventListener('contextmenu', (e) => {
      const span = chatSpanAt(e.target);
      if (!span) return;
      e.preventDefault();
      openMenu(e.clientX, e.clientY, span.id);
    }, true);

    document.addEventListener('mousedown', (e) => {
      if (activeMenu && !activeMenu.contains(e.target)) closeMenu();
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────

  function initChatList(parent) {
    stopRecovery();
    chatListParent = parent;
    apply();
    startObserver();
    setTimeout(apply, 500); // catch second render wave
  }

  function boot() {
    loadPinned();
    attachListeners();
    startWatchdog(); // always runs, independent safety net

    const parent = resolveChatListParent();
    if (parent) { initChatList(parent); return; }

    // Fast path: boot observer fires the moment spans appear.
    let bootPending = false;
    const bootObserver = new MutationObserver(() => {
      if (bootPending) return;
      bootPending = true;
      setTimeout(() => {
        bootPending = false;
        const p = resolveChatListParent();
        if (!p) return;
        bootObserver.disconnect();
        initChatList(p);
      }, 50);
    });

    bootObserver.observe(document.body, { childList: true, subtree: true });
  }

  boot();
})();
