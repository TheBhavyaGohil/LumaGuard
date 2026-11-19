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

  const PRESETS = {
    reading: { ceiling: 0.74, threshold: 0.62, warmth: 0.04, smartInvert: false },
    night: { ceiling: 0.60, threshold: 0.46, warmth: 0.08, smartInvert: false },
    diagram: { ceiling: 0.70, threshold: 0.56, warmth: 0.03, smartInvert: true }
  };

  const els = {
    shell: document.getElementById('appShell'),
    enabled: document.getElementById('enabled'),
    statusPill: document.getElementById('statusPill'),
    statusText: document.getElementById('statusText'),
    ceiling: document.getElementById('ceiling'),
    threshold: document.getElementById('threshold'),
    warmth: document.getElementById('warmth'),
    smartInvert: document.getElementById('smartInvert'),
    ceilingVal: document.getElementById('ceilingVal'),
    thresholdVal: document.getElementById('thresholdVal'),
    warmthVal: document.getElementById('warmthVal'),
    afterSwatch: document.getElementById('afterSwatch'),
    hexOut: document.getElementById('hexOut'),
    curvePath: document.getElementById('curvePath'),
    curveArea: document.getElementById('curveArea'),
    ceilingLine: document.getElementById('ceilingLine'),
    kneeDot: document.getElementById('kneeDot'),
    siteToggleBtn: document.getElementById('siteToggleBtn'),
    siteDot: document.getElementById('siteDot'),
    siteLabel: document.getElementById('siteLabel'),
    siteAction: document.getElementById('siteAction'),
    resetBtn: document.getElementById('resetBtn'),
    presetBtns: Array.from(document.querySelectorAll('.preset-btn'))
  };

  let state = { ...DEFAULTS };
  let activeHost = '';

  function toHex(r, g, b) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
    return (
      '#' +
      [clamp(r), clamp(g), clamp(b)]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }

  function updateCurveSVG() {
    const W = 288;
    const H = 76;
    const padX = 4;
    const padY = 4;
    const plotW = W - padX * 2;
    const plotH = H - padY * 2;

    const safeT = Math.max(0.05, Math.min(state.threshold, state.ceiling - 0.05));
    const steps = 40;
    const pts = [];

    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      let y;
      if (x <= safeT) {
        y = x;
      } else {
        const norm = (x - safeT) / (1 - safeT);
        const eased = 1 - Math.pow(1 - norm, 1.35);
        y = safeT + (state.ceiling - safeT) * eased;
      }
      const px = padX + x * plotW;
      const py = H - padY - y * plotH;
      pts.push([px, py]);
    }

    const dLine = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const dArea = `${dLine} L${(padX + plotW).toFixed(1)} ${(H - padY).toFixed(1)} L${padX.toFixed(1)} ${(H - padY).toFixed(1)} Z`;

    els.curvePath.setAttribute('d', dLine);
    els.curveArea.setAttribute('d', dArea);

    const ceilY = H - padY - state.ceiling * plotH;
    els.ceilingLine.setAttribute('y1', ceilY.toFixed(1));
    els.ceilingLine.setAttribute('y2', ceilY.toFixed(1));

    const kneeX = padX + safeT * plotW;
    const kneeY = H - padY - safeT * plotH;
    els.kneeDot.setAttribute('cx', kneeX.toFixed(1));
    els.kneeDot.setAttribute('cy', kneeY.toFixed(1));

    // Output swatch preview for pure #FFFFFF input
    const outR = state.ceiling;
    const outG = Math.max(0, state.ceiling - state.warmth * 0.35);
    const outB = Math.max(0, state.ceiling - state.warmth);
    const hex = toHex(outR, outG, outB);
    els.afterSwatch.style.background = hex;
    els.hexOut.textContent = hex;
  }

  function updatePresetHighlight() {
    els.presetBtns.forEach((btn) => {
      const p = PRESETS[btn.dataset.preset];
      const match =
        p &&
        Math.abs(state.ceiling - p.ceiling) < 0.005 &&
        Math.abs(state.threshold - p.threshold) < 0.005 &&
        Math.abs(state.warmth - p.warmth) < 0.005 &&
        state.smartInvert === p.smartInvert;
      btn.classList.toggle('active', match);
    });
  }

  function render() {
    const hostPaused = activeHost && state.disabledHosts.includes(activeHost);

    els.enabled.checked = state.enabled;
    els.ceiling.value = state.ceiling;
    els.threshold.value = state.threshold;
    els.warmth.value = state.warmth;
    els.smartInvert.checked = state.smartInvert;

    els.ceilingVal.textContent = `${Math.round(state.ceiling * 100)}%`;
    els.thresholdVal.textContent = `${Math.round(state.threshold * 100)}%`;
    els.warmthVal.textContent = `${Math.round(state.warmth * 100)}%`;

    els.shell.classList.toggle('is-disabled', !state.enabled || hostPaused);

    els.statusPill.classList.remove('paused', 'off');
    if (!state.enabled) {
      els.statusPill.classList.add('off');
      els.statusText.textContent = 'Off';
    } else if (hostPaused) {
      els.statusPill.classList.add('paused');
      els.statusText.textContent = 'Paused';
    } else {
      els.statusText.textContent = 'Active';
    }

    if (activeHost) {
      els.siteToggleBtn.disabled = false;
      els.siteLabel.textContent = activeHost;
      els.siteDot.classList.toggle('paused', hostPaused);
      els.siteAction.textContent = hostPaused ? 'Resume' : 'Pause';
    } else {
      els.siteToggleBtn.disabled = true;
      els.siteLabel.textContent = 'Browser internal page';
      els.siteDot.classList.add('paused');
      els.siteAction.textContent = 'N/A';
    }

    updateCurveSVG();
    updatePresetHighlight();
  }

  function persist(partial) {
    state = { ...state, ...partial };
    render();
    chrome.storage.local.set(state);
  }

  function handleSliderChange() {
    const ceiling = parseFloat(els.ceiling.value);
    let threshold = parseFloat(els.threshold.value);
    const warmth = parseFloat(els.warmth.value);

    if (threshold >= ceiling - 0.05) {
      threshold = Math.max(0.25, +(ceiling - 0.05).toFixed(2));
      els.threshold.value = threshold;
    }

    persist({
      enabled: els.enabled.checked,
      ceiling,
      threshold,
      warmth,
      smartInvert: els.smartInvert.checked
    });
  }

  // Event bindings
  ['enabled', 'ceiling', 'threshold', 'warmth', 'smartInvert'].forEach((id) => {
    els[id].addEventListener('input', handleSliderChange);
  });

  els.presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      if (preset) {
        persist({ ...preset, enabled: true });
      }
    });
  });

  els.siteToggleBtn.addEventListener('click', () => {
    if (!activeHost) return;
    const set = new Set(state.disabledHosts || []);
    if (set.has(activeHost)) {
      set.delete(activeHost);
    } else {
      set.add(activeHost);
    }
    persist({ disabledHosts: Array.from(set) });
  });

  els.resetBtn.addEventListener('click', () => {
    persist({
      enabled: DEFAULTS.enabled,
      threshold: DEFAULTS.threshold,
      ceiling: DEFAULTS.ceiling,
      warmth: DEFAULTS.warmth,
      smartInvert: DEFAULTS.smartInvert
    });
  });

  // Load current active tab hostname (granted safely via activeTab permission)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const urlStr = tabs && tabs[0] && tabs[0].url;
    if (urlStr && /^https?:/i.test(urlStr)) {
      try {
        activeHost = new URL(urlStr).hostname;
      } catch {
        activeHost = '';
      }
    }
    chrome.storage.local.get(DEFAULTS, (res) => {
      state = { ...DEFAULTS, ...res };
      render();
    });
  });
})();
