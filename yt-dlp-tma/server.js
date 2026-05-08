require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

// --- ГОРЯЧЕЕ ДОПОЛНЕНИЕ: GramJS (библиотека 'telegram') для 2 ГБ ---
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { CustomFile } = require('telegram/client/uploads');

const app = express();
const port = process.env.PORT || 3000;
const webAppUrl = process.env.WEBAPP_URL;
const adminId = parseInt(process.env.ADMIN_ID) || 0;

// Официальные ключи Telegram Android (Альтернативный вариант для 2 ГБ)
const API_ID = 6;
const API_HASH = 'eb06d4ab35277259747c0cd394c0939d';
const stringSession = new StringSession(process.env.TELEGRAM_SESSION || "");

const bot = new Telegraf(process.env.BOT_TOKEN);
const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
    deviceModel: "Klyro Android Suite",
    systemVersion: "Android 14",
    appVersion: "10.0.1"
});

// Инициализация GramJS (Безопасный запуск)
(async () => {
    try {
        await client.start({
            botAuthToken: process.env.BOT_TOKEN,
        });
        const savedSession = client.session.save();
        console.log("🚀 [MTProto] МАГИЯ АКТИВИРОВАНА!");
        if (!process.env.TELEGRAM_SESSION) {
            console.log("🔑 [SESSION] Скопируйте эту строку в .env переменную TELEGRAM_SESSION для стабильности:");
            console.log(savedSession);
        }
    } catch (err) {
        console.warn("⚠️ [MTProto] Не удалось запустить 2 ГБ режим.");
        console.error("Детали ошибки:", err.message);
    }
})();

// --- ГЛОБАЛЬНЫЙ ЛОГГЕР И ОБРАБОТЧИК ОШИБОК ---
bot.use(async (ctx, next) => {
    if (ctx.from) {
        console.log(`[📩 Сообщение] От: ${ctx.from.id} (@${ctx.from.username || '-'}) | Текст: ${ctx.message ? ctx.message.text : 'non-text'}`);
    }
    return next();
});

bot.catch((err, ctx) => {
    console.error(`🔴 [ОШИБКА БОТА] для ${ctx.updateType}:`, err);
    if (ctx.from && ctx.from.id === adminId) {
        ctx.reply(`🔴 [ОШИБКА]: ${err.message}\n\nСтек:\n${err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : 'no stack'}`).catch(e => { });
    }
});

// Глобальные обработчики для предотвращения «тихих» падений
process.on('uncaughtException', (err) => {
    console.error('💥 КРИТИЧЕСКАЯ ОШИБКА (uncaughtException):', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 КРИТИЧЕСКАЯ ОШИБКА (unhandledRejection):', reason);
});

// --- СИСТЕМА АНАЛИТИКИ (Stats Persistence) ---
const statsFile = path.join(__dirname, 'stats.json');
let stats = {
    totalTrafficBytes: 0,
    dailyUsers: {}, // { "YYYY-MM-DD": [ids] }
    allTimeUsers: [], // [ids]
    topLinks: {},   // { "url": count }
    totalDownloads: 0
};

// Загрузка статистики
if (fs.existsSync(statsFile)) {
    try {
        stats = JSON.parse(fs.readFileSync(statsFile));
        // Инициализация новых полей при миграции
        if (!stats.allTimeUsers) stats.allTimeUsers = [];
        if (!stats.totalDownloads) stats.totalDownloads = 0;
        if (!stats.topLinks) stats.topLinks = {};
        if (typeof stats.totalTrafficBytes !== 'number') stats.totalTrafficBytes = 0;
    } catch (e) { console.error("Ошибка загрузки стат:", e); }
}

function saveStats() {
    try {
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (e) { console.error("Ошибка сохранения стат:", e); }
}

function trackUser(userId) {
    if (!userId || isNaN(userId)) return;
    const today = new Date().toISOString().split('T')[0];

    // Инициализация при миграции
    if (!stats.allTimeUsers) stats.allTimeUsers = [];

    let changed = false;

    if (!stats.dailyUsers[today]) {
        stats.dailyUsers[today] = [];
        changed = true;
    }

    if (!stats.dailyUsers[today].includes(userId)) {
        stats.dailyUsers[today].push(userId);
        changed = true;
    }

    if (!stats.allTimeUsers.includes(userId)) {
        stats.allTimeUsers.push(userId);
        changed = true;
        // Уведомление админа о новом пользователе
        if (adminId && userId !== adminId) {
            bot.telegram.sendMessage(adminId, `🆕 <b>Новый пользователь!</b>\nID: <code>${userId}</code>`, { parse_mode: 'HTML' }).catch(() => { });
        }
    }

    if (changed) saveStats();
}

function trackLink(url) {
    try {
        const domain = new URL(url).hostname;
        stats.topLinks[domain] = (stats.topLinks[domain] || 0) + 1;
        saveStats();
    } catch (e) { }
}
// ----------------------------------------------

// Хранилища
const progressStore = {};
const titleStore = {};
const jobStore = {}; // Хранилище процессов { jobId: childProcess }
const chatStore = {}; // Хранилище chatId для каждой работы { jobId: chatId }

// Проверка наличия обязательных переменных
if (!process.env.BOT_TOKEN) {
    console.error('Ошибка: Укажите BOT_TOKEN в .env файле');
    process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);
app.use('/files', express.static(downloadsDir));

// --- МОНИТОРИНГ И ОЧИСТКА ---
function getSystemUsage() {
    let size = 0;
    try {
        const files = fs.readdirSync(downloadsDir);
        files.forEach(file => { size += fs.statSync(path.join(downloadsDir, file)).size; });
    } catch (e) { }
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramUsage = ((totalMem - freeMem) / totalMem) * 100;
    const cpuUsage = (os.loadavg()[0] / os.cpus().length) * 100;
    const diskUsageGB = size / (1024 * 1024 * 1024);
    return { ramUsage, cpuUsage, diskUsageGB };
}

let lastAlertTime = 0; // Коулдаун алертов
setInterval(async () => {
    const usage = getSystemUsage();
    console.log(`[🩺 Состояние] Диск: ${usage.diskUsageGB.toFixed(2)}ГБ, CPU: ${usage.cpuUsage.toFixed(1)}%, RAM: ${usage.ramUsage.toFixed(1)}%`);

    // Автоматические алерты админу
    const NOW = Date.now();
    if (adminId && (NOW - lastAlertTime > 60 * 60 * 1000)) { // Раз в час максимум
        let alertMsg = "";
        if (usage.cpuUsage > 75) alertMsg += `⚠️ Нагрузка CPU: ${usage.cpuUsage.toFixed(1)}%\n`;
        if (usage.ramUsage > 75) alertMsg += `⚠️ Использование RAM: ${usage.ramUsage.toFixed(1)}%\n`;

        // Пороговое значение по диску (если больше 100 ГБ занято или придумайте свое)
        // Но лучше по процентам. Посчитаем % если сможем.
        if (usage.diskUsageGB > 50) alertMsg += `⚠️ Место на диске (downloads): ${usage.diskUsageGB.toFixed(1)} ГБ\n`;

        if (alertMsg) {
            bot.telegram.sendMessage(adminId, `🚨 <b>ВНИМАНИЕ: Нагрузка на сервер!</b>\n\n${alertMsg}`, { parse_mode: 'HTML' })
                .then(() => { lastAlertTime = NOW; })
                .catch(() => { });
        }
    }

    // Самоочистка
    fs.readdir(downloadsDir, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(downloadsDir, file);
            fs.stat(filePath, (err, s) => {
                if (!err && (NOW - s.mtimeMs > 60 * 60 * 1000)) {
                    fs.unlink(filePath, () => { });
                }
            });
        });
    });
}, 15 * 60 * 1000);

// Команда /ping
bot.command('ping', (ctx) => ctx.reply('pong! 🏓'));

// Команда /start
bot.command('start', async (ctx) => {
    trackUser(ctx.from.id);
    await ctx.reply('Добро пожаловать в Klyro 2.0! 👋\n\nБот готов скачивать фильмы до 2 ГБ напрямую в чат.',
        Markup.inlineKeyboard([Markup.button.webApp('🚀 Открыть Klyro', webAppUrl)]));
});

// Команда /admin
bot.command('admin', async (ctx) => {
    const userId = ctx.from.id;
    console.log(`[🔐 Admin Check] User ID: ${userId}, Config Admin ID: ${adminId}`);

    if (String(userId) !== String(adminId)) {
        console.warn(`[⚠️ Access Denied] ${userId} is not ${adminId}`);
        return ctx.reply(`Доступ запрещен (ваш ID: ${userId})`);
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        const dailyCount = (stats.dailyUsers[today] || []).length;
        const allTimeCount = (stats.allTimeUsers || []).length;
        const downloadsCount = stats.totalDownloads || 0;
        const trafficGB = ((stats.totalTrafficBytes || 0) / (1024 * 1024 * 1024)).toFixed(2);

        // Сортировка топа ссылок
        const sortedLinks = Object.entries(stats.topLinks || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([domain, count], i) => `${i + 1}. <b>${domain}</b>: ${count} раз`)
            .join('\n');

        const usage = getSystemUsage();
        const diskStr = usage.diskUsageGB ? usage.diskUsageGB.toFixed(2) : "0.00";

        const report = `
📊 <b>Админ-панель Klyro</b>

👥 Юзеров сегодня: <b>${dailyCount}</b>
👥 Всего юзеров: <b>${allTimeCount}</b>
📥 Всего загрузок: <b>${downloadsCount}</b>
💾 Общий трафик: <b>${trafficGB} ГБ</b>

🚀 <b>Топ платформ:</b>
${sortedLinks || 'Пока нет данных'}

🖥 <b>Сервер:</b>
CPU: ${usage.cpuUsage.toFixed(1)}% | RAM: ${usage.ramUsage.toFixed(1)}%
Диск (downloads): ${diskStr} ГБ
        `;

        await ctx.replyWithHTML(report, Markup.inlineKeyboard([
            [Markup.button.callback('🧹 Очистить диск', 'admin_clear_disk')],
            [Markup.button.callback('🛑 STOP (ЭКСТРЕННО)', 'admin_emergency_stop')]
        ]));
    } catch (err) {
        console.error("Admin command error:", err);
        await ctx.reply(`Ошибка при генерации отчета: ${err.message}`);
    }
});

// Действие: Очистка диска
bot.action('admin_clear_disk', async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');

    try {
        const files = fs.readdirSync(downloadsDir);
        let count = 0;
        files.forEach(file => {
            try {
                fs.unlinkSync(path.join(downloadsDir, file));
                count++;
            } catch (e) { }
        });
        await ctx.answerCbQuery(`Очищено файлов: ${count}`);
        await ctx.editMessageText(`✅ Диск очищен. Удалено файлов: ${count}`);
    } catch (err) {
        console.error(err);
        await ctx.answerCbQuery('Ошибка при очистке');
    }
});

// Действие: Экстренная остановка
bot.action('admin_emergency_stop', async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');

    try {
        // 1. Убиваем все процессы
        const jobIds = Object.keys(jobStore);
        let jobsKilled = 0;
        jobIds.forEach(id => {
            try {
                jobStore[id].kill('SIGKILL');
                jobsKilled++;
            } catch (e) { }
            delete jobStore[id];
        });

        // 2. Очищаем папку
        const files = fs.readdirSync(downloadsDir);
        let filesDeleted = 0;
        files.forEach(file => {
            try {
                fs.unlinkSync(path.join(downloadsDir, file));
                filesDeleted++;
            } catch (e) { }
        });

        // 3. Очищаем сторы
        for (const key in progressStore) delete progressStore[key];
        for (const key in titleStore) delete titleStore[key];

        await ctx.answerCbQuery('🛑 СТОП ВЫПОЛНЕН');
        await ctx.editMessageText(`🛑 <b>ЭКСТРЕННАЯ ОСТАНОВКА ЗАВЕРШЕНА</b>\n\n- Завершено процессов: ${jobsKilled}\n- Удалено файлов: ${filesDeleted}`, { parse_mode: 'HTML' });
    } catch (err) {
        console.error(err);
        await ctx.answerCbQuery('Ошибка при остановке');
    }
});

// API для скачивания
app.post('/api/download', async (req, res) => {
    const { url, chatId, format, quality, title } = req.body;
    const jobId = randomUUID();
    titleStore[jobId] = title || 'video';
    chatStore[jobId] = chatId; // Запоминаем для отмены

    // Трекинг
    const parsedChatId = parseInt(chatId);
    trackUser(parsedChatId);
    trackLink(url);

    res.json({ jobId });

    try {
        let statusMessageId = null;
        try {
            const statusMsg = await bot.telegram.sendMessage(chatId, '🎬 Готовлю ваше медиа...');
            statusMessageId = statusMsg.message_id;
        } catch (msgErr) {
            console.warn(`[⚠️] Не удалось отправить статусное сообщение пользователю ${chatId}:`, msgErr.message);
            // Продолжаем выполнение, даже если сообщение не отправилось
        }

        const outputTemplate = path.join(downloadsDir, `${jobId}.%(ext)s`);

        let args = [];
        if (format === 'audio') {
            args = [
                '--js-runtime', 'node',
                '--concurrent-fragments', '16',
                '--progress', '--newline',
                '-x', '--audio-format', 'mp3',
                '--audio-quality', '0',
                '-o', outputTemplate,
                url
            ];
        } else {
            const height = quality || '1080';
            args = [
                '--js-runtime', 'node',
                '--concurrent-fragments', '16', // Снижено с 32 для стабильности
                '-f', `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best`,
                '--merge-output-format', 'mp4',
                '--format-sort', 'vcodec:h264,res,br',
                '--no-playlist',
                '--progress',
                '--newline',
                '--buffer-size', '16M', // Снижено с 32М
                '--no-mtime',
                '--external-downloader', 'aria2c',
                '--external-downloader-args', 'aria2c:-x 8 -s 8 -k 1M', // Снижено с 16
                '-o', outputTemplate,
                url
            ];
        }

        const cookiesPath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            const cookieStat = fs.statSync(cookiesPath);
            if (cookieStat.isFile()) {
                args.unshift('--cookies', cookiesPath);
            } else {
                console.warn("⚠️ [Warning] cookies.txt является папкой, а не файлом! Пропускаю использование куки.");
            }
        }

        const ytDlp = spawn('yt-dlp', args);
        jobStore[jobId] = ytDlp;

        let ytStderr = '';
        const handleOutput = (data) => {
            const str = data.toString();
            // console.log(`[JOB ${jobId}] OUT: ${str.substring(0, 50)}`); // Дебаг на сервере
            const match = str.match(/(\d+(\.\d+)?)%/);
            if (match) {
                const val = parseFloat(match[1]);
                if (!progressStore[jobId] || val > progressStore[jobId]) {
                    progressStore[jobId] = val;
                }
            }
        };

        ytDlp.stdout.on('data', handleOutput);
        ytDlp.stderr.on('data', (d) => {
            ytStderr += d.toString();
            handleOutput(d); // Пробуем искать прогресс и в stderr
        });

        ytDlp.on('close', async (code) => {
            delete jobStore[jobId];
            if (code !== 0) {
                console.error(`🔴 [yt-dlp error] Code: ${code} | JobId: ${jobId}`);
                console.error(`Stderr: ${ytStderr}`);
                try { await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `❌ Ошибка загрузки.\n\nДетали: ${ytStderr.substring(0, 100)}...`); } catch (e) { }
                return;
            }

            progressStore[jobId] = 100;

            // Улучшенный поиск файла: игнорируем служебные файлы .aria2, .part, .ytdl
            const files = fs.readdirSync(downloadsDir);
            const downloadedFiles = files.filter(f => {
                const lowerF = f.toLowerCase();
                return f.startsWith(jobId) && 
                       !lowerF.endsWith('.aria2') && 
                       !lowerF.endsWith('.part') && 
                       !lowerF.endsWith('.ytdl') &&
                       !lowerF.endsWith('.temp');
            });

            if (downloadedFiles.length === 0) {
                console.error(`🔴 [Error] Файл для задания ${jobId} не найден после завершения загрузки.`);
                try { await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `❌ Ошибка: Файл не найден после загрузки.`); } catch (e) { }
                return;
            }

            const filePath = path.join(downloadsDir, downloadedFiles[0]);
            const statsInfo = fs.statSync(filePath);
            const fileSizeMB = statsInfo.size / (1024 * 1024);

            // Проверка на пустой файл
            if (statsInfo.size === 0) {
                console.error(`🔴 [Error] Файл ${filePath} имеет размер 0 байт.`);
                try { await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `❌ Ошибка: Скачанный файл пуст (0 байт).`); } catch (e) { }
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                return;
            }

            // ТРЕКИНГ ТРАФИКА
            stats.totalTrafficBytes += statsInfo.size;
            stats.totalDownloads += 1;
            saveStats();

            if (statusMessageId) {
                try {
                    await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `🚀 Видео (${fileSizeMB.toFixed(1)}МБ) готово! Отправляю...`);
                } catch (e) { }
            }

            try {
                if (fileSizeMB < 49) {
                    if (format === 'audio') await bot.telegram.sendAudio(chatId, { source: filePath });
                    else await bot.telegram.sendVideo(chatId, { source: filePath });
                } else {
                    // ГЛУБОКАЯ ОПТИМИЗАЦИЯ: Параллельная загрузка через MTProto
                    const toUpload = new CustomFile(path.basename(filePath), statsInfo.size, filePath);
                    const uploadedFile = await client.uploadFile({
                        file: toUpload,
                        workers: 8, // Снижено с 32 для предотвращения OOM
                    });

                    await client.sendFile(parseInt(chatId), {
                        file: uploadedFile,
                        video: format !== 'audio',
                        supportsStreaming: true,
                        caption: `🎬 ${titleStore[jobId]}\n\nРазмер: ${fileSizeMB.toFixed(1)} МБ`,
                    });
                }
                if (statusMessageId) {
                    try { await bot.telegram.deleteMessage(chatId, statusMessageId); } catch (e) { }
                }
            } catch (err) {
                console.error("Ошибка отправки:", err);
                const domain = webAppUrl ? webAppUrl.replace(/\/$/, '') : '';
                const link = `${domain}/get/${encodeURIComponent(path.basename(filePath))}`;

                const failMsg = `⚠️ Ошибка отправки в чат. Но файл доступен по прямой ссылке на 1 час:\n👉 ${link}`;

                if (statusMessageId) {
                    try { await bot.telegram.editMessageText(chatId, statusMessageId, undefined, failMsg); } catch (e) {
                        // Если не удалось отредактировать, пробуем отправить новое
                        try { await bot.telegram.sendMessage(chatId, failMsg); } catch (e2) { }
                    }
                } else {
                    try { await bot.telegram.sendMessage(chatId, failMsg); } catch (e) { }
                }
            }

            setTimeout(() => {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                delete progressStore[jobId];
                delete titleStore[jobId];
            }, 60 * 60 * 1000);
        });
    } catch (e) { console.error(e); delete jobStore[jobId]; }
});

app.post('/api/cancel', async (req, res) => {
    const { jobId } = req.body;
    if (jobStore[jobId]) {
        jobStore[jobId].kill('SIGKILL');
        delete jobStore[jobId];

        // Уведомление об отмене
        const cid = chatStore[jobId];
        if (cid) {
            bot.telegram.sendMessage(cid, '❌ Загрузка отменена.').catch(() => { });
        }
    }
    delete progressStore[jobId];
    delete titleStore[jobId];
    delete chatStore[jobId];

    // Удаление файла, если он уже начал создаваться
    try {
        const files = fs.readdirSync(downloadsDir);
        const toDelete = files.filter(f => f.startsWith(jobId));
        toDelete.forEach(f => {
            try { fs.unlinkSync(path.join(downloadsDir, f)); } catch (e) { }
        });
    } catch (e) { }

    res.json({ success: true });
});

app.get('/api/progress/:jobId', (req, res) => {
    const progress = progressStore[req.params.jobId];
    res.json({ progress: progress !== undefined ? progress : 0 });
});

app.get('/get/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(downloadsDir, fileName);

    // Безопасность: проверяем, что файл находится именно в папке downloads
    if (!filePath.startsWith(downloadsDir)) {
        return res.status(403).send('Forbidden');
    }

    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            return res.status(404).send('Файл пуст');
        }

        const jobId = fileName.split('.')[0];
        let originalTitle = titleStore[jobId] || 'video';
        const safeTitle = originalTitle.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);
        const extension = path.extname(fileName) || '.mp4';
        const downloadName = `${safeTitle}${extension}`;

        res.setHeader('X-Accel-Buffering', 'no');
        
        // Динамический MIME-тип
        if (extension.toLowerCase() === '.mp3') {
            res.setHeader('Content-Type', 'audio/mpeg');
        } else {
            res.setHeader('Content-Type', 'video/mp4');
        }

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);

        console.log(`[📂 Download] Serving file: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        res.sendFile(filePath, (err) => {
            if (err) {
                console.error(`[📂 Download Error] ${fileName}:`, err.message);
                if (!res.headersSent) res.status(500).send('Ошибка сервера при передаче файла');
            }
        });
    } else {
        console.warn(`[📂 Download 404] File not found: ${fileName}`);
        res.status(404).send('Файл не найден или срок его жизни (1 час) истек');
    }
});

app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'No URL' });

    const args = [
        '--js-runtime', 'node',
        '-j',
        '--skip-download',
        '--no-playlist',
        '--no-check-certificate',
        '--prefer-free-formats',
        '--youtube-skip-dash-manifest'
    ];
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) args.unshift('--cookies', cookiesPath);
    args.push(url);

    const ytDlp = spawn('yt-dlp', args);
    let out = '';
    ytDlp.stdout.on('data', (d) => { out += d.toString(); });
    ytDlp.on('close', () => {
        try {
            const i = JSON.parse(out);
            let thumb = i.thumbnail;
            if (!thumb && i.thumbnails && i.thumbnails.length > 0) thumb = i.thumbnails[i.thumbnails.length - 1].url;
            res.json({ title: i.title, thumbnail: thumb, duration: i.duration_string, uploader: i.uploader });
        } catch (e) { res.status(500).json({ error: 'Parse' }); }
    });
});

app.listen(port, () => console.log(`[🌐 Server] ON port ${port}`));

// Запуск бота с очисткой старых вебхуков/сообщений
bot.launch({ dropPendingUpdates: true }).then(() => {
    console.log('🤖 [Telegram Bot] ПОЛОСА ЗАГРУЗКИ: 100% (Бот запущен)');
}).catch(err => {
    console.error('🔴 [Telegram Bot] ОШИБКА ЗАПУСКА:', err);
});

process.once('SIGINT', () => { bot.stop(); client.disconnect(); });
process.once('SIGTERM', () => { bot.stop(); client.disconnect(); });
