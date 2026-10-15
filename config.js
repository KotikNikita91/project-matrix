/**
 * Настройки сайта. Заполняется ОДИН РАЗ и больше не меняется:
 * при обновлении app.js этот файл трогать не нужно — URL не потеряется.
 */
window.MATRIX_CONFIG = {
  // Загрузка данных через GAS. Нужна только вне GitHub Pages (gitverse, gitflic...).
  // На github.io оставить пустым.
  GAS_PROXY_URL: '',

  // Счётчик посещений: сюда URL веб-приложения Google Apps Script
  // вида 'https://script.google.com/macros/s/XXXX/exec'
  GAS_COUNTER_URL: ''
};
