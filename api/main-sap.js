const { requireAuth } = require('./_auth');

const { fetchOpenSheet } = require('./_opensheet');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  await fetchOpenSheet('SHEET_ID_MAIN_SAP', 'SHEET_NAME_MAIN_SAP', req, res);
};
