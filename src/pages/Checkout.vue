<template>
  <ion-page>
    <Navbar title="Checkout" :show-back="true" :show-cart="false" />

    <ion-content class="page-shell">
      <div v-if="cart.length === 0" class="empty-state">
        <h2>Nothing to checkout</h2>
        <ion-button router-link="/home">Go Shopping</ion-button>
      </div>

      <div v-else class="checkout-container rise-in">
        <p class="eyebrow">Checkout</p>
        <h2>Order summary</h2>

        <div class="delivery-form">
          <h3>Delivery details</h3>
          <label>
            Phone number
            <input v-model="deliveryPhone" type="tel" placeholder="09XXXXXXXXX" />
          </label>
          <label>
            Complete address
            <textarea
              v-model="deliveryAddress"
              rows="3"
              placeholder="House number, street, barangay, city"
            ></textarea>
          </label>
          <label>
            Delivery zone
            <select v-model="deliveryZoneId" required>
              <option value="">Choose your barangay</option>
              <option v-for="zone in deliveryZones" :key="zone.id" :value="String(zone.id)">
                {{ zone.barangay }}, {{ zone.city }}<template v-if="zone.province">, {{ zone.province }}</template> - PHP {{ formatPrice(zone.delivery_fee) }}
              </option>
            </select>
          </label>
          <label>
            Delivery instructions (optional)
            <textarea v-model="deliveryInstructions" rows="2" maxlength="1000" placeholder="Gate, landmark, or drop-off details"></textarea>
          </label>
          <p v-if="zonesLoading" class="zone-status" role="status">Loading delivery areas...</p>
          <div v-else-if="zoneLoadError" class="error-msg" role="alert">
            <p>{{ zoneLoadError }}</p>
            <button type="button" class="retry-zones" @click="loadDeliveryZones">Retry loading zones</button>
          </div>
          <p v-else-if="deliveryZones.length === 0" class="error-msg" role="alert">
            The store has no active delivery barangays yet, so orders are temporarily unavailable. The store owner must search for a barangay, set its fee, and activate it under Store &gt; Delivery &gt; Zones &amp; fees.
          </p>
          <p class="payment-note">Payment: Cash on delivery</p>
        </div>

        <ion-list>
          <ion-item v-for="item in cart" :key="item.id">
            <ion-label>
              <h3>{{ item.name }}</h3>
              <p>Qty: {{ item.quantity }} x PHP {{ formatPrice(item.price) }}</p>
            </ion-label>
            <ion-note slot="end" class="price-text">PHP {{ formatPrice(item.price * item.quantity) }}</ion-note>
          </ion-item>
        </ion-list>

        <div class="total-row">
          <span>Items</span>
          <span>PHP {{ formatPrice(itemsTotal) }}</span>
        </div>
        <div class="total-row">
          <span>Delivery fee</span>
          <span>PHP {{ formatPrice(selectedDeliveryFee) }}</span>
        </div>
        <div class="total-row grand-total">
          <strong>Total</strong>
          <strong class="price-text">PHP {{ formatPrice(total) }}</strong>
        </div>

        <ion-button
          expand="block"
          class="ion-margin-top"
          :disabled="loading || zonesLoading || !deliveryZoneId || !deliveryZones.length"
          @click="placeOrder"
        >
          {{ loading ? 'Placing Order...' : 'Place Order' }}
        </ion-button>

        <ion-text color="danger" v-if="error">
          <p class="error-msg">{{ error }}</p>
        </ion-text>

        <ion-toast
          :is-open="successToast"
          :message="successMessage"
          duration="5000"
          color="success"
          @didDismiss="onSuccessDismiss"
        ></ion-toast>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onIonViewWillEnter } from '@ionic/vue';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonButton,
  IonText,
  IonToast,
} from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import {
  getCart,
  getCartTotal,
  clearCart,
  createOrder,
  getDeliveryZones,
} from '../services/api';

const router = useRouter();
const cart = ref([]);
const loading = ref(false);
const error = ref('');
const successToast = ref(false);
const deliveryPhone = ref('');
const deliveryAddress = ref('');
const deliveryInstructions = ref('');
const deliveryZones = ref([]);
const deliveryZoneId = ref('');
const zonesLoading = ref(true);
const zoneLoadError = ref('');
const deliveryOtp = ref('');

const itemsTotal = computed(() => getCartTotal());
const selectedZone = computed(() => deliveryZones.value.find((zone) => String(zone.id) === deliveryZoneId.value));
const selectedDeliveryFee = computed(() => Number(selectedZone.value?.delivery_fee || 0));
const total = computed(() => itemsTotal.value + selectedDeliveryFee.value);
const successMessage = computed(() => deliveryOtp.value
  ? `Order placed. Give your rider delivery code ${deliveryOtp.value} when the order arrives.`
  : 'Order placed successfully!');
const formatPrice = (price) => parseFloat(price).toFixed(2);

const placeOrder = async () => {
  error.value = '';
  if (deliveryPhone.value.trim().length < 7 || deliveryAddress.value.trim().length < 10) {
    error.value = 'Enter a valid phone number and complete delivery address.';
    return;
  }
  if (!selectedZone.value) {
    error.value = 'Choose a delivery zone to continue.';
    return;
  }
  loading.value = true;

  try {
    // Format items for the backend API
    const items = cart.value.map((item) => ({
      product_id: item.id,
      quantity: item.quantity,
      price: item.price,
    }));

    const response = await createOrder(
      items,
      deliveryAddress.value.trim(),
      deliveryPhone.value.trim(),
      Number(deliveryZoneId.value),
      deliveryInstructions.value.trim(),
      'cod'
    );

    clearCart();
    cart.value = [];
    deliveryOtp.value = response.data.order.delivery_otp || '';
    successToast.value = true;
  } catch (err) {
    error.value =
      err.response?.data?.message || 'Failed to place order. Please try again.';
  } finally {
    loading.value = false;
  }
};

const loadDeliveryZones = async () => {
  zonesLoading.value = true;
  zoneLoadError.value = '';
  try {
    const response = await getDeliveryZones();
    deliveryZones.value = Array.isArray(response.data) ? response.data : [];
    if (!deliveryZones.value.some((zone) => String(zone.id) === deliveryZoneId.value)) {
      deliveryZoneId.value = '';
    }
  } catch (err) {
    deliveryZones.value = [];
    zoneLoadError.value = err.response?.data?.message || (err.response
      ? 'Could not load delivery areas. Please try again.'
      : 'Could not reach the store. Check your internet connection and try again.');
  } finally {
    zonesLoading.value = false;
  }
};

const onSuccessDismiss = () => {
  successToast.value = false;
  router.push('/orders');
};

onIonViewWillEnter(() => {
  cart.value = getCart();
  error.value = '';
  loadDeliveryZones();
});
</script>

<style scoped>
.checkout-container {
  max-width: 560px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem calc(5rem + env(safe-area-inset-bottom));
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: #ff4d8d;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h2 {
  margin: 0 0 1.25rem;
  font-size: clamp(1.8rem, 4vw, 2.3rem);
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 1rem 0;
  font-size: 1.25rem;
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  border-top: 1px solid #f3d6e3;
  margin-top: 0.5rem;
}

ion-button {
  --background: #0a0a0a;
  height: 48px;
}

.delivery-form {
  display: grid;
  gap: 0.85rem;
  margin: 1.25rem 0;
  padding: 1rem;
  border: 1px solid #f3d6e3;
  border-radius: 16px;
  background: #fffafd;
}

.delivery-form h3 {
  margin: 0;
}

.zone-status {
  margin: 0;
  color: #666;
  font-size: 0.85rem;
}

.retry-zones {
  padding: 0;
  border: 0;
  background: transparent;
  color: #a51052;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.delivery-form label {
  display: grid;
  gap: 0.35rem;
  color: #5c5c5c;
  font-size: 0.85rem;
  font-weight: 600;
}

.delivery-form input,
.delivery-form textarea,
.delivery-form select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem;
  border: 1px solid #e8c8d8;
  border-radius: 10px;
  background: #ffffff;
  color: #161616;
  font: inherit;
}

@media (max-width: 600px) {
  .checkout-container {
    padding-inline: 0.8rem;
  }

  .delivery-form input,
  .delivery-form textarea,
  .delivery-form select {
    min-height: 44px;
    font-size: 16px;
  }

  .delivery-form textarea {
    min-height: 88px;
  }

  .total-row {
    gap: 0.75rem;
    font-size: 1.05rem;
  }

  .total-row > :last-child {
    text-align: right;
    white-space: nowrap;
  }

  .checkout-container ion-button {
    min-height: 48px;
    margin-bottom: env(safe-area-inset-bottom);
  }

  .retry-zones {
    min-height: 44px;
  }
}

.error-msg {
  text-align: center;
  margin-top: 1rem;
  color: #d4146a;
  font-weight: 600;
}
</style>
