import path from "path";
import { fileURLToPath } from "url";
import { readdirSync } from "fs";
import { BaseQueue } from "@/queues/base-queue.js";

// Dynamically import every *.queue.ts file in /queues and build a registry
export async function loadQueues() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const queuesDir = path.join(__dirname, "..", "queues");

  const files = readdirSync(queuesDir)
    .filter((f) => f.endsWith(".queue.ts") || f.endsWith(".queue.js"));

  const registry: Record<string, typeof BaseQueue<any>> = {};

  for (const file of files) {
    const modulePath = path.join(queuesDir, file);
    const mod = await import(modulePath);

    for (const exported of Object.values(mod)) {
      if (
        typeof exported === "function" &&
        exported.prototype instanceof BaseQueue
      ) {
        const cls = exported as unknown as typeof BaseQueue<any> & { name: string };
        if (cls.name) {
          registry[cls.name] = cls;
        }
      }
    }
  }
  return registry;
}