// Vercel entrypoint shim — routing is handled by api/ functions + vercel.json rewrites.
// This file is never actually called; all requests are intercepted by vercel.json.
module.exports = (req, res) => res.status(404).end()
