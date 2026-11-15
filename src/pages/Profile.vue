<template>
  <ion-page>
    <Navbar title="My Profile" :show-back="true" />

    <ion-content class="page-shell">
      <div v-if="loading" class="empty-state">
        <ion-spinner name="crescent"></ion-spinner>
      </div>

      <div v-else-if="error" class="empty-state">
        <h2>Error</h2>
        <p>{{ error }}</p>
        <ion-button @click="loadProfile">Retry</ion-button>
      </div>

      <div v-else class="profile-wrap rise-in">
        <section class="hero-card">
          <div class="avatar">{{ initials }}</div>
          <div>
            <p class="eyebrow">Customer profile</p>
            <h1>{{ user.name }}</h1>
            <p class="email">{{ user.email }}</p>
          </div>
        </section>

        <section class="stats">
          <article>
            <p>Orders</p>
            <h2>{{ orders.length }}</h2>
          </article>
          <article>
            <p>Spent</p>
            <h2>₱{{ formatPrice(totalSpent) }}</h2>
          </article>
        </section>

        <section class="panel coupon-wallet">
          <div class="coupon-wallet-heading">
            <div>
              <h3>My coupons</h3>
              <p class="hint">Rewards earned from your completed orders.</p>
            </div>
            <ion-spinner v-if="couponsLoading" name="crescent"></ion-spinner>
          </div>
          <p v-if="couponsError" class="form-error" role="alert">{{ couponsError }}</p>
          <p v-else-if="!couponsLoading && coupons.length === 0" class="hint">No issued coupons yet. Keep shopping to earn rewards.</p>
          <div v-else class="coupon-wallet-list">
            <article v-for="coupon in coupons" :key="coupon.id" class="customer-coupon">
              <div>
                <strong>{{ coupon.name }}</strong>
                <span class="coupon-code">{{ coupon.code }}</span>
                <span>
                  {{ coupon.discount_type === 'percent' ? `${coupon.discount_value}% off` : `PHP ${formatPrice(coupon.discount_value)} off` }}
                  · Expires {{ formatCouponDate(coupon.expires_at) }}
                </span>
              </div>
              <span :class="['coupon-state', coupon.status]">{{ coupon.status }}</span>
            </article>
          </div>
        </section>

        <section class="panel">
          <h3>Edit profile</h3>
          <label>
            Full name
            <input v-model="editName" type="text" placeholder="Your name" />
          </label>
          <p class="hint">Email stays the same for this account.</p>
          <p class="form-error" v-if="saveError">{{ saveError }}</p>
          <p class="form-ok" v-if="saveOk">Profile saved.</p>
          <button type="button" class="primary-btn" :disabled="saving" @click="saveProfile">
            {{ saving ? 'Saving...' : 'Save changes' }}
          </button>
        </section>

        <section class="panel">
          <h3>Quick links</h3>
          <div class="actions">
            <ion-button expand="block" router-link="/orders">View my orders</ion-button>
            <ion-button expand="block" fill="outline" color="dark" router-link="/home">
              Continue shopping
            </ion-button>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { IonPage, IonContent, IonButton, IonSpinner } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import {
  getMe,
  updateMe,
  getUserOrders,
  getMyCoupons,
  saveAuth,
  getToken,
} from '../services/api';

const user = ref(null);
const orders = ref([]);
const coupons = ref([]);
const couponsLoading = ref(false);
const couponsError = ref('');
const editName = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const saveError = ref('');
const saveOk = ref(false);

const initials = computed(() => {
  const name = user.value?.name || 'C';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
});

const totalSpent = computed(() =>
  orders.value.reduce((sum, order) => sum + Number(order.total || 0), 0)
);

const formatPrice = (price) => parseFloat(price || 0).toFixed(2);
const formatCouponDate = (date) => new Date(date).toLocaleDateString('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const loadProfile = async () => {
  loading.value = true;
  error.value = '';
  try {
    const me = await getMe();
    user.value = me.data;
    editName.value = me.data.name;
    const token = getToken();
    if (token) saveAuth(token, me.data);

    if (me.data?.id) {
      const orderRes = await getUserOrders(me.data.id);
      orders.value = orderRes.data;
      couponsLoading.value = true;
      couponsError.value = '';
      try {
        const couponRes = await getMyCoupons();
        coupons.value = couponRes.data;
      } catch (couponErr) {
        couponsError.value = couponErr.response?.data?.message || 'Could not load your coupons.';
      } finally {
        couponsLoading.value = false;
      }
    }
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load your profile.';
  } finally {
    loading.value = false;
  }
};

const saveProfile = async () => {
  saveError.value = '';
  saveOk.value = false;
  const name = editName.value.trim();
  if (!name) {
    saveError.value = 'Name is required.';
    return;
  }

  saving.value = true;
  try {
    const res = await updateMe(name);
    user.value = res.data.user;
    const token = getToken();
    if (token) saveAuth(token, res.data.user);
    saveOk.value = true;
  } catch (err) {
    saveError.value = err.response?.data?.message || 'Could not save profile.';
  } finally {
    saving.value = false;
  }
};

onMounted(loadProfile);
</script>

<style scoped>
.profile-wrap {
  max-width: 640px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
}

.coupon-wallet-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.coupon-wallet-heading h3,
.coupon-wallet-heading p {
  margin-top: 0;
}

.coupon-wallet-list {
  display: grid;
  gap: 0.65rem;
}

.customer-coupon {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem;
  border: 1px solid #f0d7e2;
  border-radius: 14px;
  background: #fffafd;
}

.customer-coupon > div {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
  color: #68636a;
  font-size: 0.86rem;
}

.coupon-code {
  color: #a51052;
  font-family: monospace;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.coupon-state {
  flex-shrink: 0;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  background: #e7f8ee;
  color: #166c3e;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: capitalize;
}

.coupon-state.used,
.coupon-state.expired {
  background: #eee;
  color: #666;
}

.hero-card {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
  padding: 1.25rem;
  border-radius: 22px;
  background: linear-gradient(135deg, #111, #1a0a12 55%, #ff4d8d);
  color: #fff;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.16);
  font-family: 'Syne', sans-serif;
  font-size: 1.2rem;
  font-weight: 800;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #ffc1d6;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 0.25rem;
  font-size: clamp(1.6rem, 4vw, 2.2rem);
}

.email {
  margin: 0;
  color: rgba(255, 255, 255, 0.75);
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.stats article {
  padding: 1rem;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #f0f0f0;
}

.stats p {
  margin: 0;
  color: #7a7a7a;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.stats h2 {
  margin: 0.35rem 0 0;
  font-size: 1.5rem;
}

.panel {
  margin-bottom: 1rem;
  padding: 1.1rem;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #f0f0f0;
}

.panel h3 {
  margin: 0 0 0.85rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #666;
}

input {
  border: 1px solid #e8e8e8;
  border-radius: 12px;
  padding: 0.8rem 0.9rem;
  font-family: 'Outfit', sans-serif;
  font-size: 0.95rem;
  background: #fafafa;
}

.hint {
  margin: 0.55rem 0 0.85rem;
  color: #7a7a7a;
  font-size: 0.88rem;
}

.form-error {
  color: #d4146a;
  font-weight: 650;
}

.form-ok {
  color: #1a7a4c;
  font-weight: 650;
}

.primary-btn {
  border: 0;
  border-radius: 999px;
  padding: 0.8rem 1.2rem;
  background: #ff4d8d;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-weight: 700;
  cursor: pointer;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.hero-card > div:last-child {
  min-width: 0;
}

.hero-card h1,
.email {
  overflow-wrap: anywhere;
}

ion-button[expand='block']:first-child {
  --background: #0a0a0a;
}

@media (max-width: 600px) {
  .profile-wrap {
    padding: 1rem 0.75rem calc(2rem + env(safe-area-inset-bottom));
  }

  .hero-card {
    gap: 0.75rem;
    padding: 1rem;
  }

  .avatar {
    width: 56px;
    height: 56px;
    flex: 0 0 56px;
  }

  input {
    min-height: 44px;
    font-size: 16px;
  }

  .primary-btn,
  .actions ion-button {
    min-height: 44px;
  }

  .actions ion-button {
    margin: 0;
  }
}
</style>
