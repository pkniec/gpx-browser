import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimalny loader `.env` (bez zależności) — nie nadpisuje już ustawionych zmiennych. */
export function loadEnvFile(file = ".env"): void {
  const full = path.resolve(process.cwd(), file);
  if (!existsSync(full)) return;
  const text = readFileSync(full, "utf-8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
