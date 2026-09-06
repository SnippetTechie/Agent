import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Automatically starts the local screenshot receiver server (server/receiver.py)
 * when `vite` dev server starts, and cleans it up when the dev server stops.
 */
function receiverPlugin(): Plugin {
  let proc: ChildProcess | null = null;
  return {
    name: "varma-receiver-runner",
    apply: "serve", // active during dev only, omitted during build
    configureServer(server) {
      const receiverScript = path.resolve(__dirname, "../server/receiver.py");
      const pythonCmd = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

      console.log(`\n[receiver-plugin] Auto-starting receiver server (${pythonCmd} "${receiverScript}")...`);
      proc = spawn(pythonCmd, [receiverScript], {
        stdio: "inherit",
        shell: false,
      });

      proc.on("error", (err) => {
        console.error("[receiver-plugin] Error starting receiver:", err.message);
      });

      const cleanup = () => {
        if (proc && !proc.killed && proc.pid) {
          try {
            if (process.platform === "win32") {
              spawn("taskkill", ["/pid", proc.pid.toString(), "/f", "/t"], { stdio: "ignore" });
            } else {
              proc.kill();
            }
          } catch {
            // ignore
          }
          proc = null;
        }
      };

      process.on("exit", cleanup);
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
      server.httpServer?.on("close", cleanup);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest }), receiverPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
});
