const express = require("express");
const cors = require("cors");
const path = require("node:path");
const { rateLimit } = require("express-rate-limit");

require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("./config/storeModes").validateStoreModes();

const { getJwtSecret } = require("./config/jwtSecret");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const auditRoutes = require("./routes/auditRoutes");
const planningRoutes = require("./routes/planningRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const riskRoutes = require("./routes/riskRoutes");
const controlRoutes = require("./routes/controlRoutes");
const findingRoutes = require("./routes/findingRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const actionRoutes = require("./routes/actionRoutes");
const evidenceRoutes = require("./routes/evidenceRoutes");
const assistantRoutes = require("./routes/assistantRoutes");
const orgUnitRoutes = require("./routes/orgUnitRoutes");
const riskLibraryRoutes = require("./routes/riskLibraryRoutes");

const app = express();

app.set("trust proxy", 1); // 1 = one proxy hop in front of your app

app.use(cors());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Demasiadas solicitudes. Intenta más tarde.",
    code: "API_RATE_LIMITED"
  }
}));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/planning", planningRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/risks", riskRoutes);
app.use("/api/controls", controlRoutes);
app.use("/api/findings", findingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/actions", actionRoutes);
app.use("/api/evidence", evidenceRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/org-units", orgUnitRoutes);
app.use("/api/risk-library", riskLibraryRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "VERA API funcionando correctamente"
  });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.too.large") return res.status(413).json({ message: "El archivo supera el límite de 3 MB." });
  if (error.evidenceStorage) return res.status(error.status).json({ message: error.message });
  if (error.planningStorage) return res.status(error.status).json({ message: error.message });
  if (error.userStorage) return res.status(error.status).json({ message: error.message });
  if (error.roleRequestStorage) return res.status(error.status).json({ message: error.message });
  if (error.domainStorage) return res.status(error.status).json({ message: error.message });
  if (error.action) return res.status(error.status).json({ message: error.message });
  if (error.domainStorage) return res.status(error.status).json({ message: error.message });
  if (error.auditStorage) return res.status(error.status).json({ message: error.message });
  next(error);
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  getJwtSecret();
  app.listen(PORT, () => {
    console.log(`VERA backend ejecutándose en http://localhost:${PORT}`);
  });
}

module.exports = app;
