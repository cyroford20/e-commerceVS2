<template>
  <ion-header class="vs-header" translucent>
    <ion-toolbar>
      <ion-buttons slot="start" v-if="showBack">
        <ion-back-button default-href="/home" text=""></ion-back-button>
      </ion-buttons>

      <ion-title>
        <router-link :to="brandHome" class="brand-mark" v-if="!showBack">
          <BrandLockup size="compact" />
        </router-link>
        <span v-else class="page-title">{{ title }}</span>
      </ion-title>

      <ion-buttons slot="end">
        <ion-button router-link="/store" v-if="loggedIn && isOwner" aria-label="Store">
          <ion-icon :icon="storefrontOutline"></ion-icon>
        </ion-button>

        <ion-button
          router-link="/cart"
          v-if="showCart && loggedIn && !isOwner"
          aria-label="Cart"
          class="cart-btn"
        >
          <ion-icon :icon="cartOutline"></ion-icon>
          <span class="cart-count" v-if="cartCount > 0">{{ cartCount }}</span>
        </ion-button>

        <ion-button router-link="/orders" v-if="loggedIn && showOrders && !isOwner" aria-label="Orders">
          <ion-icon :icon="receiptOutline"></ion-icon>
        </ion-button>

        <ion-button router-link="/profile" v-if="loggedIn && !isOwner" aria-label="Profile">
          <ion-icon :icon="personOutline"></ion-icon>
        </ion-button>

        <ion-button v-if="loggedIn" @click="handleLogout" aria-label="Logout">
          <ion-icon :icon="logOutOutline"></ion-icon>
        </ion-button>
        <ion-button v-else router-link="/login" aria-label="Login">
          <ion-icon :icon="logInOutline"></ion-icon>
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue';
import BrandLockup from './BrandLockup.vue';
import { useRouter } from 'vue-router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
} from '@ionic/vue';
import {
  cartOutline,
  receiptOutline,
  logOutOutline,
  logInOutline,
  personOutline,
  storefrontOutline,
} from 'ionicons/icons';
import { isLoggedIn, logout, getCartCount, getRole, homeForRole } from '../services/api';
import { stopAllRiderLocationSharing } from '../services/riderLocationTracking';

defineProps({
  title: { type: String, default: 'Vape Shop' },
  showBack: { type: Boolean, default: false },
  showCart: { type: Boolean, default: true },
  showOrders: { type: Boolean, default: true },
});

const router = useRouter();
const loggedIn = ref(false);
const cartCount = ref(0);
const isOwner = ref(false);
const brandHome = ref('/home');

const refresh = () => {
  loggedIn.value = isLoggedIn();
  cartCount.value = getCartCount();
  const role = getRole();
  isOwner.value = role === 'store-owner';
  brandHome.value = homeForRole(role);
};

const handleLogout = async () => {
  try {
    await stopAllRiderLocationSharing();
  } catch (error) {
    console.error('Could not stop rider location sharing during logout.', error);
  } finally {
    logout();
    refresh();
    router.push('/login');
  }
};

onMounted(refresh);
onActivated(refresh);

defineExpose({ refresh });
</script>

<style scoped>
.vs-header {
  box-shadow: none;
}

.vs-header ion-toolbar {
  --background: rgba(5, 5, 5, 0.72);
  --color: #ffffff;
  --border-width: 0;
  border-bottom: 1px solid rgba(255, 77, 141, 0.28);
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.brand-mark .accent {
  color: #ff4d8d;
}

.page-title {
  letter-spacing: 0.12em;
}

.cart-btn {
  position: relative;
}

.cart-count {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: #ff4d8d;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.1rem;
  text-align: center;
  transform: translate(20%, -20%);
}
</style>
