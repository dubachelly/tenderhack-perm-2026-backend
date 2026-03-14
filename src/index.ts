import "dotenv/config";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerDocument } from "./swagger";
import steRouter from "./routes/ste";
import contractsRouter from "./routes/contracts";
import searchRouter from "./routes/search";
import applicationsRouter from "./routes/applications";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/docs/swagger.json", (_req, res) => {
  res.json(swaggerDocument);
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  swaggerOptions: { url: "/docs/swagger.json" },
}));

app.use("/ste", steRouter);
app.use("/contracts", contractsRouter);
app.use("/search", searchRouter);
app.use("/applications", applicationsRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Swagger UI:    http://localhost:${PORT}/docs`);
});
