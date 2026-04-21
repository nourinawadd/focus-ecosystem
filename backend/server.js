import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db.js";
import express from "express";

dotenv.config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());

app.get("/test", (req, res) => {
  res.json({ message: "API working" });
});

connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});