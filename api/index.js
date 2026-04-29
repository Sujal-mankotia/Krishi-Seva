const serverModule = require('../src/server/index.js');

// Ensure DB is connected before handling requests
let dbInitialized = false;

module.exports = async (req, res) => {
  if (!dbInitialized) {
    try {
      await serverModule.connectDatabase();
      await serverModule.ensureCollectionsInitialized();
      dbInitialized = true;
    } catch (err) {
      console.error('Failed to initialize database on Vercel:', err);
      return res.status(500).json({ error: 'Database connection failed' });
    }
  }
  
  // Forward to Express app
  return serverModule.app(req, res);
};
