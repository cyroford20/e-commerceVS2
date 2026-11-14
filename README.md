# Cross-Platform Vape Shop E-Commerce System

Ionic Vue frontend + Node.js/Express backend + PostgreSQL.

---

## Project Structure

```
E-CommerceVapeShop/
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ server.js
â”‚   â”œâ”€â”€ .env                  â† your DB password & JWT secret
â”‚   â”œâ”€â”€ .env.example
â”‚   â”œâ”€â”€ package.json
â”‚   â”œâ”€â”€ config/
â”‚   â”‚   â””â”€â”€ db.js
â”‚   â”œâ”€â”€ models/
â”‚   â”‚   â”œâ”€â”€ userModel.js
â”‚   â”‚   â”œâ”€â”€ productModel.js
â”‚   â”‚   â””â”€â”€ orderModel.js
â”‚   â”œâ”€â”€ controllers/
â”‚   â”‚   â”œâ”€â”€ authController.js
â”‚   â”‚   â”œâ”€â”€ productController.js
â”‚   â”‚   â””â”€â”€ orderController.js
â”‚   â”œâ”€â”€ routes/
â”‚   â”‚   â”œâ”€â”€ authRoutes.js
â”‚   â”‚   â”œâ”€â”€ productRoutes.js
â”‚   â”‚   â””â”€â”€ orderRoutes.js
â”‚   â””â”€â”€ middleware/
â”‚       â””â”€â”€ authMiddleware.js
â”œâ”€â”€ database/
â”‚   â”œâ”€â”€ schema.sql
â”‚   â””â”€â”€ seed.sql
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ pages/
â”‚   â”‚   â”œâ”€â”€ Login.vue
â”‚   â”‚   â”œâ”€â”€ Register.vue
â”‚   â”‚   â”œâ”€â”€ Home.vue
â”‚   â”‚   â”œâ”€â”€ ProductDetails.vue
â”‚   â”‚   â”œâ”€â”€ Cart.vue
â”‚   â”‚   â”œâ”€â”€ Checkout.vue
â”‚   â”‚   â””â”€â”€ Orders.vue
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ ProductCard.vue
â”‚   â”‚   â”œâ”€â”€ Navbar.vue
â”‚   â”‚   â””â”€â”€ CartItem.vue
â”‚   â”œâ”€â”€ services/
â”‚   â”‚   â””â”€â”€ api.js
â”‚   â”œâ”€â”€ router/
â”‚   â”‚   â””â”€â”€ index.js
â”‚   â”œâ”€â”€ theme/
â”‚   â”‚   â””â”€â”€ variables.css
â”‚   â”œâ”€â”€ App.vue
â”‚   â””â”€â”€ main.js
â”œâ”€â”€ index.html
â”œâ”€â”€ package.json
â”œâ”€â”€ vite.config.js
â””â”€â”€ ionic.config.json
```

---

## 1. Database Setup (PostgreSQL)

### Create the database

Open **psql** or **pgAdmin**, then run:

```sql
CREATE DATABASE vape_shop;
```

### Run the schema

**Option A â€“ psql (command line):**

```bash
psql -U postgres -d vape_shop -f database/schema.sql
psql -U postgres -d vape_shop -f database/seed.sql
```

**Option B â€“ pgAdmin:**

1. Connect to PostgreSQL
2. Open Query Tool on database `vape_shop`
3. Paste and run contents of `database/schema.sql`
4. Paste and run contents of `database/seed.sql`

---

## 2. Backend Setup

```bash
cd backend
```

### Configure environment

Copy `.env.example` to `.env` (already created) and edit your password:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password
DB_NAME=vape_shop
JWT_SECRET=vape_shop_secret_key_12345
```

### Install & run

```bash
npm install
node server.js
```

You should see:

```
Connected to PostgreSQL database
Server running on http://localhost:3000
```

Test in browser: [http://localhost:3000](http://localhost:3000) â†’ `{ "message": "Vape Shop API is running!" }`

---

## 3. Frontend Setup

Open a **new terminal** at the project root:

```bash
cd E-CommerceVapeShop
npm install
npm run dev
```

Or with Ionic CLI (if installed globally):

```bash
npm install -g @ionic/cli
ionic serve
```

App opens at: [http://localhost:8100](http://localhost:8100)

---

## 4. How Frontend Connects to Backend

In `src/services/api.js`:

```js
const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});
```

JWT is stored in `localStorage` and attached automatically:

```js
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

Cart is also stored in `localStorage` (no backend needed until checkout).

### Example API calls

| Action        | Method | URL                         |
|---------------|--------|-----------------------------|
| Register      | POST   | `/api/auth/register`        |
| Login         | POST   | `/api/auth/login`           |
| All products  | GET    | `/api/products`             |
| One product   | GET    | `/api/products/:id`         |
| Create order  | POST   | `/api/orders` (JWT required)|
| User orders   | GET    | `/api/orders/user/:id` (JWT)|

**Register body:**

```json
{ "name": "Juan", "email": "juan@email.com", "password": "secret123" }
```

**Login body:**

```json
{ "email": "juan@email.com", "password": "secret123" }
```

**Create order body:**

```json
{
  "total": 998,
  "items": [
    { "product_id": 1, "quantity": 2, "price": 499 }
  ]
}
```

---

## 5. App Flow

1. **Register / Login** â†’ JWT saved to `localStorage`
2. **Home** â†’ fetch products from API
3. **Product Details** â†’ add to cart (`localStorage`)
4. **Cart** â†’ adjust quantities
5. **Checkout** â†’ send order to backend (requires login)
6. **Orders** â†’ view past orders for the logged-in user

---

## 6. Custom vape builder

Customers can open **Build your vape** from the home page and assemble a setup from available catalog inventory:

- Device / pod kit
- E-liquid
- Optional coil
- Optional accessory

Required parts must be selected before the build can be added. Each selected component is added as its own cart item so the existing checkout, stock, and order-item tracking remain accurate. Component groups are inferred from product categories, so use categories such as `Pod System`, `E-Liquid`, `Salt Nic`, `Coils`, and `Accessories` when creating products.

### Barcode scanning

Store owners can scan a product barcode while creating or editing a catalog product. Customers can scan a barcode from the catalog page to open the matching product. Barcodes are stored in the `products.barcode` column and must be unique.

The scanner uses the Capacitor ML Kit plugin on native platforms and the browser Barcode Detection API with a ZXing polyfill on supported web browsers. Camera permission is required. Run `npm run build:mobile` after installing dependencies so native projects receive the scanner plugin.

---

## 7. In-house delivery management

The delivery module extends the existing PostgreSQL `users` and `orders` tables. A new `shipments` row is created in the same transaction as each online order. Orders retain their customer, item, and payment records; no replacement customer or order tables are created.

On API startup, `backend/server.js` applies the idempotent additions in `database/delivery_management.sql`. A fresh database still needs `database/schema.sql` first. Store owners must add delivery zones and fees in Store -> Delivery before customers can check out. Checkout calculates the fee from the selected zone and currently supports cash on delivery.

The delivery admin module contains shipment search and filters, assignment history, manual and least-workload automatic rider assignment, rider accounts and availability, rider-zone coverage, company vehicles, zone fees, COD reconciliation, and delivery summaries. Riders sign in through the existing login and see assigned shipments at `/delivery`.

The shipment workflow is Ready for delivery -> Rider assigned -> Accepted by rider -> Picked up -> Out for delivery -> Delivered. A rider records unsuccessful attempts with a reason and notes, then can reschedule or return the shipment to the warehouse. Every transition is written to `shipment_events` and synced to the existing order delivery status.

Delivered COD orders require the customer OTP, recipient name, handover confirmation, and cash amount. The customer receives the OTP in checkout and in delivery notifications. Optional proof photos are stored privately. Dispatchers record cash remittance and discrepancies in the COD module.

Riders can explicitly share GPS while a delivery is out for delivery. The API retains the latest 100 shipment locations. Customers and dispatchers see location updates through the existing Leaflet/OpenStreetMap tracking UI; the rider dashboard refreshes every 15 seconds.

### Delivery data relationships

- `rider_profiles.user_id` references an existing `users.id`; rider login credentials remain in `users`.
- `rider_profiles.vehicle_id` references `vehicles.id`; `rider_zone_coverage` links riders to `delivery_zones`.
- `shipments.order_id` uniquely references an existing `orders.id`; `shipments.delivery_zone_id` references `delivery_zones.id`.
- `rider_assignments`, `delivery_attempts`, `shipment_events`, `proof_of_delivery`, `cod_transactions`, `delivery_notifications`, and `delivery_tracking` all reference `shipments.id` and preserve their timestamps/history.

### Optional embedded Google Maps setup

### Optional embedded Google Maps setup

The current implementation intentionally keeps the no-key Google Maps directions-link fallback. To enable an embedded map later:

1. In Google Cloud Console, create or select the project used by the app and enable **Maps JavaScript API** and **Routes API** only.
2. Create a browser API key and restrict it to:
   - `http://localhost:8100/*`
   - the production frontend origin when it is deployed (the production domain is not configured yet)
3. Set the daily quota for the enabled APIs to **300 requests per day** (or lower).
4. Create a billing budget alert for the project. Google Cloud billing must be enabled even when usage stays within the applicable free allowance.
5. Add the key only to the local/deployment environment as `VITE_GOOGLE_MAPS_API_KEY`; never commit it.

If the key is missing or the embedded map cannot load, users should continue using the existing **Open route in Google Maps** links.

---

## 8. Requirements

- Node.js 18+
- PostgreSQL 14+
- npm

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Error connecting to PostgreSQL` | Check `.env` password, ensure PostgreSQL is running, DB `vape_shop` exists |
| Frontend can't load products | Backend must be running on port 3000 |
| `401 Unauthorized` on orders | Log in again; token may be missing/expired |
| `Email already registered` | Use a different email or log in |

---

## 8. Mobile (Capacitor) + GitHub Actions

Native projects live in `android/` and `ios/`.

```bash
npm install
npm run build:mobile    # vite build + cap sync
```

**Local**
- Android Studio: `npm run cap:android`
- Xcode (macOS): `npm run cap:ios`

**API URL for devices**

Set `VITE_API_URL` (see `.env.example`), e.g. your deployed API:
`VITE_API_URL=https://your-api.example.com/api`

Android emulator can use `http://10.0.2.2:3000/api` to reach a host machine backend.

**CI**

- `.github/workflows/android.yml` â†’ builds and uploads a **debug APK**
- `.github/workflows/ios.yml` â†’ builds an **iOS Simulator** `.app` (no App Store signing)

Optional repo variable: `VITE_API_URL` (Settings â†’ Variables).

**Neon database**

The backend accepts Neon's pooled `DATABASE_URL` automatically. Run `neon deploy`
to pull the linked branch variables into the ignored root `.env.local`, then expose
that variable to the backend service as `DATABASE_URL`. Local `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, and `DB_NAME` variables remain supported as a fallback.
When running locally from `backend`, the database module reads the root `.env.local`
automatically, so `npm start` can use the linked Neon branch without copying secrets.

**Deploy the backend to Render**

The root `render.yaml` is a Render Blueprint for the Express API. In Render, choose
**New â†’ Blueprint**, connect this repository, and select `render.yaml`. After the
service is created, add the production Neon pooled `DATABASE_URL` as a secret
environment variable. Render generates `JWT_SECRET` automatically. Copy the
deployed API URL, then create a root `.env` before building the mobile app:

```
VITE_API_URL=https://your-render-api.onrender.com/api
```

Run `npm run build:mobile` after changing that URL. Do not commit `.env` or any
database credentials.
