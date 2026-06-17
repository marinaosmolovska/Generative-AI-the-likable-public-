"""
app.py — minimal Streamlit UI.

Upload one image -> it's shown at 1024x1024 -> click "Calculate likes" ->
see four numbers:

    Aesthetics score   (from the Aesthetics Toolbox)
    Popularity score   (from I2PA)
    Visual score       (aesthetics + popularity combined)
    Fun likes          (slot-machine toy, NOT a real prediction)

Run with:  streamlit run app.py
"""

import os
import tempfile

import streamlit as st
from PIL import Image

from analyze import analyze_image
from visual_score import full_score, load_baseline

st.set_page_config(page_title="Instagramable Interiors", page_icon="🛋️",
                   layout="centered")

st.title("🛋️ Instagramable Interiors")

# blend weight: 0.5 = even mix of aesthetics and popularity. Hard-coded so the
# interface stays to one button. (Edit here if you want to lean one way.)
W_AESTHETICS = 0.5

uploaded = st.file_uploader(
    "Upload an image",
    type=["jpg", "jpeg", "png", "bmp", "tif", "tiff", "webp"],
    accept_multiple_files=False,
)

if uploaded:
    # show the image at 1024x1024
    img = Image.open(uploaded).convert("RGB")
    img_1024 = img.resize((1024, 1024))
    st.image(img_1024, width=1024)

    # one button
    if st.button("🎰 Calculate likes", type="primary", use_container_width=True):
        baseline = load_baseline()
        if baseline is None:
            st.error(
                "No baseline_stats.json found — the aesthetics score can't be "
                "computed without it. Make sure that file is in the folder."
            )
            st.stop()

        with st.spinner("Analyzing…"):
            suffix = os.path.splitext(uploaded.name)[1] or ".png"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(uploaded.getbuffer())
                tmp_path = tmp.name
            try:
                metrics = analyze_image(tmp_path, run_i2pa=True, run_toolbox=True)
            finally:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

            i2pa_val = metrics.get("I2PA_popularity_score")
            if not isinstance(i2pa_val, (int, float)):
                i2pa_val = None

            out = full_score(
                metrics, i2pa=i2pa_val, w_aesthetics=W_AESTHETICS,
                baseline=baseline, seed_key=uploaded.name, force_random=True,
            )

        # the four numbers
        c1, c2 = st.columns(2)
        c1.metric("Aesthetics score", f"{out['aesthetics_score_0_100']:.1f}")
        c2.metric("Popularity score", f"{out['i2pa_score_0_100']:.1f}")

        c3, c4 = st.columns(2)
        c3.metric("Visual score", f"{out['visual_score_0_100']:.1f}")
        c4.metric("🎰 Fun likes", f"{out['fake_likes']:,}")

        st.caption(f"The algorithm is *{out['algorithm_mood']}* today. 🎲 "
                   "(Fun likes is a toy, not a real prediction.)")
