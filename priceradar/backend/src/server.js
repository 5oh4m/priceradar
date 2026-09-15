import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import searchRoute from "./routes/search.js";
import productRoute from "./routes/product.js";
import statusRoute from "./routes/status.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api/search", searchRoute);
app.use("/api/products", productRoute);
app.use("/api/status", statusRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`PriceRadar backend running on http://localhost:${PORT}`);
});
