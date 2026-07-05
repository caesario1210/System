const { start, app } = require('./src/app');

async function handler(req, res) {
  try {
    await start();
    return app(req, res);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

module.exports = handler;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  start().then(() => {
    app.listen(PORT, () => {
      console.log(`EstateOS Real Estate Management running on http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
