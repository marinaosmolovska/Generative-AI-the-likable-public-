"""
visual_score.py — turn one image's metrics into single numbers.

Pipeline (matches the 4 steps you asked for):

  STEP 1: aesthetics_score(metrics)  -> ONE number (0-100) from the toolbox QIPs,
          scored against a stored baseline so it works for a single image.
  STEP 2: I2PA score                 -> already one number (passed in).
  STEP 3: visual_score(...)          -> blends step 1 + step 2 into ONE 0-100
          "visual score".
  STEP 4: fake_likes(...)            -> a DELIBERATELY UNSCIENTIFIC, for-fun
          "predicted likes" number. Slot-machine style: a base driven by the
          visual score, times a random "mood of the algorithm" multiplier.
          This is a TOY. It does not predict anything real.

The baseline (baseline_stats.json) holds the mean + std of each toolbox metric
over a reference set of images. Build it once with build_baseline(); after that
any single image can be scored. Rebuild it from your own interiors anytime to
make the scores relative to *your* image style.
"""

import json
import os
import hashlib
import numpy as np

from composite import FEATURE_ORIENTATION

_HERE = os.path.dirname(os.path.abspath(__file__))
_BASELINE_PATH = os.path.join(_HERE, "baseline_stats.json")

# The toolbox features that feed the aesthetics score (same set the composite
# uses: the ones with an agreed "favoured" direction). Pulled from composite.py
# so the two stay in sync.
_SCORE_FEATURES = list(FEATURE_ORIENTATION.keys())


# ----------------------------------------------------------------------------
# Baseline: mean + std of each feature over a reference set
# ----------------------------------------------------------------------------
def build_baseline(metrics_rows, path=_BASELINE_PATH):
    """metrics_rows: list of dicts (output of analyze_image) for reference images.
    Stores per-feature mean/std to JSON. Needs >= ~5 images to be meaningful."""
    stats = {}
    for feat in _SCORE_FEATURES:
        vals = [float(r[feat]) for r in metrics_rows
                if feat in r and isinstance(r[feat], (int, float))]
        if len(vals) >= 2:
            mu = float(np.mean(vals))
            sd = float(np.std(vals, ddof=0))
            if sd < 1e-9:
                sd = 1.0  # avoid divide-by-zero on constant features
            stats[feat] = {"mean": mu, "std": sd}
    payload = {"n_reference_images": len(metrics_rows), "features": stats}
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    return payload


def load_baseline(path=_BASELINE_PATH):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def baseline_exists(path=_BASELINE_PATH):
    return os.path.exists(path)


# ----------------------------------------------------------------------------
# STEP 1 — one aesthetics number from the toolbox metrics
# ----------------------------------------------------------------------------
def _squash_to_0_100(z):
    """Map a z-score-ish value to 0-100 with a smooth logistic curve.
    z = 0 (typical) -> 50. Roughly +/-3 sd spans most of the range."""
    return 100.0 / (1.0 + np.exp(-z / 1.5))


def aesthetics_score(metrics, baseline=None):
    """Return (score_0_100, detail_dict) for ONE image's toolbox metrics.

    For each favoured feature: z = (value - baseline_mean) / baseline_std,
    sign-corrected so higher = more favoured. Average the z's, then squash
    to 0-100. Needs a baseline; returns (None, {...}) if none is available."""
    if baseline is None:
        baseline = load_baseline()
    if baseline is None:
        return None, {"error": "no baseline — build one first"}

    bstats = baseline["features"]
    zs = []
    used = []
    for feat in _SCORE_FEATURES:
        if feat not in metrics or feat not in bstats:
            continue
        v = metrics[feat]
        if not isinstance(v, (int, float)):
            continue
        mu = bstats[feat]["mean"]
        sd = bstats[feat]["std"]
        z = (float(v) - mu) / sd
        z *= FEATURE_ORIENTATION.get(feat, +1)  # higher = favoured
        zs.append(z)
        used.append(feat)

    if not zs:
        return None, {"error": "no usable features"}

    mean_z = float(np.mean(zs))
    score = float(_squash_to_0_100(mean_z))
    return score, {"mean_z": mean_z, "n_features": len(used), "used": used}


# ----------------------------------------------------------------------------
# STEP 2 — normalize the I2PA score to 0-100 (against baseline if we have one)
# ----------------------------------------------------------------------------
# I2PA scores in practice mostly fall in roughly [-2, 8]. We map with a gentle
# logistic centered at 3 (a typical-ish value) so the popularity contribution is
# on the same 0-100 footing as the aesthetics score.
def i2pa_to_0_100(i2pa):
    if i2pa is None:
        return None
    return float(100.0 / (1.0 + np.exp(-(float(i2pa) - 3.0) / 2.0)))


# ----------------------------------------------------------------------------
# STEP 3 — combine into one visual score
# ----------------------------------------------------------------------------
def visual_score(aesthetics_0_100, i2pa_0_100, w_aesthetics=0.5):
    """Weighted blend of the two 0-100 scores into one visual score (0-100).
    If one is missing, the other is used alone."""
    parts, weights = [], []
    if aesthetics_0_100 is not None:
        parts.append(aesthetics_0_100); weights.append(w_aesthetics)
    if i2pa_0_100 is not None:
        parts.append(i2pa_0_100); weights.append(1.0 - w_aesthetics)
    if not parts:
        return None
    weights = np.array(weights) / np.sum(weights)
    return float(np.dot(parts, weights))


# ----------------------------------------------------------------------------
# STEP 4 — the FOR-FUN slot-machine likes (NOT a real prediction)
# ----------------------------------------------------------------------------
# Honest framing for the metaphor: real reach genuinely has a big random/timing
# component, so a slot machine is a fitting joke. The base grows fast with the
# visual score (exponential, so a "great" image dwarfs a "meh" one), then a
# random "mood of the algorithm" multiplier shakes it.
_MOODS = [
    ("feeling generous",        1.8),
    ("doomscrolling, distracted", 0.4),
    ("loves your aesthetic",    1.5),
    ("shadow-banning vibes",    0.25),
    ("it's a slow news day",    1.2),
    ("everyone's asleep",       0.6),
    ("the explore page smiled", 2.2),
    ("mid, honestly",           0.9),
]


def fake_likes(visual_0_100, seed_key=None, force_random=False):
    """Return (likes:int, mood:str, multiplier:float).

    Deterministic per image unless force_random=True: we seed the RNG from the
    image (so re-running gives the same 'spin'), which feels stable. Set
    force_random=True for a true re-spin each press.

    THIS IS A TOY. It does not predict real engagement."""
    if visual_0_100 is None:
        visual_0_100 = 50.0

    # base: exponential in the visual score. ~12 likes at score 0,
    # ~12 * e^4.6 ~ 1200 at score 50, ~12 * e^9.2 ~ 120k at score 100.
    base = 12.0 * np.exp(visual_0_100 / 100.0 * 9.2)

    if force_random:
        rng = np.random.default_rng()
    else:
        # stable seed from the image identity + score
        h = hashlib.md5((str(seed_key) + f"{visual_0_100:.2f}").encode()).hexdigest()
        rng = np.random.default_rng(int(h[:8], 16))

    mood, mult = _MOODS[rng.integers(len(_MOODS))]
    # a little extra jitter so it feels slot-machine-y
    jitter = rng.uniform(0.85, 1.15)
    likes = int(round(base * mult * jitter))
    return likes, mood, float(mult)


# ----------------------------------------------------------------------------
# convenience: do the whole thing for one metrics dict
# ----------------------------------------------------------------------------
def full_score(metrics, i2pa=None, w_aesthetics=0.5, baseline=None,
               seed_key=None, force_random=False):
    aes, aes_detail = aesthetics_score(metrics, baseline=baseline)
    i2pa_n = i2pa_to_0_100(i2pa)
    vis = visual_score(aes, i2pa_n, w_aesthetics=w_aesthetics)
    likes, mood, mult = fake_likes(vis, seed_key=seed_key, force_random=force_random)
    return {
        "aesthetics_score_0_100": aes,
        "i2pa_score_0_100": i2pa_n,
        "visual_score_0_100": vis,
        "fake_likes": likes,
        "algorithm_mood": mood,
        "mood_multiplier": mult,
        "_aes_detail": aes_detail,
    }
