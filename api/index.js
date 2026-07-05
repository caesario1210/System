const { start, app } = require('../server');

module.exports = async (req, res) => {
  await start();
  return app(req, res);
};
