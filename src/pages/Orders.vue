<template>
  <ion-page>
    <Navbar title="My Orders" :show-back="true" />

    <ion-content class="page-shell">
      <div v-if="loading" class="empty-state">
        <ion-spinner name="crescent"></ion-spinner>
        <p>Loading orders...</p>
      </div>

      <div v-else-if="error" class="empty-state">
        <h2>Error</h2>
        <p>{{ error }}</p>
        <ion-button @click="fetchOrders">Retry</ion-button>
      </div>

      <div v-else-if="orders.length === 0" class="empty-state">
        <h2>No orders yet</h2>
        <p>Your order history will appear here.</p>
        <ion-button router-link="/home">Start Shopping</ion-button>
      </div>

      <div v-else class="orders-shell rise-in">
        <header>
          <p class="eyebrow">History</p>
          <h1>My orders</h1>
          <p v-if="activeDeliveries.length" class="tracking-refresh">
            Live delivery tracking refreshes automatically every 15 seconds.
          </p>
        </header>

        <article class="order-block" v-for="order in orders" :key="order.id">
          <div class="order-top">
            <div>
              <p class="meta">Order #{{ order.id }} · {{ formatDate(order.created_at) }}</p>
              <span class="delivery-status">{{ formatStatus(order.delivery_status) }}</span>
            </div>
            <strong class="price-text">₱{{ formatPrice(order.total) }}</strong>
          </div>

          <div class="order-items">
            <div class="order-item" v-for="item in order.items" :key="item.id">
              <img :src="item.image_url" :alt="item.product_name" />
              <div>
                <h3>{{ item.product_name }}</h3>
                <p>Qty {{ item.quantity }} × ₱{{ formatPrice(item.price) }}</p>
              </div>
            </div>
          </div>
          <LiveDeliveryMap
            v-if="isTrackable(order)"
            :location="order.delivery_location"
            :address="order.delivery_address"
          />
          <div v-if="order.delivery_address" class="delivery-details">
            <strong>Delivery</strong>
            <span>{{ order.delivery_address }}</span>
            <span>{{ order.delivery_phone }}</span>
            <a
              :href="destinationMapLink(order)"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open delivery address in Google Maps
            </a>
            <a
              v-if="order.delivery_location && isTrackable(order)"
              :href="googleMapsLink(order)"
              target="_blank"
              rel="noopener noreferrer"
              class="tracking-link"
            >
              Track courier location in Google Maps
            </a>
            <small v-if="order.delivery_location && isTrackable(order)">
              Courier location updated {{ formatDate(order.delivery_location.recorded_at) }}
              <span v-if="isLocationStale(order.delivery_location)" class="stale-label">
                · Stale — waiting for a newer update
              </span>
            </small>
            <small v-else-if="isTrackable(order)" class="tracking-waiting">
              Waiting for the courier to share a location.
            </small>
            <span v-if="order.delivery_person">Courier: {{ order.delivery_person }}</span>
          </div>
          <div v-if="isTrackable(order)" class="tracking-card">
            <div class="tracking-card-header">
              <div>
                <strong>Delivery tracking</strong>
                <small>{{ trackingMessage(order) }}</small>
              </div>
              <span class="live-dot" :class="{ stale: !order.delivery_location || isLocationStale(order.delivery_location) }">
                {{ order.delivery_location && !isLocationStale(order.delivery_location) ? 'LIVE' : 'WAITING' }}
              </span>
            </div>
            <div class="tracking-steps">
              <span :class="{ complete: hasReachedStatus(order.delivery_status, 'assigned') }">Assigned</span>
              <span :class="{ complete: hasReachedStatus(order.delivery_status, 'out_for_delivery') }">
                Out for delivery
              </span>
              <span :class="{ complete: order.delivery_status === 'delivered' }">Delivered</span>
            </div>
          </div>
          <div v-if="order.delivery_timeline?.length" class="timeline">
            <strong>Delivery timeline</strong>
            <div v-for="event in order.delivery_timeline" :key="event.id" class="timeline-event">
              <span class="timeline-dot"></span>
              <div>
                <b>{{ formatStatus(event.status) }}</b>
                <small>
                  {{ event.note }}
                  <span v-if="event.recipient_name"> · Received by {{ event.recipient_name }}</span>
                  · {{ formatDate(event.created_at) }}
                </small>
              </div>
            </div>
          </div>
        </article>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { IonPage, IonContent, IonButton, IonSpinner } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import LiveDeliveryMap from '../components/LiveDeliveryMap.vue';
import { getUserOrders, getUser } from '../services/api';

const orders = ref([]);
const loading = ref(true);
const error = ref('');
let refreshTimer;
const activeDeliveries = computed(() =>
  orders.value.filter((order) => order.delivery_status === 'out_for_delivery')
);
const trackableDeliveries = computed(() =>
  orders.value.filter((order) => isTrackable(order))
);

const formatPrice = (price) => parseFloat(price).toFixed(2);

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

const destinationMapLink = (order) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    order.delivery_address || ''
  )}`;

const isTrackable = (order) =>
  ['assigned', 'out_for_delivery'].includes(order.delivery_status);

const hasReachedStatus = (status, target) => {
  const order = ['pending', 'assigned', 'out_for_delivery', 'delivered'];
  return order.indexOf(status) >= order.indexOf(target);
};

const trackingMessage = (order) => {
  if (order.delivery_location && !isLocationStale(order.delivery_location)) {
    return `Last location update: ${formatDate(order.delivery_location.recorded_at)}`;
  }
  return 'Location sharing has not started or needs an update.';
};

const isLocationStale = (location) =>
  Date.now() - new Date(location.recorded_at).getTime() > 120000;

const fetchOrders = async (showLoading = true) => {
  if (showLoading) loading.value = true;
  error.value = '';

  const user = getUser();
  if (!user) {
    error.value = 'Please log in to view orders.';
    loading.value = false;
    return;
  }

  try {
    const res = await getUserOrders(user.id);
    orders.value = res.data;
  } catch (err) {
    error.value =
      err.response?.data?.message || 'Could not load orders.';
  } finally {
    if (showLoading) loading.value = false;
  }
};

const refreshOrders = () => fetchOrders(false);

onMounted(() => fetchOrders());
onMounted(() => {
  refreshTimer = window.setInterval(() => {
    if (trackableDeliveries.value.length) {
      refreshOrders();
    }
  }, 15000);
});
onBeforeUnmount(() => window.clearInterval(refreshTimer));
</script>

<style scoped>
.orders-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.tracking-refresh {
  margin: -0.8rem 0 1.25rem;
  color: #777;
  font-size: 0.8rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: #ff4d8d;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 1.5rem;
  font-size: clamp(1.8rem, 4vw, 2.4rem);
}

.order-block {
  padding: 1.1rem 0;
  border-top: 1px solid #f3d6e3;
}

.order-top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.meta {
  margin: 0;
  color: #5c5c5c;
  font-size: 0.9rem;
}

.delivery-status {
  display: inline-block;
  margin-top: 0.35rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: #fff0f5;
  color: #d4146a;
  font-size: 0.75rem;
  font-weight: 700;
}

.delivery-details {
  display: grid;
  gap: 0.2rem;
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid #f3d6e3;
  color: #5c5c5c;
  font-size: 0.85rem;
}

.delivery-details strong {
  color: #161616;
}

.delivery-details a {
  color: #d4146a;
  font-weight: 700;
  text-decoration: none;
}

.tracking-link {
  display: inline-flex;
  width: fit-content;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  background: #fff0f5;
}

.tracking-waiting {
  color: #a45b78;
}

.stale-label {
  color: #b86b00;
  font-weight: 700;
}

.tracking-card {
  display: grid;
  gap: 0.9rem;
  margin-top: 1rem;
  padding: 0.9rem;
  border: 1px solid #f3d6e3;
  border-radius: 14px;
  background: linear-gradient(135deg, #fff8fb, #fff);
}

.tracking-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.tracking-card-header strong,
.tracking-card-header small {
  display: block;
}

.tracking-card-header small {
  margin-top: 0.2rem;
  color: #777;
  font-size: 0.78rem;
}

.live-dot {
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  background: #e5f8ee;
  color: #198754;
  font-size: 0.65rem;
  font-weight: 800;
}

.live-dot.stale {
  background: #fff3df;
  color: #a45b00;
}

.tracking-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.tracking-steps span {
  padding-top: 0.45rem;
  border-top: 3px solid #eadfe5;
  color: #999;
  font-size: 0.72rem;
  text-align: center;
}

.tracking-steps span.complete {
  border-color: #ff4d8d;
  color: #d4146a;
  font-weight: 700;
}


.timeline {
  display: grid;
  gap: 0.7rem;
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid #f3d6e3;
}

.timeline-event {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
}

.timeline-dot {
  width: 0.55rem;
  height: 0.55rem;
  margin-top: 0.3rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #ff4d8d;
}

.timeline-event b,
.timeline-event small {
  display: block;
}

.timeline-event small {
  margin-top: 0.15rem;
  color: #777;
  font-size: 0.78rem;
}

.order-items {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.order-item {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.order-item img {
  width: 52px;
  height: 52px;
  object-fit: cover;
  background: #fff0f5;
}

.order-item h3 {
  margin: 0 0 0.15rem;
  font-size: 0.95rem;
}

.order-item p {
  margin: 0;
  color: #5c5c5c;
  font-size: 0.85rem;
}

@media (max-width: 480px) {
  .orders-shell {
    padding: 1rem 0.85rem 2rem;
  }

  h1 {
    margin-bottom: 1rem;
    font-size: 1.8rem;
  }

  .order-top {
    align-items: flex-start;
    gap: 0.5rem;
  }

  .price-text {
    white-space: nowrap;
  }

  .meta {
    font-size: 0.78rem;
  }

  .tracking-card,
  .delivery-details {
    padding: 0.75rem;
  }

  .tracking-card-header {
    gap: 0.5rem;
  }

  .tracking-card-header small {
    line-height: 1.35;
  }

  .tracking-steps span {
    font-size: 0.66rem;
    line-height: 1.2;
  }
}
</style>
