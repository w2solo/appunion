import { app } from "./app.js";
import { seed } from "./seed.js";
import { runScheduled } from "./scheduled.js";

let seeded = false;

async function ensureSeed(env: Env) {
  if (seeded) return;
  await seed(env.DB);
  seeded = true;
}

export default {
  async fetch(request, env) {
    await ensureSeed(env);
    return app.fetch(request, env);
  },
  async scheduled(controller, env) {
    await ensureSeed(env);
    await runScheduled(controller.cron, env);
  },
} satisfies ExportedHandler<Env>;
