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
                  :aria-pressed="selected[group.key]?.id === product.id"
                  :disabled="product.stock <= 0"
                  @click="selectComponent(group, product)"
                >
                  <img :src="productImage(product, group.key)" :data-part="group.key" :alt="product.name" @error="useFallbackImage" />
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
            <div class="live-preview">
              <div class="preview-heading">
                <div>
                  <p class="eyebrow">Live assembly</p>
                  <h2>Your vape</h2>
                </div>
                <span class="build-progress">{{ requiredSelectedCount }}/{{ requiredGroupCount }}</span>
              </div>
              <div class="vape-stage" aria-label="Live preview of your vape build">
                <div class="vape-aura"></div>
                <div class="assembly-parts">
                  <div class="assembly-part device-part" :class="{ empty: !selected.device, 'is-active': actionPart === 'device' }">
                    <img v-if="selected.device" :src="productImage(selected.device, 'device')" data-part="device" :alt="selected.device.name" @error="useFallbackImage" />
                    <span v-else class="part-placeholder">Device</span>
                    <small>Device</small>
                  </div>
                  <div class="assembly-connector"></div>
                  <div class="assembly-part liquid-part" :class="{ empty: !selected.liquid, 'is-active': actionPart === 'liquid' }">
                    <img v-if="selected.liquid" :src="productImage(selected.liquid, 'liquid')" data-part="liquid" :alt="selected.liquid.name" @error="useFallbackImage" />
                    <span v-else class="part-placeholder">E-liquid</span>
                    <small>E-liquid</small>
                  </div>
                  <div class="assembly-extras">
                    <div v-if="selected.coil" class="assembly-part mini-part" :class="{ 'is-active': actionPart === 'coil' }">
                      <img :src="productImage(selected.coil, 'coil')" data-part="coil" :alt="selected.coil.name" @error="useFallbackImage" />
                      <small>Coil</small>
                    </div>
                    <div v-if="selected.accessory" class="assembly-part mini-part" :class="{ 'is-active': actionPart === 'accessory' }">
                      <img :src="productImage(selected.accessory, 'accessory')" data-part="accessory" :alt="selected.accessory.name" @error="useFallbackImage" />
                      <small>Accessory</small>
                    </div>
                  </div>
                </div>
                <p class="preview-status">{{ previewStatus }}</p>
                <p class="live-action" :class="{ active: actionPart }">
                  <span class="action-dot"></span>{{ liveAction }}
                </p>
              </div>
            </div>
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
const actionPart = ref('');
const liveAction = ref('Select a part to begin assembly');
let actionTimer;

const fallbackImages = {
  device: '/products/20182b12-13db-43c4-8933-6129b7b77bd5.jfif',
  liquid: '/products/297a97eb-ee0a-4e4c-8ccc-447178d1feb9.jfif',
  coil: '/products/7235678a-401e-438c-b191-dce8abfc96cf.jfif',
  accessory: '/products/86811bc1-903f-4a2c-8fc8-6ef8f96cd7fa.jfif',
};

const productImage = (product, groupKey) => product?.image_url || fallbackImages[groupKey];

const useFallbackImage = (event) => {
  const image = event.currentTarget;
  const fallback = fallbackImages[image.dataset.part] || fallbackImages.device;
  if (image.src.endsWith(fallback)) return;
  image.src = fallback;
};

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
const requiredGroupCount = computed(
  () => componentGroups.value.filter((group) => group.required).length
);
const requiredSelectedCount = computed(
  () => componentGroups.value.filter((group) => group.required && selected.value[group.key]).length
);
const previewStatus = computed(() => {
  if (!selected.value.device) return 'Choose a device to start';
  if (!selected.value.liquid) return 'Add e-liquid to continue';
  if (!selected.value.coil && !selected.value.accessory) return 'Core build ready — add extras';
  return canBuild.value ? 'Build complete — ready to add' : 'Choose the required parts';
});

const formatPrice = (price) => Number(price || 0).toFixed(2);

const selectComponent = (group, product) => {
  selected.value = { ...selected.value, [group.key]: product };
  actionPart.value = group.key;
  liveAction.value = `Attaching ${group.label.toLowerCase()}...`;
  clearTimeout(actionTimer);
  actionTimer = setTimeout(() => {
    actionPart.value = '';
    liveAction.value = `${group.label} attached`;
  }, 650);
};

const clearComponent = (key) => {
  const next = { ...selected.value };
  delete next[key];
  selected.value = next;
  actionPart.value = '';
  liveAction.value = `${key} removed — choose another part`;
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

.live-preview {
  margin: -0.2rem -0.2rem 1.4rem;
  padding: 0.9rem;
  overflow: hidden;
  border-radius: 14px;
  background:
    radial-gradient(circle at 50% 35%, rgba(255, 77, 141, 0.3), transparent 34%),
    linear-gradient(145deg, #090909, #20101a);
  color: #fff;
}

.preview-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
}

.preview-heading .eyebrow {
  margin-bottom: 0.15rem;
}

.preview-heading h2 {
  margin: 0;
  color: #fff;
}

.build-progress {
  padding: 0.35rem 0.55rem;
  border: 1px solid rgba(255, 181, 208, 0.35);
  border-radius: 999px;
  color: #ffb5d0;
  font-size: 0.72rem;
  font-weight: 800;
}

.vape-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 210px;
}

.vape-aura {
  position: absolute;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: rgba(255, 77, 141, 0.3);
  filter: blur(26px);
  animation: preview-pulse 3s ease-in-out infinite;
}

.assembly-parts {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  width: 100%;
}

.assembly-part {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  animation: part-in 0.35s ease both;
}

.assembly-part.is-active {
  animation: attach-part 0.65s ease both;
}

.assembly-part.is-active::before {
  content: 'ATTACHING';
  position: absolute;
  top: -1.2rem;
  z-index: 3;
  color: #fff;
  font-size: 0.52rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-shadow: 0 0 8px #ff4d8d;
}

.assembly-part img {
  display: block;
  width: 94px;
  height: 118px;
  padding: 0.25rem;
  border: 1px solid rgba(255, 181, 208, 0.52);
  border-radius: 12px;
  background: linear-gradient(145deg, #fff, #f8d9e6);
  object-fit: contain;
  box-shadow: 0 12px 20px rgba(0, 0, 0, 0.35);
}

.device-part img {
  width: 116px;
  height: 148px;
}

.assembly-part small {
  color: #ffb5d0;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.assembly-part.empty img {
  display: none;
}

.part-placeholder {
  display: grid;
  place-items: center;
  width: 94px;
  height: 118px;
  border: 1px dashed rgba(255, 181, 208, 0.4);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.7rem;
}

.device-part .part-placeholder {
  width: 116px;
  height: 148px;
}

.assembly-connector {
  width: 14px;
  height: 2px;
  background: #ff4d8d;
  box-shadow: 0 0 10px #ff4d8d;
}

.assembly-extras {
  position: absolute;
  right: 0.35rem;
  bottom: -0.5rem;
  display: flex;
  gap: 0.4rem;
}

.mini-part img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}

.mini-part small {
  font-size: 0.54rem;
}

/* Keep the preview grounded while the product photography loads. */
.vape-stage::after {
  content: '';
  position: absolute;
  bottom: 1.55rem;
  width: 75%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 181, 208, 0.7), transparent);
}

.vape-pod {
  position: relative;
  width: 31px;
  height: 48px;
  border: 2px solid #ff8eb6;
  border-bottom: 0;
  border-radius: 14px 14px 5px 5px;
  background: linear-gradient(90deg, #351322, #ff4d8d 50%, #351322);
  box-shadow: 0 0 16px rgba(255, 77, 141, 0.6);
  animation: part-in 0.35s ease both;
}

.vape-pod span {
  position: absolute;
  top: -9px;
  left: 10px;
  width: 8px;
  height: 10px;
  border-radius: 3px 3px 0 0;
  background: #d7d7d7;
}

.vape-body {
  position: relative;
  width: 64px;
  height: 112px;
  border: 2px solid #ff4d8d;
  border-radius: 12px;
  background: linear-gradient(110deg, #171717, #4a1b31 52%, #0c0c0c);
  box-shadow: inset 0 0 20px rgba(255, 77, 141, 0.16);
}

.vape-screen {
  position: absolute;
  top: 24px;
  left: 15px;
  color: #ffb5d0;
  font: 800 0.62rem 'Syne', sans-serif;
  letter-spacing: 0.1em;
}

.vape-led {
  position: absolute;
  bottom: 17px;
  left: 28px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d8d;
  box-shadow: 0 0 12px #ff4d8d;
}

.vape-coil,
.vape-liquid,
.vape-accessory {
  position: absolute;
  z-index: 2;
  animation: part-in 0.35s ease both;
}

.vape-coil {
  right: -17px;
  top: 57px;
  width: 22px;
  height: 22px;
  border: 3px solid #ffb5d0;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(255, 77, 141, 0.7);
}

.vape-liquid {
  left: -17px;
  top: 76px;
  width: 18px;
  height: 30px;
  border: 1px solid #ff8eb6;
  border-radius: 4px;
  background: #d4146a;
  box-shadow: 0 0 10px rgba(255, 77, 141, 0.55);
}

.vape-accessory {
  right: -28px;
  bottom: 4px;
  width: 27px;
  height: 5px;
  border-radius: 999px;
  background: #ffb5d0;
  transform: rotate(-35deg);
}

.vape-cloud {
  position: absolute;
  width: 36px;
  height: 36px;
  border: 2px solid rgba(255, 181, 208, 0.38);
  border-radius: 50%;
  opacity: 0.65;
}

.cloud-left {
  margin: -120px 0 0 -105px;
}

.cloud-right {
  margin: -155px -105px 0 0;
  width: 24px;
  height: 24px;
}

.preview-status {
  position: absolute;
  bottom: 0;
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.live-action {
  position: absolute;
  top: 0.25rem;
  right: 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  color: rgba(255, 255, 255, 0.62);
  font-size: 0.62rem;
  letter-spacing: 0.04em;
}

.live-action.active {
  color: #ffb5d0;
}

.action-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #777;
}

.live-action.active .action-dot {
  background: #ff4d8d;
  box-shadow: 0 0 9px #ff4d8d;
  animation: action-blink 0.5s ease-in-out infinite alternate;
}

@keyframes preview-pulse {
  0%, 100% { transform: scale(0.9); opacity: 0.65; }
  50% { transform: scale(1.1); opacity: 1; }
}

@keyframes attach-part {
  0% { opacity: 0.45; transform: translateY(-18px) scale(0.9); filter: brightness(1.7); }
  55% { opacity: 1; transform: translateY(3px) scale(1.04); filter: brightness(1.35); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: brightness(1); }
}

@keyframes action-blink {
  from { opacity: 0.35; }
  to { opacity: 1; }
}

@keyframes part-in {
  from { opacity: 0; transform: translateY(8px) scale(0.85); }
  to { opacity: 1; transform: translateY(0) scale(1); }
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
