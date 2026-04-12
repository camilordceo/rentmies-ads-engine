/**
 * Vercel entrypoint — satisfies Express framework detection.
 * All routing is handled by api/ serverless functions + vercel.json rewrites.
 * This handler is never reached in practice.
 */
const express = require('express')
const app = express()
app.all('*', (req, res) => res.status(404).json({ error: 'Use /api/* endpoints' }))
module.exports = app
