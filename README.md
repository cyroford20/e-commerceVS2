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

On Android, scanning uses the native ML Kit Google Code Scanner. The scanner module is declared for installation with Google Play services; if it is not ready on the first attempt, wait for setup and scan again. The native scanner does not require the app's camera permission. On iOS and the web, the app requests the rear camera in a secure context, shows a preview, and decodes locally with the ZXing WebAssembly detector. Camera permission is required for those paths.

Riders explicitly opt in to location sharing during active deliveries. The native Android and iOS apps can continue sharing while backgrounded; Android displays an ongoing location notification, and iOS displays its location indicator. This uses battery, requires location permission, and may stop if the app is force-quit or the operating system terminates it. Web tracking works only while the page remains open. The in-app map shows the rider's last shared location and does not geocode or send the delivery address to a map service. The rider can explicitly open Google Maps navigation, which shares the address with Google Maps only after the rider taps that link.

After changing native dependencies or permissions, sync and build the mobile project:

    npm run build:android

## Verification

    npm run build
    npm test --prefix backend
    node --check backend/server.js
    node --check backend/controllers/productController.js
    node --check backend/controllers/orderController.js
    node --check backend/controllers/deliveryController.js
    node --check backend/models/productModel.js
    node --check backend/models/orderModel.js
    node --check backend/models/deliveryModel.js

Backend unit tests cover coupon rules and role authorization, but do not cover the full rider-to-customer workflow. Production builds and tests do not replace testing against a configured PostgreSQL database or physical devices. Verify location permissions, background GPS, notifications, map links, uploads, and delivery workflows on supported devices before release.
