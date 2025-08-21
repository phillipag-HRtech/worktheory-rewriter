// CONNECTIVITY TEST: works with GET, POST, and handles CORS
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  return res.status(200).json({ ok: true, route: "/api/rewrite", method: req.method });
};
