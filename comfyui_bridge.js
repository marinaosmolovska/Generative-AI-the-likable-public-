// ── ComfyUI Bridge ────────────────────────────────────────────────────────────
// Uses IG LORA TEST_canny workflow (FLUX.1 Dev Canny + igcflr LoRA).
// Node 829 changed from LoadImagesFromURL → LoadImage for browser-upload compat.
// Output target: node 947 (SaveImage, FLUX.1 Canny rendered result).
// ─────────────────────────────────────────────────────────────────────────────

const COMFY = 'http://127.0.0.1:8188';
const WS    = 'ws://127.0.0.1:8188';

const _cid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                  .map(b => b.toString(16).padStart(2,'0')).join('');

// ── FLUX.1 Canny only (FLUX.2 Klein removed to fit 4GB VRAM) ─────────────────
const _CANNY_WF = {
  "820":     { "inputs": { "width": 1024, "height": 1024, "upscale_method": "nearest-exact", "keep_proportion": "pad", "pad_color": "0, 0, 0", "crop_position": "center", "divisible_by": 2, "device": "cpu", "image": ["829", 0] }, "class_type": "ImageResizeKJv2", "_meta": { "title": "Resize Image v2" } },
  "829":     { "inputs": { "image": "placeholder.jpg" }, "class_type": "LoadImage", "_meta": { "title": "Load Image" } },
  "830":     { "inputs": { "value": "igcflr trendy modern interior design, warm minimalist aesthetic, curved organic furniture, bouclé textiles, travertine and oak surfaces, soft diffused natural light, large windows, neutral earthy palette, statement lighting fixtures, indoor plants, layered textures, designer furniture, architectural digest, professional interior photography, shallow depth of field, cozy inviting atmosphere" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "String (Multiline)" } },
  "831":     { "inputs": { "images": ["820", 0] }, "class_type": "PreviewImage", "_meta": { "title": "Preview Image" } },
  "946":     { "inputs": { "filename_prefix": "canny/canny_edge",   "images": ["950:105", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "947":     { "inputs": { "filename_prefix": "canny/canny_output", "images": ["950:91",  0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "950:91":  { "inputs": { "samples": ["950:109", 0], "vae": ["950:94", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "950:94":  { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "950:92":  { "inputs": { "text": "", "clip": ["950:944", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Negative Prompt)" } },
  "950:96":  { "inputs": { "positive": ["950:97", 0], "negative": ["950:92", 0], "vae": ["950:94", 0], "pixels": ["950:105", 0] }, "class_type": "InstructPixToPixConditioning", "_meta": { "title": "InstructPixToPixConditioning" } },
  "950:97":  { "inputs": { "guidance": 30, "conditioning": ["950:98", 0] }, "class_type": "FluxGuidance", "_meta": { "title": "FluxGuidance" } },
  "950:98":  { "inputs": { "text": ["950:189", 0], "clip": ["950:944", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Positive Prompt)" } },
  "950:99":  { "inputs": { "clip_name1": "clip_l.safetensors", "clip_name2": "t5xxl_fp8_e4m3fn.safetensors", "type": "flux", "device": "default" }, "class_type": "DualCLIPLoader", "_meta": { "title": "DualCLIPLoader" } },
  "950:105": { "inputs": { "low_threshold": 0.1, "high_threshold": 0.25, "image": ["950:188", 0] }, "class_type": "Canny", "_meta": { "title": "Canny" } },
  "950:109": { "inputs": { "add_noise": "enable", "noise_seed": ["950:833", 0], "steps": ["950:834", 0], "cfg": ["950:840", 0], "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 10000, "return_with_leftover_noise": "disable", "model": ["950:944", 0], "positive": ["950:96", 0], "negative": ["950:96", 1], "latent_image": ["950:96", 2] }, "class_type": "KSamplerAdvanced", "_meta": { "title": "KSampler (Advanced)" } },
  "950:188": { "inputs": { "measurement": "pixels", "width": ["950:839", 0], "height": ["950:838", 0], "fit": "contain", "method": "nearest-exact", "image": ["820", 0] }, "class_type": "Image Resize (rgthree)", "_meta": { "title": "Image Resize (rgthree)" } },
  "950:189": { "inputs": { "value": ["830", 0] }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "String (Multiline)" } },
  "950:190": { "inputs": { "unet_name": "flux1CannyDevFp8_v10.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load Diffusion Model" } },
  "950:833": { "inputs": { "value": 0 }, "class_type": "PrimitiveInt", "_meta": { "title": "seed" } },
  "950:834": { "inputs": { "value": 10 }, "class_type": "PrimitiveInt", "_meta": { "title": "steps" } },
  "950:838": { "inputs": { "value": 1024 }, "class_type": "PrimitiveInt", "_meta": { "title": "height" } },
  "950:839": { "inputs": { "value": 1024 }, "class_type": "PrimitiveInt", "_meta": { "title": "width" } },
  "950:840": { "inputs": { "value": 2 }, "class_type": "PrimitiveFloat", "_meta": { "title": "cfg" } },
  "950:944": { "inputs": { "lora_name": "igcflr.safetensors", "strength_model": 0.5, "strength_clip": 1, "model": ["950:190", 0], "clip": ["950:99", 0] }, "class_type": "LoraLoader", "_meta": { "title": "Load LoRA (Model and CLIP)" } }
};

async function _uploadImage(blobOrFile) {
  const file = blobOrFile instanceof File
    ? blobOrFile
    : new File([blobOrFile], 'input.png', { type: 'image/png' });
  const fd = new FormData();
  fd.append('image', file);
  fd.append('overwrite', 'true');
  const r = await fetch(`${COMFY}/upload/image`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Image upload failed — is ComfyUI running?');
  return (await r.json()).name;
}

function _neutralBlob() {
  return new Promise(res => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 512, 512);
    c.toBlob(res, 'image/png');
  });
}

function _runPrompt(workflow, onProgress) {
  return new Promise((resolve, reject) => {
    let pid = null;
    const ws = new WebSocket(`${WS}/ws?clientId=${_cid}`);

    ws.onopen = () => {
      fetch(`${COMFY}/prompt`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt: workflow, client_id: _cid })
      })
      .then(r => r.json())
      .then(d => {
        if (d.error) { ws.close(); reject(new Error(JSON.stringify(d.error))); return; }
        pid = d.prompt_id;
      })
      .catch(e => { ws.close(); reject(e); });
    };

    ws.onmessage = async (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }

      if (msg.type === 'progress' && onProgress) {
        onProgress(msg.data.value / msg.data.max);
      }

      if (msg.type === 'execution_error') {
        ws.close();
        const d = msg.data;
        reject(new Error(`ComfyUI node error [${d.node_type ?? d.node_id}]: ${d.exception_message ?? JSON.stringify(d)}`));
        return;
      }

      if (msg.type === 'executing' && msg.data.node === null) {
        if (pid && msg.data.prompt_id !== pid) return;
        ws.close();
        try {
          await new Promise(r => setTimeout(r, 300));
          const hist  = await fetch(`${COMFY}/history/${pid}`).then(r => r.json());
          const entry = hist[pid];

          if (entry?.status?.status_str === 'error') {
            const errMsg = entry.status.messages
              ?.find(m => m[0] === 'execution_error')?.[1]?.exception_message
              ?? 'workflow failed — check ComfyUI console for details';
            reject(new Error(errMsg));
            return;
          }

          const outs = entry?.outputs ?? {};
          console.log('[ComfyBridge] history outputs:', JSON.stringify(outs).slice(0, 400));

          // Prefer node 947 (FLUX.1 Canny rendered output), fall back to any image
          const preferred = outs['947'] ?? Object.values(outs).find(o => o.images?.length);
          if (preferred?.images?.length) {
            const { filename, subfolder, type } = preferred.images[0];
            const url = `${COMFY}/view?filename=${encodeURIComponent(filename)}`
                      + `&subfolder=${encodeURIComponent(subfolder)}`
                      + `&type=${type}&t=${Date.now()}`;
            resolve(url);
            return;
          }
          reject(new Error('Workflow ran but saved no images — check ComfyUI console'));
        } catch(e) { reject(e); }
      }
    };

    ws.onerror = () => { ws.close(); reject(new Error('WebSocket failed — is ComfyUI running? (run_comfyui_cors.bat)')); };
    ws.onclose = (e) => { if (!e.wasClean && !pid) reject(new Error('WebSocket closed before job was accepted')); };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
window.ComfyBridge = {
  async fetchLoRAs() {
    const r = await fetch(`${COMFY}/object_info/LoraLoader`);
    if (!r.ok) throw new Error('Cannot reach ComfyUI — is it running?');
    const info = await r.json();
    return info?.LoraLoader?.input?.required?.lora_name?.[0] ?? [];
  },

  async generate({ image = null, prompt = '', loraStrength = 1, steps = 20, onProgress } = {}) {
    // Wait until ComfyUI is fully ready (not just started)
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`${COMFY}/system_stats`);
        if (r.ok) break;
      } catch {}
      if (i === 29) throw new Error('ComfyUI not ready after 30s — wait for it to fully load then try again');
      await new Promise(r => setTimeout(r, 1000));
    }
    // Clear any stale queued jobs from previous crashes
    await fetch(`${COMFY}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true })
    }).catch(() => {});

    const wf = JSON.parse(JSON.stringify(_CANNY_WF)); // deep clone

    const blob    = image ?? await _neutralBlob();
    const imgName = await _uploadImage(blob);

    // Patch variable nodes
    wf['829'].inputs.image              = imgName;
    wf['830'].inputs.value              = prompt;
    wf['950:944'].inputs.strength_model = loraStrength;
    wf['950:944'].inputs.strength_clip  = loraStrength;
    wf['950:833'].inputs.value          = Math.floor(Math.random() * 2 ** 32);
    wf['950:834'].inputs.value          = steps;

    return _runPrompt(wf, onProgress);
  }
};
