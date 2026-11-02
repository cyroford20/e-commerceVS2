# Cross-Platform Vape Shop E-Commerce System

Ionic Vue frontend + Node.js/Express backend + PostgreSQL.

---

## Project Structure

```
E-CommerceVapeShop/
├── backend/
│   ├── server.js
│   ├── .env                  ← your DB password & JWT secret
│   ├── .env.example
│   ├── package.json
│   ├── config/
│   │   └── db.js
│   ├── models/
│   │   ├── userModel.js
│   │   ├── productModel.js
│   │   └── orderModel.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── productController.js
│   │   └── orderController.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── productRoutes.js
│   │   └── orderRoutes.js
│   └── middleware/
│       └── authMiddleware.js
├── database/
│   ├── schema.sql
│   └── seed.sql
├── src/
│   ├── pages/
│   │   ├── Login.vue
│   │   ├── Register.vue
│   │   ├── Home.vue
│   │   ├── ProductDetails.vue
│   │   ├── Cart.vue
│   │   ├── Checkout.vue
│   │   └── Orders.vue
│   ├── components/
│   │   ├── ProductCard.vue
│   │   ├── Navbar.vue
│   │   └── CartItem.vue
│   ├── services/
│   │   └── api.js
│   ├── router/
│   │   └── index.js
│   ├── theme/
│   │   └── variables.css
│   ├── App.vue
│   └── main.js
├── index.html
├── package.json
├── vite.config.js
└── ionic.config.json
```

---

## 1. Database Setup (PostgreSQL)

### Create the database

Open **psql** or **pgAdmin**, then run:

```sql
CREATE DATABASE vape_shop;
```

### Run the schema

**Option A – psql (command line):**

```bash
psql -U postgres -d vape_shop -f database/schema.sql
psql -U postgres -d vape_shop -f database/seed.sql
```

**Option B – pgAdmin:**

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

Test in browser: [http://localhost:3000](http://localhost:3000) → `{ "message": "Vape Shop API is running!" }`

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

1. **Register / Login** → JWT saved to `localStorage`
2. **Home** → fetch products from API
3. **Product Details** → add to cart (`localStorage`)
4. **Cart** → adjust quantities
5. **Checkout** → send order to backend (requires login)
6. **Orders** → view past orders for the logged-in user

---

## 6. Custom vape builder

Customers can open **Build your vape** from the home page and assemble a setup from available catalog inventory:

- Device / pod kit
- E-liquid
- Optional coil
- Optional accessory

Required parts must be selected before the build can be added. Each selected component is added as its own cart item so the existing checkout, stock, and order-item tracking remain accurate. Component groups are inferred from product categories, so use categories such as `Pod System`, `E-Liquid`, `Salt Nic`, `Coils`, and `Accessories` when creating products.

---

## 7. Delivery management

Customers enter a delivery phone number and complete address during checkout. Store owners can open **Store → Delivery** to assign a courier and update the status:

- Pending
- Assigned
- Out for delivery
- Delivered
- Cancelled

The status, address, phone number, and assigned courier are shown in the customer's order history. The delivery columns are added by `database/schema.sql`; re-run that script for an existing database.

Store owners can create courier accounts from **Store → Delivery**. Couriers sign in at the normal login page and are redirected to `/delivery`, where they can only view assigned orders and update their own delivery status.

Every delivery change is recorded in a chronological timeline visible to the customer, store owner, and assigned courier.

Couriers must enter the recipient's name and explicitly confirm the handover before an order can be marked delivered.

Couriers can accept assigned orders from the delivery dashboard before starting the trip. The dashboard also shows simple assigned, active, delivered, and delivered-today counts.

Couriers may also attach one JPEG, PNG, or WebP proof photo when confirming delivery. Photos are limited to 5 MB, stored outside public assets, and can only be retrieved by the order customer, store owner, or assigned courier.

When a courier changes an assigned order to **Out for delivery**, the delivery dashboard asks for explicit consent before requesting browser location permission and shares the courier's GPS position every 10 seconds. Customer and owner delivery pages refresh location data every 15 seconds and can open a Google Maps route using the courier's last location and the delivery address. Only the latest location is retained, and updates older than two minutes are shown as stale. Location sharing stops when the order is delivered, cancelled, unassigned, or the courier leaves the dashboard. Google Maps API keys are not required because the app opens Google Maps directions links instead of embedding the Google Maps JavaScript SDK.

Customer order tracking also includes a key-free OpenStreetMap/Leaflet map. It displays the latest courier marker, geocodes the delivery address to a destination marker, and draws a straight-line progress guide between them. The map refreshes with the existing 15-second order polling, while Google Maps remains available for turn-by-turn navigation.

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

- `.github/workflows/android.yml` → builds and uploads a **debug APK**
- `.github/workflows/ios.yml` → builds an **iOS Simulator** `.app` (no App Store signing)

Optional repo variable: `VITE_API_URL` (Settings → Variables).

**Neon database**

The backend accepts Neon's pooled `DATABASE_URL` automatically. Run `neon deploy`
to pull the linked branch variables into the ignored root `.env.local`, then expose
that variable to the backend service as `DATABASE_URL`. Local `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, and `DB_NAME` variables remain supported as a fallback.
When running locally from `backend`, the database module reads the root `.env.local`
automatically, so `npm start` can use the linked Neon branch without copying secrets.

**Deploy the backend to Render**

The root `render.yaml` is a Render Blueprint for the Express API. In Render, choose
**New → Blueprint**, connect this repository, and select `render.yaml`. After the
service is created, add the production Neon pooled `DATABASE_URL` as a secret
environment variable. Render generates `JWT_SECRET` automatically. Copy the
deployed API URL, then create a root `.env` before building the mobile app:

```
VITE_API_URL=https://your-render-api.onrender.com/api
```

Run `npm run build:mobile` after changing that URL. Do not commit `.env` or any
database credentials.
