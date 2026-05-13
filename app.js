// ===== Kling Motion Studio - App Logic =====
// Use local proxy to avoid CORS issues (server.js proxies to api.magnific.com)
const API_BASE = '/api';
const POLL_INTERVAL = 10000; // 10s between polls (avoid 429 rate-limit)
const MAX_POLL_ATTEMPTS = 60;  // Max ~10 minutes of polling
const MAX_429_RETRIES = 5;     // Max retries per poll on 429

// ===== Status Endpoint Mapping =====
// Some models use a DIFFERENT GET endpoint for status checks than their POST endpoint.
// Kling 2.6 Motion Control: POST to /video/kling-v2-6-motion-control-*, 
//   but GET status from /image-to-video/kling-v2-6/{task-id}
// Kling 3 Motion Control: GET status path matches POST path + /{task-id}
const STATUS_ENDPOINT_MAP = {
    '/video/kling-v2-6-motion-control-pro': '/image-to-video/kling-v2-6',
    '/video/kling-v2-6-motion-control-std': '/image-to-video/kling-v2-6',
    // Kling 3 variants use the same path for POST and GET — no override needed
};

// ===== Model Cost Tiers (relative, for UI guidance only) =====
// Magnific does not publish exact EUR prices in their docs — only visible in dashboard.
// These tiers reflect relative cost: Pro > Standard, 10s > 5s, newer > older.
const MODEL_TIERS = {
    // Motion Control
    'kling-v3-motion-control-pro':  { label: 'Premium',     icon: '🔴' },
    'kling-v3-motion-control-std':  { label: 'Hemat',       icon: '🟡' },
    'kling-v2-6-motion-control-pro':{ label: 'Standard',    icon: '🟠' },
    'kling-v2-6-motion-control-std':{ label: 'Paling Hemat',icon: '🟢' },
    // Image-to-Video & Text-to-Video
    'kling-v2-6-pro': { label: 'Standard',    icon: '🟠' },
    'kling-v2-5-pro': { label: 'Hemat',       icon: '🟡' },
};

// === State ===
let currentMode = 'image-generator';
let imageFile = null;
let videoFile = null;
let pollTimer = null;
let requiresClientApiKey = true;
// Nano Banana state
let nbPhotos = [];          // Array of { file, url } objects
let nbPollTimer = null;
let nbLastResultUrl = null; // URL of last generated image

// === DOM Elements ===
const $ = id => document.getElementById(id);
const els = {
    apiStatus: $('apiStatus'), settingsModal: $('settingsModal'),
    apiKeyInput: $('apiKeyInput'), btnSettings: $('btnSettings'),
    closeSettings: $('closeSettings'), saveApiKey: $('saveApiKey'),
    togglePassword: $('togglePassword'),
    // Uploads
    imageUploadArea: $('imageUploadArea'), imageFileInput: $('imageFileInput'),
    imagePlaceholder: $('imagePlaceholder'), imagePreview: $('imagePreview'),
    removeImage: $('removeImage'), imageUrlInput: $('imageUrlInput'),
    videoUploadArea: $('videoUploadArea'), videoFileInput: $('videoFileInput'),
    videoPlaceholder: $('videoPlaceholder'), videoPreview: $('videoPreview'),
    removeVideo: $('removeVideo'), videoUrlInput: $('videoUrlInput'),
    // Inputs
    promptInput: $('promptInput'), charCount: $('charCount'),
    negativePromptInput: $('negativePromptInput'),
    modelSelect: $('modelSelect'), qualitySelect: $('qualitySelect'),
    durationSelect: $('durationSelect'), aspectSelect: $('aspectSelect'),
    orientationSelect: $('orientationSelect'), cfgScale: $('cfgScale'),
    cfgValue: $('cfgValue'), generateAudio: $('generateAudio'),
    btnGenerate: $('btnGenerate'),
    // Sections visibility
    imageSection: $('imageSection'), videoSection: $('videoSection'),
    negativePromptSection: $('negativePromptSection'),
    modelGroup: $('modelGroup'), qualityGroup: $('qualityGroup'),
    durationGroup: $('durationGroup'), aspectGroup: $('aspectGroup'),
    orientationGroup: $('orientationGroup'), audioGroup: $('audioGroup'),
    // Output
    outputEmpty: $('outputEmpty'), outputProcessing: $('outputProcessing'),
    outputResult: $('outputResult'), outputError: $('outputError'),
    processingStatus: $('processingStatus'), progressFill: $('progressFill'),
    resultVideo: $('resultVideo'), downloadLink: $('downloadLink'),
    errorMessage: $('errorMessage'), taskInfo: $('taskInfo'),
    taskIdDisplay: $('taskIdDisplay'),
    btnNewGeneration: $('btnNewGeneration'), btnRetry: $('btnRetry'),
    // History
    historyList: $('historyList'), clearHistory: $('clearHistory'),
    toastContainer: $('toastContainer'),
    // Nano Banana Image Generator
    nbApiKeyInput: $('nbApiKeyInput'), toggleNbPassword: $('toggleNbPassword'),
    imgGenSection: $('imgGenSection'), btnGenerateImage: $('btnGenerateImage'),
    // NB Slots
    nbSlot1Area: $('nbSlot1Area'), nbSlot1Input: $('nbSlot1Input'),
    nbSlot1Preview: $('nbSlot1Preview'), nbSlot1Placeholder: $('nbSlot1Placeholder'), nbSlot1Remove: $('nbSlot1Remove'),
    nbSlot2Area: $('nbSlot2Area'), nbSlot2Input: $('nbSlot2Input'),
    nbSlot2Preview: $('nbSlot2Preview'), nbSlot2Placeholder: $('nbSlot2Placeholder'), nbSlot2Remove: $('nbSlot2Remove'),
    nbSlot3Area: $('nbSlot3Area'), nbSlot3Input: $('nbSlot3Input'),
    nbSlot3Preview: $('nbSlot3Preview'), nbSlot3Placeholder: $('nbSlot3Placeholder'), nbSlot3Remove: $('nbSlot3Remove'),
    nbPromptInput: $('nbPromptInput'), nbAspectRatio: $('nbAspectRatio'),
    nbResolution: $('nbResolution'),
    nbOutputEmpty: $('nbOutputEmpty'), nbOutputProcessing: $('nbOutputProcessing'),
    nbOutputResult: $('nbOutputResult'), nbOutputError: $('nbOutputError'),
    nbResultImage: $('nbResultImage'), nbDownloadLink: $('nbDownloadLink'),
    nbProcessingStatus: $('nbProcessingStatus'), nbProgressFill: $('nbProgressFill'),
    nbErrorMessage: $('nbErrorMessage'),
    btnUseAsRef: $('btnUseAsRef'), useAsRefMenu: $('useAsRefMenu'),
    btnUseForMotion: $('btnUseForMotion'), btnUseForI2V: $('btnUseForI2V'),
    btnNewImage: $('btnNewImage'), btnRetryImage: $('btnRetryImage'),
};


// === Init ===
async function init() {
    await loadRuntimeConfig();
    loadApiKey();
    loadNbApiKey();
    loadHistory();
    setupEventListeners();
    updateUIForMode();
}

// === API Key Management ===
function getApiKey() { return localStorage.getItem('magnific_api_key') || ''; }
async function loadRuntimeConfig() {
    try {
        const resp = await fetch(`${API_BASE}/config`);
        if (!resp.ok) return;
        const config = await resp.json();
        requiresClientApiKey = config.requiresClientApiKey !== false;
    } catch (err) {
        requiresClientApiKey = true;
    }
}
function loadApiKey() {
    const key = getApiKey();
    els.apiKeyInput.value = key;
    updateApiStatus(!requiresClientApiKey || !!key);
}
function getNbApiKey() { return localStorage.getItem('nanobanana_api_key') || ''; }
function loadNbApiKey() {
    const key = getNbApiKey();
    if (els.nbApiKeyInput) els.nbApiKeyInput.value = key;
}
function updateApiStatus(connected) {
    els.apiStatus.classList.toggle('connected', connected);
    els.apiStatus.querySelector('.status-text').textContent = connected
        ? (requiresClientApiKey ? 'Connected' : 'Cloud Key')
        : 'No API Key';
}

function getApiHeaders(includeJson = false) {
    const headers = {};
    if (includeJson) headers['Content-Type'] = 'application/json';
    const apiKey = getApiKey();
    if (apiKey) headers['x-magnific-api-key'] = apiKey;
    return headers;
}

// === Toast ===
function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    els.toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(20px)'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// === Mode Switching ===
function updateUIForMode() {
    const mc  = currentMode === 'motion-control';
    const i2v = currentMode === 'image-to-video';
    const t2v = currentMode === 'text-to-video';
    const img = currentMode === 'image-generator';

    // Kling input sections
    els.imageSection.classList.toggle('hidden', t2v || img);
    els.videoSection.classList.toggle('hidden', !mc || img);
    els.negativePromptSection.classList.toggle('hidden', mc || img);
    els.modelGroup.classList.toggle('hidden', mc || img);
    els.qualityGroup.classList.toggle('hidden', !mc || img);
    els.durationGroup.classList.toggle('hidden', mc || img);
    els.aspectGroup.classList.toggle('hidden', mc || i2v || img);
    els.orientationGroup.classList.toggle('hidden', !mc || img);
    els.audioGroup.classList.toggle('hidden', mc || i2v || img);

    // Nano Banana section
    els.imgGenSection.classList.toggle('hidden', !img);

    // Generate buttons
    els.btnGenerate.classList.toggle('hidden', img);
    els.btnGenerateImage.classList.toggle('hidden', !img);

    // Kling output states — hidden when image-generator
    els.outputEmpty.classList.toggle('hidden', img ? true : !els.outputEmpty.classList.contains('hidden') ? false : true);
    els.outputProcessing.classList.add('hidden');
    els.outputResult.classList.add('hidden');
    els.outputError.classList.add('hidden');

    // NB output states — hidden when not image-generator
    els.nbOutputEmpty.classList.toggle('hidden', !img);
    els.nbOutputProcessing.classList.add('hidden');
    els.nbOutputResult.classList.add('hidden');
    els.nbOutputError.classList.add('hidden');

    if (!img) {
        // Restore Kling empty state when switching away from image-generator
        els.outputEmpty.classList.remove('hidden');
        els.nbOutputEmpty.classList.add('hidden');
    }
}

// === File Upload Helpers ===
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function setupDragDrop(area, input, onFile) {
    area.addEventListener('click', () => input.click());
    area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
    area.addEventListener('dragleave', () => area.classList.remove('dragover'));
    area.addEventListener('drop', e => {
        e.preventDefault(); area.classList.remove('dragover');
        if (e.dataTransfer.files.length) onFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => { if (input.files.length) onFile(input.files[0]); });
}

function handleImageFile(file) {
    if (file.size > 10 * 1024 * 1024) return showToast('Image must be under 10MB', 'error');
    imageFile = file;
    els.imageUrlInput.value = '';
    const url = URL.createObjectURL(file);
    els.imagePreview.src = url;
    els.imagePreview.classList.remove('hidden');
    els.imagePlaceholder.classList.add('hidden');
    els.removeImage.classList.remove('hidden');
}

function handleVideoFile(file) {
    if (file.size > 100 * 1024 * 1024) return showToast('Video file too large', 'error');
    videoFile = file;
    els.videoUrlInput.value = '';
    const url = URL.createObjectURL(file);
    els.videoPreview.src = url;
    els.videoPreview.classList.remove('hidden');
    els.videoPlaceholder.classList.add('hidden');
    els.removeVideo.classList.remove('hidden');
}

function clearImage() {
    imageFile = null;
    els.imagePreview.src = ''; els.imagePreview.classList.add('hidden');
    els.imagePlaceholder.classList.remove('hidden'); els.removeImage.classList.add('hidden');
    els.imageFileInput.value = '';
}

function clearVideo() {
    videoFile = null;
    els.videoPreview.src = ''; els.videoPreview.classList.add('hidden');
    els.videoPlaceholder.classList.remove('hidden'); els.removeVideo.classList.add('hidden');
    els.videoFileInput.value = '';
}

// === API Calls ===
async function uploadViaApi(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const message = err.message || err.error || 'Cloud upload is not configured';
        const uploadError = new Error(message);
        uploadError.status = response.status;
        throw uploadError;
    }

    const result = await response.json();
    if (!result.url) throw new Error('Cloud upload did not return a URL');
    return result.url;
}

async function uploadToTmpHost(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) throw new Error('Failed to upload file to temporary host');
        
        const result = await response.json();
        if (result.status !== 'success') throw new Error('Upload failed');
        
        // tmpfiles.org returns e.g. http://tmpfiles.org/12345/img.jpg
        // We need the direct link: https://tmpfiles.org/dl/12345/img.jpg
        let url = result.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        if (url.startsWith('http://')) url = url.replace('http://', 'https://');
        return url;
    } catch (err) {
        throw new Error('Error uploading file to cloud. Try pasting a URL instead. (' + err.message + ')');
    }
}

async function uploadPublicFile(file) {
    try {
        return await uploadViaApi(file);
    } catch (apiErr) {
        if (apiErr.status === 501 || location.hostname.endsWith('.pages.dev')) {
            throw new Error(apiErr.message);
        }
        console.warn('Cloud upload failed, falling back to tmpfiles.org:', apiErr);
        return uploadToTmpHost(file);
    }
}

async function generateVideo() {
    const apiKey = getApiKey();
    if (requiresClientApiKey && !apiKey) {
        els.settingsModal.classList.add('active');
        return showToast('Please set your API key first', 'error');
    }

    let endpoint, body;

    if (currentMode === 'motion-control') {
        // Need image_url and video_url
        const imgUrl = els.imageUrlInput.value.trim();
        const vidUrl = els.videoUrlInput.value.trim();

        if (!imgUrl && !imageFile) return showToast('Please provide a reference image', 'error');
        if (!vidUrl && !videoFile) return showToast('Please provide a reference video', 'error');

        let imageData = imgUrl;
        let videoData = vidUrl;

        if (imageFile && !imgUrl) {
            els.processingStatus.textContent = 'Uploading image...';
            imageData = await uploadPublicFile(imageFile);
        }
        if (videoFile && !vidUrl) {
            els.processingStatus.textContent = 'Uploading video...';
            videoData = await uploadPublicFile(videoFile);
        }

        const modelId = els.qualitySelect.value;
        endpoint = `/video/${modelId}`;
        body = {
            image_url: imageData,
            video_url: videoData,
            cfg_scale: parseFloat(els.cfgScale.value),
            character_orientation: els.orientationSelect.value,
            generate_audio: false, // disabled to save API credits
        };
        if (els.promptInput.value.trim()) body.prompt = els.promptInput.value.trim();

    } else if (currentMode === 'image-to-video') {
        const imgUrl = els.imageUrlInput.value.trim();
        if (!imgUrl && !imageFile) return showToast('Please provide a reference image', 'error');

        let imageData = imgUrl;
        if (imageFile && !imgUrl) {
            els.processingStatus.textContent = 'Uploading image...';
            imageData = await uploadPublicFile(imageFile);
        }

        const model = els.modelSelect.value;
        endpoint = `/image-to-video/${model}`;
        body = {
            image: imageData,
            duration: els.durationSelect.value,
            cfg_scale: parseFloat(els.cfgScale.value),
            generate_audio: false, // disabled to save API credits
        };
        if (els.promptInput.value.trim()) body.prompt = els.promptInput.value.trim();
        if (els.negativePromptInput.value.trim()) body.negative_prompt = els.negativePromptInput.value.trim();

    } else {
        // text-to-video
        if (!els.promptInput.value.trim()) return showToast('Please enter a prompt', 'error');
        const t2vModel = els.modelSelect.value;
        endpoint = `/image-to-video/${t2vModel}`;
        body = {
            prompt: els.promptInput.value.trim(),
            duration: els.durationSelect.value,
            cfg_scale: parseFloat(els.cfgScale.value),
            aspect_ratio: els.aspectSelect.value,
            generate_audio: false, // disabled to save API credits
        };
        if (els.negativePromptInput.value.trim()) body.negative_prompt = els.negativePromptInput.value.trim();
    }

    // Show processing
    showOutput('processing');
    els.btnGenerate.disabled = true;
    els.processingStatus.textContent = 'Submitting task...';
    els.progressFill.style.width = '10%';

    try {
        const resp = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: getApiHeaders(true),
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || err.error || `API Error: ${resp.status} ${resp.statusText}`);
        }

        const result = await resp.json();
        const taskId = result.data?.task_id || result.task_id;
        if (!taskId) throw new Error('No task ID returned');

        els.taskInfo.classList.remove('hidden');
        els.taskIdDisplay.textContent = `Task: ${taskId.substring(0, 8)}...`;
        els.processingStatus.textContent = 'Task created. Processing...';
        els.progressFill.style.width = '25%';

        addToHistory({ taskId, mode: currentMode, endpoint, status: 'processing', time: new Date().toISOString() });
        startPolling(taskId, endpoint);

    } catch (err) {
        console.error('Generation error:', err);
        showOutput('error');
        els.errorMessage.textContent = err.message;
        els.btnGenerate.disabled = false;
        showToast(err.message, 'error');
    }
}

async function checkTaskStatus(taskId, createEndpoint, retryCount = 0) {
    // Some models use a different GET endpoint than their POST endpoint
    // e.g., Kling 2.6 MC: POST /video/kling-v2-6-motion-control-pro
    //                      GET  /image-to-video/kling-v2-6/{task-id}
    const statusBase = STATUS_ENDPOINT_MAP[createEndpoint] || createEndpoint;
    const statusUrl = `${API_BASE}${statusBase}/${taskId}`;

    console.log(`[Poll] GET ${statusUrl} (create: ${createEndpoint})`);

    const resp = await fetch(statusUrl, {
        headers: getApiHeaders(),
    });

    // Handle 429 rate-limit with exponential backoff
    if (resp.status === 429) {
        if (retryCount >= MAX_429_RETRIES) {
            throw new Error('API rate limit exceeded (429). Please wait a moment and try again.');
        }
        const delay = Math.min(5000 * Math.pow(2, retryCount), 60000); // 5s, 10s, 20s, 40s, 60s
        console.warn(`[Rate Limit] 429 received. Retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${MAX_429_RETRIES})...`);
        els.processingStatus.textContent = `Rate limited... retrying in ${Math.round(delay / 1000)}s`;
        await new Promise(resolve => setTimeout(resolve, delay));
        return checkTaskStatus(taskId, createEndpoint, retryCount + 1);
    }

    // Handle 404 - task may not be registered yet, retry a few times
    if (resp.status === 404) {
        if (retryCount >= 3) {
            // After 3 retries, try the list-all-tasks endpoint as fallback
            const listBase = STATUS_ENDPOINT_MAP[createEndpoint] || createEndpoint;
            console.warn(`[404 Fallback] Trying list endpoint: ${API_BASE}${listBase}`);
            const listResp = await fetch(`${API_BASE}${listBase}`, {
                headers: getApiHeaders(),
            });
            if (listResp.ok) {
                const listData = await listResp.json();
                const tasks = listData.data || listData;
                if (Array.isArray(tasks)) {
                    const match = tasks.find(t => t.task_id === taskId || t.id === taskId);
                    if (match) return { data: match };
                }
            }
            throw new Error('Task not found (404). The task ID may be invalid or expired.');
        }
        const delay = 5000 * (retryCount + 1); // 5s, 10s, 15s
        console.warn(`[404] Task not found yet. Retrying in ${delay / 1000}s (attempt ${retryCount + 1}/3)...`);
        els.processingStatus.textContent = `Task registering... retrying in ${Math.round(delay / 1000)}s`;
        await new Promise(resolve => setTimeout(resolve, delay));
        return checkTaskStatus(taskId, createEndpoint, retryCount + 1);
    }

    if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const errMsg = errData.message || errData.error || `Status check failed: ${resp.status}`;
        throw new Error(errMsg);
    }
    return resp.json();
}

function startPolling(taskId, createEndpoint) {
    let progress = 25;
    let attempts = 0;
    pollTimer = setInterval(async () => {
        attempts++;
        if (attempts > MAX_POLL_ATTEMPTS) {
            clearInterval(pollTimer);
            pollTimer = null;
            showOutput('error');
            els.errorMessage.textContent = 'Polling timed out. The task may still be processing — check history later.';
            els.btnGenerate.disabled = false;
            updateHistory(taskId, 'timeout');
            showToast('Polling timed out', 'error');
            return;
        }

        try {
            const result = await checkTaskStatus(taskId, createEndpoint);
            const data = result.data || result;
            const status = data.status?.toUpperCase();

            progress = Math.min(progress + 5, 90);
            els.progressFill.style.width = `${progress}%`;

            if (status === 'COMPLETED' || status === 'SUCCEED') {
                clearInterval(pollTimer);
                pollTimer = null;
                els.progressFill.style.width = '100%';

                const videoUrl = Array.isArray(data.generated) ? data.generated[0] : data.generated || data.video_url;
                if (videoUrl) {
                    els.resultVideo.src = videoUrl;
                    els.downloadLink.href = videoUrl;
                    showOutput('result');
                    updateHistory(taskId, 'completed', videoUrl);
                    showToast('Video generated successfully!', 'success');
                } else {
                    throw new Error('No video URL in response');
                }
                els.btnGenerate.disabled = false;

            } else if (status === 'FAILED' || status === 'ERROR') {
                clearInterval(pollTimer);
                pollTimer = null;
                throw new Error(data.error || 'Generation failed');

            } else {
                els.processingStatus.textContent = `Status: ${status || 'Processing'}... (${attempts}/${MAX_POLL_ATTEMPTS})`;
            }
        } catch (err) {
            clearInterval(pollTimer);
            pollTimer = null;
            showOutput('error');
            els.errorMessage.textContent = err.message;
            els.btnGenerate.disabled = false;
            updateHistory(taskId, 'failed');
            showToast(err.message, 'error');
        }
    }, POLL_INTERVAL);
}

function showOutput(state) {
    ['outputEmpty', 'outputProcessing', 'outputResult', 'outputError'].forEach(id => els[id].classList.add('hidden'));
    const key = 'output' + state.charAt(0).toUpperCase() + state.slice(1);
    if (els[key]) els[key].classList.remove('hidden');
}

// === History ===
function getHistory() { return JSON.parse(localStorage.getItem('kling_history') || '[]'); }
function saveHistory(history) { localStorage.setItem('kling_history', JSON.stringify(history)); }

function addToHistory(item) {
    const history = getHistory();
    history.unshift(item);
    if (history.length > 20) history.pop();
    saveHistory(history);
    renderHistory();
}

function updateHistory(taskId, status, videoUrl) {
    const history = getHistory();
    const item = history.find(h => h.taskId === taskId);
    if (item) { item.status = status; if (videoUrl) item.videoUrl = videoUrl; }
    saveHistory(history);
    renderHistory();
}

function renderHistory() {
    const history = getHistory();
    if (!history.length) {
        els.historyList.innerHTML = '<p class="history-empty">No previous tasks</p>';
        return;
    }
    els.historyList.innerHTML = history.map(h => {
        const time = new Date(h.time).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
        const modeLabel = { 'motion-control': 'Motion', 'image-to-video': 'I2V', 'text-to-video': 'T2V' }[h.mode] || h.mode;
        return `<div class="history-item" data-task='${JSON.stringify(h)}'>
            <span class="hi-mode">${modeLabel}</span>
            <span class="hi-time">${time}</span>
            <span class="hi-status ${h.status}">${h.status}</span>
        </div>`;
    }).join('');

    // Click handler for history items
    els.historyList.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
            const data = JSON.parse(el.dataset.task);
            if (data.videoUrl) {
                els.resultVideo.src = data.videoUrl;
                els.downloadLink.href = data.videoUrl;
                showOutput('result');
            } else if (data.status === 'processing') {
                showToast('This task is still processing', 'info');
            }
        });
    });
}

function loadHistory() { renderHistory(); }

// ================================================================
// === NANO BANANA IMAGE GENERATOR ================================
// ================================================================

// --- 3-Slot state ---
const nbSlots = { 1: null, 2: null, 3: null }; // each: { file, url } or null

// --- Slot helpers ---
function nbSetSlot(num, file) {
    if (nbSlots[num]?.url) URL.revokeObjectURL(nbSlots[num].url);
    nbSlots[num] = { file, url: URL.createObjectURL(file) };
    // Update preview
    const preview  = els[`nbSlot${num}Preview`];
    const ph       = els[`nbSlot${num}Placeholder`];
    const removeBtn= els[`nbSlot${num}Remove`];
    preview.src = nbSlots[num].url;
    preview.classList.remove('hidden');
    ph.classList.add('hidden');
    removeBtn.classList.remove('hidden');
    nbUpdateAutoPrompt();
}

function nbClearSlot(num) {
    if (nbSlots[num]?.url) URL.revokeObjectURL(nbSlots[num].url);
    nbSlots[num] = null;
    const preview  = els[`nbSlot${num}Preview`];
    const ph       = els[`nbSlot${num}Placeholder`];
    const removeBtn= els[`nbSlot${num}Remove`];
    preview.src = '';
    preview.classList.add('hidden');
    ph.classList.remove('hidden');
    removeBtn.classList.add('hidden');
    nbUpdateAutoPrompt();
}

// --- Auto-prompt builder ---
function nbBuildAutoPrompt() {
    const hasModel   = !!nbSlots[1];
    const hasPose    = !!nbSlots[2];
    const hasFashion = !!nbSlots[3];

    if (!hasModel) return 'Upload foto model di Slot 1 untuk mulai...';

    let parts = [];
    parts.push('[SUBJECT]: The person in IMAGE 1. STRICTLY retain their exact facial features, face shape, skin tone, hair, and body proportions.');

    if (hasPose && hasFashion) {
        parts.push('[POSE & CAMERA]: Copy the EXACT body posture, limb placement, head angle, and camera perspective from IMAGE 2. Do not deviate from this pose.');
        parts.push('[CLOTHING]: Dress the subject EXACTLY in the outfit shown in IMAGE 3. Replicate the fabric, cut, style, texture, and colors perfectly.');
    } else if (hasPose) {
        parts.push('[POSE & CAMERA]: Copy the EXACT body posture, limb placement, head angle, and camera perspective from IMAGE 2. Do not deviate from this pose.');
    } else if (hasFashion) {
        parts.push('[CLOTHING]: Dress the subject EXACTLY in the outfit shown in IMAGE 2. Replicate the fabric, cut, style, texture, and colors perfectly.');
    }

    parts.push('[STYLE & QUALITY]: Photorealistic, cinematic lighting, ultra-high resolution, highly detailed, 8k professional studio photography.');
    return parts.join('\n\n');
}

function nbUpdateAutoPrompt() {
    const preview = $('nbAutoPromptPreview');
    if (preview) preview.textContent = nbBuildAutoPrompt();
}

// --- NB output state manager ---
function showNbOutput(state) {
    ['nbOutputEmpty','nbOutputProcessing','nbOutputResult','nbOutputError'].forEach(id => {
        els[id].classList.add('hidden');
    });
    if (state && els[state]) els[state].classList.remove('hidden');
}

// --- Generate Image ---
async function generateImage() {
    const nbKey = getNbApiKey();
    if (!nbKey) {
        showToast('Masukkan API key (Gemini) di Settings', 'error');
        els.settingsModal.classList.add('active');
        return;
    }
    if (!nbSlots[1]) {
        showToast('Upload foto model di Slot 1 terlebih dahulu', 'error');
        return;
    }

    showNbOutput('nbOutputProcessing');
    els.nbProcessingStatus.textContent = 'Mempersiapkan foto referensi...';
    els.nbProgressFill.style.width = '10%';
    els.btnGenerateImage.disabled = true;

    // Simulated progress timer since Gemini takes a few seconds
    let progress = 10;
    const progressInterval = setInterval(() => {
        progress += (100 - progress) * 0.1;
        els.nbProgressFill.style.width = `${Math.min(progress, 90)}%`;
    }, 1000);

    try {
        const imageUrls = [];
        for (const num of [1, 2, 3]) {
            if (nbSlots[num]) {
                const b64 = await fileToBase64(nbSlots[num].file);
                imageUrls.push(b64);
            }
        }

        const autoPrompt  = nbBuildAutoPrompt();
        const extraPrompt = els.nbPromptInput.value.trim();
        const finalPrompt = extraPrompt ? `${autoPrompt} ${extraPrompt}` : autoPrompt;

        els.nbProcessingStatus.textContent = 'Menghasilkan gambar (Google Gemini)...';
        
        const payload = {
            prompt: finalPrompt,
            imageUrls,
            aspectRatio: els.nbAspectRatio.value,
            resolution: els.nbResolution.value,
        };

        const resp = await fetch('/gemini-api/generate-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-gemini-api-key': nbKey,
            },
            body: JSON.stringify(payload),
        });
        const data = await resp.json();

        clearInterval(progressInterval);

        if (!resp.ok || data.code !== 200) {
            throw new Error(data.message || data.error || `HTTP ${resp.status}`);
        }

        els.nbProgressFill.style.width = '100%';
        const imgUrl = data.data?.resultImageUrl;
        if (!imgUrl) throw new Error('No image URL in response');
        
        nbLastResultUrl = imgUrl;
        els.nbResultImage.src = imgUrl;
        els.nbDownloadLink.href = imgUrl;
        showNbOutput('nbOutputResult');
        els.btnGenerateImage.disabled = false;
        showToast('Gambar berhasil dibuat! ✨', 'success');

    } catch (err) {
        clearInterval(progressInterval);
        showNbOutput('nbOutputError');
        els.nbErrorMessage.textContent = err.message || 'Generation failed';
        els.btnGenerateImage.disabled = false;
        showToast('Gagal: ' + err.message, 'error');
    }
}

// --- Use As Reference in Kling ---
function useAsReference(targetMode) {
    if (!nbLastResultUrl) { showToast('No image generated yet', 'error'); return; }
    // Close the dropdown menu
    els.useAsRefMenu.classList.add('hidden');
    // Set the URL as reference image
    els.imageUrlInput.value = nbLastResultUrl;
    imageFile = null;
    // Switch to target Kling mode
    currentMode = targetMode;
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === targetMode);
    });
    updateUIForMode();
    updateCreditEstimate();
    // Clear any previous image preview to force URL usage
    els.imagePreview?.classList.add('hidden');
    els.imagePlaceholder?.classList.remove('hidden');
    els.removeImage?.classList.add('hidden');
    showToast(`📌 Image set as reference for ${targetMode === 'motion-control' ? 'Motion Control' : 'Image to Video'}`, 'success');
}

// ================================================================

// === Credit Estimator ===
function updateCreditEstimate() {
    const btn = els.btnGenerate;
    let modelKey, duration;

    if (currentMode === 'motion-control') {
        modelKey = els.qualitySelect?.value;
        duration = '5'; // MC doesn't have selectable duration
    } else {
        modelKey = els.modelSelect?.value;
        duration = els.durationSelect?.value || '5';
    }

    const tier = MODEL_TIERS[modelKey];
    const dur10 = duration === '10'; // 10s costs ~2x more

    const svg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

    if (tier) {
        // Show tier label + duration warning if 10s
        const durLabel = dur10 ? ' · 10s = 2× biaya' : '';
        btn.innerHTML = `${svg} Generate Video <span class="credit-badge">${tier.icon} ${tier.label}${durLabel}</span>`;
    } else {
        btn.innerHTML = `${svg} Generate Video`;
    }
}

// === Event Listeners ===
function setupEventListeners() {
    // Settings
    els.btnSettings.addEventListener('click', () => els.settingsModal.classList.add('active'));
    els.closeSettings.addEventListener('click', () => els.settingsModal.classList.remove('active'));
    els.settingsModal.addEventListener('click', e => { if (e.target === els.settingsModal) els.settingsModal.classList.remove('active'); });
    els.saveApiKey.addEventListener('click', () => {
        const key = els.apiKeyInput.value.trim();
        if (key) { localStorage.setItem('magnific_api_key', key); updateApiStatus(true); }
        else { localStorage.removeItem('magnific_api_key'); updateApiStatus(false); }
        // Save NB key
        const nbKey = els.nbApiKeyInput?.value.trim();
        if (nbKey) { localStorage.setItem('nanobanana_api_key', nbKey); }
        else { localStorage.removeItem('nanobanana_api_key'); }
        els.settingsModal.classList.remove('active');
        showToast('API keys saved!', 'success');
    });
    els.togglePassword.addEventListener('click', () => {
        const t = els.apiKeyInput.type === 'password' ? 'text' : 'password';
        els.apiKeyInput.type = t;
    });
    els.toggleNbPassword?.addEventListener('click', () => {
        const t = els.nbApiKeyInput.type === 'password' ? 'text' : 'password';
        els.nbApiKeyInput.type = t;
    });

    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMode = tab.dataset.mode;
            updateUIForMode();
        });
    });

    // File uploads
    setupDragDrop(els.imageUploadArea, els.imageFileInput, handleImageFile);
    setupDragDrop(els.videoUploadArea, els.videoFileInput, handleVideoFile);
    els.removeImage.addEventListener('click', e => { e.stopPropagation(); clearImage(); });
    els.removeVideo.addEventListener('click', e => { e.stopPropagation(); clearVideo(); });

    // URL inputs clear file on change
    els.imageUrlInput.addEventListener('input', () => { if (els.imageUrlInput.value.trim()) clearImage(); });
    els.videoUrlInput.addEventListener('input', () => { if (els.videoUrlInput.value.trim()) clearVideo(); });

    // Prompt char count
    els.promptInput.addEventListener('input', () => { els.charCount.textContent = els.promptInput.value.length; });

    // CFG slider
    els.cfgScale.addEventListener('input', () => { els.cfgValue.textContent = els.cfgScale.value; });

    // Credit estimator — update whenever model or duration changes
    [els.qualitySelect, els.modelSelect, els.durationSelect].forEach(el => {
        if (el) el.addEventListener('change', updateCreditEstimate);
    });
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.addEventListener('click', () => setTimeout(updateCreditEstimate, 50));
    });
    updateCreditEstimate();

    // Generate
    els.btnGenerate.addEventListener('click', generateVideo);

    // Output actions
    els.btnNewGeneration.addEventListener('click', () => { showOutput('empty'); els.taskInfo.classList.add('hidden'); });
    els.btnRetry.addEventListener('click', generateVideo);

    // History
    els.clearHistory.addEventListener('click', () => {
        localStorage.removeItem('kling_history');
        renderHistory();
        showToast('History cleared', 'info');
    });

    // ===== NANO BANANA EVENT LISTENERS =====
    // Setup per-slot upload handlers
    [1, 2, 3].forEach(num => {
        const area    = $(`nbSlot${num}Area`);
        const input   = $(`nbSlot${num}Input`);
        const removeB = $(`nbSlot${num}Remove`);

        area.addEventListener('click', (e) => {
            if (!removeB.contains(e.target)) input.click();
        });
        area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
        area.addEventListener('dragleave', () => area.classList.remove('dragover'));
        area.addEventListener('drop', e => {
            e.preventDefault(); area.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) nbSetSlot(num, file);
        });
        input.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) nbSetSlot(num, file);
            e.target.value = '';
        });
        removeB.addEventListener('click', e => {
            e.stopPropagation();
            nbClearSlot(num);
        });
    });

    // NB Generate Image
    els.btnGenerateImage.addEventListener('click', generateImage);
    els.btnRetryImage.addEventListener('click', generateImage);
    els.btnNewImage.addEventListener('click', () => showNbOutput('nbOutputEmpty'));

    // NB Use As Reference
    els.btnUseAsRef.addEventListener('click', (e) => {
        e.stopPropagation();
        els.useAsRefMenu.classList.toggle('hidden');
    });
    els.btnUseForMotion.addEventListener('click', () => useAsReference('motion-control'));
    els.btnUseForI2V.addEventListener('click', () => useAsReference('image-to-video'));
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!els.btnUseAsRef?.contains(e.target) && !els.useAsRefMenu?.contains(e.target)) {
            els.useAsRefMenu?.classList.add('hidden');
        }
    });
}

// === Bootstrap ===
document.addEventListener('DOMContentLoaded', init);
