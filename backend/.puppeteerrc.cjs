const { join } = require('path');

/**
 * Puppeteer cache config.
 * On Render, we keep Chrome inside the project directory so it
 * survives between builds and is not lost in /root/.cache.
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
