"""
analyze.py — Run an image through two independent aesthetics tools and report
every metric they provide.

  1. I2PA  (Intrinsic Image Popularity Assessment, Ding et al. 2019)
           A ResNet-50 trained on ~2.5M popularity-discriminable Instagram image
           pairs. Outputs ONE scalar: an "intrinsic popularity" score. Higher =
           the image content tends to be ranked as more popular by the model.
           It is a RELATIVE ranking score, NOT a like count.

  2. Aesthetics Toolbox QIPs (Bartho et al. 2025, integrating the Huebner group
           balance code used in Thoemmes & Huebner 2018, plus color, entropy,
           Fourier, fractal, PHOG and CNN-based measures).
           Outputs a dictionary of interpretable, hand-crafted image properties.

Neither predicts Instagram likes. They give scores/measures; interpretation is
up to you. See README.md for the honest caveats.
"""

import os
import warnings
import numpy as np
from PIL import Image

warnings.filterwarnings("ignore")  # silence skimage/torch deprecation chatter

# ----------------------------------------------------------------------------
# Aesthetics Toolbox modules (copied verbatim from RBartho/Aesthetics-Toolbox)
# ----------------------------------------------------------------------------
from skimage import color
from AT import (
    balance_qips,
    CNN_qips,
    color_and_simple_qips,
    edge_entropy_qips,
    fourier_qips,
    fractal_dimension_qips,
    PHOG_qips,
)

_HERE = os.path.dirname(os.path.abspath(__file__))
_ALEXNET_KERNEL = os.path.join(_HERE, "AT", "bvlc_alexnet_conv1.npy")
_I2PA_WEIGHTS = os.path.join(_HERE, "model", "model-resnet50.pth")

Image.MAX_IMAGE_PIXELS = int(1e10)


# ----------------------------------------------------------------------------
# I2PA — lazy-loaded so the toolbox metrics work even without torch installed
# ----------------------------------------------------------------------------
_I2PA_MODEL = None
_I2PA_DEVICE = None


def _load_i2pa():
    global _I2PA_MODEL, _I2PA_DEVICE
    if _I2PA_MODEL is not None:
        return _I2PA_MODEL, _I2PA_DEVICE
    import torch
    import torchvision.models

    _I2PA_DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = torchvision.models.resnet50()
    model.fc = torch.nn.Linear(in_features=2048, out_features=1)
    model.load_state_dict(torch.load(_I2PA_WEIGHTS, map_location=_I2PA_DEVICE))
    model.eval().to(_I2PA_DEVICE)
    _I2PA_MODEL = model
    return _I2PA_MODEL, _I2PA_DEVICE


def i2pa_score(img_pil):
    """Intrinsic popularity score (single float). Replicates upstream test.py:
    resize to 224x224, ToTensor, forward pass."""
    import torch
    import torchvision.transforms as transforms

    model, device = _load_i2pa()
    img = img_pil.convert("RGB") if img_pil.mode != "RGB" else img_pil
    tf = transforms.Compose([transforms.Resize([224, 224]), transforms.ToTensor()])
    x = tf(img).unsqueeze(0).to(device)
    with torch.no_grad():
        pred = model(x)
    return float(pred.item())


# ----------------------------------------------------------------------------
# Aesthetics Toolbox — compute the full QIP set
# ----------------------------------------------------------------------------
def toolbox_qips(img_pil):
    """Return a dict of every quantitative image property the toolbox exposes.
    Mirrors the call patterns in the toolbox's QIP_machine_script.py."""
    rgb = np.asarray(img_pil.convert("RGB"))
    gray = np.asarray(img_pil.convert("L"))
    lab = color.rgb2lab(rgb)
    hsv = color.rgb2hsv(rgb)

    kernel, bias = np.load(open(_ALEXNET_KERNEL, "rb"), encoding="latin1",
                           allow_pickle=True)

    q = {}

    # --- basic / size ---
    q["image_size_pixels"] = color_and_simple_qips.image_size(rgb)
    q["aspect_ratio"] = color_and_simple_qips.aspect_ratio(rgb)

    # --- color means / stds ---
    mR, mG, mB = color_and_simple_qips.mean_channels(rgb)
    q["mean_R"], q["mean_G"], q["mean_B"] = mR, mG, mB
    mL, ma, mb = color_and_simple_qips.mean_channels(lab)
    q["mean_L"], q["mean_a"], q["mean_b"] = mL, ma, mb
    circ_mean, circ_std = color_and_simple_qips.circ_stats(hsv)
    _, mS, mV = color_and_simple_qips.mean_channels(hsv)
    q["mean_H_circular"], q["mean_S"], q["mean_V"] = circ_mean, mS, mV
    sR, sG, sB = color_and_simple_qips.std_channels(rgb)
    q["std_R"], q["std_G"], q["std_B"] = sR, sG, sB
    sL, sa, sb = color_and_simple_qips.std_channels(lab)
    q["std_L"], q["std_a"], q["std_b"] = sL, sa, sb
    _, sSv, sVv = color_and_simple_qips.std_channels(hsv)
    q["std_H_circular"], q["std_S"], q["std_V"] = circ_std, sSv, sVv

    # RMS contrast == std of L channel
    q["RMS_contrast"] = sL

    # --- entropies ---
    q["luminance_entropy"] = color_and_simple_qips.shannonentropy_channels(lab[:, :, 0])
    q["color_entropy_HSV_H"] = color_and_simple_qips.shannonentropy_channels(hsv[:, :, 0])

    # --- edge density + edge-orientation entropy (1st / 2nd order) ---
    fo, so, ed = edge_entropy_qips.do_first_and_second_order_entropy_and_edge_density(gray)
    q["edge_density"] = ed
    q["EOE_1st_order"] = fo
    q["EOE_2nd_order"] = so

    # --- balance family (the Thoemmes & Huebner measures) ---
    q["balance_BAL_M_8axis"] = balance_qips.Balance(gray)
    dcm_dist, dcm_x, dcm_y = balance_qips.DCM(gray)
    q["DCM_distance"] = dcm_dist
    q["DCM_x_offset"] = dcm_x
    q["DCM_y_offset"] = dcm_y
    q["mirror_symmetry"] = balance_qips.Mirror_symmetry(gray)
    q["homogeneity"] = balance_qips.Homogeneity(gray)

    # --- fractal dimension ---
    q["fractal_dimension_2D"] = fractal_dimension_qips.fractal_dimension_2d(gray)
    q["fractal_dimension_3D"] = fractal_dimension_qips.fractal_dimension_3d(gray)

    # --- Fourier ---
    sigma, slope_redies = fourier_qips.fourier_redies(
        gray, bin_size=2, cycles_min=10, cycles_max=256)
    q["fourier_sigma"] = sigma
    q["fourier_slope_redies"] = slope_redies
    q["fourier_slope_spehar"] = fourier_qips.fourier_slope_branka_Spehar_Isherwood(gray)
    q["fourier_slope_mather"] = fourier_qips.fourier_slope_mather(rgb)

    # --- PHOG: self-similarity, complexity, anisotropy ---
    self_sim, complexity, anisotropy = PHOG_qips.PHOGfromImage(
        rgb, section=2, bins=16, angle=360, levels=3, re=-1, sesfweight=[1, 1, 1])
    q["selfsimilarity_PHOG"] = self_sim
    q["complexity_PHOG"] = complexity
    q["anisotropy_PHOG"] = anisotropy

    # --- CNN-based (AlexNet conv1) ---
    sym_lr, sym_ud, sym_lrud = CNN_qips.CNN_symmetry(rgb, kernel, bias)
    q["CNN_symmetry_left_right"] = sym_lr
    q["CNN_symmetry_up_down"] = sym_ud
    q["CNN_symmetry_lr_and_ud"] = sym_lrud

    resp = CNN_qips.conv2d(rgb, kernel, bias)
    _, sp_map = CNN_qips.max_pooling(resp, patches=22)
    q["CNN_sparseness"] = CNN_qips.CNN_Variance(sp_map, kind="sparseness")
    _, var_map = CNN_qips.max_pooling(resp, patches=12)
    q["CNN_variability"] = CNN_qips.CNN_Variance(var_map, kind="variability")
    _, map8 = CNN_qips.max_pooling(resp, patches=8)
    _, map1 = CNN_qips.max_pooling(resp, patches=1)
    q["CNN_selfsimilarity"] = CNN_qips.CNN_selfsimilarity(map1, map8)

    # cast everything to plain python floats / ints for clean output
    clean = {}
    for k, v in q.items():
        try:
            clean[k] = float(v)
        except (TypeError, ValueError):
            clean[k] = v
    return clean


# ----------------------------------------------------------------------------
# Combined entry point
# ----------------------------------------------------------------------------
def analyze_image(path, run_i2pa=True, run_toolbox=True):
    """Analyze one image. Returns a flat dict of all metrics."""
    img = Image.open(path)
    result = {"img_file": os.path.basename(path)}

    if run_i2pa:
        try:
            result["I2PA_popularity_score"] = i2pa_score(img)
        except Exception as e:
            result["I2PA_popularity_score"] = f"ERROR: {e}"

    if run_toolbox:
        try:
            result.update(toolbox_qips(img))
        except Exception as e:
            result["toolbox_error"] = f"ERROR: {e}"

    return result
