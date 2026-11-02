<template>
  <ion-page>
    <Navbar title="Delivery dashboard" :show-back="false" :show-cart="false" :show-orders="false" />
    <ion-content class="page-shell">
      <main class="delivery-shell">
        <header>
          <p class="eyebrow">Courier workspace</p>
          <h1>My deliveries</h1>
          <p>Update customers as each order moves to their door.</p>
        </header>

        <p v-if="error" class="error-msg">{{ error }}</p>
        <div v-if="loading" class="empty-state">Loading deliveries...</div>
        <div v-else-if="orders.length === 0" class="empty-state">
          <h2>No assigned deliveries</h2>
          <p>New assignments will appear here.</p>
        </div>
        <section v-else class="delivery-list">
          <article v-for="order in orders" :key="order.id" class="delivery-card">
            <div class="order-head">
              <div>
                <p class="meta">Order #{{ order.id }} · {{ formatDate(order.created_at) }}</p>
                <h2>{{ order.customer_name }}</h2>
              </div>
              <strong class="price-text">₱{{ formatPrice(order.total) }}</strong>
            </div>
            <div v-if="order.delivery_status === 'assigned' && !order.delivery_accepted_at" class="accept-row">
              <span>New delivery assignment</span>
              <button
                type="button"
                class="primary-btn"
                :disabled="savingId === order.id"
                @click="acceptDelivery(order)"
              >
                {{ savingId === order.id ? 'Accepting...' : 'Accept delivery' }}
              </button>
            </div>
            <div class="address">
              <strong>Deliver to</strong>
              <span>{{ order.delivery_address || 'No address provided' }}</span>
              <span>{{ order.delivery_phone || 'No phone number' }}</span>
              <a
                v-if="order.delivery_address"
                :href="googleMapsLink(order)"
                target="_blank"
                rel="noopener noreferrer"
                class="map-link"
              >
                Open route in Google Maps
              </a>
              <small v-if="order.delivery_location">
                Location updated {{ formatDate(order.delivery_location.recorded_at) }}
                <span v-if="isLocationStale(order.delivery_location)" class="stale-label"> · Stale</span>
              </small>
            </div>
            <div class="actions">
              <span class="status">{{ formatStatus(order.delivery_status) }}</span>
              <select
                :value="order.delivery_status"
                :disabled="savingId === order.id"
                @change="changeStatus(order, $event.target.value)"
              >
                <option value="assigned">Assigned</option>
                <option value="out_for_delivery">Out for delivery</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div v-if="proofOrderId === order.id" class="proof-form">
              <strong>Confirm delivery</strong>
              <input
                v-model="recipientName"
                type="text"
                maxlength="100"
                placeholder="Recipient name"
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                @change="proofPhoto = $event.target.files?.[0] || null"
              />
              <label>
                <input v-model="proofConfirmed" type="checkbox" />
                I confirm this order was handed to the recipient.
              </label>
              <div class="proof-actions">
                <button type="button" class="primary-btn" @click="submitProof(order)">
                  Confirm delivered
                </button>
                <button type="button" class="secondary-btn" @click="cancelProof">
                  Cancel
                </button>
              </div>
            </div>
            <div v-if="order.delivery_timeline?.length" class="timeline">
              <strong>Timeline</strong>
              <div v-for="event in order.delivery_timeline" :key="event.id" class="timeline-event">
                <span class="timeline-dot"></span>
                <div>
                  <b>{{ formatStatus(event.status) }}</b>
                  <small>
                    {{ event.note }}
                    <span v-if="event.recipient_name"> · Received by {{ event.recipient_name }}</span>
                    · {{ formatDate(event.created_at) }}
                  </small>
                  <img v-if="event.photoUrl" :src="event.photoUrl" alt="Delivery proof" class="proof-photo" />
                </div>
              </div>
            </div>
          </article>
        </section>
        <section v-if="orders.length" class="analytics-grid" aria-label="Delivery analytics">
          <div class="analytics-card"><strong>{{ analytics.assigned }}</strong><span>Assigned</span></div>
          <div class="analytics-card"><strong>{{ analytics.active }}</strong><span>Out for delivery</span></div>
          <div class="analytics-card"><strong>{{ analytics.delivered }}</strong><span>Delivered</span></div>
          <div class="analytics-card"><strong>{{ analytics.today }}</strong><span>Delivered today</span></div>
        </section>
        <label v-if="hasActiveDelivery" class="location-consent">
          <input v-model="locationConsent" type="checkbox" @change="syncLocationSharing" />
          Share my location with customers and the store while I deliver active orders.
        </label>
        <p v-if="locationMessage" class="location-message">{{ locationMessage }}</p>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { IonPage, IonContent } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import {
  getAssignedDeliveries,
  updateAssignedDelivery,
  getProofPhoto,
  updateDeliveryLocation,
  acceptAssignedDelivery,
} from '../services/api';

const orders = ref([]);
const loading = ref(true);
const savingId = ref(null);
const error = ref('');
const proofOrderId = ref(null);
const recipientName = ref('');
const proofConfirmed = ref(false);
const proofPhoto = ref(null);
const locationMessage = ref('');
const locationConsent = ref(false);
const watchIds = new Map();
const lastLocationSent = new Map();
let refreshTimer;

const analytics = computed(() => {
  const today = new Date().toDateString();
  return {
    assigned: orders.value.filter((order) => order.delivery_status === 'assigned').length,
    active: orders.value.filter((order) => order.delivery_status === 'out_for_delivery').length,
    delivered: orders.value.filter((order) => order.delivery_status === 'delivered').length,
    today: orders.value.filter(
      (order) =>
        order.delivery_status === 'delivered' &&
        order.delivery_timeline?.some(
          (event) => event.status === 'delivered' && new Date(event.created_at).toDateString() === today
        )
    ).length,
  };
});

const googleMapsLink = (order) => {
  const location = order.delivery_location;
  const destination = encodeURIComponent(order.delivery_address || '');
  const origin = location
    ? `&origin=${location.latitude},${location.longitude}`
    : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${origin}`;
};

const sendLocation = (order, position) => {
  const now = Date.now();
  if (now - (lastLocationSent.get(order.id) || 0) < 10000) return;
  lastLocationSent.set(order.id, now);
  updateDeliveryLocation(
    order.id,
    position.coords.latitude,
    position.coords.longitude,
    position.coords.accuracy
  )
    .then(({ data }) => {
      order.delivery_location = data;
    })
    .catch(() => {
      locationMessage.value = 'Location sharing stopped for an inactive delivery.';
      stopLocation(order);
    });
};

const startLocation = (order) => {
  if (!navigator.geolocation) {
    locationMessage.value =
      'Location is unavailable in this browser. Use HTTPS on a phone or the installed mobile app.';
    return;
  }
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    locationMessage.value =
      'Phone location requires HTTPS. Open the deployed secure site or mobile app.';
    return;
  }
  if (watchIds.has(order.id)) return;
  locationMessage.value = 'Sharing your location for active deliveries.';
  const watchId = navigator.geolocation.watchPosition(
    (position) => sendLocation(order, position),
    () => {
      locationMessage.value = 'Allow location access to share live delivery progress.';
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
  watchIds.set(order.id, watchId);
};

const stopLocation = (order) => {
  const watchId = watchIds.get(order.id);
  if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
  watchIds.delete(order.id);
  lastLocationSent.delete(order.id);
};

const isLocationStale = (location) =>
  !location || Date.now() - new Date(location.recorded_at).getTime() > 120000;

const hasActiveDelivery = computed(() =>
  orders.value.some((order) => order.delivery_status === 'out_for_delivery')
);

const syncLocationSharing = () => {
  orders.value.forEach((order) => {
    if (order.delivery_status === 'out_for_delivery' && locationConsent.value) startLocation(order);
    else stopLocation(order);
  });
};

const formatPrice = (price) => parseFloat(price || 0).toFixed(2);
const formatDate = (date) =>
  new Date(date).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const formatStatus = (status) =>
  (status || 'assigned')
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const loadDeliveries = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await getAssignedDeliveries();
    orders.value = response.data;
    await loadProofPhotos();
    syncLocationSharing();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load deliveries.';
  } finally {
    loading.value = false;
  }

};

const refreshDeliveries = async () => {
  try {
    const response = await getAssignedDeliveries();
    orders.value = response.data;
    await loadProofPhotos();
    syncLocationSharing();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not refresh deliveries.';
  }
};

const loadProofPhotos = async () => {
  const events = orders.value.flatMap((order) => order.delivery_timeline || []);
  await Promise.all(
    events
      .filter((event) => event.photo_filename)
      .map(async (event) => {
        event.photoUrl = await getProofPhoto(event.id);
      })
  );
};

const changeStatus = async (order, status) => {
  if (status === 'delivered') {
    proofOrderId.value = order.id;
    recipientName.value = '';
    proofConfirmed.value = false;
    return;
  }

  savingId.value = order.id;
  error.value = '';
  try {
    const response = await updateAssignedDelivery(order.id, status);
    Object.assign(order, response.data);
    syncLocationSharing();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not update delivery.';
  } finally {
    savingId.value = null;
  }
};

const acceptDelivery = async (order) => {
  savingId.value = order.id;
  error.value = '';
  try {
    const response = await acceptAssignedDelivery(order.id);
    Object.assign(order, response.data);
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not accept delivery.';
  } finally {
    savingId.value = null;
  }
};

const cancelProof = () => {
  proofOrderId.value = null;
  recipientName.value = '';
  proofConfirmed.value = false;
  proofPhoto.value = null;
};

const submitProof = async (order) => {
  if (!recipientName.value.trim() || !proofConfirmed.value) {
    error.value = 'Enter the recipient name and confirm the handover.';
    return;
  }

  savingId.value = order.id;
  error.value = '';
  try {
    const response = await updateAssignedDelivery(
      order.id,
      'delivered',
      recipientName.value.trim(),
      true,
      proofPhoto.value
    );
    Object.assign(order, response.data);
    cancelProof();
    stopLocation(order);
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not save proof of delivery.';
  } finally {
    savingId.value = null;
  }
};

onMounted(async () => {
  await loadDeliveries();
  refreshTimer = window.setInterval(refreshDeliveries, 15000);
});
onBeforeUnmount(() => {
  window.clearInterval(refreshTimer);
  orders.value.forEach(stopLocation);
});
</script>

<style scoped>
.delivery-shell {
  max-width: 760px;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: #ff4d8d;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3rem);
}

.delivery-shell > header > p:last-child {
  color: #666;
}

.delivery-list {
  display: grid;
  gap: 1rem;
  margin-top: 2rem;
}

.delivery-card {
  padding: 1.1rem;
  border: 1px solid #f3d6e3;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(80, 20, 50, 0.06);
}

.analytics-grid {
  grid-template-columns: repeat(2, 1fr);
}

.accept-row {
  align-items: stretch;
  flex-direction: column;
}

.order-head,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.order-head h2 {
  margin: 0.25rem 0 0;
  font-size: 1.1rem;
}

.accept-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 1rem 0;
  padding: 0.8rem;
  border-radius: 12px;
  background: #fff5f9;
  color: #555;
}

.analytics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.analytics-card {
  display: grid;
  gap: 0.2rem;
  padding: 0.85rem;
  border: 1px solid #f3d6e3;
  border-radius: 14px;
  background: #fff;
}

.analytics-card strong {
  font-size: 1.4rem;
  color: #d4146a;
}

.analytics-card span {
  color: #666;
  font-size: 0.78rem;
}

.meta {
  margin: 0;
  color: #777;
  font-size: 0.8rem;
}

.address {
  display: grid;
  gap: 0.25rem;
  margin: 1rem 0;
  padding: 0.8rem;
  border-radius: 12px;
  background: #fff5f9;
  color: #555;
}

.address strong {
  color: #161616;
}

.map-link {
  color: #d4146a;
  font-weight: 700;
  text-decoration: none;
}

.location-message {
  margin-top: 1rem;
  color: #666;
  font-size: 0.9rem;
}

.status {
  color: #d4146a;
  font-weight: 700;
}

select {
  padding: 0.65rem;
  border: 1px solid #e8c8d8;
  border-radius: 9px;
  background: #fff;
  font: inherit;
}

.proof-form {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
  padding: 0.85rem;
  border: 1px solid #f3d6e3;
  border-radius: 12px;
  background: #fff8fb;
}

.proof-form > input {
  padding: 0.65rem;
  border: 1px solid #e8c8d8;
  border-radius: 9px;
  font: inherit;
}

.proof-form label {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  color: #555;
  font-size: 0.85rem;
}

.proof-actions {
  display: flex;
  gap: 0.65rem;
}

.secondary-btn {
  padding: 0.65rem 0.9rem;
  border: 1px solid #e8c8d8;
  border-radius: 9px;
  background: #fff;
  color: #555;
  cursor: pointer;
}

.timeline {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid #f3d6e3;
}

@media (max-width: 480px) {
  .delivery-shell {
    padding: 1rem 0.85rem 2rem;
  }

  .delivery-shell > header {
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 1.8rem;
  }

  .delivery-list {
    gap: 0.75rem;
    margin-top: 1.25rem;
  }

  .delivery-card {
    padding: 0.85rem;
    border-radius: 14px;
  }

  .order-head,
  .actions {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.6rem;
  }

  .order-head .price-text {
    align-self: flex-end;
    margin-top: -2.1rem;
  }

  .accept-row,
  .proof-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-btn,
  .secondary-btn,
  .actions select {
    width: 100%;
    min-height: 44px;
  }

  .analytics-grid {
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .analytics-card {
    padding: 0.65rem;
  }

  .analytics-card strong {
    font-size: 1.2rem;
  }

  .location-consent {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    margin-top: 1rem;
    line-height: 1.35;
  }
}

.timeline-event {
  display: flex;
  gap: 0.6rem;
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

.proof-photo {
  display: block;
  width: 120px;
  max-height: 120px;
  margin-top: 0.5rem;
  border-radius: 8px;
  object-fit: cover;
}

.error-msg {
  margin-top: 1rem;
  color: #d4146a;
  font-weight: 600;
}
</style>
