<template>
  <ion-page>
    <Navbar title="My Orders" :show-back="true" />

    <ion-content class="page-shell">
      <section v-if="deliveryUpdates.length" class="delivery-notifications">
        <strong>Delivery updates</strong>
        <article v-for="notification in deliveryUpdates" :key="notification.id">
          <span>{{ notification.message }}</span>
          <button v-if="!notification.read_at" type="button" @click="readNotification(notification)">Mark read</button>
        </article>
      </section>
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
              <p class="meta">{{ order.shipment?.shipment_code || ('Order #' + order.id) }} · {{ formatDate(order.created_at) }}</p>
              <span class="delivery-status">{{ formatStatus(order.delivery_status) }}</span>
            </div>
            <strong class="price-text">PHP {{ formatPrice(order.total) }}</strong>
          </div>
          <section class="delivery-guidance" aria-live="polite">
            <strong>What happens next?</strong>
            <p>{{ deliveryGuidance(order) }}</p>
          </section>
          <section v-if="deliveryCodeNotification(order)" class="delivery-code-card">
            <div>
              <strong>Delivery handover code</strong>
              <p>Show this to the rider only when your order is being handed to you.</p>
              <code v-if="deliveryCode(deliveryCodeNotification(order))">{{ deliveryCode(deliveryCodeNotification(order)) }}</code>
              <span v-else>{{ deliveryCodeNotification(order).message }}</span>
            </div>
            <button
              v-if="!deliveryCodeNotification(order).read_at"
              type="button"
              @click="readNotification(deliveryCodeNotification(order))"
            >
              Mark seen
            </button>
          </section>

          <div class="order-items">
            <div class="order-item" v-for="item in order.items" :key="item.id">
              <img :src="item.image_url" :alt="item.product_name" />
              <div>
                <h3>{{ item.product_name }}</h3>
                <p>Qty {{ item.quantity }} ? PHP {{ formatPrice(item.price) }}</p>
              </div>
            </div>
          </div>
          <div v-if="isTrackable(order)" :id="`delivery-map-${order.id}`">
            <LiveDeliveryMap :location="order.delivery_location" />
          </div>
          <div v-if="order.delivery_address" class="delivery-details">
            <strong>Delivery</strong>
            <span v-if="order.shipment?.estimated_delivery_at">Estimated arrival: {{ formatDate(order.shipment.estimated_delivery_at) }}</span>
            <span v-if="order.shipment">Zone: {{ order.shipment.zone_name }} ? Fee PHP {{ formatPrice(order.shipment.delivery_fee) }}</span>
            <span>{{ order.delivery_address }}</span>
            <span v-if="order.delivery_instructions">Instructions: {{ order.delivery_instructions }}</span>
            <span>{{ order.delivery_phone }}</span>
            <button v-if="isTrackable(order)" type="button" class="tracking-link" @click="openDeliveryMap(order)">
              View in-app delivery map
            </button>
            <small v-if="order.delivery_location && isTrackable(order)">
              Courier location updated {{ formatDate(order.delivery_location.recorded_at) }}
              <span v-if="isLocationStale(order.delivery_location)" class="stale-label">
                ? Stale ? waiting for a newer update
              </span>
            </small>
            <small v-else-if="isTrackable(order)" class="tracking-waiting">
              Waiting for the courier to share a location.
            </small>
            <span v-if="order.delivery_person">Courier: {{ order.delivery_person }}</span>
          </div>
          <div v-if="hasDeliveryProgress(order)" class="tracking-card">
            <div class="tracking-card-header">
              <div>
                <strong>{{ isTrackable(order) ? 'Delivery tracking' : 'Delivery progress' }}</strong>
                <small>{{ isTrackable(order) ? trackingMessage(order) : deliveryGuidance(order) }}</small>
              </div>
              <span v-if="isTrackable(order)" class="live-dot" :class="{ stale: !order.delivery_location || isLocationStale(order.delivery_location) }">
                {{ order.delivery_location && !isLocationStale(order.delivery_location) ? 'LIVE' : 'WAITING' }}
              </span>
            </div>
            <div class="tracking-steps">
              <span
                v-for="(step, index) in deliveryProgressSteps"
                :key="step"
                :aria-current="deliveryProgressIndex(order) === index ? 'step' : null"
                :class="{
                  complete: isDeliveryStepComplete(order, index),
                  current: deliveryProgressIndex(order) === index && order.delivery_status !== 'delivered',
                }"
              >{{ step }}</span>
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
                  <span v-if="event.recipient_name"> ? Received by {{ event.recipient_name }}</span>
                  ? {{ formatDate(event.created_at) }}
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
import { ref, computed, onBeforeUnmount } from 'vue';
import { IonPage, IonContent, IonButton, IonSpinner, onIonViewWillEnter, onIonViewWillLeave } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import LiveDeliveryMap from '../components/LiveDeliveryMap.vue';
import {
  getUserOrders, getUser, getDeliveryNotifications, markDeliveryNotificationRead,
} from '../services/api';

const orders = ref([]);
const loading = ref(true);
const error = ref('');
const notifications = ref([]);
const mapOpen = ref({});
let refreshTimer;
const deliveryProgressSteps = ['Rider assigned', 'Picked up', 'On the way', 'Delivered'];
const deliveryUpdates = computed(() => notifications.value.filter((item) => item.kind !== 'delivery_otp'));
const activeDeliveries = computed(() =>
  orders.value.filter((order) => ['picked_up', 'out_for_delivery'].includes(order.delivery_status))
);
const hasOpenShipments = computed(() => orders.value.some((order) =>
  !['delivered', 'cancelled', 'return_to_warehouse'].includes(order.delivery_status)
));

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

const openDeliveryMap = (order) => {
  mapOpen.value[order.id] = true;
  window.setTimeout(() => document.getElementById(`delivery-map-${order.id}`)?.scrollIntoView({
    behavior: 'smooth', block: 'center',
  }), 0);
};

const isTrackable = (order) =>
  ['rider_assigned', 'accepted_by_rider', 'picked_up', 'out_for_delivery'].includes(order.delivery_status);

const hasDeliveryProgress = (order) =>
  deliveryProgressIndex(order) >= 0;

const deliveryProgressIndex = (order) => ({
  rider_assigned: 0,
  accepted_by_rider: 0,
  picked_up: 1,
  out_for_delivery: 2,
  delivery_failed: 2,
  rescheduled: 2,
  delivered: 3,
}[order.delivery_status] ?? -1);

const isDeliveryStepComplete = (order, index) =>
  order.delivery_status === 'delivered' || deliveryProgressIndex(order) > index;

const deliveryGuidance = (order) => ({
  pending: 'Your order is awaiting confirmation from the store.',
  ready_for_delivery: 'The store is preparing your order and will assign a rider next.',
  rider_assigned: 'A rider has been assigned and is preparing to pick up your order.',
  accepted_by_rider: 'The rider accepted the delivery and will pick up your order from the store.',
  picked_up: 'The rider has your order. Delivery will begin shortly.',
  out_for_delivery: order.payment_method === 'cod'
    ? 'Your order is on the way. Keep your phone nearby and prepare the COD amount shown in your order.'
    : 'Your order is on the way. Keep your phone nearby so the rider can reach you.',
  delivery_failed: 'The delivery attempt was unsuccessful. The store or rider will update you about the next attempt.',
  rescheduled: 'Your delivery is being rescheduled. Check back here for the next update.',
  delivered: 'Your order has been delivered. Review the delivery timeline below for handover details.',
  return_to_warehouse: 'Your order is returning to the store. Contact the store for help with next steps.',
  cancelled: 'This order was cancelled.',
}[order.delivery_status] || 'Check the delivery status and timeline below for the latest update.');

const deliveryCodeNotification = (order) => {
  if (!order.shipment?.id) return null;
  return notifications.value.find((notification) =>
    notification.kind === 'delivery_otp' &&
    String(notification.shipment_id) === String(order.shipment.id)
  ) || null;
};

const deliveryCode = (notification) =>
  notification.message.match(/\b\d{6}\b/)?.[0] || '';

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
    const [res, notificationResponse] = await Promise.all([
      getUserOrders(user.id), getDeliveryNotifications(),
    ]);
    orders.value = res.data;
    notifications.value = notificationResponse.data;
  } catch (err) {
    error.value =
      err.response?.data?.message || 'Could not load orders.';
  } finally {
    if (showLoading) loading.value = false;
  }
};

const readNotification = async (notification) => {
  try {
    await markDeliveryNotificationRead(notification.id);
    notification.read_at = new Date().toISOString();
  } catch {
    error.value = 'Could not mark delivery update as read.';
  }
};

const refreshOrders = () => fetchOrders(false);

const enterOrdersPage = () => {
  fetchOrders();
  refreshTimer = window.setInterval(() => {
    if (hasOpenShipments.value) {
      refreshOrders();
    }
  }, 15000);
};
const leaveOrdersPage = () => window.clearInterval(refreshTimer);
onIonViewWillEnter(enterOrdersPage);
onIonViewWillLeave(leaveOrdersPage);
onBeforeUnmount(leaveOrdersPage);
</script>

<style scoped>
.orders-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.delivery-notifications {
  max-width: 720px;
  margin: 1rem auto 0;
  padding: .9rem 1rem;
  border-radius: 14px;
  background: #fff2f7;
  color: #54263b;
}

.delivery-notifications article {
  display: flex;
  justify-content: space-between;
  gap: .7rem;
  padding-top: .55rem;
  font-size: .85rem;
}

.delivery-notifications button {
  min-height: 44px;
  padding: .35rem .55rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #a72355;
  font-weight: 700;
}

.delivery-guidance {
  margin: .75rem 0;
  padding: .8rem .9rem;
  border-left: 4px solid #ff4d8d;
  border-radius: 0 12px 12px 0;
  background: #fff7fa;
}

.delivery-guidance strong {
  color: #54263b;
}

.delivery-guidance p {
  margin: .25rem 0 0;
  color: #5c5c5c;
  font-size: .88rem;
  line-height: 1.45;
}

.delivery-code-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  margin: .75rem 0;
  padding: .85rem;
  border: 1px solid #f1c8d9;
  border-radius: 14px;
  background: #fff2f7;
}

.delivery-code-card p {
  margin: .25rem 0 .45rem;
  color: #675962;
  font-size: .82rem;
  line-height: 1.4;
}

.delivery-code-card code {
  display: inline-block;
  padding: .3rem .6rem;
  border-radius: 8px;
  background: white;
  color: #a72355;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: .16em;
}

.delivery-code-card button {
  min-height: 44px;
  flex: 0 0 auto;
  padding: .5rem .7rem;
  border: 0;
  border-radius: 8px;
  background: #a72355;
  color: white;
  font: inherit;
  font-weight: 700;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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

.tracking-steps span.current {
  border-color: #ff4d8d;
  color: #a72355;
  font-weight: 800;
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

  .tracking-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 0.6rem;
  }

  .delivery-notifications article {
    align-items: flex-start;
    flex-direction: column;
  }

  .delivery-code-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .delivery-notifications button,
  .tracking-link,
  .delivery-code-card button {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
}
</style>
