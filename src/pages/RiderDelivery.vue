<template>
  <ion-page>
    <Navbar title="Rider dashboard" :show-back="false" :show-cart="false" :show-orders="false" />
    <ion-content class="page-shell">
      <main class="rider-shell">
        <header class="page-head">
          <p class="eyebrow">Company delivery fleet</p>
          <h1>My shipments</h1>
          <p>Accept an assignment, scan through each delivery step, and verify handover with the customer code.</p>
        </header>

        <p v-if="error" class="notice error">{{ error }}</p>
        <p v-if="message" class="notice success">{{ message }}</p>
        <section v-if="notifications.length" class="notifications">
          <strong>Updates</strong>
          <button v-for="notification in unreadNotifications" :key="notification.id" @click="readNotification(notification)">
            {{ notification.message }}
          </button>
        </section>
        <div v-if="loading" class="empty">Loading shipments…</div>
        <div v-else-if="!shipments.length" class="empty"><h2>No assigned shipments</h2><p>New dispatches will appear here.</p></div>

        <section v-else class="shipment-list">
          <article v-for="shipment in shipments" :key="shipment.id" class="shipment-card">
            <header class="shipment-head">
              <div><span class="shipment-code">{{ shipment.shipment_code }}</span><span class="status-pill">{{ label(shipment.status) }}</span>
                <h2>Order #{{ shipment.order_id }} · {{ shipment.customer_name }}</h2>
                <p>Order value PHP {{ money(shipment.order_total) }}<template v-if="shipment.payment_method === 'cod'"> · Collect PHP {{ money(shipment.expected_cod) }}</template></p>
              <small v-if="shipment.estimated_delivery_at">Estimated delivery {{ dateTime(shipment.estimated_delivery_at) }}</small>
              </div>
              <button class="refresh" :disabled="savingId === shipment.id" @click="refreshShipments">Refresh</button>
            </header>

            <div class="address-block">
              <strong>Deliver to</strong>
              <span>{{ shipment.delivery_address }}</span>
              <span v-if="shipment.delivery_instructions">Instructions: {{ shipment.delivery_instructions }}</span>
              <a :href="`tel:${shipment.delivery_phone}`">{{ shipment.delivery_phone }}</a>
              <a
                v-if="shipment.delivery_address"
                class="secondary navigation-link"
                :href="navigationUrl(shipment.delivery_address)"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open navigation (shares address with Google Maps when opened)
              </a>
              <button v-if="shipment.delivery_address || shipment.latitude != null" type="button" class="secondary" @click="mapOpen[shipment.id] = !mapOpen[shipment.id]">
                {{ mapOpen[shipment.id] ? 'Hide in-app map' : 'View in-app map' }}
              </button>
              <small v-if="shipment.location_recorded_at">GPS updated {{ dateTime(shipment.location_recorded_at) }}<span v-if="isLocationStale(shipment.location_recorded_at)"> · stale</span></small>
            </div>
            <div v-if="mapOpen[shipment.id]" class="in-app-map">
              <LiveDeliveryMap
                :location="shipment.latitude != null ? { latitude: shipment.latitude, longitude: shipment.longitude } : null"
              />
            </div>

            <div class="workflow-actions" v-if="shipment.is_current_assignment && !['delivered', 'cancelled', 'return_to_warehouse', 'rescheduled'].includes(shipment.status)">
              <button v-if="shipment.status === 'rider_assigned'" class="primary" :disabled="savingId === shipment.id" @click="accept(shipment)">Accept assignment</button>
              <button v-if="shipment.status === 'accepted_by_rider'" class="primary" :disabled="savingId === shipment.id" @click="setStatus(shipment, 'picked_up')">Mark picked up</button>
              <button v-if="shipment.status === 'picked_up'" class="primary" :disabled="savingId === shipment.id" @click="setStatus(shipment, 'out_for_delivery')">Start delivery</button>
              <template v-if="shipment.status === 'out_for_delivery'">
                <button class="primary" @click="openProof(shipment)">Confirm delivery</button>
                <button class="secondary" @click="openFailure(shipment)">Report unsuccessful</button>
              </template>
              <template v-if="shipment.status === 'delivery_failed'">
                <label>Reschedule for <input v-model="rescheduleAt[shipment.id]" type="datetime-local" /></label>
                <button class="primary" :disabled="!rescheduleAt[shipment.id]" @click="reschedule(shipment)">Reschedule</button>
                <button class="secondary" @click="setStatus(shipment, 'return_to_warehouse')">Return to warehouse</button>
              </template>
            </div>

            <form v-if="proofShipmentId === shipment.id" class="action-form" @submit.prevent="submitProof(shipment)">
              <h3>Verify delivery</h3>
              <label>Customer delivery code<input v-model="proof.otp" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" /></label>
              <label>Recipient name<input v-model="proof.recipient_name" required maxlength="100" placeholder="Name of person receiving the order" /></label>
              <label v-if="shipment.payment_method === 'cod'">Cash collected (PHP)<input v-model="proof.actual_cod" required type="number" min="0" step="0.01" /></label>
              <label>Proof photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" @change="proof.photo = $event.target.files?.[0] || null" /></label>
              <label class="confirm"><input v-model="proof.confirmed" type="checkbox" /> I handed the order to the named recipient.</label>
              <div class="form-actions"><button class="primary" :disabled="savingId === shipment.id">{{ savingId === shipment.id ? 'Saving…' : 'Complete delivery' }}</button><button type="button" class="secondary" @click="cancelForms">Cancel</button></div>
            </form>

            <form v-if="failureShipmentId === shipment.id" class="action-form" @submit.prevent="reportFailure(shipment)">
              <h3>Report unsuccessful delivery</h3>
              <label>Reason<select v-model="failure.reason" required><option value="">Choose a reason</option><option value="customer_unavailable">Customer unavailable</option><option value="customer_unreachable">Customer unreachable</option><option value="incorrect_address">Incorrect delivery address</option><option value="customer_rejected">Customer rejected the order</option><option value="other">Other delivery problem</option></select></label>
              <label>Details<textarea v-model="failure.note" rows="2" placeholder="Add useful details for dispatch"></textarea></label>
              <div class="form-actions"><button class="primary" :disabled="savingId === shipment.id">Save failed attempt</button><button type="button" class="secondary" @click="cancelForms">Cancel</button></div>
            </form>

            <details class="history" v-if="shipment.history?.length">
              <summary>Delivery history ({{ shipment.history.length }})</summary>
              <div v-for="event in shipment.history" :key="event.id" class="history-item">
                <span class="timeline-dot"></span><div><b>{{ label(event.status) }}</b><small>{{ event.note }} · {{ dateTime(event.created_at) }}</small></div>
              </div>
            </details>
            <img v-if="shipment.proof_photo_url" :src="shipment.proof_photo_url" alt="Proof of delivery" class="proof-photo" />
          </article>
        </section>

        <section class="stats" aria-label="Delivery performance">
          <article><strong>{{ shipments.filter((s) => s.status === 'rider_assigned').length }}</strong><span>Assigned</span></article>
          <article><strong>{{ shipments.filter((s) => ['accepted_by_rider','picked_up','out_for_delivery'].includes(s.status)).length }}</strong><span>Active</span></article>
          <article><strong>{{ shipments.filter((s) => s.status === 'delivered').length }}</strong><span>Delivered</span></article>
          <article><strong>{{ shipments.filter((s) => s.status === 'delivery_failed').length }}</strong><span>Failed</span></article>
        </section>

        <label v-if="hasActiveDelivery" class="location-consent">
          <input v-model="locationConsent" type="checkbox" @change="syncLocationSharing" />
          {{ backgroundLocationSupported
            ? 'Share my location with the customer and dispatcher, even when this app is in the background. This uses battery; Android shows an ongoing notification and iOS may show a location indicator.'
            : 'Share my location with the customer and dispatcher while this page is open.' }}
          Turn this off to stop sharing.
        </label>
        <p v-if="locationMessage" class="location-message" role="status" aria-live="polite">
          {{ locationMessage }}
        </p>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { IonPage, IonContent, onIonViewWillEnter, onIonViewWillLeave } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import LiveDeliveryMap from '../components/LiveDeliveryMap.vue';
import {
  acceptShipment, getDeliveryNotifications, getRiderShipments, getShipmentProof,
  markDeliveryNotificationRead, updateRiderShipment,
} from '../services/api';
import {
  isRiderLocationSharing, startRiderLocationSharing, stopRiderLocationSharing,
} from '../services/riderLocationTracking';

const shipments = ref([]);
const notifications = ref([]);
const loading = ref(true);
const savingId = ref(null);
const error = ref('');
const message = ref('');
const locationMessage = ref('');
const locationConsent = ref(false);
const proofShipmentId = ref(null);
const failureShipmentId = ref(null);
const proof = reactive({ otp: '', recipient_name: '', actual_cod: '', confirmed: false, photo: null });
const failure = reactive({ reason: '', note: '' });
const rescheduleAt = reactive({});
const mapOpen = reactive({});
let refreshTimer;
let riderPageActive = false;
const unreadNotifications = computed(() => notifications.value.filter((item) => !item.read_at));
const hasActiveDelivery = computed(() => shipments.value.some((item) => item.status === 'out_for_delivery'));
const backgroundLocationSupported = Capacitor.isNativePlatform();

const label = (value = '') => String(value || 'unknown').split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
const money = (value) => Number(value || 0).toFixed(2);
const dateTime = (date) => new Date(date).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
const isLocationStale = (date) => Date.now() - new Date(date).getTime() > 120000;
const navigationUrl = (address) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
const loadProofPhotos = async () => Promise.all(shipments.value
  .filter((shipment) => shipment.photo_filename && !shipment.proof_photo_url)
  .map(async (shipment) => {
    try { shipment.proof_photo_url = await getShipmentProof(shipment.id); }
    catch { shipment.proof_photo_url = ''; }
  }));

const refreshShipments = async () => {
  try {
    const [shipmentResponse, notificationResponse] = await Promise.all([
      getRiderShipments(), getDeliveryNotifications(),
    ]);
    shipments.value = shipmentResponse.data;
    notifications.value = notificationResponse.data;
    await loadProofPhotos();
    syncLocationSharing();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not refresh shipments.';
  } finally {
    loading.value = false;
  }
};

const stopSharing = async (shipmentId) => {
  try {
    await stopRiderLocationSharing(shipmentId);
  } catch (err) {
    locationMessage.value = err.message || 'Could not stop location sharing.';
  }
};
const syncLocationSharing = () => {
  const activeShipments = shipments.value.filter((shipment) => shipment.status === 'out_for_delivery');
  if (!activeShipments.length) {
    locationConsent.value = false;
    locationMessage.value = '';
  }

  shipments.value.forEach((shipment) => {
    const shouldShare = shipment.status === 'out_for_delivery' && locationConsent.value;
    if (shouldShare && !isRiderLocationSharing(shipment.id)) {
      startRiderLocationSharing(shipment.id, {
        onStatus: (status) => { locationMessage.value = status; },
        onStopped: () => {
          locationConsent.value = false;
        },
      }).catch((err) => {
        locationConsent.value = false;
        locationMessage.value = err.message || 'Could not start location sharing.';
      });
    } else if (!shouldShare && isRiderLocationSharing(shipment.id)) {
      void stopSharing(shipment.id);
      locationMessage.value = 'Location sharing is off.';
    }
  });
};

const runStatus = async (shipment, data) => {
  savingId.value = shipment.id;
  error.value = '';
  message.value = '';
  try {
    await updateRiderShipment(shipment.id, data);
    await refreshShipments();
    message.value = `Shipment ${shipment.shipment_code} updated.`;
    syncLocationSharing();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not update shipment.';
  } finally { savingId.value = null; }
};
const accept = async (shipment) => {
  savingId.value = shipment.id; error.value = '';
  try { await acceptShipment(shipment.id); await refreshShipments(); message.value = 'Assignment accepted.'; }
  catch (err) { error.value = err.response?.data?.message || 'Could not accept shipment.'; }
  finally { savingId.value = null; }
};
const setStatus = (shipment, status) => runStatus(shipment, { status });
const openProof = (shipment) => {
  cancelForms(); proofShipmentId.value = shipment.id;
  proof.otp = ''; proof.recipient_name = ''; proof.actual_cod = shipment.payment_method === 'cod' ? String(shipment.expected_cod) : '';
  proof.confirmed = false; proof.photo = null;
};
const cancelForms = () => { proofShipmentId.value = null; failureShipmentId.value = null; failure.reason = ''; failure.note = ''; };
const submitProof = async (shipment) => {
  if (!proof.confirmed || proof.otp.trim().length !== 6 || proof.recipient_name.trim().length < 2) {
    error.value = 'Enter the 6-digit customer code, recipient name, and confirm the handover.'; return;
  }
  await runStatus(shipment, {
    status: 'delivered', otp: proof.otp.trim(), recipient_name: proof.recipient_name.trim(),
    proof_confirmed: 'true', actual_cod: shipment.payment_method === 'cod' ? proof.actual_cod : undefined,
    proof_photo: proof.photo,
  });
  if (!error.value) cancelForms();
};
const openFailure = (shipment) => { cancelForms(); failureShipmentId.value = shipment.id; failure.reason = ''; failure.note = ''; };
const reportFailure = async (shipment) => {
  if (!failure.reason) { error.value = 'Choose a reason for the unsuccessful attempt.'; return; }
  await runStatus(shipment, { status: 'delivery_failed', failure_reason: failure.reason, note: failure.note.trim() });
  if (!error.value) cancelForms();
};
const reschedule = (shipment) => runStatus(shipment, { status: 'rescheduled', rescheduled_for: new Date(rescheduleAt[shipment.id]).toISOString() });
const readNotification = async (notification) => {
  try { await markDeliveryNotificationRead(notification.id); notification.read_at = new Date().toISOString(); }
  catch { error.value = 'Could not mark update as read.'; }
};

const handleVisibilityChange = () => {
  if (backgroundLocationSupported) return;
  if (document.visibilityState === 'hidden') {
    shipments.value.forEach((shipment) => {
      if (isRiderLocationSharing(shipment.id)) void stopSharing(shipment.id);
    });
    locationMessage.value = 'Web location sharing is paused while this page is in the background.';
  } else if (riderPageActive && locationConsent.value) {
    syncLocationSharing();
  }
};

const enterRiderPage = async () => {
  riderPageActive = true;
  await refreshShipments();
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(refreshShipments, 15000);
};
const leaveRiderPage = () => {
  riderPageActive = false;
  window.clearInterval(refreshTimer);
  if (!backgroundLocationSupported) {
    shipments.value.forEach((shipment) => {
      if (isRiderLocationSharing(shipment.id)) void stopSharing(shipment.id);
    });
    locationMessage.value = 'Web location sharing is paused while you leave this page.';
  }
};
onMounted(() => document.addEventListener('visibilitychange', handleVisibilityChange));
onIonViewWillEnter(enterRiderPage);
onIonViewWillLeave(leaveRiderPage);
onBeforeUnmount(() => {
  leaveRiderPage();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<style scoped>
.rider-shell { max-width: 820px; margin: 0 auto; padding: 1.4rem 1rem calc(4rem + env(safe-area-inset-bottom)); }
.page-head { margin-bottom: 1.1rem; }.page-head h1 { margin: 0 0 .4rem; }.page-head p:last-child { color: #6f6269; }
.eyebrow { margin: 0 0 .35rem; color: #d4146a; text-transform: uppercase; letter-spacing: .14em; font-size: .75rem; font-weight: 800; }
.notice { padding: .75rem 1rem; border-radius: 12px; }.notice.error { background: #fff0f0; color: #a62a36; }.notice.success { background: #e8f7ee; color: #237548; }
.notifications { display: grid; gap: .4rem; padding: .85rem; margin-bottom: .8rem; border-radius: 13px; background: #fff2f7; }.notifications button { min-height: 44px; border: 0; background: transparent; color: #8b2450; text-align: left; font: inherit; }
.empty { padding: 2rem 1rem; border-radius: 15px; background: white; text-align: center; color: #75666e; }.shipment-list { display: grid; gap: .9rem; }
.shipment-card { display: grid; gap: .85rem; padding: 1rem; border: 1px solid #f1dce5; border-radius: 18px; background: #fff; box-shadow: 0 10px 28px rgba(50,20,35,.06); }
.shipment-head { display: flex; justify-content: space-between; gap: 1rem; }.shipment-head h2 { font-size: 1.15rem; margin: .5rem 0 .25rem; }.shipment-head p { margin: 0; color: #675962; font-size: .88rem; }
.shipment-code { margin-right: .5rem; color: #a72355; font-weight: 800; }.status-pill { display: inline-block; padding: .25rem .55rem; border-radius: 20px; background: #fff1f6; color: #92234e; font-size: .75rem; font-weight: 700; }
.refresh,.primary,.secondary { min-height: 44px; border: 0; border-radius: 10px; padding: .72rem .9rem; font: inherit; font-weight: 700; cursor: pointer; }.refresh,.secondary { background: #211a1e; color: white; }.primary { background: #ff4d8d; color: white; }.primary:disabled { opacity: .55; }
.address-block { display: grid; gap: .3rem; padding: .75rem; border-radius: 12px; background: #fbf7f9; }.address-block a { color: #a72355; }.address-block small { color: #75666e; }
.workflow-actions,.form-actions { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }.workflow-actions label { display: flex; align-items: center; gap: .35rem; }
.action-form { display: grid; gap: .7rem; padding: 1rem; border: 1px solid #efd5e0; border-radius: 13px; background: #fff9fc; }.action-form h3 { margin: 0; }.action-form label { display: grid; gap: .35rem; font-size: .85rem; font-weight: 650; }.action-form input,.action-form select,.action-form textarea,.workflow-actions input { min-width: 0; width: 100%; box-sizing: border-box; padding: .7rem; border: 1px solid #e2d2da; border-radius: 9px; background: #fff; font: inherit; }.action-form input[type=checkbox] { width: 20px; height: 20px; flex: 0 0 auto; accent-color: #d4146a; }.action-form .confirm { display: flex; align-items: center; gap: .45rem; }
.history { border-top: 1px solid #eee3e8; padding-top: .65rem; }.history summary { cursor: pointer; font-weight: 750; }.history-item { display: flex; gap: .55rem; padding: .55rem 0; }.history-item > div { display: grid; gap: .2rem; }.history-item small { color: #75666e; }.timeline-dot { width: .6rem; height: .6rem; margin-top: .25rem; border-radius: 50%; background: #ff4d8d; flex: 0 0 auto; }.proof-photo { width: min(100%, 420px); border-radius: 12px; }
.stats { display: grid; grid-template-columns: repeat(4,1fr); gap: .6rem; margin: 1rem 0; }.stats article { display: grid; gap: .2rem; padding: .8rem; border-radius: 13px; background: #211a1e; color: white; }.stats strong { color: #ff75a7; font-size: 1.3rem; }.stats span { font-size: .75rem; }
.location-consent { display: flex; gap: .55rem; align-items: start; padding: .8rem; border-radius: 12px; background: #fff2f7; }.location-consent input { width: 20px; height: 20px; flex: 0 0 auto; accent-color: #ff4d8d; margin-top: .2rem; }.location-message { color: #705c66; font-size: .85rem; }
.in-app-map { min-width: 0; }
.action-form label { min-width: 0; }
.action-form input[type=file] { max-width: 100%; }
.history summary { min-height: 44px; display: flex; align-items: center; }
@media(max-width:600px) {
  .rider-shell { padding-inline: .8rem; }
  .shipment-head { display: grid; min-width: 0; }
  .shipment-head > div { min-width: 0; overflow-wrap: anywhere; }
  .refresh { justify-self: start; }
  .stats { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .workflow-actions,.form-actions { align-items: stretch; flex-direction: column; }
  .workflow-actions > button,.form-actions > button { width: 100%; }
  .action-form input,.action-form select,.action-form textarea,.workflow-actions input { min-height: 44px; font-size: 16px; }
  .action-form textarea { min-height: 88px; }
  .action-form input[type=checkbox] { width: 20px; min-height: 20px; }
  .location-consent { align-items: flex-start; line-height: 1.4; }
}
</style>
