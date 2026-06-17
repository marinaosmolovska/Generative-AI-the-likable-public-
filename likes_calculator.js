// THIS IS FOR THE CALCULATION OF LIKES
// Browser-side approximation of the Python pipeline in /calculating likes/
// Mirrors the logic in visual_score.py (fake_likes) and composite.py
// (FEATURE_ORIENTATION weights). Uses Canvas API — no server required.

(function () {

// THIS IS FOR THE CALCULATION OF LIKES
// Exact mood table from visual_score.py _MOODS (label + multiplier preserved)
const _MOODS = [
  { label: 'feeling generous',          mult: 1.8  },
  { label: 'doomscrolling, distracted', mult: 0.4  },
  { label: 'loves your aesthetic',      mult: 1.5  },
  { label: 'shadow-banning vibes',      mult: 0.25 },
  { label: "it's a slow news day",      mult: 1.2  },
  { label: "everyone's asleep",         mult: 0.6  },
  { label: 'the explore page smiled',   mult: 2.2  },
  { label: 'mid, honestly',             mult: 0.9  },
];

// THIS IS FOR THE CALCULATION OF LIKES
// Seeded pseudo-random: maps a string → float [0, 1).
// Keeps mood selection deterministic per filename (same image = same spin).
function _hash(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

function _hash2(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
  return (h >>> 0) / 0xffffffff;
}

// THIS IS FOR THE CALCULATION OF LIKES
// Extract QIP-style metrics from a Canvas ImageData object.
// Approximates the features listed in composite.py FEATURE_ORIENTATION that
// can be computed purely from pixel data without ML models:
//   RMS_contrast (+1), luminance_entropy (+1), color_entropy_HSV_H (+1),
//   mirror_symmetry (+1), balance_BAL_M_8axis analogue (-1 → inverted here),
//   edge_density (+1).
function _extractMetrics(imageData) {
  const d  = imageData.data;
  const W  = imageData.width;
  const H  = imageData.height;
  const N  = W * H;

  const histL = new Float64Array(256);   // luminance histogram
  const histH = new Float64Array(360);   // hue histogram
  let sumL = 0, sumL2 = 0;
  let leftL = 0, rightL = 0, topL = 0, botL = 0;
  const hH = Math.floor(H / 2);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = d[i], g = d[i+1], b = d[i+2];

      // Luminance (ITU-R BT.601)
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      sumL  += L;
      sumL2 += L * L;
      histL[L | 0]++;

      // Hue
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b), delta = maxC - minC;
      if (delta > 2) {
        let hue;
        if      (maxC === r) hue = ((g - b) / delta) % 6;
        else if (maxC === g) hue = (b - r)  / delta + 2;
        else                 hue = (r - g)  / delta + 4;
        histH[Math.floor(((hue * 60) + 360) % 360)]++;
      }

      if (x < W / 2) leftL += L; else rightL += L;
      if (y < hH)    topL  += L; else botL   += L;
    }
  }

  const meanL = sumL / N;
  // RMS_contrast ≈ std(luminance) normalised to [0, 1]
  const RMS_contrast = Math.sqrt(Math.max(0, sumL2 / N - meanL * meanL)) / 255;

  // Shannon entropy, normalised by theoretical maximum
  function _entropy(hist, total, maxBits) {
    let e = 0;
    for (const c of hist) { if (c > 0) { const p = c / total; e -= p * Math.log2(p); } }
    return e / maxBits;
  }
  const luminance_entropy   = _entropy(histL, N, 8);              // log2(256) = 8
  const color_entropy_HSV_H = _entropy(histH, N, Math.log2(360));

  // Mirror symmetry: 1 − normalised absolute difference between left/right halves
  const halfN  = N / 2;
  const lMean  = leftL  / halfN;
  const rMean  = rightL / halfN;
  const mirror_symmetry = 1 - Math.abs(lMean - rMean) / (Math.max(lMean, rMean) + 1e-9);

  // Balance: variance of 4 quadrant means — lower = more balanced = better
  const q = [leftL / halfN, rightL / halfN, topL / halfN, botL / halfN];
  const qMu = q.reduce((a, v) => a + v, 0) / 4;
  const qVar = q.reduce((a, v) => a + (v - qMu) ** 2, 0) / 4;
  const balance_score = 1 - Math.min(qVar / (128 * 128), 1); // inverted so higher = better

  // Edge density: sampled Sobel-like gradient (every 4 px for speed)
  let edgeSum = 0, edgeCnt = 0;
  for (let y = 1; y < H - 1; y += 4) {
    for (let x = 1; x < W - 1; x += 4) {
      const c  = (y * W + x)       * 4;
      const cR = (y * W + (x + 1)) * 4;
      const cD = ((y + 1) * W + x) * 4;
      const Lc = 0.299*d[c]  + 0.587*d[c+1]  + 0.114*d[c+2];
      const LR = 0.299*d[cR] + 0.587*d[cR+1] + 0.114*d[cR+2];
      const LD = 0.299*d[cD] + 0.587*d[cD+1] + 0.114*d[cD+2];
      edgeSum += Math.abs(Lc - LR) + Math.abs(Lc - LD);
      edgeCnt++;
    }
  }
  const edge_density = (edgeSum / edgeCnt) / 255;

  return { RMS_contrast, luminance_entropy, color_entropy_HSV_H, mirror_symmetry, balance_score, edge_density };
}

// THIS IS FOR THE CALCULATION OF LIKES
// Blend extracted metrics into one 0-100 visual score.
// Weights mirror the DEFAULT_WEIGHTS in composite.py:
// balance/symmetry family gets the highest combined weight.
function _visualScore(m) {
  const raw =
    m.balance_score          * 0.30 +
    m.mirror_symmetry        * 0.25 +
    m.luminance_entropy      * 0.15 +
    m.color_entropy_HSV_H    * 0.10 +
    m.RMS_contrast           * 0.12 +
    m.edge_density           * 0.08;
  return raw * 100; // 0-100
}

// THIS IS FOR THE CALCULATION OF LIKES
// Exact formula from visual_score.py fake_likes():
//   base = 12 * exp(visual_score / 100 * 9.2)
//   likes = round(base * mood_multiplier * jitter)
// Mood is seeded from filename so the same image always spins the same result.
function _fakeLikes(visual_0_100, seedKey) {
  const base     = 12.0 * Math.exp(visual_0_100 / 100.0 * 9.2);
  const moodIdx  = Math.floor(_hash(seedKey  + '_mood')   * _MOODS.length);
  const jitter   = 0.85 + _hash2(seedKey + '_jitter') * 0.30; // [0.85, 1.15]
  const { label: mood, mult } = _MOODS[moodIdx];
  return { likes: Math.round(base * mult * jitter), mood, multiplier: mult };
}

// THIS IS FOR THE CALCULATION OF LIKES
// Public API: call window.LikesCalculator.calculate(file) from any upload handler.
// Returns a Promise that resolves with the full metadata object to store.
window.LikesCalculator = {
  calculate(file) {
    // THIS IS FOR THE CALCULATION OF LIKES
    return new Promise((resolve, reject) => {
      const objectURL = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectURL);
        // Draw at 256×256 — large enough for reliable statistics, fast enough for real-time
        const SIZE   = 256;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx    = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const imageData = ctx.getImageData(0, 0, SIZE, SIZE);

        const metrics      = _extractMetrics(imageData);
        const visual       = _visualScore(metrics);
        const { likes, mood, multiplier } = _fakeLikes(visual, file.name);

        resolve({
          fileName:           file.name,
          uploadedAt:         new Date().toISOString(),
          visual_score_0_100: parseFloat(visual.toFixed(1)),
          fake_likes:         likes,
          algorithm_mood:     mood,
          mood_multiplier:    multiplier,
          _metrics:           metrics,
        });
      };
      img.onerror = () => reject(new Error('LikesCalculator: could not load image'));
      img.src = objectURL;
    });
  }
};

})();
