const { fetchOpenSheet } = require('./_opensheet');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  await fetchOpenSheet('SHEET_ID_PENDING', 'SHEET_NAME_PENDING', req, res);
};
