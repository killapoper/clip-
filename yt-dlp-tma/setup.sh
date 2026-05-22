#!/bin/bash

# Скрипт для быстрой настройки сервера и запуска бота в Docker
# Использование: bash setup.sh

echo "🚀 Начинаю настройку сервера..."

# 1. Проверка и установка Docker
if ! [ -x "$(command -v docker)" ]; then
    echo "📦 Устанавливаю Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "✅ Docker установлен."
else
    echo "✅ Docker уже установлен."
fi

# 2. Проверка Docker Compose
if ! docker compose version > /dev/null 2>&1; then
    echo "📦 Устанавливаю Docker Compose..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
    echo "✅ Docker Compose установлен."
else
    echo "✅ Docker Compose уже установлен."
fi

# 3. Подготовка необходимых файлов (чтобы Docker не создал их как папки)
echo "📂 Подготовка файлов данных..."

if [ ! -f stats.json ]; then
    echo '{"totalTrafficBytes": 0, "dailyUsers": {}, "topLinks": {}, "totalDownloads": 0}' > stats.json
    echo "📝 Создан пустой stats.json"
fi

if [ ! -f cookies.txt ]; then
    touch cookies.txt
    echo "📝 Создан пустой cookies.txt"
fi

if [ ! -f session.txt ]; then
    touch session.txt
    echo "📝 Создан пустой session.txt"
fi

if [ ! -f .env ]; then
    echo "⚠️ ВНИМАНИЕ: Файл .env не найден! Убедитесь, что вы создали его и заполнили BOT_TOKEN."
fi

# 4. Запуск контейнера
echo "🏗 Сборка и запуск контейнера..."
sudo docker compose up -d --build

echo "-------------------------------------------------------"
echo "🎉 ВСЁ ГОТОВО! Бот запущен в фоновом режиме."
echo "-------------------------------------------------------"
echo "Полезные команды:"
echo "  docker compose logs -f    - Просмотр логов"
echo "  docker compose stop       - Остановка бота"
echo "  docker compose start      - Запуск остановленного бота"
echo "  docker compose ps         - Статус контейнера"
echo "-------------------------------------------------------"
