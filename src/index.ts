import "dotenv/config";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { swaggerDocument } from "./swagger";
import steRouter from "./routes/ste";
import contractsRouter from "./routes/contracts";
import searchRouter from "./routes/search";
import applicationsRouter from "./routes/applications";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use("/ste", steRouter);
app.use("/contracts", contractsRouter);
app.use("/search", searchRouter);
app.use("/applications", applicationsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Swagger UI:    http://localhost:${PORT}/docs`);
});
