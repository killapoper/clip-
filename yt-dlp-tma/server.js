require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const webAppUrl = process.env.WEBAPP_URL;
const adminId = parseInt(process.env.ADMIN_ID) || 0;

const bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
        apiRoot: process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org'
    }
});

// Улучшенная функция для исправления формата cookies.txt
function fixCookiesFormat() {
    const cookiesPath = path.join(__dirname, 'data', 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        try {
            const stat = fs.statSync(cookiesPath);
            if (!stat.isFile()) {
                console.warn("⚠️ [Cookies] cookies.txt является папкой, а не файлом! Пропускаю.");
                return;
            }
            let content = fs.readFileSync(cookiesPath, 'utf8');
            
            // 1. Убираем BOM
            content = content.replace(/^\uFEFF/, '');
            
            // 2. Разбиваем на строки и чистим
            let lines = content.split('\n');
            let fixedLines = [];
            let headerFound = false;

            for (let line of lines) {
                let trimmed = line.trim();
                if (!trimmed) continue;

                if (trimmed.startsWith('# Netscape HTTP Cookie File')) {
                    headerFound = true;
                    fixedLines.push('# Netscape HTTP Cookie File');
                    continue;
                }

                if (trimmed.startsWith('#')) {
                    fixedLines.push(trimmed);
                    continue;
                }

                // Если в строке есть пробелы, но нет табов - пробуем заменить
                // В Netscape должно быть 7 колонок
                if (trimmed.includes(' ') && !trimmed.includes('\t')) {
                    // Заменяем последовательности пробелов на один таб
                    trimmed = trimmed.replace(/\s+/g, '\t');
                }
                fixedLines.push(trimmed);
            }

            if (!headerFound) {
                fixedLines.unshift('# Netscape HTTP Cookie File');
            }

            fs.writeFileSync(cookiesPath, fixedLines.join('\n') + '\n', 'utf8');
            console.log("✅ [Cookies] Файл cookies.txt успешно нормализован (пробелы заменены на табы).");
        } catch (err) {
            console.error("❌ [Cookies] Ошибка при нормализации cookies.txt:", err.message);
        }
    }
}

// Функция для автоматического обновления yt-dlp
function autoUpdateYtDlp() {
    console.log("🔄 [Auto-Update] Запуск автоматического обновления yt-dlp...");
    const { exec } = require('child_process');
    exec('pip3 install -U yt-dlp --break-system-packages', (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ [Auto-Update] Ошибка при обновлении yt-dlp: ${error.message}`);
            return;
        }
        console.log(`✅ [Auto-Update] yt-dlp обновлен:\n${stdout.trim()}`);
    });
}

// Инициализация и автообновление
(async () => {
    fixCookiesFormat();
    autoUpdateYtDlp();
    
    // Запуск автоматического обновления каждые 24 часа
    setInterval(autoUpdateYtDlp, 24 * 60 * 60 * 1000);
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
const statsFile = path.join(__dirname, 'data', 'stats.json');
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
        const stat = fs.statSync(statsFile);
        if (stat.isFile()) {
            stats = JSON.parse(fs.readFileSync(statsFile));
            // Инициализация новых полей при миграции
            if (!stats.allTimeUsers) stats.allTimeUsers = [];
            if (!stats.totalDownloads) stats.totalDownloads = 0;
            if (!stats.topLinks) stats.topLinks = {};
            if (typeof stats.totalTrafficBytes !== 'number') stats.totalTrafficBytes = 0;
        } else {
            console.warn("⚠️ [Stats] stats.json является папкой, а не файлом!");
        }
    } catch (e) { console.error("Ошибка загрузки стат:", e); }
}

function saveStats() {
    try {
        if (fs.existsSync(statsFile) && !fs.statSync(statsFile).isFile()) {
            console.warn("⚠️ [Stats] Не удается сохранить, так как stats.json является папкой!");
            return;
        }
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

// --- СИСТЕМА РАССЫЛОК ---
const broadcastsFile = path.join(__dirname, 'data', 'broadcasts.json');
let broadcastState = {
    step: 'idle', // 'idle', 'awaiting_content', 'awaiting_time', 'awaiting_confirm', 'awaiting_confirm_sched'
    contentType: null, // 'text', 'audio', 'media'
    message: null,
    scheduleTime: null
};

function loadScheduledBroadcasts() {
    try {
        if (fs.existsSync(broadcastsFile)) {
            const stat = fs.statSync(broadcastsFile);
            if (stat.isFile()) {
                return JSON.parse(fs.readFileSync(broadcastsFile, 'utf8'));
            }
        }
    } catch (e) {
        console.error("Error loading broadcasts:", e);
    }
    return [];
}

function saveScheduledBroadcasts(list) {
    try {
        fs.writeFileSync(broadcastsFile, JSON.stringify(list, null, 2));
    } catch (e) {
        console.error("Error saving broadcasts:", e);
    }
}

async function runBroadcast(fromChatId, messageId) {
    const users = stats.allTimeUsers || [];
    let successCount = 0;
    let failCount = 0;
    
    for (const userId of users) {
        try {
            await bot.telegram.copyMessage(userId, fromChatId, messageId);
            successCount++;
        } catch (err) {
            console.error(`Broadcast failed for user ${userId}:`, err.message);
            failCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 40)); // обход лимитов (30/сек)
    }
    
    if (adminId) {
        await bot.telegram.sendMessage(adminId, `📢 <b>Рассылка завершена!</b>\n\n✅ Успешно доставлено: <b>${successCount}</b>\n❌ Ошибок: <b>${failCount}</b>`, { parse_mode: 'HTML' }).catch(() => {});
    }
}

// Запуск фоновой проверки запланированных рассылок (каждые 30 секунд)
setInterval(async () => {
    const list = loadScheduledBroadcasts();
    const now = Date.now();
    let changed = false;
    
    for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (new Date(item.scheduleTime).getTime() <= now) {
            console.log(`[📢] Запуск запланированной рассылки от ${item.createdAt}`);
            runBroadcast(item.fromChatId, item.messageId);
            list.splice(i, 1);
            i--;
            changed = true;
        }
    }
    
    if (changed) {
        saveScheduledBroadcasts(list);
    }
}, 30 * 1000);
// ----------------------------------------------

// Хранилища
const progressStore = {};
const titleStore = {};
const jobStore = {}; // Хранилище процессов { jobId: childProcess }
const chatStore = {}; // Хранилище chatId для каждой работы { jobId: chatId }
const pendingDownloads = {}; // Временный стор для ссылок из чата { pendingId: { url, chatId, title } }
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS) || 10; // Лимит параллельных загрузок кумулятивно

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

// Функция генерации выдуманной статистики (меняется каждые 4 минуты)
const getSeededStats = () => {
    const now = Date.now();
    // Округляем время до 4 минут (240 000 мс)
    const seedTime = Math.floor(now / (4 * 60 * 1000));
    
    // Псевдогенератор случайных чисел на основе сида
    const pseudoRandom = (seed) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    };

    const getRandomRange = (min, max, seedOffset) => {
        const rand = pseudoRandom(seedTime + seedOffset);
        return Math.floor(rand * (max - min + 1)) + min;
    };

    // 1. Детерминированное общее количество пользователей бота с плавным ростом
    // Стартует с 1367 пользователей 15 июня 2026 года и растет на 1-5 пользователей каждые 2-3 дня
    const baseDate = new Date('2026-06-15T00:00:00Z').getTime();
    const diffDays = Math.floor(Math.max(0, now - baseDate) / (24 * 60 * 60 * 1000));
    
    let totalUsers = 1367;
    let lastIncreaseDay = 0;
    for (let d = 1; d <= diffDays; d++) {
        // Детерминированный интервал прироста: 2 или 3 дня
        const hash = Math.sin(lastIncreaseDay + 55) * 10000;
        const randInterval = (hash - Math.floor(hash)) > 0.5 ? 3 : 2;
        
        if (d - lastIncreaseDay >= randInterval) {
            // Детерминированный шаг прироста: 1-5 пользователей
            const incHash = Math.sin(d + 77) * 10000;
            const increment = Math.floor((incHash - Math.floor(incHash)) * 5) + 1;
            totalUsers += increment;
            lastIncreaseDay = d;
        }
    }

    // 2. Активных за 30 дней (MAU): 65% - 75% от общего количества пользователей
    const mauMin = Math.floor(totalUsers * 0.65);
    const mauMax = Math.floor(totalUsers * 0.75);
    const mau = getRandomRange(mauMin, mauMax, 3);

    // 3. Активных за 24 часа (DAU): 15% - 22% от MAU
    const dauMin = Math.floor(mau * 0.15);
    const dauMax = Math.floor(mau * 0.22);
    const dau = getRandomRange(dauMin, dauMax, 2);

    // 4. Количество скачиваний в день: 1.5 - 3.0 от DAU
    const downloadsMin = Math.floor(dau * 1.5);
    const downloadsMax = Math.floor(dau * 3.0);
    const downloadsPerDay = getRandomRange(downloadsMin, downloadsMax, 4);

    // 5. Кол-во видео в обработке: [3, 13]
    const seedDau = pseudoRandom(seedTime + 6);
    const processingMin = 3 + Math.floor(seedDau * 4); // от 3 до 7
    const processingMax = 13;
    const processingVideos = getRandomRange(processingMin, processingMax, 6);

    // 6. Нагрузка сервера: до 73%
    // Базовая нагрузка от 8% до 22% + от 3% до 5% на каждое видео в обработке
    const baseLoad = getRandomRange(8, 22, 5);
    const addedLoad = processingVideos * getRandomRange(3, 5, 7);
    let serverLoad = baseLoad + addedLoad;
    if (serverLoad > 73) {
        // Ограничиваем значением до 73%
        serverLoad = getRandomRange(68, 73, 8);
    }

    return {
        totalUsers,
        dau,
        mau,
        downloadsPerDay,
        serverLoad,
        processingVideos
    };
};


async function handleBroadcastInput(ctx) {
    if (broadcastState.step === 'awaiting_content') {
        const msg = ctx.message;
        
        broadcastState.message = msg;
        broadcastState.step = 'awaiting_confirm';
        
        await ctx.reply('✨ <b>Предпросмотр сообщения:</b>', { parse_mode: 'HTML' });
        await ctx.telegram.copyMessage(ctx.chat.id, msg.chat.id, msg.message_id);
        
        return ctx.reply('Сообщение готово к рассылке. Выберите следующее действие:', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🚀 Отправить сейчас', callback_data: 'broadcast_send_now' },
                        { text: '⏰ Запланировать', callback_data: 'broadcast_schedule' }
                    ],
                    [
                        { text: '❌ Отменить', callback_data: 'admin_broadcast_cancel' }
                    ]
                ]
            }
        });
    }
    
    if (broadcastState.step === 'awaiting_time') {
        const text = ctx.message.text ? ctx.message.text.trim() : '';
        let targetDate = null;
        
        if (/^\d{2}:\d{2}$/.test(text)) {
            const todayStr = new Date().toISOString().split('T')[0];
            targetDate = new Date(`${todayStr}T${text}:00`);
        } else {
            targetDate = new Date(text.replace(' ', 'T'));
        }
        
        if (!targetDate || isNaN(targetDate.getTime()) || targetDate.getTime() <= Date.now()) {
            return ctx.reply(`❌ <b>Неверный формат времени или указано время в прошлом!</b>\n\nПожалуйста, отправьте время в формате:\n<code>ГГГГ-ММ-ДД ЧЧ:ММ</code> (например, <code>2026-06-15 18:00</code>):\n\n<i>Текущее время сервера: ${new Date().toLocaleString('ru-RU')}</i>`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '❌ Отменить', callback_data: 'admin_broadcast_cancel' }
                    ]]
                }
            });
        }
        
        broadcastState.scheduleTime = targetDate;
        broadcastState.step = 'awaiting_confirm_sched';
        
        return ctx.reply(`📅 <b>Рассылка запланирована на:</b>\n<code>${targetDate.toLocaleString('ru-RU')}</code>\n\nВсе верно?`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Подтвердить планирование', callback_data: 'broadcast_confirm_sched' }
                    ],
                    [
                        { text: '❌ Отменить', callback_data: 'admin_broadcast_cancel' }
                    ]
                ]
            }
        });
    }
}

bot.use(async (ctx, next) => {
    if (ctx.from && String(ctx.from.id) === String(adminId) && broadcastState.step !== 'idle') {
        if (ctx.callbackQuery) {
            return next();
        }
        if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/')) {
            broadcastState = { step: 'idle', contentType: null, message: null, scheduleTime: null };
            return next();
        }
        if (ctx.message) {
            return handleBroadcastInput(ctx);
        }
    }
    return next();
});

// Команда /stats
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    if (String(userId) !== String(adminId)) {
        console.warn(`[⚠️ Access Denied for /stats] ${userId} is not ${adminId}`);
        return ctx.reply('Доступ разрешен только администратору.');
    }
    try {
        const statsData = getSeededStats();
        const message = `
<tg-emoji emoji-id="5397838301166078960">👤</tg-emoji> <b>Статистика Klyro:</b>

<tg-emoji emoji-id="5400079672799165880">👥</tg-emoji> Всего пользователей бота: <b>${statsData.totalUsers}</b>
<tg-emoji emoji-id="5399841684366329533">↖️</tg-emoji> Активных за 24 часа (DAU): <b>${statsData.dau}</b>
<tg-emoji emoji-id="5397893654704586539">✔️</tg-emoji> Активных за 30 дней (MAU): <b>${statsData.mau}</b>
<tg-emoji emoji-id="5399862394698629054">✉️</tg-emoji> Количество скачиваний в день: <b>${statsData.downloadsPerDay}</b>
<tg-emoji emoji-id="5397637648883940852">⏲️</tg-emoji> Нагрузка сервера: <b>${statsData.serverLoad}%</b>
<tg-emoji emoji-id="5397804246370386558">📷</tg-emoji> Кол-во видео в обработке: <b>${statsData.processingVideos}</b>
        `;
        
        const photoPath = path.join(__dirname, 'stats.png');
        if (fs.existsSync(photoPath)) {
            await ctx.replyWithPhoto({ source: photoPath }, {
                caption: message.trim(),
                parse_mode: 'HTML'
            });
        } else {
            await ctx.replyWithHTML(message.trim());
        }
    } catch (err) {
        console.error("Stats command error:", err);
    }
});

// Команда /ping
bot.command('ping', (ctx) => ctx.reply('pong! 🏓'));


// Команда /start
bot.command('start', async (ctx) => {
    trackUser(ctx.from.id);
    await ctx.replyWithHTML(`<b>Добро пожаловать в Klyro!</b> <tg-emoji emoji-id="5985478698722136468">👋</tg-emoji>\n\nЯ готов скачивать медиафайлы напрямую в чат. Вы можете просто отправить ссылку прямо в этот диалог или открыть Web App приложение по кнопке «Web App Interface» слева от поля ввода (или по кнопке «Открыть Klyro» ниже).`,
        {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: 'Открыть Klyro',
                        web_app: { url: webAppUrl },
                        icon_custom_emoji_id: '6028171274939797252'
                    }
                ]]
            }
        });
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

        const activeJobsCount = Object.keys(jobStore).length;
        const report = `
<tg-emoji emoji-id="5397838301166078960">👤</tg-emoji> <b>Админ-панель Klyro</b>

<tg-emoji emoji-id="5400079672799165880">👥</tg-emoji> Юзеров сегодня: <b>${dailyCount}</b>
<tg-emoji emoji-id="5400079672799165880">👥</tg-emoji> Всего юзеров: <b>${allTimeCount}</b>
<tg-emoji emoji-id="5399862394698629054">✉️</tg-emoji> Всего загрузок: <b>${downloadsCount}</b>
<tg-emoji emoji-id="5805506958995758422">📁</tg-emoji> Общий трафик: <b>${trafficGB} ГБ</b>

<tg-emoji emoji-id="5399841684366329533">↖️</tg-emoji> Активных загрузок: <b>${activeJobsCount} / ${MAX_CONCURRENT_JOBS}</b>

<tg-emoji emoji-id="6043874504302661409">📤</tg-emoji> <b>Топ платформ:</b>
${sortedLinks || 'Пока нет данных'}

<tg-emoji emoji-id="5397637648883940852">⏲️</tg-emoji> <b>Сервер:</b>
CPU: ${usage.cpuUsage.toFixed(1)}% | RAM: ${usage.ramUsage.toFixed(1)}%
Диск (downloads): ${diskStr} ГБ
        `;

        await ctx.replyWithHTML(report, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🧹 Очистить диск', callback_data: 'admin_clear_disk' }
                    ],
                    [
                        { text: 'Рассылка', callback_data: 'admin_broadcast_menu', icon_custom_emoji_id: '6043874504302661409' }
                    ],
                    [
                        { text: 'STOP (ЭКСТРЕННО)', callback_data: 'admin_emergency_stop', icon_custom_emoji_id: '5774077015388852135' }
                    ]
                ]
            }
        });
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
        await ctx.editMessageText(`<tg-emoji emoji-id="5774022692642492953">✅</tg-emoji> Диск очищен. Удалено файлов: ${count}`, { parse_mode: 'HTML' });
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

// --- CALLBACK-ОБРАБОТЧИКИ ДЛЯ РАССЫЛКИ ---

// Меню рассылки
bot.action('admin_broadcast_menu', async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');
    
    broadcastState = { step: 'awaiting_content', contentType: null, message: null, scheduleTime: null };
    
    await ctx.editMessageText('📢 <b>Создание рассылки</b>\n\nПожалуйста, отправьте боту любое сообщение, которое вы хотите разослать всем пользователям (это может быть текст, фото, видео, голосовое сообщение, аудиозапись, GIF или файл — как отдельным сообщением, так и с подписью).\n\n<i>Пришлите сообщение или нажмите «Отменить» ниже:</i>', {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[
                { text: 'Отменить', callback_data: 'admin_broadcast_cancel', icon_custom_emoji_id: '5774077015388852135' }
            ]]
        }
    });
});

// Отмена рассылки
bot.action('admin_broadcast_cancel', async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');
    
    broadcastState = { step: 'idle', contentType: null, message: null, scheduleTime: null };
    await ctx.answerCbQuery('Создание рассылки отменено.');
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const dailyCount = (stats.dailyUsers[today] || []).length;
        const allTimeCount = (stats.allTimeUsers || []).length;
        const downloadsCount = stats.totalDownloads || 0;
        const trafficGB = ((stats.totalTrafficBytes || 0) / (1024 * 1024 * 1024)).toFixed(2);
        const sortedLinks = Object.entries(stats.topLinks || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([domain, count], i) => `${i + 1}. <b>${domain}</b>: ${count} раз`)
            .join('\n');
        const usage = getSystemUsage();
        const diskStr = usage.diskUsageGB ? usage.diskUsageGB.toFixed(2) : "0.00";
        const activeJobsCount = Object.keys(jobStore).length;
        
        const report = `
<tg-emoji emoji-id="5397838301166078960">👤</tg-emoji> <b>Админ-панель Klyro</b>

<tg-emoji emoji-id="5400079672799165880">👥</tg-emoji> Юзеров сегодня: <b>${dailyCount}</b>
<tg-emoji emoji-id="5400079672799165880">👥</tg-emoji> Всего юзеров: <b>${allTimeCount}</b>
<tg-emoji emoji-id="5399862394698629054">✉️</tg-emoji> Всего загрузок: <b>${downloadsCount}</b>
<tg-emoji emoji-id="5805506958995758422">📁</tg-emoji> Общий трафик: <b>${trafficGB} ГБ</b>

<tg-emoji emoji-id="5399841684366329533">↖️</tg-emoji> Активных загрузок: <b>${activeJobsCount} / ${MAX_CONCURRENT_JOBS}</b>

<tg-emoji emoji-id="6043874504302661409">📤</tg-emoji> <b>Топ платформ:</b>
${sortedLinks || 'Пока нет данных'}

<tg-emoji emoji-id="5397637648883940852">⏲️</tg-emoji> <b>Сервер:</b>
CPU: ${usage.cpuUsage.toFixed(1)}% | RAM: ${usage.ramUsage.toFixed(1)}%
Диск (downloads): ${diskStr} ГБ
        `;
        
        await ctx.editMessageText(report, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🧹 Очистить диск', callback_data: 'admin_clear_disk' }
                    ],
                    [
                        { text: 'Рассылка', callback_data: 'admin_broadcast_menu', icon_custom_emoji_id: '6043874504302661409' }
                    ],
                    [
                        { text: 'STOP (ЭКСТРЕННО)', callback_data: 'admin_emergency_stop', icon_custom_emoji_id: '5774077015388852135' }
                    ]
                ]
            }
        });
    } catch (e) {
        await ctx.reply('Админка закрыта.');
    }
});



// Действие: Отправить сейчас
bot.action('broadcast_send_now', async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');
    if (!broadcastState.message) return ctx.reply('❌ Ошибка: Сообщение рассылки не найдено.');
    
    await ctx.reply('🚀 <b>Рассылка запущена!</b>\nПожалуйста, подождите, бот отправляет сообщения пользователям...', { parse_mode: 'HTML' });
    
    const fromChatId = broadcastState.message.chat.id;
    const messageId = broadcastState.message.message_id;
    
    broadcastState = { step: 'idle', contentType: null, message: null, scheduleTime: null };
    
    runBroadcast(fromChatId, messageId);
});

// Действие: Запланировать
bot.action('broadcast_schedule', async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');
    
    await ctx.editMessageText(`⏰ <b>Планирование рассылки</b>\n\nВыберите, через какое время отправить рассылку, или укажите время вручную:\n\n<i>Текущее время сервера: ${new Date().toLocaleString('ru-RU')}</i>`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '⏱ Через 10 минут', callback_data: 'broadcast_sched_val:10m' },
                    { text: '⏱ Через 1 час', callback_data: 'broadcast_sched_val:1h' }
                ],
                [
                    { text: '⏱ Через 3 часа', callback_data: 'broadcast_sched_val:3h' },
                    { text: '⏱ Через 12 часов', callback_data: 'broadcast_sched_val:12h' }
                ],
                [
                    { text: '📅 Через 1 день', callback_data: 'broadcast_sched_val:1d' },
                    { text: '📝 Указать время вручную', callback_data: 'broadcast_sched_val:manual' }
                ],
                [
                    { text: '❌ Отменить', callback_data: 'admin_broadcast_cancel' }
                ]
            ]
        }
    });
});

// Выбор быстрого интервала или вручную
bot.action(/^broadcast_sched_val:(.+)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');
    
    const val = ctx.match[1];
    
    if (val === 'manual') {
        broadcastState.step = 'awaiting_time';
        await ctx.editMessageText(`📝 <b>Укажите время вручную</b>\n\nПожалуйста, пришлите сообщение с точной датой и временем в формате:\n<code>ГГГГ-ММ-ДД ЧЧ:ММ</code>\n(например: <code>2026-06-15 14:30</code>)\n\n<i>Текущее время сервера: ${new Date().toLocaleString('ru-RU')}</i>`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Отменить', callback_data: 'admin_broadcast_cancel' }
                ]]
            }
        });
        return;
    }
    
    let offset = 0;
    if (val === '10m') offset = 10 * 60 * 1000;
    else if (val === '1h') offset = 60 * 60 * 1000;
    else if (val === '3h') offset = 3 * 60 * 60 * 1000;
    else if (val === '12h') offset = 12 * 60 * 60 * 1000;
    else if (val === '1d') offset = 24 * 60 * 60 * 1000;
    
    const targetDate = new Date(Date.now() + offset);
    broadcastState.scheduleTime = targetDate;
    broadcastState.step = 'awaiting_confirm_sched';
    
    await ctx.editMessageText(`📅 <b>Рассылка запланирована на:</b>\n<code>${targetDate.toLocaleString('ru-RU')}</code>\n\nВсе верно?`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Подтвердить планирование', callback_data: 'broadcast_confirm_sched' }
                ],
                [
                    { text: '❌ Отменить', callback_data: 'admin_broadcast_cancel' }
                ]
            ]
        }
    });
});

// Действие: Подтвердить планирование
bot.action('broadcast_confirm_sched', async (ctx) => {
    if (String(ctx.from.id) !== String(adminId)) return ctx.answerCbQuery('У вас нет прав');
    if (!broadcastState.message || !broadcastState.scheduleTime) {
        return ctx.reply('❌ Ошибка: Сообщение или время не найдены.');
    }
    
    const list = loadScheduledBroadcasts();
    list.push({
        id: randomUUID(),
        fromChatId: broadcastState.message.chat.id,
        messageId: broadcastState.message.message_id,
        scheduleTime: broadcastState.scheduleTime.toISOString(),
        createdAt: new Date().toISOString()
    });
    saveScheduledBroadcasts(list);
    
    const timeStr = broadcastState.scheduleTime.toLocaleString('ru-RU');
    broadcastState = { step: 'idle', contentType: null, message: null, scheduleTime: null };
    
    await ctx.editMessageText(`✅ <b>Успешно запланировано!</b>\n\nРассылка будет автоматически отправлена: <code>${timeStr}</code>`, { parse_mode: 'HTML' });
});

// Действие: Отмена конкретной загрузки пользователем
bot.action(/^cancel_(.+)$/, async (ctx) => {
    const jobId = ctx.match[1];
    
    if (jobStore[jobId]) {
        try {
            jobStore[jobId].kill('SIGKILL');
        } catch (e) {
            console.error("Ошибка при SIGKILL активного процесса:", e);
        }
        delete jobStore[jobId];
    }
    
    delete chatStore[jobId];
    delete progressStore[jobId];
    delete titleStore[jobId];
    
    try {
        await ctx.answerCbQuery('Загрузка отменена');
        await ctx.editMessageText('<tg-emoji emoji-id="5774077015388852135">❌</tg-emoji> Загрузка отменена пользователем.', { parse_mode: 'HTML' });
    } catch (e) { }
});

// Действие: Запуск скачивания с выбранными параметрами из чата
bot.action(/^dl_(.+)_(video|audio)_?(\d+)?$/, async (ctx) => {
    const pendingId = ctx.match[1];
    const format = ctx.match[2];
    const quality = ctx.match[3] || '1080';
    
    const task = pendingDownloads[pendingId];
    if (!task) {
        try {
            await ctx.answerCbQuery('⚠️ Ссылка устарела');
            await ctx.editMessageText('⚠️ Ссылка устарела. Пожалуйста, отправьте ссылку заново.');
        } catch (e) { }
        return;
    }
    
    delete pendingDownloads[pendingId];
    
    // Проверка лимита параллельных задач
    if (Object.keys(jobStore).length >= MAX_CONCURRENT_JOBS) {
        try {
            await ctx.answerCbQuery('⚠️ Сервер временно перегружен');
            await ctx.editMessageText('⚠️ Извините, сейчас сервер перегружен (превышен лимит параллельных загрузок). Пожалуйста, попробуйте через пару минут.');
        } catch (e) { }
        return;
    }
    
    try {
        await ctx.answerCbQuery('Запуск загрузки...');
        await ctx.deleteMessage();
    } catch (e) { }
    
    const jobId = randomUUID();
    startDownloadJob({ 
        url: task.url, 
        chatId: task.chatId, 
        format, 
        quality, 
        title: task.title, 
        jobId 
    });
});

// Функция запуска задачи скачивания и отправки
async function startDownloadJob({ url, chatId, format = 'video', quality = '1080', title = 'video', jobId = null }) {
    if (!jobId) jobId = randomUUID();

    // Проверка лимита параллельных задач
    if (Object.keys(jobStore).length >= MAX_CONCURRENT_JOBS) {
        try {
            await bot.telegram.sendMessage(chatId, '⚠️ Извините, сейчас сервер перегружен (выполняется слишком много параллельных загрузок). Пожалуйста, попробуйте через пару минут.');
        } catch (e) { }
        return;
    }

    titleStore[jobId] = title || 'video';
    chatStore[jobId] = chatId; // Запоминаем для отмены

    // Трекинг
    const parsedChatId = parseInt(chatId);
    trackUser(parsedChatId);
    trackLink(url);

    let progressInterval = null;
    try {
        let statusMessageId = null;
        try {
            const statusMsg = await bot.telegram.sendMessage(chatId, '<tg-emoji emoji-id="5944753741512052670">📷</tg-emoji> Готовлю ваше медиа...', {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        {
                            text: 'Отменить',
                            callback_data: `cancel_${jobId}`,
                            icon_custom_emoji_id: '5774077015388852135'
                        }
                    ]]
                }
            });
            statusMessageId = statusMsg.message_id;
        } catch (msgErr) {
            console.warn(`[⚠️] Не удалось отправить статусное сообщение пользователю ${chatId}:`, msgErr.message);
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
                '--concurrent-fragments', '16',
                '-f', `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best`,
                '--merge-output-format', 'mp4',
                '--format-sort', 'vcodec:h264,res,br',
                '--no-playlist',
                '--progress',
                '--newline',
                '--buffer-size', '16M',
                '--no-mtime',
                '--external-downloader', 'aria2c',
                '--external-downloader-args', 'aria2c:-x 8 -s 8 -k 1M',
                '-o', outputTemplate,
                url
            ];
        }

        const cookiesPath = path.join(__dirname, 'data', 'cookies.txt');
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
            const lines = str.split(/[\r\n]+/);
            
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (!line) continue;
                
                // 1. Поиск стандартного процента (%)
                const pctMatch = line.match(/(\d+(\.\d+)?)%/);
                if (pctMatch) {
                    const val = parseFloat(pctMatch[1]);
                    if (!progressStore[jobId] || val > progressStore[jobId]) {
                        progressStore[jobId] = val;
                    }
                    break;
                }
                
                // 2. Поиск HLS-фрагментов (например, "Fragment 12 of 120")
                const fragMatch = line.match(/Fragment\s+(\d+)\s+of\s+(\d+)/i);
                if (fragMatch) {
                    const current = parseInt(fragMatch[1], 10);
                    const total = parseInt(fragMatch[2], 10);
                    if (total > 0) {
                        const val = Math.round((current / total) * 100 * 10) / 10;
                        if (!progressStore[jobId] || val > progressStore[jobId]) {
                            progressStore[jobId] = val;
                        }
                    }
                    break;
                }
            }
        };

        ytDlp.stdout.on('data', handleOutput);
        ytDlp.stderr.on('data', (d) => {
            ytStderr += d.toString();
            handleOutput(d);
        });

        // Интервал обновления статуса скачивания в самом Telegram (раз в 3 секунды)
        let lastEditedProgress = -1;
        let lastEditTime = 0;
        progressInterval = setInterval(async () => {
            const currentProgress = progressStore[jobId];
            if (currentProgress === undefined) return;
            
            const now = Date.now();
            if (Math.floor(currentProgress) !== Math.floor(lastEditedProgress) && (now - lastEditTime > 3000)) {
                lastEditedProgress = currentProgress;
                lastEditTime = now;
                if (statusMessageId) {
                    try {
                        await bot.telegram.editMessageText(
                            chatId, 
                            statusMessageId, 
                            undefined, 
                            `<tg-emoji emoji-id="5944753741512052670">📷</tg-emoji> Скачиваю ваше медиа: ${Math.floor(currentProgress)}%...`,
                            {
                                parse_mode: 'HTML',
                                reply_markup: {
                                    inline_keyboard: [[
                                        {
                                            text: 'Отменить',
                                            callback_data: `cancel_${jobId}`,
                                            icon_custom_emoji_id: '5774077015388852135'
                                        }
                                    ]]
                                }
                            }
                        );
                    } catch (e) { }
                }
            }
        }, 1000);

        ytDlp.on('close', async (code) => {
            if (progressInterval) clearInterval(progressInterval);
            
            // Если задание уже удалено (например, отменено вручную)
            if (!chatStore[jobId]) {
                delete jobStore[jobId];
                return;
            }
            
            delete jobStore[jobId];

            if (code !== 0) {
                console.error(`🔴 [yt-dlp error] Code: ${code} | JobId: ${jobId}`);
                console.error(`Stderr: ${ytStderr}`);
                try { await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `<tg-emoji emoji-id="5774077015388852135">❌</tg-emoji> Ошибка загрузки.\n\nДетали: ${ytStderr.substring(0, 100)}...`, { parse_mode: 'HTML' }); } catch (e) { }
                delete chatStore[jobId];
                delete progressStore[jobId];
                delete titleStore[jobId];
                return;
            }

            progressStore[jobId] = 100;

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
                try { await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `<tg-emoji emoji-id="5774077015388852135">❌</tg-emoji> Ошибка: Файл не найден после загрузки.`, { parse_mode: 'HTML' }); } catch (e) { }
                delete chatStore[jobId];
                delete progressStore[jobId];
                delete titleStore[jobId];
                return;
            }

            const filePath = path.join(downloadsDir, downloadedFiles[0]);
            const statsInfo = fs.statSync(filePath);
            const fileSizeMB = statsInfo.size / (1024 * 1024);

            if (statsInfo.size === 0) {
                console.error(`🔴 [Error] Файл ${filePath} имеет размер 0 байт.`);
                try { await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `<tg-emoji emoji-id="5774077015388852135">❌</tg-emoji> Ошибка: Скачанный файл пуст (0 байт).`, { parse_mode: 'HTML' }); } catch (e) { }
                if (fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch (e) { }
                }
                delete chatStore[jobId];
                delete progressStore[jobId];
                delete titleStore[jobId];
                return;
            }

            stats.totalTrafficBytes += statsInfo.size;
            stats.totalDownloads += 1;
            saveStats();

            if (statusMessageId) {
                try {
                    await bot.telegram.editMessageText(chatId, statusMessageId, undefined, `<tg-emoji emoji-id="6043874504302661409">📤</tg-emoji> Медиа (${fileSizeMB.toFixed(1)}МБ) готово! Отправляю...`, { parse_mode: 'HTML' });
                } catch (e) { }
            }

            try {
                const domain = webAppUrl ? webAppUrl.replace(/\/$/, '') : '';
                const link = `${domain}/get/${encodeURIComponent(path.basename(filePath))}`;

                if (fileSizeMB < 49.5) {
                    const captionText = `<tg-emoji emoji-id="5944753741512052670">📷</tg-emoji> <b>${titleStore[jobId] || (format === 'audio' ? 'аудио' : 'видео')}</b>\n\n<tg-emoji emoji-id="5805506958995758422">📁</tg-emoji> Размер: ${fileSizeMB.toFixed(1)} МБ\n\n<tg-emoji emoji-id="5774022692642492953">✅</tg-emoji> <a href="${link}">Прямая ссылка на скачивание</a>`;
                    
                    if (format === 'audio') {
                        await bot.telegram.sendAudio(chatId, { source: filePath }, {
                            caption: captionText,
                            parse_mode: 'HTML'
                        });
                    } else {
                        await bot.telegram.sendVideo(chatId, { source: filePath }, {
                            supports_streaming: true,
                            caption: captionText,
                            parse_mode: 'HTML'
                        });
                    }
                    if (statusMessageId) {
                        try { await bot.telegram.deleteMessage(chatId, statusMessageId); } catch (e) { }
                    }
                } else {
                    // Большой файл: отправляем красивое уведомление со ссылкой на скачивание
                    const msgText = `<tg-emoji emoji-id="5944753741512052670">📷</tg-emoji> <b>${titleStore[jobId] || (format === 'audio' ? 'аудио' : 'видео')}</b>\n\n<tg-emoji emoji-id="5805506958995758422">📁</tg-emoji> Размер файла: <b>${fileSizeMB.toFixed(1)} МБ</b>\n\n<tg-emoji emoji-id="5774022692642492953">✅</tg-emoji> <i>Из-за ограничений Telegram файлы крупнее 50 МБ бот отправляет в виде прямой ссылки для автоматического скачивания на ваше устройство:</i>\n\n👉 <a href="${link}">Скачать медиафайл</a>`;
                    
                    if (statusMessageId) {
                        try {
                            await bot.telegram.editMessageText(chatId, statusMessageId, undefined, msgText, { parse_mode: 'HTML' });
                        } catch (e) {
                            try { await bot.telegram.sendMessage(chatId, msgText, { parse_mode: 'HTML' }); } catch (e2) { }
                        }
                    } else {
                        await bot.telegram.sendMessage(chatId, msgText, { parse_mode: 'HTML' });
                    }
                }
            } catch (err) {
                console.error("Ошибка отправки:", err);
                const domain = webAppUrl ? webAppUrl.replace(/\/$/, '') : '';
                const link = `${domain}/get/${encodeURIComponent(path.basename(filePath))}`;
                const errDetail = err.message ? ` (${err.message})` : '';
                const failMsg = `⚠️ Не удалось отправить файл в чат${errDetail}.\n\nНо вы можете скачать его по прямой ссылке:\n👉 <a href="${link}">Скачать медиафайл</a>`;

                if (statusMessageId) {
                    try {
                        await bot.telegram.editMessageText(chatId, statusMessageId, undefined, failMsg, { parse_mode: 'HTML' });
                    } catch (e) {
                        try { await bot.telegram.sendMessage(chatId, failMsg, { parse_mode: 'HTML' }); } catch (e2) { }
                    }
                } else {
                    try { await bot.telegram.sendMessage(chatId, failMsg, { parse_mode: 'HTML' }); } catch (e) { }
                }
            }

            setTimeout(() => {
                if (fs.existsSync(filePath)) {
                    try { fs.unlinkSync(filePath); } catch (e) { }
                }
                delete progressStore[jobId];
                delete titleStore[jobId];
                delete chatStore[jobId];
            }, 60 * 60 * 1000);
        });
    } catch (e) {
        console.error(e);
        if (progressInterval) clearInterval(progressInterval);
        delete jobStore[jobId];
        delete chatStore[jobId];
        delete progressStore[jobId];
        delete titleStore[jobId];
    }
}

// Обработчик ссылок, присланных сообщением в бот
bot.on('text', async (ctx) => {
    const text = ctx.message.text ? ctx.message.text.trim() : '';
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urlMatch = text.match(urlRegex);
    
    if (urlMatch) {
        const url = urlMatch[0];
        const chatId = ctx.chat.id;
        
        // Проверяем лимит параллельных задач
        if (Object.keys(jobStore).length >= MAX_CONCURRENT_JOBS) {
            ctx.reply('⚠️ Извините, сейчас сервер перегружен (выполняется слишком много параллельных загрузок). Пожалуйста, попробуйте через пару минут.').catch(() => {});
            return;
        }
        
        // 1. Попытка быстро узнать заголовок видео
        let title = 'видео';
        try {
            title = await new Promise((resolve) => {
                const args = [
                    '--js-runtime', 'node',
                    '-j',
                    '--skip-download',
                    '--no-playlist',
                    '--no-check-certificate',
                    '--prefer-free-formats',
                    '--youtube-skip-dash-manifest',
                    url
                ];
                const cookiesPath = path.join(__dirname, 'data', 'cookies.txt');
                if (fs.existsSync(cookiesPath)) {
                    try {
                        const stat = fs.statSync(cookiesPath);
                        if (stat.isFile()) args.unshift('--cookies', cookiesPath);
                    } catch (e) { }
                }
                
                const ytDlp = spawn('yt-dlp', args);
                let out = '';
                ytDlp.stdout.on('data', (d) => { out += d.toString(); });
                ytDlp.on('close', () => {
                    try {
                        const i = JSON.parse(out);
                        resolve(i.title || 'видео');
                    } catch (e) {
                        resolve('видео');
                    }
                });
                setTimeout(() => {
                    try { ytDlp.kill('SIGKILL'); } catch(e){}
                    resolve('видео');
                }, 3000); // Ограничиваем получение названия 3 секундами
            });
        } catch (e) {
            console.error("Ошибка при получении названия для сообщения:", e.message);
        }
        
        // Создаем временную задачу ожидания формата
        const pendingId = randomUUID();
        pendingDownloads[pendingId] = { url, chatId, title };
        
        // Очищаем через 10 минут
        setTimeout(() => {
            if (pendingDownloads[pendingId]) delete pendingDownloads[pendingId];
        }, 10 * 60 * 1000);

        // Отправляем меню выбора формата и качества
        await ctx.replyWithHTML(`<tg-emoji emoji-id="5944753741512052670">📷</tg-emoji> <b>Выберите формат скачивания:</b>\n\n<tg-emoji emoji-id="5805506958995758422">📁</tg-emoji> Название: <i>${title}</i>`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Видео 1080p', callback_data: `dl_${pendingId}_video_1080`, icon_custom_emoji_id: '5794164805065514131' },
                        { text: 'Видео 720p', callback_data: `dl_${pendingId}_video_720`, icon_custom_emoji_id: '5794085322400733645' }
                    ],
                    [
                        { text: 'Видео 480p', callback_data: `dl_${pendingId}_video_480`, icon_custom_emoji_id: '5794280000383358988' },
                        { text: 'Аудио (MP3)', callback_data: `dl_${pendingId}_audio`, icon_custom_emoji_id: '5805506958995758422' }
                    ]
                ]
            }
        }).catch(() => {});
    } else {
        if (text.startsWith('/')) return; // Игнорируем команды
        ctx.reply('Отправьте мне ссылку на видео (например, с YouTube, Rutube, TikTok и др.), и я скачаю его для вас! 🎬').catch(() => {});
    }
});

// API для скачивания
app.post('/api/download', async (req, res) => {
    const { url, chatId, format, quality, title } = req.body;
    
    // Проверяем лимит параллельных задач
    if (Object.keys(jobStore).length >= MAX_CONCURRENT_JOBS) {
        return res.status(429).json({ error: 'Сервер перегружен. Пожалуйста, подождите завершения текущих загрузок.' });
    }

    const jobId = randomUUID();
    res.json({ jobId });
    
    // Запускаем асинхронную загрузку
    startDownloadJob({ url, chatId, format, quality, title, jobId });
});

app.post('/api/cancel', async (req, res) => {
    const { jobId } = req.body;
    if (jobStore[jobId]) {
        jobStore[jobId].kill('SIGKILL');
        delete jobStore[jobId];

        // Уведомление об отмене
        const cid = chatStore[jobId];
        if (cid) {
            bot.telegram.sendMessage(cid, '<tg-emoji emoji-id="5774077015388852135">❌</tg-emoji> Загрузка отменена.', { parse_mode: 'HTML' }).catch(() => { });
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
    const cookiesPath = path.join(__dirname, 'data', 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        try {
            const stat = fs.statSync(cookiesPath);
            if (stat.isFile()) args.unshift('--cookies', cookiesPath);
        } catch (e) { }
    }
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

process.once('SIGINT', () => { bot.stop(); });
process.once('SIGTERM', () => { bot.stop(); });
