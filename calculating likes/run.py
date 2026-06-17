#!/usr/bin/env python3
"""
run.py — command-line front end for the two-tool image analyzer.

Usage:
    python run.py path/to/image.jpg
    python run.py path/to/folder/                 # all images in folder
    python run.py path/to/folder/ --csv out.csv   # also write a CSV
    python run.py img.jpg --no-i2pa               # toolbox metrics only
    python run.py img.jpg --no-toolbox            # I2PA score only

Output: a readable per-image printout grouped by metric family, plus an
optional CSV (one row per image, one column per metric).
"""

import argparse
import csv
import os
import sys

from analyze import analyze_image

IMG_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}

# how to group metrics for the human-readable printout
GROUPS = [
    ("I2PA — intrinsic popularity (relative ranking score, NOT likes)",
     ["I2PA_popularity_score"]),
    ("Balance & symmetry (Thoemmes & Hubner family — lower = more balanced)",
     ["balance_BAL_M_8axis", "DCM_distance", "DCM_x_offset", "DCM_y_offset",
      "mirror_symmetry", "homogeneity", "CNN_symmetry_left_right",
      "CNN_symmetry_up_down", "CNN_symmetry_lr_and_ud"]),
    ("Complexity / structure",
     ["edge_density", "EOE_1st_order", "EOE_2nd_order", "complexity_PHOG",
      "anisotropy_PHOG", "selfsimilarity_PHOG", "CNN_selfsimilarity",
      "CNN_sparseness", "CNN_variability",
      "fractal_dimension_2D", "fractal_dimension_3D"]),
    ("Entropy",
     ["luminance_entropy", "color_entropy_HSV_H"]),
    ("Fourier spectrum",
     ["fourier_sigma", "fourier_slope_redies", "fourier_slope_spehar",
      "fourier_slope_mather"]),
    ("Color — means",
     ["mean_R", "mean_G", "mean_B", "mean_L", "mean_a", "mean_b",
      "mean_H_circular", "mean_S", "mean_V"]),
    ("Color — spread / contrast",
     ["RMS_contrast", "std_R", "std_G", "std_B", "std_L", "std_a", "std_b",
      "std_H_circular", "std_S", "std_V"]),
    ("Image basics",
     ["image_size_pixels", "aspect_ratio"]),
]


def fmt(v):
    if isinstance(v, float):
        if abs(v) < 1 and v != 0:
            return f"{v:.5f}"
        return f"{v:.3f}"
    return str(v)


def collect_images(path):
    if os.path.isfile(path):
        return [path]
    files = []
    for root, _, names in os.walk(path):
        for n in sorted(names):
            if os.path.splitext(n)[1].lower() in IMG_EXTS:
                files.append(os.path.join(root, n))
    return files


def print_report(res):
    print("\n" + "=" * 64)
    print(f"  {res['img_file']}")
    print("=" * 64)
    shown = {"img_file"}
    for title, keys in GROUPS:
        present = [k for k in keys if k in res]
        if not present:
            continue
        print(f"\n  {title}")
        print("  " + "-" * (len(title)))
        for k in present:
            print(f"    {k:<28} {fmt(res[k])}")
            shown.add(k)
    # any leftover keys (e.g. errors)
    leftover = [k for k in res if k not in shown]
    if leftover:
        print("\n  Other")
        for k in leftover:
            print(f"    {k:<28} {fmt(res[k])}")


def main():
    ap = argparse.ArgumentParser(description="Run I2PA + Aesthetics Toolbox on image(s).")
    ap.add_argument("path", help="image file or folder of images")
    ap.add_argument("--csv", default=None, help="write results to this CSV path")
    ap.add_argument("--no-i2pa", action="store_true", help="skip the I2PA model")
    ap.add_argument("--no-toolbox", action="store_true", help="skip toolbox QIPs")
    ap.add_argument("--quiet", action="store_true", help="suppress per-image printout")
    args = ap.parse_args()

    images = collect_images(args.path)
    if not images:
        print(f"No images found at: {args.path}", file=sys.stderr)
        sys.exit(1)

    rows = []
    for i, img_path in enumerate(images, 1):
        if not args.quiet:
            print(f"[{i}/{len(images)}] analyzing {os.path.basename(img_path)} ...",
                  file=sys.stderr)
        res = analyze_image(img_path,
                            run_i2pa=not args.no_i2pa,
                            run_toolbox=not args.no_toolbox)
        rows.append(res)
        if not args.quiet:
            print_report(res)

    if args.csv:
        # union of all keys, img_file first
        all_keys = []
        for r in rows:
            for k in r:
                if k not in all_keys:
                    all_keys.append(k)
        all_keys = ["img_file"] + [k for k in all_keys if k != "img_file"]
        with open(args.csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=all_keys)
            w.writeheader()
            for r in rows:
                w.writerow(r)
        print(f"\nWrote {len(rows)} row(s) to {args.csv}", file=sys.stderr)


if __name__ == "__main__":
    main()
