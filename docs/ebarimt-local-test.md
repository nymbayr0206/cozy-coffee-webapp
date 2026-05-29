# eBarimt PosAPI 3.0 local smoke test

This is only for local direct mode.

Local direct mode works only when:

- Cozy backend runs on the same Windows computer as PosAPI 3.0.
- PosAPI 3.0 is running at `EBARIMT_BASE_URL`, default `http://127.0.0.1:7080`.

## Environment

Set these in `.env`:

```env
EBARIMT_MODE=direct
EBARIMT_ENABLED=false
EBARIMT_BASE_URL=http://127.0.0.1:7080
EBARIMT_TIMEOUT_MS=10000
EBARIMT_MERCHANT_TIN=
EBARIMT_POS_NO=
EBARIMT_DISTRICT_CODE=
EBARIMT_BRANCH_NO=
EBARIMT_VAT_REGISTERED=false
EBARIMT_TEST_TAX_TYPE=VAT_FREE
EBARIMT_TEST_CLASSIFICATION_CODE=5610100
EBARIMT_AUTO_SEND=false
EBARIMT_RETRY_FAILED=true
```

Keep `EBARIMT_ENABLED=false` while doing the first connectivity test.

## Test connection

Start PosAPI 3.0 on the Windows kass computer, then run:

```powershell
npm run ebarimt:info
```

Expected success:

- The command prints `PosAPI /rest/info OK`.
- The response includes POS information such as `posNo`, `version`, and merchant data.

If it fails with `POSAPI_NOT_RUNNING`, PosAPI is not reachable from the machine running the Cozy backend.

## Send pending data

Only use this after connection works:

```powershell
npm run ebarimt:send-data
```

This calls `GET /rest/sendData`.

## Send test receipt

Use this only after connection works. It sends a real `POST /rest/receipt` request to the local PosAPI test setup:

```powershell
npm run ebarimt:test-receipt -- --confirm
```

The test receipt is:

- Product: `Тест кофе`
- Quantity: `1`
- Total amount: `1000`
- VAT: `0` when `EBARIMT_VAT_REGISTERED=false`
- City tax: `0`
- Payment: `CASH`

Without `--confirm`, the command only prints a warning and does not create a receipt:

```powershell
npm run ebarimt:test-receipt
```

If `/rest/info` does not include merchant, POS, district, or branch values, fill these in `.env` before sending:

- `EBARIMT_MERCHANT_TIN`
- `EBARIMT_POS_NO`
- `EBARIMT_DISTRICT_CODE`
- `EBARIMT_BRANCH_NO`

If the merchant is VAT registered later, set:

```env
EBARIMT_VAT_REGISTERED=true
EBARIMT_TEST_TAX_TYPE=VAT_ABLE
```

## Important

Do not use local direct mode from a cloud or VPS backend. On a VPS, `127.0.0.1:7080` points to the VPS itself, not the kass Windows computer. Production needs the future Windows Local Bridge Agent.
