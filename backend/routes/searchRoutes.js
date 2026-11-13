const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { verifyToken } = require("../middleware/authMiddleware");
const { searchForUser } = require("../services/universalSearchService");

const router = express.Router();
router.get("/", verifyToken, rateLimit({ windowMs: 60_000, limit: 30,
  standardHeaders: "draft-8", legacyHeaders: false }), async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.set("Vary", "Authorization");
    res.json({ results: await searchForUser(req.user, req.query.q) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    return next(error);
  }
});

module.exports = router;
