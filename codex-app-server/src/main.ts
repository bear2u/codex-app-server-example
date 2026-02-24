import "dotenv/config";
import { createApp } from "./app";
import { loadEnv } from "./config/env";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await createApp(env);

  const shutdown = async () => {
    app.log.info("Shutting down codex-app-server");
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: env.host, port: env.port });
  app.log.info({ host: env.host, port: env.port }, "codex-app-server listening");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
