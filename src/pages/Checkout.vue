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
                {{ zone.barangay }}, {{ zone.city }} - PHP {{ formatPrice(zone.delivery_fee) }}
              </option>
            </select>
          </label>
          <label>
            Delivery instructions (optional)
            <textarea v-model="deliveryInstructions" rows="2" maxlength="1000" placeholder="Gate, landmark, or drop-off details"></textarea>
          </label>
          <p v-if="!zonesLoading && deliveryZones.length === 0" class="error-msg">
            Delivery zones are not set up yet. Contact the store before placing an order.
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
import { ref, computed, onMounted } from 'vue';
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

const onSuccessDismiss = () => {
  successToast.value = false;
  router.push('/orders');
};

onMounted(async () => {
  cart.value = getCart();
  try {
    const response = await getDeliveryZones();
    deliveryZones.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load delivery zones.';
  } finally {
    zonesLoading.value = false;
  }
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

  .checkout-container ion-button {
    min-height: 48px;
    margin-bottom: env(safe-area-inset-bottom);
  }
}

.error-msg {
  text-align: center;
  margin-top: 1rem;
  color: #d4146a;
  font-weight: 600;
}
</style>
