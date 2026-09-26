import { buildApp } from "./http.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildApp();
app
  .listen({ port, host })
  .then((addr) => {
    console.log(`waterhammer service listening at ${addr}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
