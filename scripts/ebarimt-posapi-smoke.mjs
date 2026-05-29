import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function getConfig() {
  loadDotEnv();

  const baseUrl = (process.env.EBARIMT_BASE_URL || "http://127.0.0.1:7080").replace(/\/+$/, "");
  const timeoutMs = Number.parseInt(process.env.EBARIMT_TIMEOUT_MS || "10000", 10);

  return {
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000,
  };
}

function explainError(error) {
  const code = error?.cause?.code || error?.code || "";
  const message = error instanceof Error ? error.message : String(error);

  if (code === "ECONNREFUSED" || message.includes("fetch failed")) {
    return [
      "POSAPI_NOT_RUNNING",
      "eBarimt PosAPI 3.0 ajillahgui baina. Kassiin computer deer PosAPI service asaaltai esehiig shalgana uu.",
    ];
  }

  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return [
      "TIMEOUT",
      "eBarimt PosAPI-aas hariu irehgui baina. Internet bolon PosAPI holboltoo shalgana uu.",
    ];
  }

  if (error instanceof SyntaxError) {
    return ["INVALID_RESPONSE", "PosAPI JSON bus hariu butsaalaa."];
  }

  return ["UNKNOWN_ERROR", message];
}

async function requestJson(pathname, options = {}) {
  const { baseUrl, timeoutMs } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const command = process.argv[2] || "info";
  const { baseUrl, timeoutMs } = getConfig();

  console.log(`[eBarimt] mode=direct baseUrl=${baseUrl} timeoutMs=${timeoutMs}`);

  try {
    if (command === "info") {
      const info = await requestJson("/rest/info");
      console.log("[eBarimt] PosAPI /rest/info OK");
      console.log(JSON.stringify(info, null, 2));
      return;
    }

    if (command === "send-data") {
      const result = await requestJson("/rest/sendData");
      console.log("[eBarimt] PosAPI /rest/sendData OK");
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    throw new Error(`Unknown command: ${command}. Use "info" or "send-data".`);
  } catch (error) {
    const [code, friendly] = explainError(error);
    console.error(`[eBarimt] ${code}`);
    console.error(friendly);
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  }
}

await main();
