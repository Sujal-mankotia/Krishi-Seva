const serverModule = require('./src/server');

if (require.main === module) {
  serverModule.startApp().catch(() => {
    process.exit(1);
  });
}

module.exports = serverModule;
