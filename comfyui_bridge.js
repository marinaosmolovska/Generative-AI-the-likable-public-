// ── ComfyUI Bridge ────────────────────────────────────────────────────────────
// Uses IG LORA TEST_canny workflow (FLUX.1 Dev Canny + igcflr LoRA).
// Node 829 changed from LoadImagesFromURL → LoadImage for browser-upload compat.
// Output target: node 947 (SaveImage, FLUX.1 Canny rendered result).
// ─────────────────────────────────────────────────────────────────────────────

const COMFY = 'http://127.0.0.1:8188';
const WS    = 'ws://127.0.0.1:8188';

const _cid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                  .map(b => b.toString(16).padStart(2,'0')).join('');

// ── Inlined workflow: IG LORA TEST_canny_new (API format) ────────────────────
// Node 829: LoadImagesFromURL → LoadImage for browser-upload compatibility.
// Node 947: wired to 952:344 (FLUX.2 Klein output) — was missing images input.
// Node 950:944 lora_name: mal_fav not present on machine → igcflr.safetensors.
const _CANNY_WF = {
  "820":  { "inputs": { "width": 1024, "height": 1024, "upscale_method": "nearest-exact", "keep_proportion": "pad", "pad_color": "0, 0, 0", "crop_position": "center", "divisible_by": 2, "device": "cpu", "image": ["829", 0] }, "class_type": "ImageResizeKJv2", "_meta": { "title": "Resize Image v2" } },
  "829":  { "inputs": { "image": "placeholder.jpg" }, "class_type": "LoadImage", "_meta": { "title": "Load Image" } },
  "830":  { "inputs": { "value": "igcflr trendy modern interior design, warm minimalist aesthetic, curved organic furniture, bouclé textiles, travertine and oak surfaces, soft diffused natural light, large windows, neutral earthy palette (beige, terracotta, cream, sage), statement lighting fixtures, indoor plants, layered textures, designer furniture, architectural digest, professional interior photography, shallow depth of field, cozy inviting atmosphere" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "String (Multiline)" } },
  "831":  { "inputs": { "images": ["820", 0] }, "class_type": "PreviewImage", "_meta": { "title": "Preview Image" } },
  "832":  { "inputs": { "images": ["952:344", 0] }, "class_type": "PreviewImage", "_meta": { "title": "Preview Image" } },
  "946":  { "inputs": { "filename_prefix": "canny/canny_edge", "images": ["950:105", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "947":  { "inputs": { "filename_prefix": "canny/canny_output", "images": ["952:344", 0] }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "950:94":  { "inputs": { "vae_name": "ae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "950:96":  { "inputs": { "positive": ["950:97", 0], "negative": ["950:92", 0], "vae": ["950:94", 0], "pixels": ["950:105", 0] }, "class_type": "InstructPixToPixConditioning", "_meta": { "title": "InstructPixToPixConditioning" } },
  "950:97":  { "inputs": { "guidance": 75, "conditioning": ["950:98", 0] }, "class_type": "FluxGuidance", "_meta": { "title": "FluxGuidance" } },
  "950:98":  { "inputs": { "text": ["950:189", 0], "clip": ["950:944", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Positive Prompt)" } },
  "950:92":  { "inputs": { "text": "", "clip": ["950:944", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Negative Prompt)" } },
  "950:99":  { "inputs": { "clip_name1": "clip_l.safetensors", "clip_name2": "t5xxl_fp8_e4m3fn.safetensors", "type": "flux", "device": "default" }, "class_type": "DualCLIPLoader", "_meta": { "title": "DualCLIPLoader" } },
  "950:105": { "inputs": { "low_threshold": 0.1, "high_threshold": 0.25, "image": ["950:188", 0] }, "class_type": "Canny", "_meta": { "title": "Canny" } },
  "950:109": { "inputs": { "add_noise": "enable", "noise_seed": ["950:833", 0], "steps": ["950:834", 0], "cfg": ["950:840", 0], "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 10000, "return_with_leftover_noise": "disable", "model": ["950:944", 0], "positive": ["950:96", 0], "negative": ["950:96", 1], "latent_image": ["950:96", 2] }, "class_type": "KSamplerAdvanced", "_meta": { "title": "KSampler (Advanced)" } },
  "950:188": { "inputs": { "measurement": "pixels", "width": ["950:839", 0], "height": ["950:838", 0], "fit": "contain", "method": "nearest-exact", "image": ["820", 0] }, "class_type": "Image Resize (rgthree)", "_meta": { "title": "Image Resize (rgthree)" } },
  "950:189": { "inputs": { "value": ["830", 0] }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "String (Multiline)" } },
  "950:190": { "inputs": { "unet_name": "flux1CannyDevFp8_v10.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load Diffusion Model" } },
  "950:833": { "inputs": { "value": -162158298323898 }, "class_type": "PrimitiveInt", "_meta": { "title": "seed" } },
  "950:834": { "inputs": { "value": 30 }, "class_type": "PrimitiveInt", "_meta": { "title": "steps" } },
  "950:835": { "inputs": { "seed": ["950:833", 0], "steps": ["950:834", 0], "model": ["950:837", 0], "author": ["950:836", 0], "output_path": "[time(%Y-%m-%d)]", "file_prefix": "[time(%Y%m%d_%H%M%S)]_param", "wrap_width": 60, "font_family": "Arial", "font_size": 36, "dark_mode": false, "save_svg": true, "save_yaml": false, "prompt": ["950:189", 0], "negative_prompt": "", "additional_text": "" }, "class_type": "SaveParamsSVG", "_meta": { "title": "Save Params as SVG" } },
  "950:836": { "inputs": { "value": "Eva Vasileska" }, "class_type": "PrimitiveString", "_meta": { "title": "author" } },
  "950:837": { "inputs": { "value": "FLUX.1 Dev Canny" }, "class_type": "PrimitiveString", "_meta": { "title": "model" } },
  "950:838": { "inputs": { "value": 1024 }, "class_type": "PrimitiveInt", "_meta": { "title": "height" } },
  "950:839": { "inputs": { "value": 1024 }, "class_type": "PrimitiveInt", "_meta": { "title": "width" } },
  "950:840": { "inputs": { "value": 2 }, "class_type": "PrimitiveFloat", "_meta": { "title": "cfg" } },
  "950:944": { "inputs": { "lora_name": "igcflr.safetensors", "strength_model": 1.75, "strength_clip": 1, "model": ["950:190", 0], "clip": ["950:99", 0] }, "class_type": "LoraLoader", "_meta": { "title": "Load LoRA (Model and CLIP)" } },
  "952:340": { "inputs": { "sampler_name": "euler" }, "class_type": "KSamplerSelect", "_meta": { "title": "KSamplerSelect" } },
  "952:341": { "inputs": { "steps": ["952:354", 0], "width": ["952:355", 0], "height": ["952:356", 0] }, "class_type": "Flux2Scheduler", "_meta": { "title": "Flux2Scheduler" } },
  "952:342": { "inputs": { "cfg": ["952:553", 0], "model": ["952:575", 0], "positive": ["952:571:570", 0], "negative": ["952:571:568", 0] }, "class_type": "CFGGuider", "_meta": { "title": "CFGGuider" } },
  "952:343": { "inputs": { "noise": ["952:345", 0], "guider": ["952:342", 0], "sampler": ["952:340", 0], "sigmas": ["952:341", 0], "latent_image": ["952:350", 0] }, "class_type": "SamplerCustomAdvanced", "_meta": { "title": "SamplerCustomAdvanced" } },
  "952:344": { "inputs": { "samples": ["952:343", 0], "vae": ["952:349", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "952:345": { "inputs": { "noise_seed": ["952:353", 0] }, "class_type": "RandomNoise", "_meta": { "title": "RandomNoise" } },
  "952:346": { "inputs": { "unet_name": "flux-2-klein-base-4b-fp8.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load Diffusion Model" } },
  "952:347": { "inputs": { "clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "flux2", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Load CLIP" } },
  "952:348": { "inputs": { "text": ["952:361", 0], "clip": ["952:575", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Positive Prompt)" } },
  "952:349": { "inputs": { "vae_name": "flux2-vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "952:350": { "inputs": { "width": ["952:355", 0], "height": ["952:356", 0], "batch_size": 1 }, "class_type": "EmptyFlux2LatentImage", "_meta": { "title": "Empty Flux 2 Latent" } },
  "952:351": { "inputs": { "upscale_method": "nearest-exact", "megapixels": 1, "resolution_steps": 1, "image": ["820", 0] }, "class_type": "ImageScaleToTotalPixels", "_meta": { "title": "ImageScaleToTotalPixels" } },
  "952:352:337": { "inputs": { "conditioning": ["952:410", 0], "latent": ["952:352:338", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "ReferenceLatent" } },
  "952:352:338": { "inputs": { "pixels": ["952:351", 0], "vae": ["952:349", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE Encode" } },
  "952:352:339": { "inputs": { "conditioning": ["952:348", 0], "latent": ["952:352:338", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "ReferenceLatent" } },
  "952:353": { "inputs": { "value": -628112986509551 }, "class_type": "PrimitiveInt", "_meta": { "title": "seed" } },
  "952:354": { "inputs": { "value": 15 }, "class_type": "PrimitiveInt", "_meta": { "title": "steps" } },
  "952:355": { "inputs": { "value": 1024 }, "class_type": "PrimitiveInt", "_meta": { "title": "width" } },
  "952:356": { "inputs": { "value": 1024 }, "class_type": "PrimitiveInt", "_meta": { "title": "height" } },
  "952:357": { "inputs": { "seed": ["952:353", 0], "steps": ["952:354", 0], "model": ["952:359", 0], "author": ["952:358", 0], "output_path": "[time(%Y-%m-%d)]", "file_prefix": "[time(%Y%m%d_%H%M%S)]_param", "wrap_width": 60, "font_family": "Arial", "font_size": 36, "dark_mode": false, "save_svg": true, "save_yaml": false, "prompt": ["952:361", 0], "negative_prompt": "", "additional_text": "" }, "class_type": "SaveParamsSVG", "_meta": { "title": "Save Params as SVG" } },
  "952:358": { "inputs": { "value": "Eva Vasileska" }, "class_type": "PrimitiveString", "_meta": { "title": "author" } },
  "952:359": { "inputs": { "value": "FLUX.2 Klein Multi-image" }, "class_type": "PrimitiveString", "_meta": { "title": "model" } },
  "952:361": { "inputs": { "prompt": ["830", 0] }, "class_type": "CR Prompt Text", "_meta": { "title": "⚙️ CR Prompt Text" } },
  "952:365": { "inputs": { "image": ["952:351", 0] }, "class_type": "GetImageSize", "_meta": { "title": "Get Image Size" } },
  "952:410": { "inputs": { "text": "prompt", "clip": ["952:575", 1] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Negative Prompt)" } },
  "952:553": { "inputs": { "value": 2 }, "class_type": "PrimitiveFloat", "_meta": { "title": "cfg" } },
  "952:567": { "inputs": { "upscale_method": "nearest-exact", "megapixels": 1, "resolution_steps": 1, "image": ["950:105", 0] }, "class_type": "ImageScaleToTotalPixels", "_meta": { "title": "ImageScaleToTotalPixels" } },
  "952:571:568": { "inputs": { "conditioning": ["952:352:337", 0], "latent": ["952:571:569", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "ReferenceLatent" } },
  "952:571:569": { "inputs": { "pixels": ["952:567", 0], "vae": ["952:349", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE Encode" } },
  "952:571:570": { "inputs": { "conditioning": ["952:352:339", 0], "latent": ["952:571:569", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "ReferenceLatent" } },
  "952:575": { "inputs": { "lora_name": "igcflr.safetensors", "strength_model": 0.5, "strength_clip": 1, "model": ["952:346", 0], "clip": ["952:347", 0] }, "class_type": "LoraLoader", "_meta": { "title": "Load LoRA (Model and CLIP)" } }
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
    const wf = JSON.parse(JSON.stringify(_CANNY_WF)); // deep clone

    const blob    = image ?? await _neutralBlob();
    const imgName = await _uploadImage(blob);

    // Patch variable nodes
    wf['829'].inputs.image              = imgName;          // Load Image
    wf['830'].inputs.value              = prompt;           // prompt string (feeds both pipelines)
    wf['950:944'].inputs.strength_model = loraStrength;     // FLUX.1 Canny LoRA
    wf['950:944'].inputs.strength_clip  = loraStrength;
    wf['952:575'].inputs.strength_model = loraStrength;     // FLUX.2 Klein LoRA
    wf['952:575'].inputs.strength_clip  = loraStrength;
    wf['950:833'].inputs.value          = Math.floor(Math.random() * 2 ** 32); // seed FLUX.1
    wf['952:353'].inputs.value          = Math.floor(Math.random() * 2 ** 32); // seed FLUX.2
    wf['950:834'].inputs.value          = steps;            // steps FLUX.1

    return _runPrompt(wf, onProgress);
  }
};
