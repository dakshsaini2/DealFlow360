import express from "express";
import {
  errorHandler,
  notFoundHandler,
} from "./common/middleware/error.middleware.js";
import { env } from "./common/utils/env.js";
import { disconnectPrisma } from "./common/utils/prisma.js";
import { authRouter } from "./modules/auth/auth.routes.js";

const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  });
}
