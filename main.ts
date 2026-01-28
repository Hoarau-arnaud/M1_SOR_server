import { Application, Router } from "@oak/oak";
import { oakCors } from "@tajpouria/cors";
import pollsRouter from "./routes/polls.ts";
import { ok } from "./types/api.ts";
const app = new Application();
app.use(oakCors());

// Root router (health + hello)
const root = new Router();
root.get("/", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = ok({ message: "Hello, World" });
});
root.get("/health", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = ok({ ok: true });
});

// (optionnel) ws -> tu pourras faire routes/ws.ts plus tard
// Ici on laisse simple pour TP2

app.use(root.routes());
app.use(root.allowedMethods());

app.use(pollsRouter.routes());
app.use(pollsRouter.allowedMethods());

const HOSTNAME = "127.0.0.1";
const PORT = 8000;
const ADDRESS = `http://${HOSTNAME}:${PORT}`;

app.addEventListener("listen", () => console.log(`Server listening on ${ADDRESS}`));

if (import.meta.main) {
  await app.listen({ hostname: HOSTNAME, port: PORT });
}

export { app };
