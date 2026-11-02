<template>
  <ion-page>
    <Navbar title="Build your vape" :show-back="true" />
    <ion-content class="page-shell">
      <main class="builder-shell">
        <header class="builder-header">
          <p class="eyebrow">Vape builder</p>
          <h1>Build it your way.</h1>
          <p>Pick compatible parts from our catalog and add the complete setup to your cart.</p>
        </header>

        <p v-if="error" class="error-msg">{{ error }}</p>
        <div v-if="loading" class="empty-state">Loading components...</div>
        <div v-else class="builder-layout">
          <section class="component-list">
            <article v-for="group in componentGroups" :key="group.key" class="component-group">
              <div class="group-heading">
                <div>
                  <p class="step-label">Step {{ group.step }}</p>
                  <h2>{{ group.label }}</h2>
                </div>
                <span v-if="group.required" class="required-label">Required</span>
                <span v-else class="optional-label">Optional</span>
              </div>

              <div v-if="group.products.length" class="component-options">
                <button
                  v-for="product in group.products"
                  :key="product.id"
                  type="button"
                  class="component-option"
                  :class="{ selected: selected[group.key]?.id === product.id }"
                  :disabled="product.stock <= 0"
                  @click="selectComponent(group, product)"
                >
                  <img :src="product.image_url" :alt="product.name" />
                  <span class="option-copy">
                    <strong>{{ product.name }}</strong>
                    <small>{{ product.stock > 0 ? `${product.stock} available` : 'Out of stock' }}</small>
                  </span>
                  <span class="option-price">₱{{ formatPrice(product.price) }}</span>
                </button>
                <button
                  v-if="!group.required && selected[group.key]"
                  type="button"
                  class="clear-option"
                  @click="clearComponent(group.key)"
                >
                  Remove {{ group.label.toLowerCase() }}
                </button>
              </div>
              <p v-else class="missing-components">
                No {{ group.label.toLowerCase() }} are currently available in the catalog.
              </p>
            </article>
          </section>

          <aside class="build-summary">
            <p class="eyebrow">Your setup</p>
            <h2>Build summary</h2>
            <div v-if="selectedItems.length" class="summary-items">
              <div v-for="item in selectedItems" :key="item.id" class="summary-item">
                <span>{{ item.name }}</span>
                <strong>₱{{ formatPrice(item.price) }}</strong>
              </div>
            </div>
            <p v-else class="summary-empty">Choose the required parts to start your build.</p>
            <div class="summary-total">
              <span>Total</span>
              <strong>₱{{ formatPrice(buildTotal) }}</strong>
            </div>
            <button
              type="button"
              class="build-button"
              :disabled="!canBuild"
              @click="addBuildToCart"
            >
              {{ loggedIn ? 'Add complete build to cart' : 'Login to add build' }}
            </button>
            <p class="summary-note">Each selected part is added separately so inventory and order details stay accurate.</p>
          </aside>
        </div>
      </main>
      <ion-toast
        :is-open="toastOpen"
        :message="toastMessage"
        duration="1800"
        color="success"
        @didDismiss="toastOpen = false"
      ></ion-toast>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonPage, IonToast } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import { addToCart, getProducts, isLoggedIn, isStoreOwner } from '../services/api';

const router = useRouter();
const products = ref([]);
const loading = ref(true);
const error = ref('');
const selected = ref({});
const toastOpen = ref(false);
const toastMessage = ref('');
const loggedIn = ref(false);

const componentGroups = computed(() => {
  const groups = [
    {
      key: 'device',
      step: 1,
      label: 'Device / pod kit',
      required: true,
      matches: ['pod system', 'device', 'mod', 'disposable'],
    },
    {
      key: 'liquid',
      step: 2,
      label: 'E-liquid',
      required: true,
      matches: ['e-liquid', 'salt nic', 'liquid'],
    },
    {
      key: 'coil',
      step: 3,
      label: 'Coil',
      required: false,
      matches: ['coil', 'atomizer'],
    },
    {
      key: 'accessory',
      step: 4,
      label: 'Accessory',
      required: false,
      matches: ['accessor', 'charger', 'battery', 'drip'],
    },
  ];

  return groups.map((group) => ({
    ...group,
    products: products.value.filter((product) => {
      const category = (product.category || '').toLowerCase();
      return group.matches.some((match) => category.includes(match));
    }),
  }));
});

const selectedItems = computed(() => Object.values(selected.value));
const buildTotal = computed(() =>
  selectedItems.value.reduce((sum, product) => sum + Number(product.price || 0), 0)
);
const canBuild = computed(
  () => componentGroups.value.filter((group) => group.required).every((group) => selected.value[group.key])
);

const formatPrice = (price) => Number(price || 0).toFixed(2);

const selectComponent = (group, product) => {
  selected.value = { ...selected.value, [group.key]: product };
};

const clearComponent = (key) => {
  const next = { ...selected.value };
  delete next[key];
  selected.value = next;
};

const addBuildToCart = () => {
  if (!canBuild.value) return;
  if (!loggedIn.value) {
    router.push('/login');
    return;
  }
  if (isStoreOwner()) {
    router.push('/store');
    return;
  }
  selectedItems.value.forEach((product) => addToCart(product));
  toastMessage.value = 'Your custom vape build was added to the cart.';
  toastOpen.value = true;
};

onMounted(async () => {
  loggedIn.value = isLoggedIn();
  try {
    const response = await getProducts();
    products.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load build components.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.builder-shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}

.builder-header {
  max-width: 680px;
  margin-bottom: 2rem;
}

.eyebrow,
.step-label {
  margin: 0 0 0.4rem;
  color: #ff4d8d;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.builder-header h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.4rem);
}

.builder-header > p:last-child {
  color: #666;
}

.builder-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.7fr);
  gap: 1.5rem;
  align-items: start;
}

.component-list {
  display: grid;
  gap: 1rem;
}

.component-group,
.build-summary {
  padding: 1.1rem;
  border: 1px solid #f3d6e3;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(80, 20, 50, 0.05);
}

.group-heading {
  display: flex;
  align-items: start;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.group-heading h2 {
  margin: 0;
  font-size: 1.1rem;
}

.required-label,
.optional-label {
  margin-left: auto;
  padding: 0.3rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
}

.required-label {
  background: #fff0f5;
  color: #d4146a;
}

.optional-label {
  background: #f2f2f2;
  color: #666;
}

.component-options {
  display: grid;
  gap: 0.6rem;
}

.component-option {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  padding: 0.6rem;
  border: 1px solid #eee0e7;
  border-radius: 12px;
  background: #fff;
  color: #161616;
  text-align: left;
  cursor: pointer;
}

.component-option.selected {
  border-color: #ff4d8d;
  box-shadow: 0 0 0 2px rgba(255, 77, 141, 0.14);
}

.component-option:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.component-option img {
  width: 54px;
  height: 54px;
  border-radius: 9px;
  object-fit: cover;
}

.option-copy,
.option-copy strong,
.option-copy small {
  display: block;
}

.option-copy strong {
  font-size: 0.9rem;
}

.option-copy small,
.missing-components,
.summary-empty,
.summary-note {
  color: #777;
  font-size: 0.78rem;
}

.option-price {
  font-weight: 800;
  color: #d4146a;
}

.clear-option {
  justify-self: start;
  border: 0;
  background: transparent;
  color: #777;
  font-size: 0.75rem;
  cursor: pointer;
}

.build-summary {
  position: sticky;
  top: 1rem;
}

.build-summary h2 {
  margin: 0 0 1rem;
}

.summary-items {
  display: grid;
  gap: 0.6rem;
}

.summary-item,
.summary-total {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.summary-item {
  color: #555;
  font-size: 0.83rem;
}

.summary-total {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #f3d6e3;
  font-size: 1.2rem;
}

.summary-total strong {
  color: #d4146a;
}

.build-button {
  width: 100%;
  margin-top: 1rem;
  padding: 0.85rem 1rem;
  border: 0;
  border-radius: 10px;
  background: #ff4d8d;
  color: #fff;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.build-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.error-msg {
  color: #d4146a;
  font-weight: 700;
}

@media (max-width: 780px) {
  .builder-layout {
    grid-template-columns: 1fr;
  }

  .build-summary {
    position: static;
  }
}
</style>
