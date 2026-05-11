// ===== Kling Motion Studio - App Logic =====
// Use local proxy to avoid CORS issues (server.js proxies to api.magnific.com)
const API_BASE = '/api';
const POLL_INTERVAL = 5000;

// === State ===
let currentMode = 'motion-control';
let imageFile = null;
let videoFile = null;
let pollTimer = null;
let requiresClientApiKey = true;

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
};

// === Init ===
async function init() {
    await loadRuntimeConfig();
    loadApiKey();
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
    const mc = currentMode === 'motion-control';
    const i2v = currentMode === 'image-to-video';
    const t2v = currentMode === 'text-to-video';

    // Show/hide sections
    els.imageSection.classList.toggle('hidden', t2v);
    els.videoSection.classList.toggle('hidden', !mc);
    els.negativePromptSection.classList.toggle('hidden', mc);
    els.modelGroup.classList.toggle('hidden', mc);
    els.qualityGroup.classList.toggle('hidden', !mc);
    els.durationGroup.classList.toggle('hidden', mc);
    els.aspectGroup.classList.toggle('hidden', mc || i2v);
    els.orientationGroup.classList.toggle('hidden', !mc);
    els.audioGroup.classList.toggle('hidden', mc || i2v);
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
        throw new Error(err.message || err.error || 'Cloud upload is not configured');
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
        };
        if (els.promptInput.value.trim()) body.prompt = els.promptInput.value.trim();
        if (els.negativePromptInput.value.trim()) body.negative_prompt = els.negativePromptInput.value.trim();

    } else {
        // text-to-video
        if (!els.promptInput.value.trim()) return showToast('Please enter a prompt', 'error');
        endpoint = `/image-to-video/kling-v2-6-pro`;
        body = {
            prompt: els.promptInput.value.trim(),
            duration: els.durationSelect.value,
            cfg_scale: parseFloat(els.cfgScale.value),
            aspect_ratio: els.aspectSelect.value,
            generate_audio: els.generateAudio.checked,
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

async function checkTaskStatus(taskId, createEndpoint) {
    // The GET status endpoint is identical to the POST creation endpoint
    const statusUrl = `${API_BASE}${createEndpoint}/${taskId}`;

    const resp = await fetch(statusUrl, {
        headers: getApiHeaders(),
    });
    if (!resp.ok) throw new Error(`Status check failed: ${resp.status}`);
    return resp.json();
}

function startPolling(taskId, createEndpoint) {
    let progress = 25;
    pollTimer = setInterval(async () => {
        try {
            const result = await checkTaskStatus(taskId, createEndpoint);
            const data = result.data || result;
            const status = data.status?.toUpperCase();

            progress = Math.min(progress + 8, 90);
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
                els.processingStatus.textContent = `Status: ${status || 'Processing'}...`;
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

// === Event Listeners ===
function setupEventListeners() {
    // Settings
    els.btnSettings.addEventListener('click', () => els.settingsModal.classList.add('active'));
    els.closeSettings.addEventListener('click', () => els.settingsModal.classList.remove('active'));
    els.settingsModal.addEventListener('click', e => { if (e.target === els.settingsModal) els.settingsModal.classList.remove('active'); });
    els.saveApiKey.addEventListener('click', () => {
        const key = els.apiKeyInput.value.trim();
        if (key) { localStorage.setItem('magnific_api_key', key); updateApiStatus(true); showToast('API key saved!', 'success'); }
        else { localStorage.removeItem('magnific_api_key'); updateApiStatus(false); }
        els.settingsModal.classList.remove('active');
    });
    els.togglePassword.addEventListener('click', () => {
        const t = els.apiKeyInput.type === 'password' ? 'text' : 'password';
        els.apiKeyInput.type = t;
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
}

// === Bootstrap ===
document.addEventListener('DOMContentLoaded', init);
