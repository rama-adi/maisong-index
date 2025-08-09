import path from "path";
import { fileURLToPath } from "url";
import { readdirSync } from "fs";
import { BaseQueue, type QueueConstructor } from "@/queues/base-queue.js";

// Dynamically import every *.queue.ts file in /queues and build a registry
export async function loadQueues() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const queuesDir = path.join(__dirname, "..", "queues");

  const files = readdirSync(queuesDir)
    .filter((f) => f.endsWith(".queue.ts") || f.endsWith(".queue.js"));

  const registry: Record<string, QueueConstructor<any>> = {};

  for (const file of files) {
    const modulePath = path.join(queuesDir, file);
    try {
      const mod = await import(modulePath);

      for (const exported of Object.values(mod)) {
        if (
          typeof exported === "function" &&
          exported.prototype instanceof BaseQueue
        ) {
          const cls = exported as unknown as QueueConstructor<any> & { name: string };
          if (cls.name) {
            registry[cls.name] = cls;
          }
        }
      }
    } catch (error) {
      console.warn(`[QueueRegistry] Failed to load ${modulePath}:`, error);
    }
  }
  return registry;
}