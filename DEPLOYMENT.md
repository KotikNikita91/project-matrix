# Инструкция по развертыванию

## Вариант 1: GitHub Pages (рекомендуется)

### Шаги:

1. **Создайте репозиторий на GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/ВАШ_USERNAME/ВАШ_РЕПОЗИТОРИЙ.git
   git push -u origin main
   ```

2. **Активируйте GitHub Pages**
   - Откройте Settings репозитория
   - Перейдите в раздел Pages
   - В Source выберите "main" branch
   - Сохраните

3. **Готово!**
   Сайт будет доступен по адресу:
   ```
   https://ВАШ_USERNAME.github.io/ВАШ_РЕПОЗИТОРИЙ/
   ```

## Вариант 2: Netlify

### Шаги:

1. **Перейдите на** [netlify.com](https://netlify.com)
2. **Нажмите** "Add new site" → "Deploy manually"
3. **Перетащите** папку с файлами (index.html, app.js, style.css)
4. **Готово!** Netlify автоматически сгенерирует URL

### Преимущества Netlify:
- ✅ Бесплатно
- ✅ HTTPS по умолчанию
- ✅ Автоматические обновления при push
- ✅ Собственный домен

## Вариант 3: Vercel

### Шаги:

1. **Перейдите на** [vercel.com](https://vercel.com)
2. **Импортируйте** Git репозиторий или загрузите файлы
3. **Deploy!**

## Вариант 4: Локальный сервер

Для тестирования локально:

```bash
# Python 3
python -m http.server 8000

# Node.js (если установлен)
npx http-server

# PHP
php -S localhost:8000
```

Откройте браузер: `http://localhost:8000`

## Структура для деплоя

Минимально необходимые файлы:
```
project/
├── index.html
├── app.js
├── style.css
└── README.md (опционально)
```

## Настройка после деплоя

1. Откройте сайт
2. Введите ID вашей Google Sheets таблицы
3. Убедитесь, что таблица публична
4. Нажмите "Сохранить и загрузить"

## Обновление данных

Приложение загружает данные напрямую из Google Sheets.
Для обновления данных:
1. Измените таблицу в Google Sheets
2. Обновите страницу в браузере (F5)

Никакого повторного деплоя не требуется!

## Troubleshooting

### CORS ошибки

Если возникают ошибки CORS при локальном тестировании:
- Используйте локальный сервер (см. Вариант 4)
- Или разверните на GitHub Pages/Netlify

### Таблица не загружается

1. Проверьте, что таблица публична
2. Проверьте ID таблицы
3. Откройте консоль браузера (F12) для деталей

## Кастомный домен

### GitHub Pages:
Settings → Pages → Custom domain

### Netlify:
Domain settings → Add custom domain

### Vercel:
Settings → Domains → Add Domain

---

**Готово!** Ваше приложение теперь доступно онлайн 🚀
