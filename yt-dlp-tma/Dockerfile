# Используем легкий образ Node.js
FROM node:20-slim

# Устанавливаем системные зависимости: Python (для yt-dlp) и FFmpeg (для обработки видео)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    aria2 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем yt-dlp через pip3 (используем флаг для обхода ограничений в Docker)
RUN pip3 install yt-dlp --break-system-packages

# Создаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package*.json ./

# Устанавливаем npm-пакеты
RUN npm install --production

# Копируем исходный код приложения
COPY . .

# Создаем папку для загрузок и даем права (на всякий случай)
RUN mkdir -p downloads && chmod 777 downloads

# Приложение слушает на 3000 порту
EXPOSE 3000

# Запуск приложения
CMD ["npm", "start"]
