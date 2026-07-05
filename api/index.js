const { start, app } = require('../server');

module.exports = async (req, res) => {
  try {
    await start();
    return app(req, res);
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};