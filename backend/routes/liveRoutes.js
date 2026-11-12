const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const live = require("../services/liveEventService");
const presence = require("../services/editPresenceService");

const router = express.Router();
router.get("/stream", verifyToken, live.stream);
router.get("/presence/cleanup", presence.cleanup);
router.get("/presence", verifyToken, presence.list);
router.post("/presence", verifyToken, presence.heartbeat);
router.delete("/presence/:clientId", verifyToken, presence.leave);
module.exports = router;
