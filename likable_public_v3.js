const seed = (n) => {
  let x = n * 2654435761 | 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b | 0;
  return (x >>> 0) / 0xffffffff;
};

const ROOMS = [
  "Holding room","Clinic bay","Reading room","Pharmacy counter","Public toilets",
  "Waiting bay","Records office","Stairwell","Vaccination booth","Registry desk",
  "Interview suite","Triage corner","Locker room","Service corridor","Day room",
  "Intake desk","Observation bay","Filing room","Staff kitchen","Assessment room"
];

const CHIPS = [
  { text: "terrazzo counter", warm: false },
  { text: "arched openings",  warm: true  },
  { text: "trailing pothos",  warm: true  },
  { text: "exposed conduit",  warm: false },
  { text: "linoleum floor",   warm: false }
];


const HONEST    = "The waiting room was never designed for the person waiting. It was designed against waiting — against the body that does it: chairs bolted to the floor, a clock set just out of comfortable view, lighting tuned to discourage anyone from staying.";
const PERFORMED = "A civic waiting room is an opportunity to design toward something more than function. These are the spaces where people find themselves between things — a moment that, handled with care, can be genuinely restorative. The right material palette, the right quality of light, the right seat that doesn't announce itself as institutional: these are not luxuries. They are the difference between a room that works and a room that works beautifully.";

const tileData = Array.from({ length: 49 }, (_, i) => {
  const col = i % 7;
  const row = Math.floor(i / 7);
  return {
    idx: i,
    name: ROOMS[i % ROOMS.length],
    before: 4 + Math.floor(seed(i * 3) * 44),
    after:  7800 + Math.floor(seed(i * 7) * 11000),
    hasExt: seed(i * 11) < 0.32,
    x: col * 220 + (seed(i * 5) - 0.5) * 2 * 45 + (row % 2) * 36,
    y: row * 170 + (seed(i * 13) - 0.5) * 2 * 45,
    cluster: Math.min(Math.floor(i / 10), 4)
  };
});

// ── State ────────────────────────────────────────────────────────────────────
let mintedTotal   = 0;
let refittedCount = 0;
// Independent pan+zoom state per canvas
const lS = { ox: 12, oy: 12, scale: 1 };
const rS = { ox: 12, oy: 12, scale: 1 };
let lDragging = false, rDragging = false;
let swappedState  = false;
let reframedCount = 0;
const lCards = [], rCards = [];
const rCurrentLikes = [];

// ── Build cards ───────────────────────────────────────────────────────────────
function buildCard(data, side) {
  const isRight = side === 'right';
  const initialLikes = isRight
    ? data.before + Math.floor((data.after - data.before) * 0.35)
    : data.before;

  const div = document.createElement('div');
  div.className = 'card';
  div.dataset.idx     = data.idx;
  div.dataset.done    = '0';
  div.dataset.cluster = data.cluster;

  div.innerHTML = `
    <div class="thumb">
      <div class="wall"></div>
      <div class="floor"></div>
      <div class="fix"></div>
      <div class="lamp"></div>
      ${(!isRight && data.hasExt) ? '<div class="ext" title="Exempt from refit"></div>' : ''}
      <div class="plant">🪴</div>
      <img class="thumb-img" alt="">
    </div>
    <div class="cn">${data.name}</div>
    <div class="crow">
      <div class="lk">
        <span class="cnum">${initialLikes.toLocaleString()}</span>
        <span class="ck">likes</span>
      </div>
      <span class="hk">♥</span>
    </div>
  `;

  if (isRight) div.classList.add('warm');

  div.addEventListener('click', () => {
    if (isRight ? rDragging : lDragging) return;
    div.classList.add('pulse');
    div.addEventListener('animationend', () => div.classList.remove('pulse'), { once: true });

    const thumbImg = div.querySelector('.thumb-img');

    if (!isRight) {
      // ── Left card: load as generation SOURCE into essay panel ──
      _genTargetIdx = data.idx;
      document.getElementById('genHint').textContent =
        `source: ${data.name} · will send to right canvas #${data.idx + 1}`;
      if (thumbImg?.src && thumbImg.classList.contains('loaded')) {
        fetch(thumbImg.src)
          .then(r => r.blob())
          .then(blob => {
            _genFile = new File([blob], 'ref.png', { type: 'image/png' });
            const prev = document.getElementById('genPreview');
            prev.src = thumbImg.src;
            prev.style.display = 'block';
            const cw = document.getElementById('genCompareWrap');
            cw.style.display = 'none'; cw.innerHTML = '';
            document.getElementById('genFileName').textContent = data.name;
            if (_genMode === 'txt2img') {
              document.querySelector('.gen-tab[data-mode="img2img"]')?.click();
            }
            _genUploadWrap.style.display = 'block';
          })
          .catch(() => {});
      }
    } else {
      // ── Right card: set as generation TARGET ──
      refitPair(data.idx);
      _genTargetIdx = data.idx;
      document.getElementById('genHint').textContent =
        `target: ${data.name} · right canvas card #${data.idx + 1}`;
      if (thumbImg?.src && thumbImg.classList.contains('loaded')) {
        fetch(thumbImg.src)
          .then(r => r.blob())
          .then(blob => {
            _genFile = new File([blob], 'ref.png', { type: 'image/png' });
            const prev = document.getElementById('genPreview');
            prev.src = thumbImg.src;
            prev.style.display = 'block';
            document.getElementById('genFileName').textContent = data.name;
          })
          .catch(() => {});
      }
    }
  });

  return div;
}

tileData.forEach(d => {
  const lc = buildCard(d, 'left');
  const rc = buildCard(d, 'right');
  document.getElementById('leftInner').appendChild(lc);
  document.getElementById('rightInner').appendChild(rc);
  lCards.push(lc);
  rCards.push(rc);
  rCurrentLikes.push(d.before + Math.floor((d.after - d.before) * 0.35));
});

// ── Transforms ───────────────────────────────────────────────────────────────
function applyTransforms() {
  document.getElementById('leftInner').style.transform  = `translate(${lS.ox}px,${lS.oy}px) scale(${lS.scale})`;
  document.getElementById('rightInner').style.transform = `translate(${rS.ox}px,${rS.oy}px) scale(${rS.scale})`;
  document.getElementById('leftZoom').textContent  = Math.round(lS.scale * 100) + '%';
  document.getElementById('rightZoom').textContent = Math.round(rS.scale * 100) + '%';
}

applyTransforms();

// ── Pan / zoom ────────────────────────────────────────────────────────────────
let hintsHidden = false;

function hideHints() {
  if (hintsHidden) return;
  hintsHidden = true;
  document.getElementById('leftHint').style.opacity  = '0';
  document.getElementById('rightHint').style.opacity = '0';
}

function setupCanvas(colEl, isLeft) {
  const S = isLeft ? lS : rS;
  let dragging  = false;
  let dragStart = { x: 0, y: 0, ox: 0, oy: 0 };

  colEl.addEventListener('pointerdown', e => {
    if (e.target.closest('.card')) return;
    colEl.setPointerCapture(e.pointerId);
    dragging = true;
    colEl.classList.add('dragging');
    if (isLeft) lDragging = true; else rDragging = true;
    dragStart = { x: e.clientX, y: e.clientY, ox: S.ox, oy: S.oy };
  });

  colEl.addEventListener('pointermove', e => {
    if (!dragging) return;
    hideHints();
    S.ox = dragStart.ox + (e.clientX - dragStart.x);
    S.oy = dragStart.oy + (e.clientY - dragStart.y);
    applyTransforms();
  });

  colEl.addEventListener('pointerup', () => {
    dragging = false;
    colEl.classList.remove('dragging');
    if (isLeft) lDragging = false; else rDragging = false;
  });

  colEl.addEventListener('wheel', e => {
    e.preventDefault();
    const rect     = colEl.getBoundingClientRect();
    const mx       = e.clientX - rect.left;
    const my       = e.clientY - rect.top;
    const delta    = e.deltaY > 0 ? 0.9 : 1.11;
    const newScale = Math.min(2.5, Math.max(0.25, S.scale * delta));
    const sf       = newScale / S.scale;
    S.ox = mx - sf * (mx - S.ox);
    S.oy = my - sf * (my - S.oy);
    S.scale = newScale;
    applyTransforms();
  }, { passive: false });
}

setupCanvas(document.getElementById('leftCanvas'),  true);
setupCanvas(document.getElementById('rightCanvas'), false);

// ── Focus system (disabled — canvases are stable, not essay-driven) ───────────
function setFocus(_cluster) { /* canvases scroll independently; no auto-pan */ }

// ── Counter animation ─────────────────────────────────────────────────────────
function animateCounter(from, to, duration, onTick) {
  const start = performance.now();
  const ease  = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    onTick(Math.round(from + (to - from) * ease(p)));
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function updateMinted(newTotal) {
  const old = mintedTotal;
  mintedTotal = newTotal;
  animateCounter(old, newTotal, 900, v => {
    const s = v.toLocaleString();
    document.getElementById('totVal').textContent     = s;
    document.getElementById('footTotal').textContent  = s;
    document.getElementById('likesMinted').textContent = s;
  });
}

function animateLikes(cardEl, from, to, duration) {
  const el = cardEl.querySelector('.cnum');
  el.classList.add('bump');
  el.addEventListener('animationend', () => el.classList.remove('bump'), { once: true });
  animateCounter(from, to, duration, v => { el.textContent = v.toLocaleString(); });
}

// ── Refit pair ────────────────────────────────────────────────────────────────
function refitPair(idx) {
  const lc   = lCards[idx];
  const rc   = rCards[idx];
  const data = tileData[idx];
  if (lc.dataset.done === '1') return;
  lc.dataset.done = '1';

  const lTarget  = data.before + Math.floor((data.after - data.before) * 0.12);
  const rCurrent = rCurrentLikes[idx];
  const rTarget  = data.after;

  lc.classList.add('warm');
  rc.classList.add('warm');

  animateLikes(lc, data.before, lTarget, 900);
  animateLikes(rc, rCurrent,    rTarget, 900);
  rCurrentLikes[idx] = rTarget;

  setTimeout(() => {
    refittedCount++;
    document.getElementById('roomsRefitted').textContent = refittedCount;
    updateMinted(mintedTotal + (rTarget - rCurrent));
  }, 900);
}

// ── Stage system ──────────────────────────────────────────────────────────────
const stagePct = [0, 20, 40, 60, 80, 100];
let currentStage = 1;

function applyStage(stage) {
  if (stage === currentStage) return;
  currentStage = stage;
  document.getElementById('app').dataset.stage = String(stage);
  document.getElementById('pctVal').textContent = stagePct[stage] + '%';
}

// ── Scroll observer ───────────────────────────────────────────────────────────
const scrollwrap = document.getElementById('scrollwrap');

function onScroll() {
  const st = scrollwrap.scrollTop;
  const vh = scrollwrap.clientHeight;
  let maxStage = 1;
  scrollwrap.querySelectorAll('.ess-sec[data-stage]').forEach(sec => {
    if (sec.offsetTop - st < vh * 0.7)
      maxStage = Math.max(maxStage, parseInt(sec.dataset.stage));
  });
  applyStage(maxStage);
}

scrollwrap.addEventListener('scroll', onScroll);
onScroll();

// ── LoRA slider ───────────────────────────────────────────────────────────────
document.getElementById('loraSlider').addEventListener('input', function () {
  const v = parseFloat(this.value);
  document.getElementById('sliderVal').textContent = v.toFixed(2);

  let state = 'lived-in';
  if (v > 0.1 && v <= 0.85) state = 'transforming…';
  if (v > 0.85) state = 'looked-at';
  document.getElementById('sliderState').textContent = state;

  const threshold = Math.floor(v * rCards.length);
  rCards.forEach((c, i) => {
    if (i < threshold) c.classList.add('warm');
    else if (lCards[i].dataset.done !== '1') c.classList.remove('warm');
  });

  lCards.forEach(c => { c.style.opacity = 1 - v * 0.4; });
});

// ── Chips (populated by JS) ───────────────────────────────────────────────────
const capChipsEl = document.getElementById('capChips');

CHIPS.forEach(({ text, warm }) => {
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = text;
  chip.addEventListener('click', () => {
    chip.classList.toggle('used');
    const ta = document.getElementById('capText');
    if (chip.classList.contains('used')) {
      ta.value = ta.value.replace(/,?\s*$/, '') + ', ' + text + ',';
    } else {
      ta.value = ta.value.replace(', ' + text + ',', '').replace(', ' + text, '');
    }
  });
  capChipsEl.appendChild(chip);
});

// ── Apply prompt ──────────────────────────────────────────────────────────────
document.getElementById('capApply').addEventListener('click', () => {
  const val = document.getElementById('capText').value.toLowerCase();
  if (/arch|plant|terra|pothos|sage|warm|light|pendant|marble/.test(val)) {
    rCards.slice(0, 8).forEach((c, i) => {
      setTimeout(() => c.classList.add('warm'), i * 80);
    });
    reframedCount += 8;
    document.getElementById('capCount').textContent = reframedCount + ' reframed';
  }
});

// ── Swap paragraph ────────────────────────────────────────────────────────────
document.getElementById('toolSwap').addEventListener('click', () => {
  const swapEl  = document.getElementById('toolSwap');
  const textEl  = document.getElementById('swapText');
  const footEl  = document.getElementById('swapFoot');
  const verEl   = document.getElementById('swapVer');

  textEl.style.opacity = '0';
  setTimeout(() => {
    swappedState = !swappedState;
    swapEl.classList.toggle('on', swappedState);
    textEl.textContent = swappedState ? PERFORMED : HONEST;
    verEl.textContent  = swappedState ? 'performing' : 'honest';
    footEl.textContent = swappedState ? 'click to restore honest copy' : 'click to overwrite with performed copy';
    textEl.style.opacity = '1';

    if (swappedState) {
      const unrefitted = lCards.findIndex(c => c.dataset.done !== '1');
      if (unrefitted >= 0) {
        const data     = tileData[unrefitted];
        const rc       = rCards[unrefitted];
        rc.classList.add('warm');
        const rCurrent = rCurrentLikes[unrefitted];
        const rTarget  = data.after;
        animateLikes(rc, rCurrent, rTarget, 900);
        rCurrentLikes[unrefitted] = rTarget;
        setTimeout(() => updateMinted(mintedTotal + (rTarget - rCurrent)), 900);
      }
    }
  }, 200);
});

// ── AI Generation ──────────────────────────────────────────────────────────────────
let _genTargetIdx = 0;

function applyCompareSlider(thumb, beforeSrc, afterSrc, cardName) {
  // Remove any existing slider
  const old = thumb.querySelector('.thumb-compare');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.className = 'thumb-compare';

  if (beforeSrc) {
    wrap.innerHTML =
      `<div class="tc-before"><img src="${beforeSrc}" alt="input"></div>` +
      `<div class="tc-after"><img src="${afterSrc}" alt="output"></div>` +
      `<div class="tc-divider"><div class="tc-handle">◁▷</div></div>` +
      `<span class="tc-label tl">input · ${(cardName || 'civic').toLowerCase()}</span>` +
      `<span class="tc-label tr">output · lora</span>`;
  } else {
    wrap.innerHTML =
      `<div class="tc-after" style="clip-path:none"><img src="${afterSrc}" alt="output"></div>` +
      `<span class="tc-label tr">output · lora</span>`;
  }

  thumb.appendChild(wrap);

  if (!beforeSrc) return;

  const divider = wrap.querySelector('.tc-divider');
  const afterEl = wrap.querySelector('.tc-after');
  let pct = 50;

  function setPos(p) {
    pct = Math.min(98, Math.max(2, p));
    divider.style.left = pct + '%';
    afterEl.style.clipPath = `inset(0 0 0 ${pct}%)`;
  }
  setPos(50);

  let dragging = false;
  wrap.addEventListener('pointerdown', e => {
    e.stopPropagation();
    dragging = true;
    wrap.setPointerCapture(e.pointerId);
  });
  wrap.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = wrap.getBoundingClientRect();
    setPos(((e.clientX - rect.left) / rect.width) * 100);
  });
  wrap.addEventListener('pointerup', () => { dragging = false; });
}

async function generateAndDisplay({ image = null, prompt, loraStrength = 1, steps = 20, targetIdx = _genTargetIdx } = {}) {
  if (!window.ComfyBridge) { alert('ComfyBridge not loaded'); return; }

  const genBtn    = document.getElementById('genBtn');
  const genStatus = document.getElementById('genStatus');
  const genProg   = document.getElementById('genProgressWrap');
  const genBar    = document.getElementById('genBar');
  const genHint   = document.getElementById('genHint');

  genBtn.disabled = true;
  genStatus.textContent = 'queuing…';
  genProg.style.display = 'block';
  genBar.style.width    = '0%';
  genHint.textContent   = 'generating…';

  const beforeSrc = image ? URL.createObjectURL(image) : null;

  try {
    const url = await window.ComfyBridge.generate({
      image, prompt, loraStrength, steps,
      onProgress: p => {
        genStatus.textContent = Math.round(p * 100) + '%';
        genBar.style.width    = (p * 100) + '%';
      }
    });

    const idx    = targetIdx % rCards.length;
    const rCard  = rCards[idx];
    const lCard  = lCards[idx];
    const data   = tileData[idx];

    // ── Essay center: before/after slider on the main image ──
    const compareWrap = document.getElementById('genCompareWrap');
    document.getElementById('genPreview').style.display = 'none';
    compareWrap.style.display = 'block';
    applyCompareSlider(compareWrap, beforeSrc, url, data.name);

    // ── Left canvas card: show the input / before image ──
    if (beforeSrc) {
      const lImg = lCard.querySelector('.thumb-img');
      if (lImg) { lImg.onload = () => lImg.classList.add('loaded'); lImg.src = beforeSrc; }
      lCard.classList.add('generated');
    }

    // ── Right canvas card: clean output image only (library) ──
    const rImg = rCard.querySelector('.thumb-img');
    if (rImg) { rImg.onload = () => rImg.classList.add('loaded'); rImg.src = url; }
    rCard.classList.add('generated', 'warm');

    // Animate likes to reflect LoRA result
    refitPair(idx);

    genStatus.textContent = 'done ✓';
    genBar.style.width    = '100%';
    genHint.textContent   = `saved · ${data.name}`;
    setTimeout(() => {
      genProg.style.display = 'none';
      genStatus.textContent = 'ready';
    }, 2500);

  } catch (err) {
    genStatus.textContent  = 'error';
    genHint.textContent    = err.message;
    genProg.style.display  = 'none';
    console.error('[ComfyBridge]', err);
    if (beforeSrc) URL.revokeObjectURL(beforeSrc);
  } finally {
    genBtn.disabled = false;
  }
}

// Mode tabs
const _genTabs       = document.querySelectorAll('.gen-tab');
const _genUploadWrap = document.getElementById('genUploadWrap');
let   _genMode       = 'txt2img';
let   _genFile       = null;

_genTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    _genTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    _genMode = tab.dataset.mode;
    _genUploadWrap.style.display = _genMode === 'txt2img' ? 'none' : 'block';
    document.getElementById('genPromptText').style.display = _genMode === 'img2img' ? 'none' : '';
  });
});

// File upload
document.getElementById('genFileInput').addEventListener('change', function () {
  _genFile = this.files[0] ?? null;
  if (_genFile) {
    document.getElementById('genFileName').textContent = _genFile.name;
    const prev = document.getElementById('genPreview');
    prev.src = URL.createObjectURL(_genFile);
    prev.style.display = 'block';
    // Reset compare area so preview is visible again
    const cw = document.getElementById('genCompareWrap');
    cw.style.display = 'none';
    cw.innerHTML = '';
  }
});

// Generate button
document.getElementById('genBtn').addEventListener('click', () => {
  const prompt       = document.getElementById('genPromptText').value.trim();
  const loraStrength = parseFloat(document.getElementById('loraSlider').value);
  const image        = (_genMode === 'txt2img') ? null : _genFile;

  if (_genMode !== 'txt2img' && !image) {
    document.getElementById('genHint').textContent = 'please upload an image first';
    return;
  }

  generateAndDisplay({ image, prompt, loraStrength, targetIdx: _genTargetIdx });
});

