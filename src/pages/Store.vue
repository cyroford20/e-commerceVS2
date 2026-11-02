<template>
  <ion-page>
    <ion-content :fullscreen="true" :scroll-y="false" class="admin-content">
      <div v-if="loading" class="admin-loading">
        <div class="loader-ring"></div>
        <p>Preparing command center...</p>
      </div>

      <div v-else class="admin-shell">
        <aside class="sidebar">
          <div class="side-glow" aria-hidden="true"></div>
          <div class="side-brand">
            <span class="mark">VS</span>
            <div>
              <strong>Vape Shop</strong>
              <small>Commerce OS</small>
            </div>
          </div>

          <nav class="side-nav">
            <button type="button" :class="{ active: tab === 'dashboard' }" @click="tab = 'dashboard'">
              <span class="nav-ico"><ion-icon :icon="gridOutline"></ion-icon></span>
              <span>Dashboard</span>
            </button>
            <button type="button" :class="{ active: tab === 'products' }" @click="tab = 'products'">
              <span class="nav-ico"><ion-icon :icon="cubeOutline"></ion-icon></span>
              <span>Products</span>
              <em>{{ products.length }}</em>
            </button>
            <button type="button" :class="{ active: tab === 'pos' }" @click="tab = 'pos'">
              <span class="nav-ico"><ion-icon :icon="storefrontOutline"></ion-icon></span>
              <span>POS</span>
              <em v-if="posItemCount">{{ posItemCount }}</em>
            </button>
            <button type="button" :class="{ active: tab === 'orders' }" @click="tab = 'orders'">
              <span class="nav-ico"><ion-icon :icon="receiptOutline"></ion-icon></span>
              <span>Orders</span>
              <em>{{ orders.length }}</em>
            </button>
            <button type="button" :class="{ active: tab === 'delivery' }" @click="tab = 'delivery'">
              <span class="nav-ico"><ion-icon :icon="navigateOutline"></ion-icon></span>
              <span>Delivery</span>
              <em>{{ deliveryQueue.length }}</em>
            </button>
            <button type="button" :class="{ active: tab === 'customers' }" @click="tab = 'customers'">
              <span class="nav-ico"><ion-icon :icon="peopleOutline"></ion-icon></span>
              <span>Customers</span>
              <em>{{ customers.length }}</em>
            </button>
            <button type="button" :class="{ active: tab === 'profile' }" @click="tab = 'profile'">
              <span class="nav-ico"><ion-icon :icon="personOutline"></ion-icon></span>
              <span>Profile</span>
            </button>
          </nav>

          <div class="side-foot">
            <div class="admin-chip">
              <div class="avatar">{{ initials }}</div>
              <div>
                <strong>{{ profile?.name }}</strong>
                <small>Store owner</small>
              </div>
            </div>
            <button type="button" class="logout-btn" @click="handleLogout">
              <ion-icon :icon="logOutOutline"></ion-icon>
              Sign out
            </button>
          </div>
        </aside>

        <main class="admin-main">
          <div class="main-atmosphere" aria-hidden="true"></div>

          <header class="topbar" :class="{ compact: tab === 'pos' }">
            <div>
              <p class="eyebrow">{{ greeting }} · {{ todayLabel }}</p>
              <h1>{{ pageTitle }}</h1>
              <p class="subhead">{{ pageSubhead }}</p>
            </div>
            <div class="top-actions">
              <div class="search-pill" v-if="tab === 'products' || tab === 'customers' || tab === 'pos'">
                <ion-icon :icon="searchOutline"></ion-icon>
                <input
                  v-if="tab === 'products'"
                  v-model="productQuery"
                  type="search"
                  placeholder="Search catalog..."
                />
                <input
                  v-else-if="tab === 'pos'"
                  v-model="posQuery"
                  type="search"
                  placeholder="Scan or search SKU..."
                />
                <input
                  v-else
                  v-model="customerQuery"
                  type="search"
                  placeholder="Search customers..."
                />
              </div>
              <button
                v-if="tab === 'products'"
                type="button"
                class="primary-btn"
                @click="startCreate"
              >
                <span>+ Add product</span>
              </button>
              <button
                v-if="tab === 'pos' && posCart.length"
                type="button"
                class="ghost-btn top-clear"
                @click="clearPos"
              >
                Clear ticket
              </button>
            </div>
          </header>

          <p class="error-banner" v-if="error">{{ error }}</p>

          <section v-if="tab === 'dashboard'" class="view">
            <div class="hero-banner">
              <div>
                <p class="banner-kicker">Live store pulse</p>
                <h2>Your catalog is ready to sell.</h2>
                <p>{{ products.length }} products online · {{ orders.length }} orders tracked</p>
              </div>
              <div class="banner-orb" aria-hidden="true"></div>
            </div>

            <div class="stats">
              <article class="stat-card" v-for="stat in stats" :key="stat.label" :class="stat.tone">
                <div class="stat-top">
                  <span>{{ stat.label }}</span>
                  <ion-icon :icon="stat.icon"></ion-icon>
                </div>
                <h3>{{ stat.value }}</h3>
                <div class="meter"><i :style="{ width: stat.meter }"></i></div>
                <small>{{ stat.hint }}</small>
              </article>
            </div>

            <div class="dash-grid">
              <div class="panel glass">
                <div class="panel-head">
                  <div>
                    <h3>Inventory mix</h3>
                    <p class="muted">Units by category</p>
                  </div>
                </div>
                <div class="bars" v-if="categoryBars.length">
                  <div class="bar-row" v-for="bar in categoryBars" :key="bar.name">
                    <div class="bar-meta">
                      <strong>{{ bar.name }}</strong>
                      <span>{{ bar.stock }} units</span>
                    </div>
                    <div class="bar-track">
                      <span :style="{ width: bar.pct + '%' }"></span>
                    </div>
                  </div>
                </div>
                <div v-else class="panel-empty">Add products to see inventory mix.</div>
              </div>

              <div class="panel glass">
                <div class="panel-head">
                  <div>
                    <h3>Inventory alerts</h3>
                    <p class="muted">Under 20 units</p>
                  </div>
                  <button type="button" class="link-btn" @click="tab = 'products'">Manage</button>
                </div>
                <div v-if="lowStockProducts.length === 0" class="panel-empty healthy">
                  Stock looks healthy across the catalog.
                </div>
                <ul v-else class="alert-list">
                  <li v-for="product in lowStockProducts" :key="product.id">
                    <img :src="product.image_url" :alt="product.name" />
                    <div>
                      <strong>{{ product.name }}</strong>
                      <span>{{ product.stock }} left · {{ product.category || 'General' }}</span>
                    </div>
                    <em>{{ Math.max(0, 20 - Number(product.stock)) }} to restock</em>
                  </li>
                </ul>
              </div>
            </div>

            <div class="panel glass">
              <div class="panel-head">
                <div>
                  <h3>Recent orders</h3>
                  <p class="muted">Latest customer checkouts</p>
                </div>
                <button type="button" class="link-btn" @click="tab = 'orders'">View all</button>
              </div>
              <div v-if="recentOrders.length === 0" class="panel-empty">No orders yet. Sales will appear here.</div>
              <div v-else class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Items</th>
                      <th>Date</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="order in recentOrders" :key="order.id">
                      <td><span class="mono">#{{ order.id }}</span></td>
                      <td>
                        <strong>{{ order.customer_name }}</strong>
                        <span class="muted">{{ order.customer_email }}</span>
                      </td>
                      <td>{{ order.items?.length || 0 }}</td>
                      <td>{{ formatDate(order.created_at) }}</td>
                      <td class="price-text">₱{{ formatPrice(order.total) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section v-if="tab === 'pos'" class="view pos-view">
            <div class="pos-layout">
              <div class="panel glass pos-catalog">
                <div class="panel-head">
                  <div>
                    <h3>Floor catalog</h3>
                    <p class="muted">{{ filteredPosProducts.length }} sellable items</p>
                  </div>
                </div>
                <div v-if="filteredPosProducts.length === 0" class="panel-empty">
                  No in-stock products match this search.
                </div>
                <div v-else class="pos-grid">
                  <button
                    type="button"
                    class="pos-sku"
                    v-for="product in filteredPosProducts"
                    :key="product.id"
                    :disabled="Number(product.stock) <= 0"
                    @click="addToPos(product)"
                  >
                    <img :src="product.image_url" :alt="product.name" />
                    <div class="pos-sku-body">
                      <strong>{{ product.name }}</strong>
                      <span class="muted">{{ product.category || 'Uncategorized' }}</span>
                      <div class="pos-sku-meta">
                        <em>₱{{ formatPrice(product.price) }}</em>
                        <span :class="['stock-pill', product.stock < 20 ? 'low' : 'ok']">
                          {{ product.stock }} left
                        </span>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <aside class="panel glass pos-ticket">
                <div class="panel-head">
                  <div>
                    <h3>Sale ticket</h3>
                    <p class="muted">{{ posItemCount }} items · walk-up checkout</p>
                  </div>
                </div>

                <label class="pos-customer">
                  Customer
                  <select v-model="posCustomerId">
                    <option value="walkin">Walk-in customer</option>
                    <option v-for="customer in customers" :key="customer.id" :value="String(customer.id)">
                      {{ customer.name }} · {{ customer.email }}
                    </option>
                  </select>
                </label>

                <div v-if="posCart.length === 0" class="panel-empty pos-empty">
                  Tap products to build the sale.
                </div>

                <div v-else class="pos-lines">
                  <div class="pos-line" v-for="line in posCart" :key="line.id">
                    <img :src="line.image_url" :alt="line.name" />
                    <div class="pos-line-info">
                      <strong>{{ line.name }}</strong>
                      <span>₱{{ formatPrice(line.price) }} each</span>
                      <div class="pos-qty">
                        <button type="button" @click="changePosQty(line.id, -1)">−</button>
                        <em>{{ line.quantity }}</em>
                        <button type="button" @click="changePosQty(line.id, 1)">+</button>
                      </div>
                    </div>
                    <div class="pos-line-side">
                      <strong>₱{{ formatPrice(line.price * line.quantity) }}</strong>
                      <button type="button" class="danger-link" @click="removeFromPos(line.id)">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                <div class="pos-footer">
                  <div class="pos-total">
                    <span>Total due</span>
                    <strong>₱{{ formatPrice(posTotal) }}</strong>
                  </div>
                  <p class="form-error" v-if="posError">{{ posError }}</p>
                  <p class="form-ok" v-if="posOk">{{ posOk }}</p>
                  <div class="pos-footer-actions">
                    <button
                      v-if="posCart.length"
                      type="button"
                      class="ghost-btn"
                      @click="clearPos"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      class="primary-btn pos-pay"
                      :disabled="!posCart.length || posWorking"
                      @click="completePosSale"
                    >
                      {{ posWorking ? 'Processing...' : 'Complete sale' }}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section v-if="tab === 'products'" class="view">
            <div class="panel editor glass" v-if="editing">
              <div class="panel-head">
                <div>
                  <h3>{{ form.id ? 'Edit product' : 'New product' }}</h3>
                  <p class="muted">Keep pricing and stock accurate</p>
                </div>
                <button type="button" class="link-btn" @click="editing = false">Close</button>
              </div>
              <div class="form-grid">
                <label>
                  Product name
                  <input v-model="form.name" type="text" placeholder="Iced Mango Disposable" />
                </label>
                <label>
                  Category
                  <input v-model="form.category" type="text" placeholder="Disposable" />
                </label>
                <label>
                  Price
                  <input v-model="form.price" type="number" min="0" step="0.01" />
                </label>
                <label>
                  Stock
                  <input v-model="form.stock" type="number" min="0" step="1" />
                </label>
                <label class="full">
                  Image URL
                  <input v-model="form.image_url" type="text" placeholder="/products/your-image.jfif" />
                </label>
              </div>
              <div class="preview-row" v-if="form.image_url">
                <img :src="form.image_url" alt="Preview" />
                <span>Image preview</span>
              </div>
              <p class="form-error" v-if="formError">{{ formError }}</p>
              <div class="form-actions">
                <button type="button" class="primary-btn" :disabled="saving" @click="saveProduct">
                  {{ saving ? 'Saving...' : 'Save product' }}
                </button>
                <button type="button" class="ghost-btn" @click="editing = false">Cancel</button>
              </div>
            </div>

            <div class="panel glass">
              <div class="panel-head">
                <div>
                  <h3>Catalog table</h3>
                  <p class="muted">{{ filteredProducts.length }} visible items</p>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data-table products-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Stock</th>
                      <th>Price</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="product in filteredProducts" :key="product.id">
                      <td>
                        <div class="product-cell">
                          <img :src="product.image_url" :alt="product.name" />
                          <div>
                            <strong>{{ product.name }}</strong>
                            <span class="muted mono">SKU-{{ product.id }}</span>
                          </div>
                        </div>
                      </td>
                      <td><span class="tag">{{ product.category || 'Uncategorized' }}</span></td>
                      <td>
                        <div class="stock-cell">
                          <span :class="['stock-pill', product.stock < 20 ? 'low' : 'ok']">
                            {{ product.stock }}
                          </span>
                          <div class="mini-meter">
                            <i :style="{ width: Math.min(100, (Number(product.stock) / 100) * 100) + '%' }"></i>
                          </div>
                        </div>
                      </td>
                      <td class="price-text">₱{{ formatPrice(product.price) }}</td>
                      <td>
                        <div class="row-actions">
                          <button type="button" @click="startEdit(product)">Edit</button>
                          <button type="button" class="danger" @click="removeProduct(product)">Delete</button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section v-if="tab === 'orders'" class="view">
            <div class="panel glass">
              <div class="panel-head">
                <div>
                  <h3>Order pipeline</h3>
                  <p class="muted">{{ orders.length }} customer purchases</p>
                </div>
              </div>
              <div v-if="orders.length === 0" class="panel-empty">No orders yet.</div>
              <div v-else class="order-cards">
                <article class="order-card" v-for="order in orders" :key="order.id">
                  <div class="order-top">
                    <div>
                      <p class="order-id">Order #{{ order.id }}</p>
                      <strong>{{ order.customer_name }}</strong>
                      <span class="muted">{{ order.customer_email }}</span>
                    </div>
                    <div class="order-right">
                      <span class="status">{{ order.channel === 'pos' ? 'POS' : 'Online' }}</span>
                      <strong class="price-text">₱{{ formatPrice(order.total) }}</strong>
                      <span class="muted">{{ formatDate(order.created_at) }}</span>
                    </div>
                  </div>
                  <div class="order-items">
                    <div class="order-item" v-for="item in order.items" :key="item.id">
                      <img :src="item.image_url" :alt="item.product_name" />
                      <div>
                        <strong>{{ item.product_name }}</strong>
                        <span>Qty {{ item.quantity }} · ₱{{ formatPrice(item.price) }}</span>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section v-if="tab === 'delivery'" class="view">
            <div class="panel glass">
              <div class="panel-head">
                <div>
                  <h3>Delivery queue</h3>
                  <p class="muted">{{ deliveryQueue.length }} online deliveries</p>
                </div>
              </div>
              <div v-if="deliveryQueue.length" class="delivery-analytics" aria-label="Delivery analytics">
                <div class="delivery-analytics-card">
                  <strong>{{ deliveryAnalytics.total }}</strong>
                  <span>Total</span>
                </div>
                <div class="delivery-analytics-card">
                  <strong>{{ deliveryAnalytics.unassigned }}</strong>
                  <span>Unassigned</span>
                </div>
                <div class="delivery-analytics-card">
                  <strong>{{ deliveryAnalytics.active }}</strong>
                  <span>Active</span>
                </div>
                <div class="delivery-analytics-card">
                  <strong>{{ deliveryAnalytics.delivered }}</strong>
                  <span>Delivered</span>
                </div>
                <div class="delivery-analytics-card">
                  <strong>{{ deliveryAnalytics.completionRate }}%</strong>
                  <span>Completion rate</span>
                </div>
              </div>
              <div v-if="deliveryQueue.length === 0" class="panel-empty">
                No online deliveries are waiting.
              </div>
              <div v-else class="delivery-cards">
                <article class="delivery-card" v-for="order in deliveryQueue" :key="order.id">
                  <div class="delivery-card-top">
                    <div>
                      <p class="order-id">Order #{{ order.id }}</p>
                      <strong>{{ order.customer_name }}</strong>
                      <span class="muted">{{ order.customer_email }}</span>
                    </div>
                    <strong class="price-text">₱{{ formatPrice(order.total) }}</strong>
                  </div>
                  <div class="delivery-address">
                    <strong>Deliver to</strong>
                    <span>{{ order.delivery_address || 'Address not provided' }}</span>
                    <span>{{ order.delivery_phone || 'No phone number' }}</span>
                    <a
                      v-if="order.delivery_location"
                      :href="googleMapsLink(order)"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open live route in Google Maps
                    </a>
                    <small v-if="order.delivery_location">
                      Courier location updated {{ formatDate(order.delivery_location.recorded_at) }}
                      <span v-if="isLocationStale(order.delivery_location)"> · Stale</span>
                    </small>
                  </div>
                  <div class="delivery-actions">
                    <select v-model="deliveryAssignments[order.id]">
                      <option value="">Unassigned</option>
                      <option
                        v-for="person in deliveryPersons"
                        :key="person.id"
                        :value="String(person.id)"
                      >
                        {{ person.name }}
                      </option>
                    </select>
                    <select v-model="deliveryStatuses[order.id]">
                      <option value="pending">Pending</option>
                      <option value="assigned">Assigned</option>
                      <option value="out_for_delivery">Out for delivery</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button type="button" class="primary-btn" @click="saveDelivery(order)">
                      Save
                    </button>
                  </div>
                  <div v-if="order.delivery_timeline?.length" class="delivery-timeline">
                    <strong>Timeline</strong>
                    <span v-for="event in order.delivery_timeline" :key="event.id">
                      {{ formatStatus(event.status) }}
                      <span v-if="event.recipient_name"> · Received by {{ event.recipient_name }}</span>
                      · {{ formatDate(event.created_at) }}
                    </span>
                  </div>
                </article>
              </div>
            </div>
            <div class="panel glass courier-panel">
              <div class="panel-head">
                <div>
                  <h3>Courier accounts</h3>
                  <p class="muted">Create accounts for delivery staff.</p>
                </div>
              </div>
              <form class="courier-form" @submit.prevent="createCourier">
                <input v-model="newCourier.name" required placeholder="Full name" />
                <input v-model="newCourier.email" required type="email" placeholder="Email" />
                <input
                  v-model="newCourier.password"
                  required
                  minlength="8"
                  type="password"
                  placeholder="Password (8+ characters)"
                />
                <button type="submit" class="primary-btn" :disabled="creatingCourier">
                  {{ creatingCourier ? 'Creating...' : 'Create courier' }}
                </button>
              </form>
              <p v-if="courierMessage" class="muted courier-message">{{ courierMessage }}</p>
            </div>
          </section>

          <section v-if="tab === 'customers'" class="view">
            <div class="panel glass">
              <div class="panel-head">
                <div>
                  <h3>Customer accounts</h3>
                  <p class="muted">{{ filteredCustomers.length }} shoppers registered</p>
                </div>
              </div>
              <div v-if="filteredCustomers.length === 0" class="panel-empty">No customer accounts yet.</div>
              <div v-else class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Email</th>
                      <th>Orders</th>
                      <th>Total spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="customer in filteredCustomers" :key="customer.id">
                      <td>
                        <div class="product-cell">
                          <div class="mini-avatar">{{ customerInitials(customer.name) }}</div>
                          <div>
                            <strong>{{ customer.name }}</strong>
                            <span class="muted mono">ID #{{ customer.id }}</span>
                          </div>
                        </div>
                      </td>
                      <td>{{ customer.email }}</td>
                      <td>{{ customer.order_count }}</td>
                      <td class="price-text">₱{{ formatPrice(customer.total_spent) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section v-if="tab === 'profile'" class="view">
            <div class="panel glass profile-panel">
              <div class="panel-head">
                <div>
                  <h3>Store owner profile</h3>
                  <p class="muted">Manage how your admin account appears</p>
                </div>
              </div>
              <div class="owner-profile">
                <div class="owner-avatar">{{ initials }}</div>
                <div>
                  <strong>{{ profile?.name }}</strong>
                  <span class="muted">{{ profile?.email }}</span>
                  <span class="tag">Store owner</span>
                </div>
              </div>
              <div class="form-grid single">
                <label class="full">
                  Display name
                  <input v-model="ownerName" type="text" placeholder="Store Admin" />
                </label>
              </div>
              <p class="muted" style="margin-top: 0.75rem">
                Email cannot be changed here. Use this name across the admin panel.
              </p>
              <p class="form-error" v-if="profileError">{{ profileError }}</p>
              <p class="form-ok" v-if="profileOk">Profile saved.</p>
              <div class="form-actions">
                <button type="button" class="primary-btn" :disabled="savingProfile" @click="saveOwnerProfile">
                  {{ savingProfile ? 'Saving...' : 'Save profile' }}
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonIcon } from '@ionic/vue';
import {
  gridOutline,
  cubeOutline,
  receiptOutline,
  logOutOutline,
  searchOutline,
  cashOutline,
  alertCircleOutline,
  bagHandleOutline,
  layersOutline,
  peopleOutline,
  personOutline,
  storefrontOutline,
  navigateOutline,
} from 'ionicons/icons';
import {
  getMe,
  updateMe,
  getCustomers,
  getProducts,
  getAllOrders,
  createProduct,
  updateProduct,
  deleteProduct,
  createPosOrder,
  updateDelivery,
  getDeliveryPersons,
  createDeliveryPerson,
  saveAuth,
  getToken,
  logout,
} from '../services/api';

const router = useRouter();
const tab = ref('dashboard');
const productQuery = ref('');
const customerQuery = ref('');
const posQuery = ref('');
const posCart = ref([]);
const posCustomerId = ref('walkin');
const posWorking = ref(false);
const posError = ref('');
const posOk = ref('');
const ownerName = ref('');
const savingProfile = ref(false);
const profileError = ref('');
const profileOk = ref(false);

const emptyForm = () => ({
  id: null,
  name: '',
  category: '',
  price: '',
  stock: '',
  image_url: '',
});

const profile = ref(null);
const products = ref([]);
const orders = ref([]);
const customers = ref([]);
const deliveryPersons = ref([]);
const deliveryAssignments = ref({});
const deliveryStatuses = ref({});
const newCourier = ref({ name: '', email: '', password: '' });
const creatingCourier = ref(false);
const courierMessage = ref('');
const loading = ref(true);
const saving = ref(false);
const editing = ref(false);
const form = ref(emptyForm());
const formError = ref('');
const error = ref('');
let deliveryRefreshTimer;

const pageTitle = computed(() => {
  if (tab.value === 'products') return 'Products';
  if (tab.value === 'pos') return 'Point of Sale';
  if (tab.value === 'orders') return 'Orders';
  if (tab.value === 'delivery') return 'Delivery';
  if (tab.value === 'customers') return 'Customers';
  if (tab.value === 'profile') return 'Profile';
  return 'Dashboard';
});

const pageSubhead = computed(() => {
  if (tab.value === 'products') return 'Control pricing, stock, and media for every SKU.';
  if (tab.value === 'pos') return 'Ring up walk-in sales and sync stock instantly.';
  if (tab.value === 'orders') return 'Track every customer checkout in one place.';
  if (tab.value === 'delivery') return 'Assign couriers and keep customers updated.';
  if (tab.value === 'customers') return 'See every shopper account and their spend.';
  if (tab.value === 'profile') return 'Update your store owner display details.';
  return 'A clear snapshot of catalog health and sales.';
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});

const todayLabel = computed(() =>
  new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
);

const initials = computed(() => {
  const name = profile.value?.name || 'SA';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
});

const totalRevenue = computed(() =>
  orders.value.reduce((sum, order) => sum + Number(order.total || 0), 0)
);

const totalStock = computed(() =>
  products.value.reduce((sum, product) => sum + Number(product.stock || 0), 0)
);

const lowStockProducts = computed(() =>
  products.value.filter((product) => Number(product.stock) < 20).slice(0, 6)
);

const lowStockCount = computed(() =>
  products.value.filter((product) => Number(product.stock) < 20).length
);

const recentOrders = computed(() => orders.value.slice(0, 5));

const deliveryQueue = computed(() =>
  orders.value.filter((order) => order.channel === 'online')
);

const deliveryAnalytics = computed(() => {
  const total = deliveryQueue.value.length;
  const delivered = deliveryQueue.value.filter(
    (order) => order.delivery_status === 'delivered'
  ).length;
  return {
    total,
    unassigned: deliveryQueue.value.filter(
      (order) => !order.delivery_person_id && order.delivery_status !== 'delivered'
    ).length,
    active: deliveryQueue.value.filter(
      (order) => order.delivery_status === 'out_for_delivery'
    ).length,
    delivered,
    completionRate: total ? Math.round((delivered / total) * 100) : 0,
  };
});

const filteredProducts = computed(() => {
  const q = productQuery.value.trim().toLowerCase();
  if (!q) return products.value;
  return products.value.filter(
    (product) =>
      product.name.toLowerCase().includes(q) ||
      (product.category || '').toLowerCase().includes(q)
  );
});

const filteredCustomers = computed(() => {
  const q = customerQuery.value.trim().toLowerCase();
  if (!q) return customers.value;
  return customers.value.filter(
    (customer) =>
      customer.name.toLowerCase().includes(q) ||
      customer.email.toLowerCase().includes(q)
  );
});

const filteredPosProducts = computed(() => {
  const q = posQuery.value.trim().toLowerCase();
  return products.value.filter((product) => {
    if (Number(product.stock) <= 0) return false;
    if (!q) return true;
    return (
      product.name.toLowerCase().includes(q) ||
      (product.category || '').toLowerCase().includes(q) ||
      String(product.id).includes(q)
    );
  });
});

const posItemCount = computed(() =>
  posCart.value.reduce((sum, line) => sum + line.quantity, 0)
);

const posTotal = computed(() =>
  posCart.value.reduce((sum, line) => sum + line.price * line.quantity, 0)
);

const customerInitials = (name = '') =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'C';

const categoryBars = computed(() => {
  const map = {};
  products.value.forEach((product) => {
    const key = product.category || 'Other';
    map[key] = (map[key] || 0) + Number(product.stock || 0);
  });
  const entries = Object.entries(map).map(([name, stock]) => ({ name, stock }));
  const max = Math.max(...entries.map((entry) => entry.stock), 1);
  return entries
    .sort((a, b) => b.stock - a.stock)
    .map((entry) => ({ ...entry, pct: Math.round((entry.stock / max) * 100) }));
});

const stats = computed(() => [
  {
    label: 'Products',
    value: products.value.length,
    hint: 'Live catalog SKUs',
    meter: `${Math.min(100, products.value.length * 10)}%`,
    tone: '',
    icon: layersOutline,
  },
  {
    label: 'Low stock',
    value: lowStockCount.value,
    hint: 'Needs restock soon',
    meter: `${Math.min(100, lowStockCount.value * 15)}%`,
    tone: 'warn',
    icon: alertCircleOutline,
  },
  {
    label: 'Orders',
    value: orders.value.length,
    hint: 'Completed checkouts',
    meter: `${Math.min(100, orders.value.length * 12)}%`,
    tone: '',
    icon: bagHandleOutline,
  },
  {
    label: 'Revenue',
    value: `₱${formatPrice(totalRevenue.value)}`,
    hint: `${totalStock.value} units in stock`,
    meter: `${Math.min(100, Number(totalRevenue.value) / 50)}%`,
    tone: 'accent',
    icon: cashOutline,
  },
]);

const formatPrice = (price) => parseFloat(price || 0).toFixed(2);

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatStatus = (status) =>
  (status || 'pending')
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const googleMapsLink = (order) => {
  const destination = encodeURIComponent(order.delivery_address || '');
  const location = order.delivery_location;
  const origin = location ? `&origin=${location.latitude},${location.longitude}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${origin}`;
};

const isLocationStale = (location) =>
  Date.now() - new Date(location.recorded_at).getTime() > 120000;

const loadStore = async () => {
  loading.value = true;
  error.value = '';
  try {
    const [me, catalog, orderList, customerList, courierList] = await Promise.all([
      getMe(),
      getProducts(),
      getAllOrders(),
      getCustomers(),
      getDeliveryPersons(),
    ]);
    profile.value = me.data;
    ownerName.value = me.data.name || '';
    const token = getToken();
    if (token) saveAuth(token, me.data);
    products.value = catalog.data;
    orders.value = orderList.data;
    customers.value = customerList.data;
    deliveryPersons.value = courierList.data;
    deliveryAssignments.value = Object.fromEntries(
      orders.value.map((order) => [order.id, String(order.delivery_person_id || '')])
    );
    deliveryStatuses.value = Object.fromEntries(
      orders.value.map((order) => [order.id, order.delivery_status || 'pending'])
    );
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load the store.';
  } finally {
    loading.value = false;
  }
};

const createCourier = async () => {
  creatingCourier.value = true;
  courierMessage.value = '';
  try {
    const response = await createDeliveryPerson(
      newCourier.value.name.trim(),
      newCourier.value.email.trim(),
      newCourier.value.password
    );
    deliveryPersons.value = [...deliveryPersons.value, response.data.user].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    newCourier.value = { name: '', email: '', password: '' };
    courierMessage.value = 'Courier account created.';
  } catch (err) {
    courierMessage.value =
      err.response?.data?.message || 'Could not create courier account.';
  } finally {
    creatingCourier.value = false;
  }
};

const saveDelivery = async (order) => {
  error.value = '';
  try {
    const res = await updateDelivery(
      order.id,
      deliveryStatuses.value[order.id],
      deliveryAssignments.value[order.id]
    );
    const index = orders.value.findIndex((item) => item.id === order.id);
    if (index >= 0) orders.value[index] = { ...orders.value[index], ...res.data };
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not update delivery.';
  }
};

const startCreate = () => {
  tab.value = 'products';
  form.value = emptyForm();
  formError.value = '';
  editing.value = true;
};

const startEdit = (product) => {
  form.value = {
    id: product.id,
    name: product.name,
    category: product.category || '',
    price: String(product.price),
    stock: String(product.stock),
    image_url: product.image_url || '',
  };
  formError.value = '';
  editing.value = true;
};

const saveProduct = async () => {
  formError.value = '';
  saving.value = true;
  const payload = {
    name: form.value.name,
    category: form.value.category,
    price: Number(form.value.price),
    stock: Number(form.value.stock),
    image_url: form.value.image_url,
  };

  try {
    if (form.value.id) {
      await updateProduct(form.value.id, payload);
    } else {
      await createProduct(payload);
    }
    editing.value = false;
    const catalog = await getProducts();
    products.value = catalog.data;
  } catch (err) {
    formError.value = err.response?.data?.message || 'Could not save the product.';
  } finally {
    saving.value = false;
  }
};

const removeProduct = async (product) => {
  if (!window.confirm(`Delete ${product.name}?`)) return;
  error.value = '';
  try {
    await deleteProduct(product.id);
    products.value = products.value.filter((item) => item.id !== product.id);
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not delete the product.';
  }
};

const addToPos = (product) => {
  posError.value = '';
  posOk.value = '';
  const stock = Number(product.stock);
  if (stock <= 0) return;

  const existing = posCart.value.find((line) => line.id === product.id);
  if (existing) {
    if (existing.quantity >= stock) {
      posError.value = `Only ${stock} left in stock for ${product.name}.`;
      return;
    }
    existing.quantity += 1;
    return;
  }

  posCart.value.push({
    id: product.id,
    name: product.name,
    price: parseFloat(product.price),
    image_url: product.image_url,
    stock,
    quantity: 1,
  });
};

const changePosQty = (productId, delta) => {
  posError.value = '';
  posOk.value = '';
  const line = posCart.value.find((item) => item.id === productId);
  if (!line) return;

  const next = line.quantity + delta;
  if (next <= 0) {
    posCart.value = posCart.value.filter((item) => item.id !== productId);
    return;
  }

  const live = products.value.find((product) => product.id === productId);
  const maxStock = live ? Number(live.stock) : line.stock;
  if (next > maxStock) {
    posError.value = `Only ${maxStock} left in stock for ${line.name}.`;
    return;
  }

  line.quantity = next;
};

const removeFromPos = (productId) => {
  posCart.value = posCart.value.filter((item) => item.id !== productId);
};

const clearPos = () => {
  posCart.value = [];
  posError.value = '';
  posOk.value = '';
};

const completePosSale = async () => {
  if (!posCart.value.length) return;

  posWorking.value = true;
  posError.value = '';
  posOk.value = '';

  const items = posCart.value.map((line) => ({
    product_id: line.id,
    quantity: line.quantity,
  }));
  const customerId =
    posCustomerId.value === 'walkin' ? null : Number(posCustomerId.value);

  try {
    const res = await createPosOrder(items, customerId);
    const orderId = res.data.order?.id;
    posOk.value = orderId
      ? `Sale #${orderId} completed.`
      : 'Sale completed.';
    posCart.value = [];
    posCustomerId.value = 'walkin';

    const [catalog, orderList, customerList] = await Promise.all([
      getProducts(),
      getAllOrders(),
      getCustomers(),
    ]);
    products.value = catalog.data;
    orders.value = orderList.data;
    customers.value = customerList.data;
  } catch (err) {
    posError.value = err.response?.data?.message || 'Could not complete the sale.';
  } finally {
    posWorking.value = false;
  }
};

const handleLogout = () => {
  logout();
  router.push('/login');
};

const saveOwnerProfile = async () => {
  profileError.value = '';
  profileOk.value = false;
  const name = ownerName.value.trim();
  if (!name) {
    profileError.value = 'Name is required.';
    return;
  }

  savingProfile.value = true;
  try {
    const res = await updateMe(name);
    profile.value = res.data.user;
    const token = getToken();
    if (token) saveAuth(token, res.data.user);
    profileOk.value = true;
  } catch (err) {
    profileError.value = err.response?.data?.message || 'Could not save profile.';
  } finally {
    savingProfile.value = false;
  }
};

const refreshDeliveryQueue = async () => {
  if (tab.value !== 'delivery') return;
  try {
    const response = await getAllOrders();
    orders.value = response.data;
    deliveryAssignments.value = Object.fromEntries(
      orders.value.map((order) => [order.id, String(order.delivery_person_id || '')])
    );
    deliveryStatuses.value = Object.fromEntries(
      orders.value.map((order) => [order.id, order.delivery_status || 'pending'])
    );
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not refresh deliveries.';
  }
};

onMounted(async () => {
  await loadStore();
  deliveryRefreshTimer = window.setInterval(refreshDeliveryQueue, 15000);
});
onBeforeUnmount(() => window.clearInterval(deliveryRefreshTimer));
</script>

<style scoped>
.admin-content {
  --background: #0b0b0d;
  --overflow: hidden;
}

.admin-content :deep(.inner-scroll) {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.admin-loading {
  height: 100%;
  min-height: 100%;
  display: grid;
  place-content: center;
  gap: 1rem;
  color: #fff;
  text-align: center;
  background:
    radial-gradient(circle at 50% 30%, rgba(255, 77, 141, 0.2), transparent 45%),
    #050505;
}

.loader-ring {
  width: 46px;
  height: 46px;
  margin: 0 auto;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: #ff4d8d;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.admin-shell {
  height: 100%;
  min-height: 100%;
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  overflow: hidden;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  padding: 1.4rem 1rem;
  background: linear-gradient(180deg, #09090b 0%, #050505 100%);
  color: #fff;
  border-right: 1px solid rgba(255, 77, 141, 0.2);
}

.side-glow {
  position: absolute;
  width: 220px;
  height: 220px;
  right: -70px;
  top: -40px;
  border-radius: 50%;
  background: rgba(255, 77, 141, 0.22);
  filter: blur(40px);
  pointer-events: none;
}

.side-brand {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.4rem;
}

.mark {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #ff4d8d, #d4146a);
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  box-shadow: 0 10px 30px rgba(255, 77, 141, 0.35);
}

.side-brand strong,
.admin-chip strong {
  display: block;
  font-family: 'Syne', sans-serif;
}

.side-brand small,
.admin-chip small,
.muted {
  display: block;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.75rem;
}

.admin-main .muted {
  color: #8a8a8a;
}

.delivery-cards {
  display: grid;
  gap: 0.9rem;
}

.delivery-analytics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.delivery-analytics-card {
  display: grid;
  gap: 0.2rem;
  padding: 0.75rem;
  border: 1px solid #eee5ea;
  border-radius: 12px;
  background: #fff8fb;
}

.delivery-analytics-card strong {
  color: #d4146a;
  font-size: 1.25rem;
}

.delivery-analytics-card span {
  color: #777;
  font-size: 0.72rem;
}

.delivery-card {
  padding: 1rem;
  border: 1px solid #e8e1e6;
  border-radius: 16px;
  background: #fff;
}

.delivery-card-top,
.delivery-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}

.delivery-card-top {
  margin-bottom: 0.85rem;
}

.delivery-address {
  display: grid;
  gap: 0.2rem;
  margin-bottom: 0.9rem;
  padding: 0.75rem;
  border-radius: 10px;
  background: #fff5f9;
  color: #5c5c5c;
  font-size: 0.85rem;
}

.delivery-address strong {
  color: #161616;
}

.delivery-actions input,
.delivery-actions select {
  min-width: 0;
  flex: 1;
  padding: 0.65rem;
  border: 1px solid #e8e1e6;
  border-radius: 9px;
  background: #fff;
  color: #161616;
  font: inherit;
}

.delivery-timeline {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid #eee5ea;
  color: #777;
  font-size: 0.78rem;
}

.delivery-timeline strong {
  color: #161616;
}

.courier-panel {
  margin-top: 1rem;
}

.courier-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.courier-form input {
  min-width: 0;
  padding: 0.65rem;
  border: 1px solid #e8e1e6;
  border-radius: 9px;
  background: #fff;
  color: #161616;
  font: inherit;
}

.courier-message {
  margin: 0.75rem 0 0;
}

@media (max-width: 700px) {
  .delivery-analytics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .delivery-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .courier-form {
    grid-template-columns: 1fr;
  }
}

.side-nav {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}

.side-nav::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.side-nav button,
.logout-btn {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 14px;
  padding: 0.85rem 0.8rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  font-family: 'Outfit', sans-serif;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.25s ease;
  box-sizing: border-box;
}

.nav-ico {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
}

.side-nav button.active,
.side-nav button:hover,
.logout-btn:hover {
  background: rgba(255, 77, 141, 0.14);
  color: #fff;
}

.side-nav button.active .nav-ico {
  background: rgba(255, 77, 141, 0.3);
}

.side-nav em {
  margin-left: auto;
  font-style: normal;
  min-width: 1.5rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 0.72rem;
  text-align: center;
}

.side-foot {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.admin-chip {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.8rem;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #ff4d8d;
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 0.8rem;
}

.admin-main {
  position: relative;
  min-height: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 1.4rem 1.6rem 2.6rem;
  background:
    radial-gradient(ellipse 70% 42% at 100% -8%, rgba(255, 77, 141, 0.16), transparent 55%),
    radial-gradient(ellipse 45% 30% at 0% 0%, rgba(17, 17, 17, 0.05), transparent 50%),
    linear-gradient(180deg, #f7f4f6 0%, #f3f3f5 38%, #efefef 100%);
  color: #111;
}

.main-atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.55), transparent 42%),
    radial-gradient(circle at 85% 18%, rgba(255, 77, 141, 0.08), transparent 28%);
}

.topbar,
.view,
.panel,
.stats,
.hero-banner {
  position: relative;
  z-index: 1;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
  margin-bottom: 1.3rem;
  color: #111;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #d4146a;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.topbar h1 {
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: clamp(1.9rem, 3vw, 2.5rem);
  color: #0d0d10;
  letter-spacing: -0.03em;
}

.subhead {
  margin: 0.35rem 0 0;
  color: #6f6f76;
}

.top-actions {
  display: flex;
  gap: 0.65rem;
  align-items: center;
}

.search-pill {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 220px;
  padding: 0.65rem 0.9rem;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e7e2e5;
  color: #444;
  box-shadow: 0 8px 24px rgba(17, 17, 17, 0.04);
}

.search-pill input {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: #111;
  font-family: 'Outfit', sans-serif;
}

.search-pill input::placeholder {
  color: #9a9598;
}

.primary-btn,
.ghost-btn,
.link-btn,
.row-actions button {
  border: 0;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-weight: 650;
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.8rem 1.2rem;
  background: linear-gradient(135deg, #ff4d8d, #ff6ea1);
  color: #fff;
  box-shadow: 0 12px 30px rgba(255, 77, 141, 0.35);
}

.ghost-btn {
  border-radius: 999px;
  padding: 0.8rem 1.2rem;
  background: #fff;
  color: #111;
  border: 1px solid #e8e8e8;
}

.link-btn {
  background: transparent;
  color: #ff4d8d;
}

.error-banner,
.form-error {
  color: #d4146a;
  font-weight: 650;
}

.panel .form-error {
  color: #d4146a;
}

.form-ok {
  color: #1a7a4c;
  font-weight: 650;
}

.mini-avatar,
.owner-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #ff4d8d;
  color: #fff;
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.owner-profile {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-bottom: 1rem;
  padding: 0.9rem;
  border-radius: 16px;
  background: #fff7fa;
}

.owner-avatar {
  width: 58px;
  height: 58px;
  font-size: 1rem;
}

.owner-profile .tag {
  margin-top: 0.35rem;
}

.form-grid.single {
  grid-template-columns: 1fr;
}

.hero-banner {
  position: relative;
  overflow: hidden;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1.55rem 1.45rem;
  border-radius: 26px;
  background:
    radial-gradient(circle at 88% 20%, rgba(255, 255, 255, 0.28), transparent 36%),
    linear-gradient(125deg, #101014 0%, #1c1018 48%, #ff4d8d 100%);
  color: #fff;
  border: 1px solid rgba(255, 77, 141, 0.35);
  box-shadow: 0 22px 50px rgba(212, 20, 106, 0.22);
}

.banner-kicker {
  margin: 0 0 0.4rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 0.72rem;
  color: #ffc1d6;
}

.hero-banner h2 {
  margin: 0 0 0.4rem;
  font-family: 'Syne', sans-serif;
  font-size: clamp(1.4rem, 3vw, 2rem);
  letter-spacing: -0.02em;
}

.hero-banner p {
  margin: 0;
  color: rgba(255, 255, 255, 0.75);
}

.banner-orb {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.35), transparent 65%);
  filter: blur(4px);
  animation: orb-float 5s ease-in-out infinite;
}

@keyframes orb-float {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-10px) scale(1.05);
  }
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
  margin-bottom: 1rem;
}

.stat-card {
  padding: 1.15rem 1rem;
  border-radius: 22px;
  background: #fff;
  border: 1px solid #ece8ea;
  box-shadow: 0 10px 28px rgba(17, 17, 17, 0.04);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 34px rgba(212, 20, 106, 0.1);
}

.stat-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #7a7a7a;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.stat-card h3 {
  margin: 0.55rem 0 0.55rem;
  font-size: 1.65rem;
}

.meter,
.mini-meter,
.bar-track {
  height: 6px;
  border-radius: 999px;
  background: #ececec;
  overflow: hidden;
}

.meter i,
.mini-meter i,
.bar-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ff4d8d, #ff9fbf);
}

.stat-card small {
  display: block;
  margin-top: 0.45rem;
  color: #8a8a8a;
}

.stat-card.accent h3,
.stat-card.warn h3 {
  color: #d4146a;
}

.dash-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 1rem;
}

.panel.glass {
  background: #fff;
  border: 1px solid #ece8ea;
  border-radius: 22px;
  padding: 1.05rem 1.1rem 1.2rem;
  box-shadow: 0 10px 28px rgba(17, 17, 17, 0.04);
  margin-bottom: 1rem;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 0.75rem;
  margin-bottom: 0.95rem;
}

.panel-head h3 {
  margin: 0;
}

.panel-empty {
  padding: 1.6rem 0.5rem;
  color: #7a7a7a;
  text-align: center;
}

.panel-empty.healthy {
  color: #111;
}

.bars {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.bar-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.35rem;
  font-size: 0.9rem;
}

.bar-meta span {
  color: #8a8a8a;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 0.85rem 0.55rem;
  border-bottom: 1px solid #f0f0f0;
  text-align: left;
  vertical-align: middle;
}

.data-table th {
  color: #8a8a8a;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.data-table tbody tr {
  transition: background 0.2s ease;
}

.data-table tbody tr:hover {
  background: #fff7fa;
}

.mono {
  font-family: 'Syne', sans-serif;
  letter-spacing: 0.04em;
}

.product-cell,
.alert-list li,
.order-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.product-cell img,
.alert-list img,
.order-item img,
.preview-row img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 12px;
  background: #fff0f5;
}

.product-cell strong,
.alert-list strong,
.order-item strong,
.order-top strong {
  display: block;
}

.tag,
.stock-pill,
.status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.tag {
  background: #fff0f5;
  color: #d4146a;
}

.stock-cell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 78px;
}

.stock-pill.ok {
  background: #f1f1f1;
  color: #222;
  width: fit-content;
}

.stock-pill.low {
  background: #ffe4ef;
  color: #d4146a;
  width: fit-content;
}

.status {
  background: #111;
  color: #fff;
  margin-bottom: 0.35rem;
}

.row-actions {
  display: flex;
  gap: 0.35rem;
  justify-content: flex-end;
}

.row-actions button {
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  background: #111;
  color: #fff;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.row-actions button.danger {
  background: #fff;
  color: #d4146a;
  border: 1px solid #d4146a;
}

.alert-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.alert-list li {
  padding: 0.55rem;
  border-radius: 14px;
  background: #fff7fa;
}

.alert-list span,
.order-item span {
  color: #7a7a7a;
  font-size: 0.82rem;
}

.alert-list em {
  margin-left: auto;
  font-style: normal;
  color: #d4146a;
  font-size: 0.75rem;
  font-weight: 700;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #666;
}

.form-grid label.full {
  grid-column: 1 / -1;
}

.form-grid input {
  border: 1px solid #e8e8e8;
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  font-family: 'Outfit', sans-serif;
  font-size: 0.95rem;
  background: #fafafa;
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.9rem;
  color: #7a7a7a;
}

.form-actions {
  display: flex;
  gap: 0.55rem;
  margin-top: 1rem;
}

.order-cards {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.order-card {
  border: 1px solid #f0f0f0;
  border-radius: 18px;
  padding: 1rem;
  background: linear-gradient(180deg, #fff, #fafafa);
}

.order-top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
}

.order-id {
  margin: 0 0 0.25rem;
  color: #ff4d8d;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.order-right {
  text-align: right;
}

.order-items {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.view {
  animation: panel-in 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pos-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 1rem;
  align-items: start;
}

.pos-catalog {
  min-width: 0;
  min-height: 520px;
}

.pos-ticket {
  position: sticky;
  top: 1rem;
  display: flex;
  flex-direction: column;
  width: 380px;
  max-width: 100%;
  min-height: 520px;
  align-self: start;
}

.pos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.75rem;
}

.pos-sku {
  display: flex;
  flex-direction: column;
  text-align: left;
  border: 1px solid #efefef;
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(180deg, #fff, #fafafa);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.pos-sku:hover:not(:disabled) {
  transform: translateY(-3px);
  border-color: rgba(255, 77, 141, 0.45);
  box-shadow: 0 12px 28px rgba(212, 20, 106, 0.12);
}

.pos-sku:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pos-sku img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  background: #fff0f5;
}

.pos-sku-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
}

.pos-sku-body strong {
  font-size: 0.9rem;
  line-height: 1.25;
  color: #111;
}

.pos-sku-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-top: 0.35rem;
}

.pos-sku-meta em {
  font-style: normal;
  font-weight: 800;
  color: #d4146a;
}

.pos-customer {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #666;
}

.pos-customer select {
  border: 1px solid #e8e8e8;
  border-radius: 14px;
  padding: 0.8rem 0.9rem;
  font-family: 'Outfit', sans-serif;
  font-size: 0.92rem;
  background: #fafafa;
  color: #111;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 500;
}

.pos-empty {
  flex: 1;
}

.pos-lines {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  flex: 1;
  max-height: 420px;
  overflow: auto;
  padding-right: 0.2rem;
}

.pos-line {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 0.7rem;
  align-items: center;
  padding: 0.65rem;
  border-radius: 16px;
  border: 1px solid #f0f0f0;
  background: #fff;
}

.pos-line img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 12px;
  background: #fff0f5;
}

.pos-line-info strong {
  display: block;
  font-size: 0.88rem;
}

.pos-line-info span {
  color: #8a8a8a;
  font-size: 0.78rem;
}

.pos-qty {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.4rem;
}

.pos-qty button {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #111;
  color: #fff;
  font-size: 1rem;
  line-height: 1;
}

.pos-qty em {
  min-width: 1.4rem;
  text-align: center;
  font-style: normal;
  font-weight: 700;
}

.pos-line-side {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-end;
}

.danger-link {
  border: 0;
  background: transparent;
  color: #d4146a;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.pos-footer {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #efefef;
}

.pos-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.85rem;
}

.pos-total span {
  color: #777;
  font-size: 0.85rem;
  font-weight: 600;
}

.pos-total strong {
  font-family: 'Syne', sans-serif;
  font-size: 1.7rem;
  color: #111;
}

.pos-pay {
  width: 100%;
  justify-content: center;
}

.pos-footer-actions {
  display: flex;
  gap: 0.55rem;
}

.pos-footer-actions .ghost-btn {
  flex-shrink: 0;
}

.pos-footer-actions .pos-pay {
  flex: 1;
}

.top-clear {
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .stats,
  .dash-grid,
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 860px) {
  .admin-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .sidebar {
    position: sticky;
    top: 0;
    z-index: 20;
    height: auto;
    max-height: none;
    gap: 0.55rem;
    padding: 0.7rem 0.65rem 0.55rem;
  }

  .side-brand {
    padding: 0 0.15rem;
  }

  .side-brand .mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    font-size: 0.72rem;
  }

  .side-brand strong {
    font-size: 0.88rem;
  }

  .side-brand small {
    display: none;
  }

  .side-nav {
    flex-direction: row;
    flex-wrap: nowrap;
    gap: 0.35rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0.1rem;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .side-nav::-webkit-scrollbar {
    display: none;
  }

  .side-nav button {
    flex: 0 0 auto;
    width: auto;
    min-height: 42px;
    white-space: nowrap;
    padding: 0.45rem 0.75rem;
    font-size: 0.78rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
  }

  .side-nav button.active {
    background: rgba(255, 77, 141, 0.24);
  }

  .side-nav .nav-ico {
    width: 24px;
    height: 24px;
    border-radius: 7px;
  }

  .side-nav em {
    min-width: 1.15rem;
    padding: 0.08rem 0.32rem;
    font-size: 0.65rem;
  }

  .side-foot {
    display: none;
  }

  .admin-main {
    padding: 0.85rem 0.75rem 1.4rem;
    background:
      radial-gradient(ellipse 70% 42% at 100% -8%, rgba(255, 77, 141, 0.16), transparent 55%),
      linear-gradient(180deg, #f7f4f6 0%, #f3f3f5 38%, #efefef 100%);
  }

  .topbar {
    align-items: stretch;
    margin-bottom: 0.75rem;
    gap: 0.65rem;
  }

  .topbar.compact {
    margin-bottom: 0.55rem;
  }

  .topbar.compact .eyebrow,
  .topbar.compact .subhead {
    display: none;
  }

  .topbar.compact h1 {
    font-size: 1.35rem;
  }

  .topbar,
  .top-actions,
  .hero-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .topbar h1 {
    font-size: 1.55rem;
  }

  .subhead {
    font-size: 0.88rem;
  }

  .search-pill {
    min-width: 0;
    width: 100%;
  }

  .primary-btn,
  .ghost-btn {
    min-height: 44px;
    justify-content: center;
  }

  .hero-banner {
    padding: 1.1rem 1rem;
    border-radius: 20px;
  }

  .hero-banner h2 {
    font-size: 1.25rem;
  }

  .banner-orb {
    display: none;
  }

  .stats,
  .dash-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .stat-card h3 {
    font-size: 1.35rem;
  }

  .pos-view {
    padding-bottom: 0.5rem;
  }

  .pos-layout {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .pos-catalog {
    min-height: 0;
    margin-bottom: 0;
  }

  .pos-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .pos-sku {
    border-radius: 14px;
  }

  .pos-sku img {
    height: 96px;
  }

  .pos-sku-body {
    padding: 0.55rem;
  }

  .pos-sku-body strong {
    font-size: 0.78rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .pos-ticket {
    position: sticky;
    bottom: 0.25rem;
    top: auto;
    z-index: 15;
    width: 100%;
    min-height: 0;
    max-height: 46vh;
    margin-bottom: 0;
    overflow: auto;
    border-radius: 18px;
    box-shadow: 0 -10px 28px rgba(17, 17, 17, 0.12);
  }

  .pos-empty {
    padding: 0.55rem 0;
    flex: 0;
  }

  .pos-lines {
    max-height: 18vh;
    overflow: auto;
  }

  .pos-line {
    grid-template-columns: 44px 1fr auto;
    gap: 0.55rem;
    padding: 0.55rem;
  }

  .pos-line img {
    width: 44px;
    height: 44px;
  }

  .pos-qty button {
    width: 32px;
    height: 32px;
  }

  .pos-total strong {
    font-size: 1.35rem;
  }

  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .products-table,
  .data-table {
    min-width: 560px;
  }

  .row-actions {
    flex-wrap: wrap;
  }

  .order-top {
    flex-direction: column;
  }

  .order-right {
    text-align: left;
  }
}
</style>
