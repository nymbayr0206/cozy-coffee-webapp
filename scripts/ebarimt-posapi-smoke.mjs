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

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function findValue(source, keys) {
  if (!source || typeof source !== "object") return "";

  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue = [source];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;

    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase()) && value !== null && value !== undefined && String(value).trim()) {
        return String(value).trim();
      }

      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return "";
}

function requiredSetting(name, value, hint) {
  if (value) return value;
  throw new Error(`${name} is required. ${hint}`);
}

function buildTestReceiptPayload(posInfo) {
  const totalAmount = 1000;
  const totalVAT = roundMoney(totalAmount / 11);
  const totalCityTax = 0;
  const merchantTin = requiredSetting(
    "EBARIMT_MERCHANT_TIN",
    process.env.EBARIMT_MERCHANT_TIN || findValue(posInfo, ["merchantTin", "merchant_tin", "tin", "regNo"]),
    "Set it in .env if /rest/info does not return merchant TIN.",
  );
  const posNo = requiredSetting(
    "EBARIMT_POS_NO",
    process.env.EBARIMT_POS_NO || findValue(posInfo, ["posNo", "posno", "posNumber", "pos_no"]),
    "Set it in .env if /rest/info does not return POS number.",
  );
  const districtCode = requiredSetting(
    "EBARIMT_DISTRICT_CODE",
    process.env.EBARIMT_DISTRICT_CODE || findValue(posInfo, ["districtCode", "district_code", "district"]),
    "Set it in .env if /rest/info does not return district code.",
  );
  const branchNo = requiredSetting(
    "EBARIMT_BRANCH_NO",
    process.env.EBARIMT_BRANCH_NO || findValue(posInfo, ["branchNo", "branch_no", "branch"]),
    "Set it in .env if /rest/info does not return branch number.",
  );
  const classificationCode = process.env.EBARIMT_TEST_CLASSIFICATION_CODE || "5610100";
  const receiptNumber = `COZY-TEST-${Date.now()}`;

  return {
    totalAmount,
    totalVAT,
    totalCityTax,
    districtCode,
    merchantTin,
    posNo,
    branchNo,
    type: "B2C_RECEIPT",
    billIdSuffix: receiptNumber,
    receipts: [
      {
        totalAmount,
        totalVAT,
        totalCityTax,
        taxType: "VAT_ABLE",
        merchantTin,
        items: [
          {
            name: "Тест кофе",
            barCode: "",
            barCodeType: "UNDEFINED",
            classificationCode,
            measureUnit: "ш",
            qty: 1,
            unitPrice: totalAmount,
            totalAmount,
            totalVAT,
            totalCityTax,
            taxType: "VAT_ABLE",
          },
        ],
      },
    ],
    payments: [
      {
        code: "CASH",
        paidAmount: totalAmount,
        status: "PAID",
      },
    ],
  };
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
  const flags = new Set(process.argv.slice(3));
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

    if (command === "test-receipt") {
      if (!flags.has("--confirm")) {
        console.log("[eBarimt] Test receipt is a real POST /rest/receipt request.");
        console.log("[eBarimt] Run with --confirm when PosAPI test environment is ready:");
        console.log("npm run ebarimt:test-receipt -- --confirm");
        return;
      }

      const info = await requestJson("/rest/info");
      const payload = buildTestReceiptPayload(info);
      console.log("[eBarimt] Sending test receipt payload:");
      console.log(JSON.stringify(payload, null, 2));

      const result = await requestJson("/rest/receipt", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log("[eBarimt] PosAPI /rest/receipt OK");
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    throw new Error(`Unknown command: ${command}. Use "info", "send-data", or "test-receipt".`);
  } catch (error) {
    const [code, friendly] = explainError(error);
    console.error(`[eBarimt] ${code}`);
    console.error(friendly);
    if (error instanceof Error) console.error(error.message);
    process.exitCode = 1;
  }
}

await main();
