<template>
  <ion-page>
    <Navbar title="Build your vape" :show-back="true" />
    <ion-content class="page-shell">
      <main class="builder-shell">
        <header class="builder-header">
          <p class="eyebrow">Vape builder</p>
          <h1>Build it your way.</h1>
          <p>Choose products from the live catalog and see your setup update as you build.</p>
        </header>

        <div class="builder-search">
          <label for="build-search">Find a catalog product</label>
          <input id="build-search" v-model="search" type="search" placeholder="Search name or category" />
        </div>

        <p v-if="error" class="state-message error-msg" role="alert">{{ error }}</p>
        <div v-if="loading" class="state-message" role="status">Loading products from the catalog...</div>
        <div v-else-if="error && !products.length" class="state-message">
          <button type="button" class="secondary-button" @click="loadProducts">Retry</button>
        </div>

        <div v-else class="builder-layout">
          <section class="component-list" aria-label="Choose build products">
            <article v-for="group in componentGroups" :key="group.key" class="component-group">
              <div class="group-heading">
                <div>
                  <p class="step-label">Step {{ group.step }}</p>
                  <h2>{{ group.label }}</h2>
                </div>
                <span :class="group.required ? 'required-label' : 'optional-label'">
                  {{ group.required ? 'Required' : 'Optional' }}
                </span>
              </div>

              <div v-if="group.products.length" class="component-options">
                <button
                  v-for="product in group.products"
                  :key="product.id"
                  type="button"
                  class="component-option"
                  :class="{ selected: selected[group.key]?.id === product.id }"
                  :aria-pressed="selected[group.key]?.id === product.id"
                  :disabled="Number(product.stock) <= 0 || validating"
                  @click="selectComponent(group, product)"
                >
                  <span class="option-image">
                    <img v-if="product.image_url" :src="product.image_url" :alt="product.name" @error="hideBrokenImage" />
                    <span v-else aria-hidden="true">No image</span>
                  </span>
                  <span class="option-copy">
                    <strong>{{ product.name }}</strong>
                    <small>{{ product.category || 'Catalog item' }}  -  {{ Number(product.stock) }} available</small>
                  </span>
                  <span class="option-price">PHP {{ formatPrice(product.price) }}</span>
                </button>
                <button
                  v-if="selected[group.key]"
                  type="button"
                  class="clear-option"
                  @click="clearComponent(group.key)"
                >
                  Remove {{ group.label.toLowerCase() }}
                </button>
              </div>
              <p v-else class="missing-components">No matching catalog products are available.</p>
            </article>

            <p v-if="!componentGroups.length" class="state-message">
              The catalog does not currently have products for a build. Check back later.
            </p>
            <p v-else-if="!hasDeviceProducts" class="state-message">
              A device or disposable must be available in the catalog before a build can be added.
            </p>
          </section>

          <aside class="build-summary" aria-label="Build preview and summary">
            <section class="live-preview">
              <div class="preview-heading">
                <div>
                  <p class="eyebrow">Live selection preview</p>
                  <h2>Your setup</h2>
                </div>
                <span class="build-progress">{{ selectedItems.length }} selected</span>
              </div>

              <div v-if="componentGroups.length" class="preview-items" aria-live="polite">
                <article
                  v-for="group in componentGroups"
                  :key="`${group.key}:${selected[group.key]?.id || 'empty'}`"
                  class="preview-item"
                  :class="{ empty: !selected[group.key] }"
                >
                  <span class="preview-image">
                    <img v-if="selected[group.key]?.image_url" :src="selected[group.key].image_url" :alt="selected[group.key].name" @error="hideBrokenImage" />
                    <span v-else aria-hidden="true">＋</span>
                  </span>
                  <span class="preview-item-copy">
                    <small>{{ group.label }}{{ group.required ? '  -  Required' : '  -  Optional' }}</small>
                    <strong>{{ selected[group.key]?.name || 'Choose from catalog' }}</strong>
                  </span>
                </article>
              </div>
              <div v-else class="preview-empty">
                <span class="preview-empty-mark" aria-hidden="true">＋</span>
                <p>Select a device or disposable to start your build.</p>
              </div>
              <p class="compatibility-note">
                Preview uses the selected catalog product photos. The catalog has no fitment specifications, so physical compatibility has not been verified.
              </p>
            </section>

            <div class="summary-heading">
              <p class="eyebrow">Your selection</p>
              <h2>Build summary</h2>
            </div>
            <div v-if="selectedItems.length" class="summary-items">
              <div v-for="item in selectedItems" :key="item.id" class="summary-item">
                <span><strong>{{ item.name }}</strong><small>Qty 1 / {{ item.category || item.groupLabel }} / {{ Number(item.stock) }} available</small></span>
                <strong>PHP {{ formatPrice(item.price) }}</strong>
              </div>
            </div>
            <p v-else class="summary-empty">Your selected products will appear here.</p>
            <div class="summary-total">
              <span>Total</span>
              <strong>PHP {{ formatPrice(buildTotal) }}</strong>
            </div>

            <p v-if="validating" class="status-message" role="status">Checking current prices and stock...</p>
            <p v-if="buildError" class="error-msg" role="alert">{{ buildError }}</p>
            <p v-if="buildNotice" class="status-message" role="status">{{ buildNotice }}</p>

            <button
              type="button"
              class="build-button"
              :disabled="!canBuild || validating"
              @click="addBuildToCart"
            >
              {{ validating ? 'Checking build...' : loggedIn ? 'Add build to cart' : 'Login to add build' }}
            </button>
            <p class="summary-note">Selected products are added separately, one of each, using the existing cart and checkout.</p>

            <div v-if="addedToCart" class="build-success" role="status">
              <strong>Your build was added to the cart.</strong>
              <div>
                <button type="button" class="success-link" @click="router.push('/cart')">View cart</button>
                <button type="button" class="success-link" @click="router.push('/home')">Continue shopping</button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { IonContent, IonPage } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import {
  addToCart,
  getProducts,
  isLoggedIn,
  isStoreOwner,
  validateBuild,
} from '../services/api';

const router = useRouter();
const products = ref([]);
const loading = ref(true);
const validating = ref(false);
const error = ref('');
const buildError = ref('');
const buildNotice = ref('');
const selected = ref({});
const search = ref('');
const loggedIn = ref(false);
const addedToCart = ref(false);
const draftKey = 'vapeBuildDraft';

const definitions = [
  { key: 'device', label: 'Device or disposable', required: true, matches: ['device', 'pod', 'mod', 'disposable', 'kit'] },
  { key: 'liquid', label: 'E-liquid', required: false, matches: ['e-liquid', 'e liquid', 'e-juice', 'ejuice', 'liquid', 'salt nic'] },
  { key: 'coil', label: 'Coil', required: false, matches: ['coil', 'atomizer'] },
  { key: 'accessory', label: 'Accessory', required: false, matches: ['accessor', 'charger', 'battery', 'drip'] },
];

const componentGroups = computed(() => {
  const query = search.value.trim().toLowerCase();
  const classifiedIds = new Set();
  const groups = definitions.map((definition) => {
    const matches = products.value.filter((product) => {
      const category = (product.category || '').toLowerCase();
      return !classifiedIds.has(product.id) && definition.matches.some((term) => category.includes(term));
    });
    matches.forEach((product) => classifiedIds.add(product.id));
    return { ...definition, products: matches };
  });
  const otherProducts = products.value.filter((product) => !classifiedIds.has(product.id));
  if (otherProducts.length) {
    groups.push({ key: 'other', label: 'Other catalog products', required: false, matches: [], products: otherProducts });
  }

  return groups
    .filter((group) => group.products.length)
    .map((group, index) => ({
      ...group,
      step: index + 1,
      products: group.products.filter((product) => {
        if (!query) return true;
        return `${product.name} ${product.category || ''}`.toLowerCase().includes(query);
      }),
    }));
});
const hasDeviceProducts = computed(() => products.value.some((product) => {
  const category = (product.category || '').toLowerCase();
  return definitions[0].matches.some((term) => category.includes(term));
}));

const selectedItems = computed(() => Object.entries(selected.value).flatMap(([key, product]) => {
  if (!product) return [];
  const group = definitions.find((item) => item.key === key);
  return [{ ...product, groupLabel: group?.label || 'Other catalog product' }];
}));
const buildTotal = computed(() => selectedItems.value.reduce((sum, product) => sum + Number(product.price || 0), 0));
const canBuild = computed(() => Boolean(
  selected.value.device &&
  Number(selected.value.device.stock) > 0 &&
  selectedItems.value.length > 0 &&
  selectedItems.value.every((product) => Number(product.stock) > 0),
));

const formatPrice = (price) => Number(price || 0).toFixed(2);
const hideBrokenImage = (event) => { event.currentTarget.hidden = true; };

const saveDraft = () => {
  const draft = Object.fromEntries(Object.entries(selected.value).map(([key, product]) => [key, product?.id]));
  localStorage.setItem(draftKey, JSON.stringify(draft));
};

const restoreDraft = () => {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || '{}');
    const restored = {};
    for (const [key, id] of Object.entries(draft)) {
      const product = products.value.find((item) => String(item.id) === String(id));
      if (product && Number(product.stock) > 0) restored[key] = product;
    }
    selected.value = restored;
    saveDraft();
  } catch {
    localStorage.removeItem(draftKey);
  }
};

const loadProducts = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await getProducts();
    products.value = Array.isArray(response.data) ? response.data : [];
    restoreDraft();
  } catch (err) {
    error.value = err.response?.data?.message || (err.response
      ? 'Could not load catalog products. Please try again.'
      : 'Could not reach the store. Check your internet connection and retry.');
  } finally {
    loading.value = false;
  }
};

const selectComponent = (group, product) => {
  if (Number(product.stock) <= 0) return;
  selected.value = { ...selected.value, [group.key]: product };
  buildError.value = '';
  buildNotice.value = '';
  addedToCart.value = false;
  saveDraft();
};

const clearComponent = (key) => {
  const next = { ...selected.value };
  delete next[key];
  selected.value = next;
  buildError.value = '';
  buildNotice.value = '';
  addedToCart.value = false;
  saveDraft();
};

const addBuildToCart = async () => {
  if (!canBuild.value || validating.value) return;
  if (!loggedIn.value) {
    saveDraft();
    router.push('/login');
    return;
  }
  if (isStoreOwner()) {
    router.push('/store');
    return;
  }

  validating.value = true;
  buildError.value = '';
  buildNotice.value = '';
  addedToCart.value = false;
  try {
    const request = {
      items: selectedItems.value.map((product) => ({
        id: product.id,
        price: Number(product.price),
        stock: Number(product.stock),
      })),
    };
    const response = await validateBuild(request);
    const currentProducts = response.data.products || [];
    const currentById = new Map(currentProducts.map((product) => [String(product.id), product]));
    const refreshedSelection = {};
    for (const [key, product] of Object.entries(selected.value)) {
      const current = currentById.get(String(product.id));
      if (current) refreshedSelection[key] = current;
    }
    selected.value = refreshedSelection;

    const changes = [];
    if (response.data.price_changed?.length) changes.push('Prices changed');
    if (response.data.stock_changed?.length) changes.push('Stock changed');
    if (changes.length) {
      buildNotice.value = `${changes.join(' and ')}. Review the updated build, then tap Add build to cart again.`;
      saveDraft();
      return;
    }

    currentProducts.forEach((product) => addToCart(product, 1));
    localStorage.removeItem(draftKey);
    addedToCart.value = true;
  } catch (err) {
    const unavailableIds = err.response?.data?.unavailable_ids || [];
    if (unavailableIds.length) {
      const unavailable = new Set(unavailableIds.map(String));
      selected.value = Object.fromEntries(
        Object.entries(selected.value).filter(([, product]) => !unavailable.has(String(product.id))),
      );
      saveDraft();
      await loadProducts();
      buildError.value = err.response?.data?.message || 'A selected product is no longer available. Choose another product.';
    } else {
      buildError.value = err.response?.data?.message || (err.response
        ? 'Could not validate this build. Please review it and try again.'
        : 'Could not reach the store. Check your internet connection and try again.');
    }
  } finally {
    validating.value = false;
  }
};

onMounted(() => {
  loggedIn.value = isLoggedIn();
  loadProducts();
});

</script>

<style scoped>
.builder-shell { max-width: 1180px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.builder-header { max-width: 700px; margin-bottom: 1.5rem; }
.eyebrow, .step-label { margin: 0 0 .35rem; color: #d4146a; font-size: .72rem; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
.builder-header h1 { margin: 0; font-size: clamp(2rem, 5vw, 3.25rem); }
.builder-header > p:last-child { color: #666; }
.builder-search { display: grid; gap: .4rem; max-width: 560px; margin-bottom: 1rem; }
.builder-search label { font-size: .82rem; font-weight: 700; }
.builder-search input { width: 100%; min-height: 46px; padding: .7rem .85rem; border: 1px solid #e8dce2; border-radius: 12px; font: inherit; }
.builder-layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(300px, .8fr); gap: 1.2rem; align-items: start; }
.component-list { display: grid; gap: .9rem; }
.component-group, .build-summary { padding: 1rem; border: 1px solid #f0dce5; border-radius: 18px; background: #fff; box-shadow: 0 12px 30px rgba(80, 20, 50, .05); }
.group-heading, .preview-heading { display: flex; align-items: start; justify-content: space-between; gap: .7rem; }
.group-heading { margin-bottom: .8rem; }
.group-heading h2, .preview-heading h2, .summary-heading h2 { margin: 0; font-size: 1.1rem; }
.required-label, .optional-label, .build-progress { flex: 0 0 auto; padding: .32rem .55rem; border-radius: 999px; font-size: .68rem; font-weight: 800; }
.required-label { background: #fff0f5; color: #d4146a; }
.optional-label { background: #f2f2f2; color: #666; }
.build-progress { border: 1px solid rgba(255, 181, 208, .35); color: #ffb5d0; }
.component-options { display: grid; gap: .55rem; }
.component-option { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; align-items: center; gap: .75rem; width: 100%; min-height: 70px; padding: .55rem; border: 1px solid #eee0e7; border-radius: 12px; background: #fff; color: #161616; text-align: left; cursor: pointer; }
.component-option.selected { border-color: #ff4d8d; box-shadow: 0 0 0 2px rgba(255, 77, 141, .14); }
.component-option:disabled { cursor: not-allowed; opacity: .48; }
.option-image, .preview-image { display: grid; place-items: center; overflow: hidden; background: linear-gradient(145deg, #faf4f7, #eee8ec); color: #777; font-size: .6rem; }
.option-image { width: 58px; height: 58px; border-radius: 9px; }
.option-image img { width: 100%; height: 100%; object-fit: cover; }
.option-copy { min-width: 0; }
.option-copy strong, .option-copy small { display: block; }
.option-copy strong { overflow: hidden; font-size: .88rem; text-overflow: ellipsis; }
.option-copy small { margin-top: .18rem; color: #777; font-size: .7rem; }
.option-price { color: #d4146a; font-size: .84rem; font-weight: 800; white-space: nowrap; }
.clear-option, .success-link { justify-self: start; padding: .45rem 0; border: 0; background: transparent; color: #a51052; font: inherit; font-size: .78rem; font-weight: 700; text-decoration: underline; cursor: pointer; }
.build-summary { position: sticky; top: 1rem; }
.live-preview { margin: -.2rem -.2rem 1.2rem; padding: 1rem; overflow: hidden; border-radius: 14px; background: radial-gradient(circle at 50% 0%, rgba(255, 77, 141, .25), transparent 48%), linear-gradient(145deg, #090909, #20101a); color: #fff; }
.preview-heading { align-items: center; margin-bottom: .85rem; }
.preview-heading .eyebrow { margin: 0 0 .15rem; color: #ff8eb6; }
.preview-heading h2 { color: #fff; }
.preview-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .55rem; }
.preview-item { display: grid; justify-items: center; gap: .5rem; min-width: 0; padding: .55rem; border: 1px solid rgba(255, 181, 208, .22); border-radius: 12px; background: rgba(255, 255, 255, .06); animation: preview-in .25s ease both; }
.preview-item.empty { border-style: dashed; background: rgba(255, 255, 255, .025); }
.preview-item.empty { border-style: dashed; background: rgba(255, 255, 255, .025); }
.preview-image { width: min(100%, 120px); height: 106px; border-radius: 9px; }
.preview-image img { width: 100%; height: 100%; object-fit: contain; }
.preview-item-copy { display: grid; gap: .15rem; width: 100%; text-align: center; }
.preview-item-copy small { color: #ffb5d0; font-size: .63rem; text-transform: uppercase; }
.preview-item-copy strong { overflow-wrap: anywhere; color: #fff; font-size: .75rem; }
.preview-empty { display: grid; justify-items: center; gap: .5rem; min-height: 145px; align-content: center; color: rgba(255, 255, 255, .75); text-align: center; }
.preview-empty p { margin: 0; font-size: .85rem; }
.preview-empty-mark { color: #ff8eb6; font-size: 2rem; }
.compatibility-note { margin: .8rem 0 0; padding-top: .7rem; border-top: 1px solid rgba(255, 255, 255, .14); color: rgba(255, 255, 255, .68); font-size: .7rem; line-height: 1.45; }
.summary-heading { margin-bottom: .8rem; }
.summary-heading .eyebrow { margin-bottom: .15rem; }
.summary-items { display: grid; gap: .65rem; }
.summary-item { display: flex; justify-content: space-between; gap: .8rem; color: #444; font-size: .8rem; }
.summary-item > span { min-width: 0; display: grid; gap: .15rem; }
.summary-item > span > strong { overflow-wrap: anywhere; }
.summary-item small { color: #777; font-size: .68rem; }
.summary-total { display: flex; justify-content: space-between; margin-top: 1rem; padding-top: .85rem; border-top: 1px solid #f0dce5; font-size: 1.1rem; }
.summary-total strong { color: #d4146a; }
.build-button, .secondary-button { min-height: 46px; padding: .75rem 1rem; border: 0; border-radius: 10px; background: #ff4d8d; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
.build-button { width: 100%; margin-top: 1rem; }
.build-button:disabled { cursor: not-allowed; opacity: .45; }
.summary-note, .summary-empty, .missing-components { color: #777; font-size: .75rem; line-height: 1.45; }
.summary-note { margin: .65rem 0 0; }
.summary-empty { margin: 0; }
.missing-components { margin: .3rem 0; }
.state-message { padding: .9rem; color: #666; }
.error-msg { color: #a51052; font-size: .82rem; font-weight: 700; }
.status-message { color: #555; font-size: .78rem; }
.build-success { display: grid; gap: .35rem; margin-top: .8rem; padding: .75rem; border-radius: 10px; background: #eefaf1; color: #25683a; font-size: .8rem; }
.build-success > div { display: flex; flex-wrap: wrap; gap: .9rem; }
.success-link { color: #25683a; }
@keyframes preview-in { from { opacity: 0; transform: translateY(6px) scale(.97); } to { opacity: 1; transform: none; } }
@media (max-width: 780px) { .builder-shell { padding: 1.2rem .9rem 3rem; } .builder-layout { grid-template-columns: 1fr; } .build-summary { position: static; } }
@media (max-width: 390px) { .component-option { grid-template-columns: 50px minmax(0, 1fr); } .option-image { width: 50px; height: 50px; } .option-price { grid-column: 2; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; } }
</style>
