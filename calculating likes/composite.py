"""
composite.py — turn the raw per-image metrics into ONE principled
"composition score" per image.

This is NOT a like predictor. It produces a relative score that lets you rank
images within a batch by how strongly they lean toward the aesthetically
"favoured" direction reported in the visual-aesthetics literature
(more balanced, more symmetric, etc.). The score is meaningful *relative to the
batch you feed it*, not as an absolute universal number.

Two methods are provided:

  - "pca"      : data-driven. Finds the dominant axis of variation across the
                 standardized features and projects each image onto it. The axis
                 is oriented so it correlates positively with the I2PA score
                 (our one learned "appeal" proxy), and the function reports how
                 much variance that axis explains so you know if it's coherent.

  - "weighted" : transparent. You (or the provided default) assign a weight to
                 each feature; the score is the weighted sum of the standardized,
                 sign-corrected features. Easy to explain in a thesis.

Why standardize + sign-correct first:
  * Standardize (z-score): puts every metric on the same scale so a big-range
    metric (mean_R ~226) doesn't drown a small-range one (DCM_x_offset ~0.08).
  * Sign-correct: some metrics are "lower = better" (balance/symmetry distances),
    others "higher = better". We flip the lower-is-better ones so that for every
    feature, higher consistently means "more of the favoured direction".
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA


# ----------------------------------------------------------------------------
# Which metrics to feed into the composite, and their orientation.
#
# orientation = +1 : higher is the aesthetically-favoured direction
# orientation = -1 : LOWER is favoured (we will flip these)
#
# We deliberately EXCLUDE pure descriptors that don't have an agreed
# "good/bad" direction (raw color means, image size, aspect ratio, raw color
# channel positions). Including them would add noise, not signal. You can edit
# this dict freely — it's meant to be transparent and adjustable.
# ----------------------------------------------------------------------------
FEATURE_ORIENTATION = {
    # --- balance & symmetry: lower distance = more balanced/symmetric = favoured
    "balance_BAL_M_8axis": -1,
    "DCM_distance": -1,
    "mirror_symmetry": +1,   # this toolbox measure: higher = more symmetric
    "homogeneity": +1,       # higher = more evenly distributed mass
    "CNN_symmetry_left_right": +1,
    "CNN_symmetry_up_down": +1,
    "CNN_symmetry_lr_and_ud": +1,
    # --- structure / complexity: treated as "more structure" = +1.
    #     (Note: the literature suggests an INVERTED-U for complexity, so a
    #      linear weight is a simplification. See README / notes.)
    "selfsimilarity_PHOG": +1,
    "CNN_selfsimilarity": +1,
    "complexity_PHOG": +1,
    "edge_density": +1,
    "EOE_1st_order": +1,
    "EOE_2nd_order": +1,
    # --- entropy / order
    "luminance_entropy": +1,
    "color_entropy_HSV_H": +1,
    # --- contrast
    "RMS_contrast": +1,
}

# Default weights for the "weighted" method. Equal weight within families,
# normalized so they sum to 1. Edit to taste — this is the honest knob.
DEFAULT_WEIGHTS = {
    # balance/symmetry family gets the most weight (it's the best-supported
    # link to aesthetic appeal in the source paper)
    "balance_BAL_M_8axis": 3.0,
    "DCM_distance": 3.0,
    "mirror_symmetry": 1.0,
    "homogeneity": 1.0,
    "CNN_symmetry_left_right": 1.0,
    "CNN_symmetry_up_down": 1.0,
    "CNN_symmetry_lr_and_ud": 1.0,
    "selfsimilarity_PHOG": 1.0,
    "CNN_selfsimilarity": 1.0,
    "complexity_PHOG": 1.0,
    "edge_density": 1.0,
    "EOE_1st_order": 1.0,
    "EOE_2nd_order": 1.0,
    "luminance_entropy": 1.0,
    "color_entropy_HSV_H": 1.0,
    "RMS_contrast": 1.0,
}


def _prepare_matrix(df, features):
    """Standardize + sign-correct the selected feature columns.
    Returns (matrix, used_features)."""
    used = [f for f in features if f in df.columns]
    if not used:
        raise ValueError("None of the composite features are present in the data.")

    X = df[used].astype(float).copy()

    # drop columns that are constant across the batch (std=0 -> can't z-score,
    # and they carry no ranking information anyway)
    nonconstant = [c for c in used if X[c].std(ddof=0) > 1e-12]
    X = X[nonconstant]
    used = nonconstant

    # z-score
    Z = StandardScaler().fit_transform(X.values)

    # sign-correct: flip lower-is-better features
    signs = np.array([FEATURE_ORIENTATION.get(f, +1) for f in used], dtype=float)
    Z = Z * signs

    return Z, used


def _rescale_0_100(values):
    """Map an array to 0-100 by min-max within the batch (purely for readability).
    If all values are equal, return 50 for every item."""
    v = np.asarray(values, dtype=float)
    lo, hi = v.min(), v.max()
    if hi - lo < 1e-12:
        return np.full_like(v, 50.0)
    return (v - lo) / (hi - lo) * 100.0


def composite_pca(df, features=None):
    """PCA composite. Returns a dict with the score column and diagnostics."""
    if features is None:
        features = list(FEATURE_ORIENTATION.keys())
    Z, used = _prepare_matrix(df, features)

    if len(df) < 3:
        raise ValueError(
            "PCA needs at least ~3 images to find a meaningful axis. "
            "Use method='weighted' for 1-2 images."
        )

    pca = PCA(n_components=min(5, Z.shape[1], Z.shape[0]))
    comps = pca.fit_transform(Z)
    pc1 = comps[:, 0]

    # Orient PC1 so it points the same way as I2PA (our learned appeal proxy).
    # If I2PA isn't available, orient so the mean of sign-corrected features
    # (already "higher=better") correlates positively.
    if "I2PA_popularity_score" in df.columns and \
            pd.to_numeric(df["I2PA_popularity_score"], errors="coerce").notna().all():
        ref = pd.to_numeric(df["I2PA_popularity_score"]).values
    else:
        ref = Z.mean(axis=1)

    if np.corrcoef(pc1, ref)[0, 1] < 0:
        pc1 = -pc1

    var_explained = float(pca.explained_variance_ratio_[0])

    return {
        "score_raw": pc1,
        "score_0_100": _rescale_0_100(pc1),
        "used_features": used,
        "pc1_variance_explained": var_explained,
        "method": "pca",
    }


def composite_weighted(df, features=None, weights=None):
    """Transparent weighted-sum composite. Works for any number of images
    (including 1, since it doesn't need cross-image variance)."""
    if features is None:
        features = list(FEATURE_ORIENTATION.keys())
    if weights is None:
        weights = DEFAULT_WEIGHTS

    # NOTE: standardization here uses the batch. For a single image, std=0,
    # so we fall back to no scaling (the score is then just the weighted sum of
    # sign-corrected raw-ish values, which is only meaningful vs other batches).
    Z, used = _prepare_matrix(df, features) if len(df) > 1 else (
        _single_image_fallback(df, features))

    w = np.array([weights.get(f, 1.0) for f in used], dtype=float)
    if w.sum() == 0:
        w = np.ones_like(w)
    w = w / w.sum()

    score = Z @ w
    return {
        "score_raw": score,
        "score_0_100": _rescale_0_100(score) if len(df) > 1 else np.array([np.nan]),
        "used_features": used,
        "weights_normalized": dict(zip(used, w)),
        "method": "weighted",
    }


def _single_image_fallback(df, features):
    """For a single image we can't z-score (no spread). We return sign-corrected
    raw values; the 0-100 rescale is meaningless for n=1 and is set to NaN."""
    used = [f for f in features if f in df.columns
            and pd.notna(df[f].iloc[0])]
    vals = df[used].astype(float).values  # shape (1, k)
    signs = np.array([FEATURE_ORIENTATION.get(f, +1) for f in used], dtype=float)
    return vals * signs, used


def add_composite_scores(df, method="pca"):
    """Convenience: take the metrics dataframe, append a composite score column.
    Returns (df_with_score, diagnostics_dict)."""
    df = df.copy()
    if method == "pca" and len(df) >= 3:
        out = composite_pca(df)
    else:
        # fall back to weighted for tiny batches
        out = composite_weighted(df)
        method = out["method"]

    df["composition_score_raw"] = out["score_raw"]
    df["composition_score_0_100"] = out["score_0_100"]
    return df, out
