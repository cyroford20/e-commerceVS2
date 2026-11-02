<template>
  <ion-page>
    <Navbar ref="navbar" title="Vape Shop" />

    <ion-content :fullscreen="true" class="home-content">
      <section
        class="hero"
        aria-label="Vape Shop"
        @pointermove="onHeroPointer"
        @pointerleave="resetHeroPointer"
      >
        <div class="hero-media" aria-hidden="true">
          <div class="hero-photo" :style="photoStyle"></div>
          <div class="grid-mask"></div>
          <div class="hero-veil"></div>
          <div class="vapor vapor-a" :style="vaporAStyle"></div>
          <div class="vapor vapor-b" :style="vaporBStyle"></div>
          <div class="ring ring-a"></div>
          <div class="ring ring-b"></div>
        </div>

        <p class="watermark" aria-hidden="true">VAPE</p>

        <div class="hero-copy">
          <p class="brand rise-in">
            <img src="/logo.svg" alt="VapeShop" class="hero-logo" />
          </p>
          <div class="rule rise-in rise-in-delay-1"></div>
          <h1 class="rise-in rise-in-delay-1">Flavor, cut sharp.</h1>
          <p class="lede rise-in rise-in-delay-2">
            Disposables, pods, and liquids curated for a clean hit.
          </p>
          <div class="cta rise-in rise-in-delay-3">
            <button type="button" class="cta-btn" @click="scrollToCatalog">
              <span>Shop catalog</span>
              <span class="cta-glow"></span>
            </button>
            <button type="button" class="cta-btn outline" @click="goCustomize">
              Build your vape
            </button>
            <template v-if="!loggedIn">
              <button type="button" class="cta-btn ghost" @click="goLogin">
                Login
              </button>
              <button type="button" class="cta-btn outline" @click="goRegister">
                Sign up
              </button>
            </template>
          </div>
        </div>

        <button type="button" class="scroll-cue" @click="scrollToCatalog" aria-label="Scroll to catalog">
          <span></span>
        </button>
      </section>

      <div class="marquee" aria-hidden="true">
        <div class="marquee-track">
          <span v-for="n in 2" :key="n">
            Disposable · Pod System · E-Liquid · Salt Nic · Coils · Accessories ·
          </span>
        </div>
      </div>

      <section id="catalog" class="catalog">
        <div class="catalog-head">
          <p class="eyebrow">Collection</p>
          <h2>Catalog</h2>
          <p>Find your next everyday device or liquid.</p>
        </div>

        <div class="filter-bar">
          <ion-searchbar
            v-model="search"
            placeholder="Search products..."
            debounce="300"
          ></ion-searchbar>

          <div class="category-row">
            <button
              type="button"
              class="chip"
              :class="{ active: selectedCategory === '' }"
              @click="selectedCategory = ''"
            >
              All
            </button>
            <button
              type="button"
              class="chip"
              v-for="cat in categories"
              :key="cat"
              :class="{ active: selectedCategory === cat }"
              @click="selectedCategory = cat"
            >
              {{ cat }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="empty-state">
          <ion-spinner name="crescent"></ion-spinner>
          <p>Loading products...</p>
        </div>

        <div v-else-if="error" class="empty-state">
          <h2>Could not load shop</h2>
          <p>{{ error }}</p>
          <ion-button @click="fetchProducts">Retry</ion-button>
        </div>

        <div v-else class="product-grid">
          <ProductCard
            v-for="(product, index) in filteredProducts"
            :key="product.id"
            :product="product"
            :style="{ animationDelay: `${Math.min(index, 10) * 0.06}s` }"
            @click="goToProduct"
          />

          <div v-if="filteredProducts.length === 0" class="empty-state wide">
            <h2>No products found</h2>
            <p>Try a different search or category.</p>
          </div>
        </div>
      </section>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonSearchbar, IonSpinner, IonButton } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import ProductCard from '../components/ProductCard.vue';
import { getProducts, isLoggedIn } from '../services/api';

const router = useRouter();
const products = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const selectedCategory = ref('');
const navbar = ref(null);
const photoStyle = ref({});
const vaporAStyle = ref({});
const vaporBStyle = ref({});
const loggedIn = ref(false);

const categories = computed(() => {
  const cats = products.value.map((p) => p.category).filter(Boolean);
  return [...new Set(cats)];
});

const filteredProducts = computed(() => {
  return products.value.filter((p) => {
    const matchesSearch =
      !search.value ||
      p.name.toLowerCase().includes(search.value.toLowerCase());
    const matchesCategory =
      !selectedCategory.value || p.category === selectedCategory.value;
    return matchesSearch && matchesCategory;
  });
});

const fetchProducts = async () => {
  loading.value = true;
  error.value = '';
  try {
    const res = await getProducts();
    products.value = res.data;
  } catch (err) {
    error.value =
      err.response?.data?.message ||
      'Could not load products. Is the backend running?';
  } finally {
    loading.value = false;
  }
};

const goToProduct = (product) => {
  router.push(`/product/${product.id}`);
};

const scrollToCatalog = () => {
  document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
};

const goLogin = () => router.push('/login');
const goRegister = () => router.push('/register');
const goCustomize = () => router.push('/customize');

const onHeroPointer = (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  photoStyle.value = {
    transform: `translate3d(${x * -18}px, ${y * -14}px, 0) scale(1.08)`,
  };
  vaporAStyle.value = {
    transform: `translate3d(${x * 28}px, ${y * 18}px, 0)`,
  };
  vaporBStyle.value = {
    transform: `translate3d(${x * -22}px, ${y * -16}px, 0)`,
  };
};

const resetHeroPointer = () => {
  photoStyle.value = { transform: 'translate3d(0, 0, 0) scale(1.05)' };
  vaporAStyle.value = { transform: 'translate3d(0, 0, 0)' };
  vaporBStyle.value = { transform: 'translate3d(0, 0, 0)' };
};

onMounted(() => {
  loggedIn.value = isLoggedIn();
  fetchProducts();
  if (navbar.value) navbar.value.refresh();
});
</script>

<style scoped>
.home-content {
  --background: #050505;
}

.hero {
  position: relative;
  isolation: isolate;
  min-height: calc(100dvh - 62px);
  display: grid;
  align-items: end;
  overflow: hidden;
  background: #050505;
  color: #ffffff;
}

.hero-media {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #050505;
}

.hero-photo {
  position: absolute;
  inset: -10%;
  background:
    radial-gradient(circle at 70% 25%, rgba(255, 77, 141, 0.62), transparent 38%),
    radial-gradient(circle at 20% 70%, rgba(255, 255, 255, 0.14), transparent 28%),
    radial-gradient(circle at 55% 55%, #220814 0%, #050505 68%),
    conic-gradient(from 210deg at 65% 35%, rgba(255, 77, 141, 0.2), transparent 40%);
  transition: transform 0.35s ease-out;
  will-change: transform;
}

.grid-mask {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(circle at center, black 20%, transparent 75%);
  opacity: 0.55;
}

.hero-veil {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(5, 5, 5, 0.15) 0%, rgba(5, 5, 5, 0.45) 48%, #050505 100%),
    radial-gradient(ellipse 80% 60% at 80% 10%, rgba(255, 77, 141, 0.2), transparent 55%);
}

.vapor {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  pointer-events: none;
  transition: transform 0.4s ease-out;
  animation: soft-pulse 7s ease-in-out infinite;
}

.vapor-a {
  width: min(46vw, 460px);
  height: min(46vw, 460px);
  right: 6%;
  top: 14%;
  background: rgba(255, 77, 141, 0.42);
}

.vapor-b {
  width: min(34vw, 320px);
  height: min(34vw, 320px);
  left: 8%;
  bottom: 18%;
  background: rgba(255, 255, 255, 0.12);
  animation-delay: 1.5s;
}

.ring {
  position: absolute;
  border: 1px solid rgba(255, 77, 141, 0.28);
  border-radius: 50%;
  pointer-events: none;
}

.ring-a {
  width: min(52vw, 520px);
  height: min(52vw, 520px);
  right: 2%;
  top: 8%;
  animation: soft-pulse 10s ease-in-out infinite;
}

.ring-b {
  width: min(28vw, 280px);
  height: min(28vw, 280px);
  right: 18%;
  top: 28%;
  border-color: rgba(255, 255, 255, 0.14);
  animation: soft-pulse 8s ease-in-out infinite reverse;
}

.watermark {
  position: absolute;
  right: -4%;
  top: 12%;
  z-index: 1;
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: clamp(6rem, 22vw, 16rem);
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 0.8;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.1);
  user-select: none;
  pointer-events: none;
}

.hero-copy {
  position: relative;
  z-index: 2;
  width: min(760px, 100%);
  padding: 3.8rem 1.5rem 3.4rem;
}

.brand {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.22em;
  margin: 0 0 1rem;
  font-family: 'Syne', sans-serif;
  font-size: clamp(3rem, 11vw, 6.2rem);
  font-weight: 800;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  line-height: 0.88;
}

.hero-logo {
  width: clamp(15rem, 42vw, 28rem);
  height: auto;
  box-shadow: 0 0 30px rgba(255, 77, 141, 0.42);
}

.brand .word {
  display: inline-block;
}

.brand .accent {
  background: linear-gradient(100deg, #ffffff 10%, #ff4d8d 55%, #ff9fc2 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmer 7s linear infinite;
}

.rule {
  width: 72px;
  height: 2px;
  margin-bottom: 1rem;
  background: linear-gradient(90deg, #ff4d8d, transparent);
  transform-origin: left center;
  animation: line-draw 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
}

.hero-copy h1 {
  margin: 0 0 0.85rem;
  font-family: 'Outfit', sans-serif;
  font-size: clamp(1.25rem, 3.5vw, 1.85rem);
  font-weight: 350;
  letter-spacing: 0.01em;
  color: #ffffff;
}

.lede {
  margin: 0 0 1.7rem;
  max-width: 28rem;
  color: rgba(255, 255, 255, 0.74);
  font-size: 1.02rem;
  line-height: 1.6;
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  align-items: center;
}

.cta-btn {
  position: relative;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  padding: 0.95rem 1.7rem;
  background: #ff4d8d;
  color: #ffffff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s ease;
}

.cta-btn:hover {
  transform: translateY(-2px) scale(1.02);
  background: #ff5f98;
}

.cta-btn.ghost {
  background: #ffffff;
  color: #050505;
}

.cta-btn.ghost:hover {
  background: #f3f3f3;
}

.cta-btn.outline {
  background: transparent;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.55);
}

.cta-btn.outline:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: #ff4d8d;
  color: #ff4d8d;
}

.cta-glow {
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.35), transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.55s ease;
}

.cta-btn:hover .cta-glow {
  transform: translateX(120%);
}

.scroll-cue {
  position: absolute;
  left: 50%;
  bottom: 1.2rem;
  z-index: 3;
  width: 28px;
  height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: transparent;
  transform: translateX(-50%);
}

.scroll-cue span {
  display: block;
  width: 4px;
  height: 4px;
  margin: 8px auto 0;
  border-radius: 50%;
  background: #ff4d8d;
  animation: bounce-cue 1.5s ease-in-out infinite;
}

.marquee {
  overflow: hidden;
  border-top: 1px solid rgba(255, 77, 141, 0.25);
  border-bottom: 1px solid rgba(255, 77, 141, 0.25);
  background: #0a0a0a;
  color: rgba(255, 255, 255, 0.72);
}

.marquee-track {
  display: flex;
  width: max-content;
  gap: 0;
  animation: marquee 28s linear infinite;
  font-family: 'Syne', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  padding: 0.85rem 0;
  white-space: nowrap;
}

.marquee-track span {
  padding-right: 1.5rem;
}

.catalog {
  padding: 3rem 1.25rem 4rem;
  background:
    radial-gradient(ellipse 50% 30% at 100% 0%, rgba(255, 77, 141, 0.08), transparent 55%),
    #ffffff;
}

.catalog-head {
  margin-bottom: 1.6rem;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: #ff4d8d;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.catalog-head h2 {
  margin: 0 0 0.4rem;
  font-size: clamp(2rem, 5vw, 3rem);
}

.catalog-head p {
  margin: 0;
  color: #5c5c5c;
}

.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
  margin-bottom: 1.9rem;
}

.category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip {
  border: 1px solid #f3d6e3;
  background: rgba(255, 255, 255, 0.9);
  color: #111;
  border-radius: 999px;
  padding: 0.48rem 1rem;
  font-family: 'Outfit', sans-serif;
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.05em;
  transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.chip:hover {
  transform: translateY(-1px);
  background: #0a0a0a;
  border-color: #0a0a0a;
  color: #ffffff;
}

.chip.active {
  background: #ff4d8d;
  border-color: #ff4d8d;
  color: #ffffff;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.7rem 1.15rem;
}

.wide {
  grid-column: 1 / -1;
}

@media (max-width: 600px) {
  .hero-copy {
    padding: 2.6rem 1.15rem 3.2rem;
  }

  .watermark {
    opacity: 0.55;
  }

  .product-grid {
    grid-template-columns: 1fr 1fr;
    gap: 1.15rem 0.75rem;
  }
}
</style>
