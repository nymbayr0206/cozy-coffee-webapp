# Cozy Coffee Kass

Odoo ERP connected POS/Kass web frontend.

## Odoo config

Odoo credentials are server-side only. Do not create `NEXT_PUBLIC_ODOO_*`.

Create `.env` if it does not exist:

```powershell
Copy-Item .env.example .env
```

Then set the VPS Odoo values:

```env
ODOO_URL=https://YOUR-VPS-ODOO-DOMAIN
ODOO_DB=YOUR_VPS_ODOO_DB
ODOO_USERNAME=YOUR_VPS_ODOO_USERNAME
ODOO_PASSWORD=YOUR_VPS_ODOO_PASSWORD
ODOO_DEFAULT_PARTNER_ID=1
ODOO_PRODUCT_MODEL=product.product
ODOO_PRODUCT_FILTER_FIELD=sale_ok
KASS_STORE_PATH=./data/kass-store.json
```

Restart Next.js after changing `.env`.

`KASS_STORE_PATH` keeps kass open/close records and local receipt/order summaries on disk.
On VPS/Docker, mount this path to a persistent volume so shift records survive restarts.

## Commands

```powershell
npm install
npm run typecheck
npm run build
npm run dev
```

## VPS Docker deploy

Use the same server-side `.env` values on the VPS. For the current Odoo VPS this should look like:

```env
ODOO_URL=http://187.77.158.34:8069
ODOO_DB=db
ODOO_USERNAME=admin
ODOO_PASSWORD=admin
ODOO_DEFAULT_PARTNER_ID=1
ODOO_PRODUCT_MODEL=product.product
ODOO_PRODUCT_FILTER_FIELD=sale_ok
KASS_STORE_PATH=/app/data/kass-store.json
```

Deploy with Docker Compose:

```bash
docker compose up -d --build
docker compose logs -f cozy-coffee-kass
```

Health check:

```bash
curl http://localhost:3000/api/kass/health
curl http://localhost:3000/api/kass/sessions
```

The `./data` folder is mounted into the container. Do not delete it during redeploys unless you intentionally want to remove kass session history.
