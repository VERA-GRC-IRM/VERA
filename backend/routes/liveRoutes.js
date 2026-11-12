const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const live = require("../services/liveEventService");

const router = express.Router();
router.get("/stream", verifyToken, live.stream);
module.exports = router;
