# Vape Shop E-Commerce and In-House Delivery

Vue 3, Ionic, Capacitor, Express, and PostgreSQL application for customers, store owners, and company riders. Delivery is managed in-house; no third-party courier integration is used.

## Requirements

- Node.js 18 or newer and npm
- PostgreSQL 14 or newer
- Android Studio for Android device builds; Xcode on macOS for iOS builds

## Database setup

Create the PostgreSQL database, then run the base schema and seed data once:

    createdb vape_shop
    psql -d vape_shop -f database/schema.sql
    psql -d vape_shop -f database/seed.sql

The API applies database/product_management.sql and database/delivery_management.sql idempotently at startup. These add product availability and delivery records to the existing schema. Existing users, products, orders, and order_items remain canonical. Before checkout is available, the store owner must configure delivery zones and fees in Store → Delivery.

## Environment

Create backend/.env for local development:

    PORT=3000
    DB_HOST=localhost
    DB_PORT=5432
    DB_USER=postgres
    DB_PASSWORD=your_local_password
    DB_NAME=vape_shop
    JWT_SECRET=your_generated_random_secret

Generate a strong JWT secret with openssl rand -base64 48. Production must provide JWT_SECRET with at least 32 bytes; the API refuses to start without it. Never commit .env files or credentials. For hosted PostgreSQL, set DATABASE_URL; it takes precedence over the local DB fields.

## Run locally

Install frontend dependencies in the repository root and backend dependencies in backend/:

    npm install
    cd backend
    npm install
    npm start

In a second terminal from the repository root:

    npm run dev

Set VITE_API_URL when the frontend needs to reach an API other than the default. Android emulators can use http://10.0.2.2:3000/api; a physical phone needs a reachable HTTPS API or a LAN address with cleartext enabled for development.

## Main workflows

- Customers browse the active catalog, scan a product barcode, add items to the cart, choose a delivery zone, place a COD order, view shipment history and notifications, and track the rider when GPS sharing is enabled.
- Store owners manage products and stock, deactivate or reactivate catalog items, use barcode scanning in the product editor and POS, configure riders, vehicles, delivery zones, assign shipments, set ETAs, review reports, and reconcile COD.
- Riders sign in with an owner-created rider account, accept assignments, update shipment status, share GPS during an active delivery, report failed attempts, reschedule or return shipments, and verify handover with the customer OTP. A photo can be attached as proof.

The shipment workflow is Ready for delivery → Rider assigned → Accepted by rider → Picked up → Out for delivery → Delivered. Failed attempts can be rescheduled, reassigned, or returned to the warehouse. Shipment changes are recorded in delivery history and synced to the existing order.

## Barcode and location permissions

The scanner requests the rear camera through the in-app WebView, displays its live feed in the scan frame, and decodes barcodes locally with the ZXing WebAssembly detector. It does not launch Google Lens, Google Code Scanner, or another app. Camera permission is required. Riders separately opt in to GPS sharing while delivering. Android and iOS declare the required camera and location permissions.

After changing native dependencies or permissions, sync and build the mobile project:

    npm run build:android

## Verification

    npm run build
    node --check backend/server.js
    node --check backend/controllers/productController.js
    node --check backend/controllers/orderController.js
    node --check backend/controllers/deliveryController.js
    node --check backend/models/productModel.js
    node --check backend/models/orderModel.js
    node --check backend/models/deliveryModel.js

The repository currently has no automated test suite. Production builds and syntax checks do not replace testing against a configured PostgreSQL database or a physical device. Verify camera preview, permission prompts, GPS, uploads, and delivery workflows on supported devices before release.
