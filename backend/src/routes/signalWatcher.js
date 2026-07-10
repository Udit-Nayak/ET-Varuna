// backend/src/routes/signalWatcher.js
const express = require('express');
const router = express.Router();

router.get('/signal-watcher/:corridor', async (req, res) => {
  try {
    const response = await fetch(`http://localhost:8001/signal-watcher/${req.params.corridor}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Signal Watcher service unavailable' });
  }
});

module.exports = router;