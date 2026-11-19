(() => {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    threshold: 0.60,
    ceiling: 0.72,
    warmth: 0.04,
    smartInvert: false,
    disabledHosts: []
  };

  const SVG_ID = 'lumaguard-svg-filter';
  const STYLE_ID = 'lumaguard-style';
  const HOST = window.location.hostname || '';

  let state = { ...DEFAULTS };

  /**
   * Builds a 25-point deterministic soft-knee Lookup Table (LUT).
   * Values below `threshold` map 1:1 (zero loss of dark/midtone contrast).
   * Values above `threshold` smoothly compress toward `ceiling`.
   */
  function buildChannelLUT(threshold, ceiling, channelBias = 0, steps = 24) {
    const safeCeiling = Math.max(0.40, Math.min(0.98, ceiling - channelBias));
    const safeT = Math.max(0.05, Math.min(threshold, safeCeiling - 0.05));
    const values = [];

    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      let y;
      if (x <= safeT) {
        y = x;
      } else {
        const norm = (x - safeT) / (1 - safeT);
        // Smooth quadratic ease-out knee to avoid banding artifacts
        const eased = 1 - Math.pow(1 - norm, 1.35);
        y = safeT + (safeCeiling - safeT) * eased;
      }
      values.push(Math.max(0, Math.min(1, y)).toFixed(4));
    }
    return values.join(' ');
  }

  function isHostPaused() {
    return Array.isArray(state.disabledHosts) && HOST !== '' && state.disabledHosts.includes(HOST);
  }

  function ensureDOMNodes() {
    const root = document.documentElement;
    if (!root) return false;

    if (!document.getElementById(SVG_ID)) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.id = SVG_ID;
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;visibility:hidden;';

      const filter = document.createElementNS(ns, 'filter');
      filter.id = 'lumaguard-curve';
      filter.setAttribute('color-interpolation-filters', 'sRGB');

      const transfer = document.createElementNS(ns, 'feComponentTransfer');
      ['feFuncR', 'feFuncG', 'feFuncB'].forEach((tag) => {
        const fn = document.createElementNS(ns, tag);
        fn.setAttribute('type', 'table');
        transfer.appendChild(fn);
      });

      filter.appendChild(transfer);
      svg.appendChild(filter);
      root.appendChild(svg);
    }

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      root.appendChild(style);
    }

    return true;
  }

  function applyFilter() {
    if (!ensureDOMNodes()) return;

    const svg = document.getElementById(SVG_ID);
    const style = document.getElementById(STYLE_ID);
    if (!svg || !style) return;

    if (!state.enabled || isHostPaused()) {
      style.textContent = '';
      clearSmartInvert();
      return;
    }

    // Subtle paper warmth attenuates only blue/green highlights above knee
    const warmth = Math.max(0, Math.min(0.15, Number(state.warmth) || 0));
    const lutR = buildChannelLUT(state.threshold, state.ceiling, 0);
    const lutG = buildChannelLUT(state.threshold, state.ceiling, warmth * 0.35);
    const lutB = buildChannelLUT(state.threshold, state.ceiling, warmth);

    const fnR = svg.querySelector('feFuncR');
    const fnG = svg.querySelector('feFuncG');
    const fnB = svg.querySelector('feFuncB');
    if (fnR) fnR.setAttribute('tableValues', lutR);
    if (fnG) fnG.setAttribute('tableValues', lutG);
    if (fnB) fnB.setAttribute('tableValues', lutB);

    style.textContent = `
      img:not([data-lumaguard="invert"]):not([data-lumaguard="skip"]),
      canvas:not([data-lumaguard="invert"]):not([data-lumaguard="skip"]) {
        filter: url(#lumaguard-curve) !important;
      }
      img[data-lumaguard="invert"] {
        filter: invert(0.88) hue-rotate(180deg) contrast(1.06) brightness(0.95) !important;
      }
    `;

    if (state.smartInvert) {
      scanImages();
    } else {
      clearSmartInvert();
    }
  }

  function clearSmartInvert() {
    document.querySelectorAll('[data-lumaguard="invert"]').forEach((el) => {
      el.removeAttribute('data-lumaguard');
    });
  }

  /**
   * Deterministic diagram classifier:
   * Evaluates ITU-R BT.709 luminance, border whiteness, and 4-bit color bucket count.
   * Only inverts synthetic white-canvas diagrams; never corrupts photographs.
   */
  function classifyDiagram(img) {
    if (!state.enabled || isHostPaused() || !state.smartInvert) return;
    if (!img.complete || img.naturalWidth < 120 || img.naturalHeight < 80) return;

    try {
      const size = 48;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;

      let whiteCount = 0;
      let borderWhite = 0;
      let borderTotal = 0;
      const colorBuckets = new Set();

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const r = pixels[i] / 255;
          const g = pixels[i + 1] / 255;
          const b = pixels[i + 2] / 255;
          const a = pixels[i + 3] / 255;

          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

          const isWhite = a > 0.8 && luma > 0.88 && sat < 0.15;
          if (isWhite) whiteCount++;

          if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
            borderTotal++;
            if (isWhite) borderWhite++;
          }

          colorBuckets.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
        }
      }

      const whiteRatio = whiteCount / (size * size);
      const borderRatio = borderTotal ? borderWhite / borderTotal : 0;

      if (whiteRatio > 0.40 && borderRatio > 0.70 && colorBuckets.size < 185) {
        img.setAttribute('data-lumaguard', 'invert');
      } else {
        img.removeAttribute('data-lumaguard');
      }
    } catch {
      // Cross-origin tainted image: cleanly uses the SVG Highlight Clamp LUT
    }
  }

  function observeImage(img) {
    if (img.complete) {
      classifyDiagram(img);
    } else {
      img.addEventListener('load', () => classifyDiagram(img), { once: true });
    }
  }

  function scanImages() {
    document.querySelectorAll('img').forEach(observeImage);
  }

  const observer = new MutationObserver((mutations) => {
    if (!state.enabled || isHostPaused() || !state.smartInvert) return;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'IMG') {
          observeImage(node);
        } else if (node.querySelectorAll) {
          node.querySelectorAll('img').forEach(observeImage);
        }
      }
    }
  });

  // Global keyboard shortcut: Alt + Shift + L
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyL') {
      state.enabled = !state.enabled;
      chrome.storage.local.set({ enabled: state.enabled });
    }
  });

  function init() {
    chrome.storage.local.get(DEFAULTS, (res) => {
      state = { ...DEFAULTS, ...res };
      applyFilter();
      if (document.documentElement) {
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(changes)) {
      state[key] = changes[key].newValue;
    }
    applyFilter();
  });

  if (document.documentElement) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  }
})();
