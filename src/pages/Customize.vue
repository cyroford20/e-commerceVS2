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
              <div
                class="vape-stage"
                :class="{ 'build-complete': canBuild }"
                :style="assemblyColors"
                aria-label="Live preview of your vape build"
              >
                <div class="vape-aura"></div>
                <div :key="assemblyVersion" class="assembly-parts">
                  <div class="assembly-part device-part" :class="{ empty: !selected.device, 'is-active': actionPart === 'device' }">
                    <div class="device-shell">
                      <span class="device-screen">{{ selected.device ? 'ON' : '--' }}</span>
                      <span class="device-button"></span>
                      <span class="device-led"></span>
                    </div>
                    <small>Device</small>
                  </div>
                  <div class="assembly-connector"></div>
                  <div class="assembly-part liquid-part" :class="{ empty: !selected.liquid, 'is-active': actionPart === 'liquid' }">
                    <div class="pod-tank">
                      <span class="tank-mouthpiece"></span>
                      <span class="tank-liquid"></span>
                      <span v-if="selected.coil" class="tank-coil"></span>
                    </div>
                    <small>E-liquid</small>
                  </div>
                  <div class="assembly-extras">
                    <div v-if="selected.coil" class="assembly-part mini-part" :class="{ 'is-active': actionPart === 'coil' }">
                      <span class="coil-part"></span>
                      <small>Coil</small>
                    </div>
                    <div v-if="selected.accessory" class="assembly-part mini-part" :class="{ 'is-active': actionPart === 'accessory' }">
                      <span class="charger-part"><span></span></span>
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
const assemblyVersion = ref(0);
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
const colorPalettes = [
  { primary: '#ff4d8d', light: '#ffb5d0', dark: '#4a1b31' },
  { primary: '#7c5cff', light: '#c4b8ff', dark: '#271c5c' },
  { primary: '#20d6c7', light: '#a5fff6', dark: '#123f43' },
  { primary: '#ff9f43', light: '#ffd0a0', dark: '#5a3215' },
  { primary: '#66a3ff', light: '#b8d5ff', dark: '#1b3764' },
  { primary: '#b8e34b', light: '#e1ff9d', dark: '#354d16' },
];
const paletteFor = (product, fallbackIndex) => {
  const value = `${product?.name || ''}${product?.category || ''}`;
  const score = [...value].reduce((sum, character) => sum + character.charCodeAt(0), fallbackIndex);
  return colorPalettes[score % colorPalettes.length];
};
const assemblyColors = computed(() => {
  const device = paletteFor(selected.value.device, 0);
  const liquid = paletteFor(selected.value.liquid, 1);
  const coil = paletteFor(selected.value.coil, 2);
  const accessory = paletteFor(selected.value.accessory, 3);
  return {
    '--device-primary': device.primary,
    '--device-light': device.light,
    '--device-dark': device.dark,
    '--liquid-primary': liquid.primary,
    '--liquid-light': liquid.light,
    '--coil-color': coil.light,
    '--accessory-color': accessory.light,
  };
});
const previewStatus = computed(() => {
  if (!selected.value.device) return 'Choose a device to start';
  if (!selected.value.liquid) return 'Add e-liquid to continue';
  if (!selected.value.coil && !selected.value.accessory) return 'Core build ready — add extras';
  return canBuild.value ? 'Build complete — ready to add' : 'Choose the required parts';
});

const formatPrice = (price) => Number(price || 0).toFixed(2);

const selectComponent = (group, product) => {
  selected.value = { ...selected.value, [group.key]: product };
  assemblyVersion.value += 1;
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
  assemblyVersion.value += 1;
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
  padding: 1.25rem;
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
  min-height: 330px;
}

.vape-aura {
  position: absolute;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--device-primary) 42%, transparent);
  filter: blur(26px);
  animation: preview-pulse 3s ease-in-out infinite;
}

.assembly-parts {
  position: relative;
  z-index: 1;
  width: min(100%, 390px);
  height: 275px;
}

.assembly-part {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  animation: part-in 0.35s ease both;
}

.device-part,
.liquid-part {
  position: absolute;
  left: 50%;
}

.device-part {
  bottom: 0.1rem;
  z-index: 2;
  transform: translateX(-50%);
}

.liquid-part {
  top: 0.2rem;
  z-index: 3;
  transform: translateX(-50%);
}

.device-part:not(.empty) {
  animation: assemble-device 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.liquid-part:not(.empty) {
  animation: assemble-liquid 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.assembly-part.is-active {
  animation: attach-part 0.65s ease both;
}

.device-part.is-active {
  animation: assemble-device-active 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.liquid-part.is-active {
  animation: assemble-liquid-active 0.65s cubic-bezier(0.22, 1, 0.36, 1) both;
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

.assembly-part small {
  color: #ffb5d0;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.device-shell {
  position: relative;
  width: 112px;
  height: 172px;
  border: 2px solid var(--device-primary);
  border-radius: 15px 15px 12px 12px;
  background: linear-gradient(110deg, #101010, var(--device-dark) 52%, #090909);
  box-shadow: inset 0 0 18px color-mix(in srgb, var(--device-primary) 40%, transparent), 0 12px 20px rgba(0, 0, 0, 0.35);
}

.device-shell::before {
  content: '';
  position: absolute;
  top: -14px;
  left: 28px;
  width: 52px;
  height: 16px;
  border: 2px solid var(--device-light);
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: #171717;
}

.device-screen {
  position: absolute;
  top: 40px;
  left: 27px;
  padding: 0.3rem 0.4rem;
  border: 1px solid color-mix(in srgb, var(--device-light) 55%, transparent);
  border-radius: 3px;
  color: var(--device-light);
  font: 800 0.78rem 'Syne', sans-serif;
}

.device-button {
  position: absolute;
  top: 82px;
  left: 45px;
  width: 18px;
  height: 28px;
  border: 1px solid var(--device-light);
  border-radius: 5px;
}

.device-led {
  position: absolute;
  bottom: 25px;
  left: 50px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--device-primary);
  box-shadow: 0 0 12px var(--device-primary);
}

.device-part.empty .device-shell {
  opacity: 0.35;
  border-style: dashed;
  box-shadow: none;
}

.pod-tank {
  position: relative;
  width: 96px;
  height: 108px;
  border: 2px solid var(--liquid-light);
  border-radius: 12px 12px 18px 18px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.08), color-mix(in srgb, var(--liquid-primary) 22%, transparent), rgba(255, 255, 255, 0.08));
  box-shadow: 0 0 16px color-mix(in srgb, var(--liquid-primary) 55%, transparent), inset 0 -18px 0 color-mix(in srgb, var(--liquid-primary) 75%, #351322);
}

.tank-mouthpiece {
  position: absolute;
  top: -26px;
  left: 30px;
  width: 32px;
  height: 26px;
  border: 2px solid #d7d7d7;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: #282828;
}

.tank-liquid {
  position: absolute;
  right: 13px;
  bottom: 13px;
  left: 13px;
  height: 36px;
  border-radius: 4px 4px 10px 10px;
  background: linear-gradient(var(--liquid-light), var(--liquid-primary));
  box-shadow: 0 0 10px color-mix(in srgb, var(--liquid-primary) 70%, transparent);
}

.tank-coil {
  position: absolute;
  bottom: 5px;
  left: 40px;
  width: 15px;
  height: 15px;
  border: 3px solid var(--coil-color);
  border-radius: 50%;
}

.liquid-part.empty .pod-tank {
  opacity: 0.35;
  border-style: dashed;
  box-shadow: none;
}

.assembly-connector {
  position: absolute;
  top: 6.8rem;
  left: 50%;
  z-index: 4;
  width: 78px;
  height: 11px;
  border-radius: 999px;
  background: var(--device-primary);
  box-shadow: 0 0 10px var(--device-primary);
  transform: translateX(-50%);
  animation: connector-pulse 1.8s ease-in-out infinite;
}

.assembly-extras {
  position: absolute;
  right: -0.5rem;
  bottom: 0.2rem;
  z-index: 5;
  display: flex;
  gap: 0.4rem;
}

.mini-part small {
  font-size: 0.54rem;
}

.coil-part {
  display: block;
  width: 48px;
  height: 48px;
  border: 7px solid var(--coil-color);
  border-radius: 50%;
  box-shadow: inset 0 0 0 4px var(--device-dark), 0 0 12px color-mix(in srgb, var(--coil-color) 70%, transparent);
}

.charger-part {
  display: block;
  position: relative;
  width: 60px;
  height: 36px;
  border: 2px solid var(--accessory-color);
  border-radius: 5px;
  background: #252525;
}

.charger-part::after {
  content: '';
  position: absolute;
  right: -18px;
  top: 12px;
  width: 18px;
  height: 7px;
  border-radius: 0 999px 999px 0;
  background: var(--accessory-color);
}

.charger-part span {
  position: absolute;
  left: 10px;
  top: 10px;
  width: 18px;
  height: 8px;
  border-radius: 2px;
  background: var(--accessory-color);
}

/* Keep the preview grounded while the product photography loads. */
.vape-stage::after {
  content: '';
  position: absolute;
  bottom: 1.9rem;
  width: 88%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 181, 208, 0.7), transparent);
}

.build-complete .vape-aura {
  width: 175px;
  height: 175px;
  background: color-mix(in srgb, var(--device-primary) 55%, transparent);
  animation: complete-pulse 1.5s ease-in-out infinite;
}

.build-complete .assembly-parts {
  animation: complete-build 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.build-complete .assembly-connector {
  width: 72px;
  box-shadow: 0 0 16px var(--device-primary), 0 0 30px color-mix(in srgb, var(--device-primary) 65%, transparent);
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

@keyframes assemble-device {
  from { opacity: 0; transform: translate(-50%, 28px) scale(0.82) rotate(-5deg); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1) rotate(0); }
}

@keyframes assemble-liquid {
  from { opacity: 0; transform: translate(-50%, -28px) scale(0.82) rotate(5deg); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1) rotate(0); }
}

@keyframes assemble-device-active {
  0% { opacity: 0.45; transform: translate(-50%, 28px) scale(0.82) rotate(-5deg); filter: brightness(1.7); }
  55% { opacity: 1; transform: translate(-50%, 3px) scale(1.04) rotate(1deg); filter: brightness(1.35); }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1) rotate(0); filter: brightness(1); }
}

@keyframes assemble-liquid-active {
  0% { opacity: 0.45; transform: translate(-50%, -28px) scale(0.82) rotate(5deg); filter: brightness(1.7); }
  55% { opacity: 1; transform: translate(-50%, 3px) scale(1.04) rotate(-1deg); filter: brightness(1.35); }
  100% { opacity: 1; transform: translate(-50%, 0) scale(1) rotate(0); filter: brightness(1); }
}

@keyframes complete-build {
  0% { transform: scale(0.92); filter: brightness(1); }
  55% { transform: scale(1.05); filter: brightness(1.35); }
  100% { transform: scale(1); filter: brightness(1); }
}

@keyframes connector-pulse {
  0%, 100% { opacity: 0.5; transform: translateX(-50%) scaleX(0.7); }
  50% { opacity: 1; transform: translateX(-50%) scaleX(1); }
}

@keyframes complete-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.92); }
  50% { opacity: 1; transform: scale(1.08); }
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

  .vape-stage {
    min-height: 300px;
  }

  .assembly-parts {
    transform: scale(0.9);
  }
}
</style>
