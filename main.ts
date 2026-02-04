// server/main.ts
import { Application, Router } from "@oak/oak";
import { oakCors } from "@tajpouria/cors";

import { errorMiddleware } from "./middlewares/error_middleware.ts";

import pollsRouter from "./routes/polls.ts";
import usersRouter from "./routes/users.ts";
import optionsRouter from "./routes/options.ts";
import votesRouter from "./routes/votes.ts";
import { ok } from "./types/api.ts";
import { entropyMiddleware } from "./middlewares/entropy_middleware.ts";

const app = new Application();

app.use(oakCors());
app.use(errorMiddleware);
app.use(entropyMiddleware);

// Routes "root"
const root = new Router();
root.get("/", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = ok({ message: "Hello, World" });
});
root.get("/health", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = ok({ ok: true });
});

app.use(root.routes(), root.allowedMethods());

// Routes modules
app.use(usersRouter.routes(), usersRouter.allowedMethods());
app.use(pollsRouter.routes(), pollsRouter.allowedMethods());
app.use(optionsRouter.routes(), optionsRouter.allowedMethods());
app.use(votesRouter.routes(), votesRouter.allowedMethods());

const HOSTNAME = "127.0.0.1";
const PORT = 8000;
const ADDRESS = `http://${HOSTNAME}:${PORT}`;

app.addEventListener("listen", () => console.log(`Server listening on ${ADDRESS}`));

if (import.meta.main) {
  await app.listen({ hostname: HOSTNAME, port: PORT });
}

export { app };
