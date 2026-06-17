// ── ComfyUI Bridge ────────────────────────────────────────────────────────────
// Connects the website to ComfyUI running at localhost:8188.
// Launch ComfyUI first with run_comfyui_cors.bat to enable CORS.
// Uses IG_LORA_imgtoimg.json (Flux 2 + igcflr LoRA).
// ─────────────────────────────────────────────────────────────────────────────

const COMFY = 'http://127.0.0.1:8188';
const WS    = 'ws://127.0.0.1:8188';

const _cid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                  .map(b => b.toString(16).padStart(2,'0')).join('');

let _tpl = null;

async function _template() {
  if (_tpl) return _tpl;
  const r = await fetch('IG_LORA_imgtoimg.json');
  if (!r.ok) throw new Error('Cannot load workflow template (IG_LORA_imgtoimg.json)');
  _tpl = await r.json();
  return _tpl;
}

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

// Creates a neutral grey 512×512 canvas blob for txt2img mode
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

      // Workflow errored on a specific node
      if (msg.type === 'execution_error') {
        ws.close();
        const d = msg.data;
        reject(new Error(`ComfyUI node error [${d.node_type ?? d.node_id}]: ${d.exception_message ?? JSON.stringify(d)}`));
        return;
      }

      // node === null means the whole prompt finished executing
      if (msg.type === 'executing' && msg.data.node === null) {
        if (pid && msg.data.prompt_id !== pid) return; // different prompt
        ws.close();
        try {
          // Small delay — let ComfyUI finish writing history
          await new Promise(r => setTimeout(r, 300));
          const hist = await fetch(`${COMFY}/history/${pid}`).then(r => r.json());
          const entry = hist[pid];

          // Surface any error recorded in the history status
          if (entry?.status?.status_str === 'error') {
            const errMsg = entry.status.messages
              ?.find(m => m[0] === 'execution_error')?.[1]?.exception_message
              ?? 'workflow failed — check ComfyUI console for details';
            reject(new Error(errMsg));
            return;
          }

          const outs = entry?.outputs ?? {};
          console.log('[ComfyBridge] history outputs:', JSON.stringify(outs).slice(0, 400));
          for (const out of Object.values(outs)) {
            if (out.images?.length) {
              const { filename, subfolder, type } = out.images[0];
              const url = `${COMFY}/view?filename=${encodeURIComponent(filename)}`
                        + `&subfolder=${encodeURIComponent(subfolder)}`
                        + `&type=${type}&t=${Date.now()}`;
              resolve(url);
              return;
            }
          }
          reject(new Error('Workflow ran but saved no images — check ComfyUI console'));
        } catch(e) { reject(e); }
      }
    };

    ws.onerror  = () => { ws.close(); reject(new Error('WebSocket failed — is ComfyUI running? (run_comfyui_cors.bat)')); };
    ws.onclose  = (e) => { if (!e.wasClean && !pid) reject(new Error('WebSocket closed before job was accepted')); };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
window.ComfyBridge = {
  /**
   * Fetch the list of LoRA filenames installed in ComfyUI.
   * @returns {Promise<string[]>}
   */
  async fetchLoRAs() {
    const r = await fetch(`${COMFY}/object_info/LoraLoader`);
    if (!r.ok) throw new Error('Cannot reach ComfyUI — is it running?');
    const info = await r.json();
    return info?.LoraLoader?.input?.required?.lora_name?.[0] ?? [];
  },

  async generate({ image = null, prompt = '', loraStrength = 1, steps = 20, onProgress } = {}) {
    const tpl = await _template();
    const wf  = JSON.parse(JSON.stringify(tpl)); // deep clone

    const blob    = image ?? await _neutralBlob();
    const imgName = await _uploadImage(blob);

    // Patch the variable nodes (igcflr LoRA, Flux 2 workflow)
    wf['843'].inputs.image             = imgName;
    wf['842'].inputs.value             = prompt;
    wf['836:781'].inputs.lora_name     = 'igcflr.safetensors';
    wf['836:781'].inputs.strength_model = loraStrength;
    wf['836:781'].inputs.strength_clip  = loraStrength;
    wf['836:768'].inputs.value         = Math.floor(Math.random() * 2 ** 32);
    wf['836:769'].inputs.value         = steps;

    return _runPrompt(wf, onProgress);
  }
};
