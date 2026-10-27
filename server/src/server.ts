
import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();

const PORT = Number(process.env.PORT) || 5000;

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  })
);

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Warrior Fitness API is running",
  });
});

// Start server
app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Server running at http://localhost:${PORT}`
  );
});
