<template>
  <ion-page>
    <Navbar ref="navbar" title="My Cart" :show-back="true" />

    <ion-content class="page-shell">
      <div v-if="cart.length === 0" class="empty-state">
        <h2>Your cart is empty</h2>
        <p>Browse products and add some items.</p>
        <ion-button router-link="/home">Go Shopping</ion-button>
      </div>

      <div v-else class="cart-shell rise-in">
        <header class="cart-head">
          <h1>Bag</h1>
          <p>{{ cart.length }} item{{ cart.length === 1 ? '' : 's' }} ready to check out.</p>
        </header>

        <div class="cart-list">
          <CartItem
            v-for="item in cart"
            :key="item.id"
            :item="item"
            @increase="increaseQty"
            @decrease="decreaseQty"
            @remove="removeItem"
          />
        </div>

        <div class="cart-summary">
          <div class="total-row">
            <span>Total</span>
            <span class="price-text">₱{{ formatPrice(total) }}</span>
          </div>

          <ion-button expand="block" @click="goCheckout">
            Proceed to Checkout
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonButton } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import CartItem from '../components/CartItem.vue';
import {
  getCart,
  updateCartItem,
  removeFromCart,
  getCartTotal,
  isLoggedIn,
  isStoreOwner,
} from '../services/api';

const router = useRouter();
const cart = ref([]);
const navbar = ref(null);

const total = computed(() => getCartTotal());

const formatPrice = (price) => parseFloat(price).toFixed(2);

const refreshCart = () => {
  cart.value = getCart();
  if (navbar.value) navbar.value.refresh();
};

const increaseQty = (item) => {
  updateCartItem(item.id, item.quantity + 1);
  refreshCart();
};

const decreaseQty = (item) => {
  updateCartItem(item.id, item.quantity - 1);
  refreshCart();
};

const removeItem = (item) => {
  removeFromCart(item.id);
  refreshCart();
};

const goCheckout = () => {
  if (!isLoggedIn()) {
    router.push('/login');
    return;
  }
  if (isStoreOwner()) {
    router.push('/store');
    return;
  }
  router.push('/checkout');
};

onMounted(refreshCart);
</script>

<style scoped>
.cart-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem calc(5rem + env(safe-area-inset-bottom));
}

.cart-head h1 {
  margin: 0 0 0.35rem;
  font-size: clamp(1.8rem, 4vw, 2.4rem);
}

.cart-head p {
  margin: 0 0 1.5rem;
  color: #5c5c5c;
}

.cart-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cart-summary {
  margin-top: 1.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid #f3d6e3;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  font-family: 'Syne', sans-serif;
  font-size: 1.35rem;
  font-weight: 700;
}

ion-button {
  --background: #ff4d8d;
  height: 48px;
  margin-bottom: env(safe-area-inset-bottom);
}

@media (max-width: 600px) {
  .cart-shell {
    padding-inline: 0.8rem;
  }

  .cart-summary {
    padding-bottom: 1rem;
  }
}
</style>
