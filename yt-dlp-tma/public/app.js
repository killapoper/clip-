let tg = window.Telegram.WebApp;
let pollingInterval = null;
let infoTimeout = null;
let currentJobId = null;

try {
    tg.expand();
    tg.ready();
    tg.setHeaderColor('#000000');
    tg.setBackgroundColor('#000000');
} catch (e) {
    console.warn("Not running inside Telegram App");
}

const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const downloadBtn = document.getElementById('downloadBtn');
const cancelBtn = document.getElementById('cancelBtn');
const btnText = document.getElementById('btnText');
const statusMsg = document.getElementById('statusMsg');
const formatRadios = document.querySelectorAll('input[name="format"]');

// Progress Elements
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressStatus = document.getElementById('progressStatus');

// New Preview & Quality Elements
const previewCard = document.getElementById('previewCard');
const previewImg = document.getElementById('previewImg');
const previewTitle = document.getElementById('previewTitle');
const previewDetail = document.getElementById('previewDetail');
const qualitySelector = document.getElementById('qualitySelector');

urlInput.addEventListener('input', () => {
    updateActionBtn();
    handleUrlChange();
});

urlInput.addEventListener('focus', () => {
    document.body.classList.add('keyboard-open');
    setTimeout(() => {
        urlInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
});

urlInput.addEventListener('blur', () => {
    document.body.classList.remove('keyboard-open');
});

function updateActionBtn() {
    if (urlInput.value.trim().length > 0) {
        pasteBtn.innerHTML = `<svg class="act-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
        pasteBtn.dataset.action = "clear";
    } else {
        pasteBtn.innerHTML = `<svg class="act-icon" viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 16H5V5h2v3h10V5h2v14z"/></svg>`;
        pasteBtn.dataset.action = "paste";
    }
}

function handleUrlChange() {
    const url = urlInput.value.trim();
    clearTimeout(infoTimeout);

    if (url.startsWith('http')) {
        infoTimeout = setTimeout(() => fetchVideoInfo(url), 800);
    } else {
        hidePreview();
    }
}

let currentVideoTitle = "video"; // Название для красивого имени файла

async function fetchVideoInfo(url) {
    previewCard.classList.add('active');
    previewTitle.textContent = getT('preview_loading');
    previewDetail.textContent = "";
    previewImg.style.opacity = "0.3";

    try {
        const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (data.title) {
            currentVideoTitle = data.title;
            previewImg.src = data.thumbnail;
            previewImg.style.opacity = "1";
            previewTitle.textContent = data.title;
            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
            previewDetail.textContent = `${data.uploader || (isYouTube ? 'YouTube' : 'Video')} • ${data.duration || ''}`;
            try { tg.HapticFeedback.selectionChanged(); } catch (e) { }
        } else {
            hidePreview();
        }
    } catch (e) {
        hidePreview();
    }
}

function hidePreview() {
    previewCard.classList.remove('active');
}

pasteBtn.addEventListener('click', async () => {
    try { tg.HapticFeedback.selectionChanged(); } catch (e) { }
    if (pasteBtn.dataset.action === "clear") {
        urlInput.value = '';
        updateActionBtn();
        hidePreview();
        urlInput.focus();
    } else {
        // Пытаемся использовать официальный метод Telegram (надежнее на iOS)
        if (typeof tg.readTextFromClipboard === 'function') {
            tg.readTextFromClipboard((text) => {
                if (text) {
                    urlInput.value = text;
                    updateActionBtn();
                    handleUrlChange();
                }
            });
            return;
        }

        // Fallback на стандартный метод
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text;
                updateActionBtn();
                handleUrlChange();
            }
        } catch (err) {
            showStatus('Нет доступа к буферу. Вставьте ссылку вручную.', 'error');
        }
    }
});

formatRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        try { tg.HapticFeedback.selectionChanged(); } catch (e) { }
        const isAudio = document.querySelector('input[name="format"]:checked').value === 'audio';
        qualitySelector.style.display = isAudio ? 'none' : 'flex';
    });
});

function showStatus(text, type) {
    statusMsg.textContent = text;
    statusMsg.className = `status visible ${type}`;
}

function shakeError() {
    const panel = document.querySelector('.glass-panel');
    panel.style.transform = "translateX(8px)";
    setTimeout(() => panel.style.transform = "translateX(-8px)", 50);
    setTimeout(() => panel.style.transform = "translateX(0)", 200);
}

downloadBtn.addEventListener('click', async () => {
    if (downloadBtn.classList.contains('processing') || downloadBtn.classList.contains('success')) return;

    const url = urlInput.value.trim();
    const currentFormat = document.querySelector('input[name="format"]:checked').value;
    const currentQuality = document.querySelector('input[name="quality"]:checked').value;

    if (!url || !url.startsWith('http')) {
        showStatus(getT('status_error_url'), 'error');
        try { tg.HapticFeedback.notificationOccurred('error'); } catch (e) { }
        shakeError();
        return;
    }

    let chatId = null;
    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        chatId = tg.initDataUnsafe.user.id;
    } else if (tg.initData && tg.initData.user) {
        chatId = tg.initData.user.id;
    }

    if (!chatId) {
        showStatus('Ошибка: Не удалось определить ваш ID. Попробуйте перезапустить бота.', 'error');
        shakeError();
        try { tg.HapticFeedback.notificationOccurred('error'); } catch (e) { }
        return;
    }

    // Блокировка UI
    downloadBtn.disabled = true;
    downloadBtn.classList.add('processing');
    cancelBtn.style.display = 'flex';
    btnText.textContent = getT('btn_preparing');
    try { tg.HapticFeedback.impactOccurred('medium'); } catch (e) { }
    showStatus('', '');

    try {
        currentJobId = null; // Reset
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                chatId,
                format: currentFormat,
                quality: currentQuality,
                title: currentVideoTitle
            })
        });

        const data = await response.json();

        if (response.ok && data.jobId) {
            currentJobId = data.jobId;
            progressContainer.classList.add('active');
            startPolling(data.jobId);
        } else {
            showStatus(data.error || 'Ошибка сервера', 'error');
            resetBtn();
        }
    } catch (error) {
        showStatus(getT('status_error_conn'), 'error');
        resetBtn();
    }
});

function startPolling(jobId) {
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/progress/${jobId}`);
            const data = await res.json();

            const progress = data.progress || 0;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${Math.floor(progress)}%`;

            if (progress > 0 && progress < 100) {
                progressStatus.textContent = getT('progress_downloading_server');
                btnText.textContent = getT('btn_downloading');
            } else if (progress >= 100) {
                progressStatus.textContent = getT('progress_sending_tg');
                clearInterval(pollingInterval);
                setTimeout(() => {
                    showSuccessMode();
                }, 1500);
            }
        } catch (e) {
            console.error("Polling error", e);
        }
    }, 400);
}

cancelBtn.addEventListener('click', async () => {
    if (!currentJobId) {
        resetBtn();
        return;
    }

    try {
        await fetch('/api/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: currentJobId })
        });
        showStatus(getT('status_cancelled'), 'error');
    } catch (e) { }

    currentJobId = null;
    if (pollingInterval) clearInterval(pollingInterval);
    resetBtn();
    try { tg.HapticFeedback.notificationOccurred('warning'); } catch (e) { }
});

function showSuccessMode() {
    progressContainer.classList.remove('active');
    downloadBtn.classList.remove('processing');
    downloadBtn.classList.add('success');
    btnText.textContent = getT('btn_success');
    showStatus(getT('status_success_file'), 'success');
    try { tg.HapticFeedback.notificationOccurred('success'); } catch (e) { }

    setTimeout(() => {
        resetBtn();
    }, 4000);
}

function resetBtn() {
    downloadBtn.disabled = false;
    downloadBtn.classList.remove('processing');
    downloadBtn.classList.remove('success');
    cancelBtn.style.display = 'none';
    btnText.textContent = getT('btn_download');
    progressContainer.classList.remove('active');
}

updateActionBtn();

// --- BOTTOM NAV TAB SWITCHING ---
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetTab = item.dataset.tab;

        // Haptic Feedback
        try { tg.HapticFeedback.selectionChanged(); } catch (e) { }

        // Update Nav UI
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // Update Content
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === `tab-${targetTab}`) {
                content.classList.add('active');
            }
        });

        // Specific logic for tabs if needed
        if (targetTab === 'home') {
            tg.setHeaderColor('#000000'); // Return to original header color
        } else {
            tg.setHeaderColor('#141419'); // Darker for other tabs
        }
    });
});

// --- LOCALIZATION SYSTEM ---
const translations = {
    ru: {
        app_title: "Klyro",
        app_subtitle: "Тут вы можете скачать любой медиафайл",
        format_video: "Видео",
        format_audio: "Аудио (MP3)",
        input_placeholder: "Вставьте ссылку...",
        btn_download: "Скачать файл",
        btn_preparing: "Начинаю...",
        btn_downloading: "Загружаю...",
        btn_cancel: "Отменить",
        btn_success: "Готово! Видео отправлено.",
        nav_home: "Главная",
        nav_converter: "Конвертор",
        nav_settings: "Настройки",
        converter_subtitle: "Скоро здесь будет конвертация медиа",
        settings_subtitle: "Управление вашими предпочтениями",
        settings_version: "Версия",
        settings_lang: "Язык",
        lang_name: "Русский",
        status_error_url: "Отсутствует корректная ссылка",
        status_error_conn: "Нет соединения",
        status_cancelled: "Загрузка отменена",
        prompt_chat_id: "Введите chat_id для теста:",
        progress_downloading_server: "Скачиваю на сервер...",
        progress_sending_tg: "Готово! Отправляю в Telegram...",
        status_success_file: "Файл успешно обработан!",
        preview_loading: "Получаю данные..."
    },
    en: {
        app_title: "Klyro",
        app_subtitle: "Download any media file with ease",
        format_video: "Video",
        format_audio: "Audio (MP3)",
        input_placeholder: "Paste link here...",
        btn_download: "Download File",
        btn_preparing: "Starting...",
        btn_downloading: "Downloading...",
        btn_cancel: "Cancel",
        btn_success: "Done! Video sent to chat.",
        nav_home: "Home",
        nav_converter: "Converter",
        nav_settings: "Settings",
        converter_subtitle: "Conversion tool coming soon",
        settings_subtitle: "Manage your preferences",
        settings_version: "Version",
        settings_lang: "Language",
        lang_name: "English",
        status_error_url: "Invalid or missing URL",
        status_error_conn: "Connection error",
        status_cancelled: "Download cancelled",
        prompt_chat_id: "Enter chat_id for testing:",
        progress_downloading_server: "Downloading to server...",
        progress_sending_tg: "Ready! Sending to Telegram...",
        status_success_file: "File processed successfully!",
        preview_loading: "Fetching data..."
    }
};

let currentLang = localStorage.getItem('klyro_lang') || 'ru';

function getT(key) {
    return translations[currentLang][key] || key;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang][key]) {
            el.textContent = translations[currentLang][key];
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[currentLang][key]) {
            el.placeholder = translations[currentLang][key];
        }
    });

    const langDisplay = document.getElementById('currentLangDisplay');
    if (langDisplay) langDisplay.textContent = translations[currentLang].lang_name;
}

const langToggle = document.getElementById('langToggle');
if (langToggle) {
    langToggle.addEventListener('click', () => {
        currentLang = currentLang === 'ru' ? 'en' : 'ru';
        localStorage.setItem('klyro_lang', currentLang);
        applyTranslations();
        try { tg.HapticFeedback.notificationOccurred('success'); } catch (e) { }
    });
}

// Initial apply
applyTranslations();
