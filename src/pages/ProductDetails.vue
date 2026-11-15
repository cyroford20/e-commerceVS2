<template>
  <ion-page>
    <Navbar ref="navbar" title="Product" :show-back="true" />

    <ion-content :fullscreen="true">
      <div v-if="loading" class="empty-state">
        <ion-spinner name="crescent"></ion-spinner>
      </div>

      <div v-else-if="error" class="empty-state">
        <h2>Error</h2>
        <p>{{ error }}</p>
        <ion-button router-link="/home">Back to Shop</ion-button>
      </div>

      <div v-else-if="product" class="detail-stage rise-in">
        <div class="detail-media" @pointermove="onMediaMove" @pointerleave="resetMedia">
          <div class="media-glow"></div>
          <div class="media-frame" :style="frameStyle">
            <img :src="product.image_url" :alt="product.name" />
          </div>
          <p class="media-mark" aria-hidden="true">VS</p>
        </div>

        <div class="detail-copy">
          <p class="category">{{ product.category }}</p>
          <h1>{{ product.name }}</h1>
          <p class="price-text big-price">₱{{ formatPrice(product.price) }}</p>
          <p class="stock-line" :class="{ out: product.stock <= 0 }">
            {{ product.stock > 0 ? `${product.stock} in stock` : 'Out of stock' }}
          </p>

          <div class="qty-row" v-if="product.stock > 0">
            <span>Quantity</span>
            <div class="qty-controls">
              <button type="button" @click="qty > 1 && qty--">−</button>
              <span class="qty-value">{{ qty }}</span>
              <button type="button" @click="qty < product.stock && qty++">+</button>
            </div>
          </div>

          <button
            type="button"
            class="add-btn"
            :disabled="product.stock <= 0"
            @click="handleAddToCart"
          >
            {{ addButtonLabel }}
          </button>
        </div>
      </div>

      <ion-toast
        :is-open="toastOpen"
        :message="toastMessage"
        duration="1500"
        color="success"
        @didDismiss="toastOpen = false"
      ></ion-toast>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonPage, IonContent, IonButton, IonSpinner, IonToast } from '@ionic/vue';
import Navbar from '../components/Navbar.vue';
import { getProductById, addToCart, isLoggedIn, isStoreOwner } from '../services/api';

const route = useRoute();
const router = useRouter();
const product = ref(null);
const loading = ref(true);
const error = ref('');
const qty = ref(1);
const toastOpen = ref(false);
const toastMessage = ref('Added to cart!');
const navbar = ref(null);
const frameStyle = ref({});

const formatPrice = (price) => parseFloat(price).toFixed(2);

const addButtonLabel = computed(() => {
  if (product.value?.stock <= 0) return 'Out of Stock';
  if (!isLoggedIn()) return 'Login to add to cart';
  if (isStoreOwner()) return 'Store owners cannot shop';
  return 'Add to Cart';
});

const fetchProduct = async () => {
  loading.value = true;
  try {
    const res = await getProductById(route.params.id);
    product.value = res.data;
  } catch (err) {
    error.value = err.response?.data?.message || 'Product not found.';
  } finally {
    loading.value = false;
  }
};

const handleAddToCart = () => {
  if (product.value?.stock <= 0) return;

  if (!isLoggedIn()) {
    router.push('/login');
    return;
  }

  if (isStoreOwner()) {
    router.push('/store');
    return;
  }

  addToCart(product.value, qty.value);
  toastMessage.value = 'Added to cart!';
  toastOpen.value = true;
  if (navbar.value) navbar.value.refresh();
};

const onMediaMove = (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  frameStyle.value = {
    transform: `perspective(1000px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`,
  };
};

const resetMedia = () => {
  frameStyle.value = { transform: 'perspective(1000px) rotateY(0deg) rotateX(0deg)' };
};

onMounted(fetchProduct);
</script>

<style scoped>
.detail-stage {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  min-height: calc(100dvh - 62px);
  background: #050505;
}

.detail-media {
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: 2rem;
  background:
    radial-gradient(circle at 70% 30%, rgba(255, 77, 141, 0.28), transparent 40%),
    linear-gradient(160deg, #050505, #150810 55%, #050505);
}

.media-glow {
  position: absolute;
  width: 55%;
  height: 55%;
  border-radius: 50%;
  background: rgba(255, 77, 141, 0.32);
  filter: blur(55px);
  animation: soft-pulse 5s ease-in-out infinite;
}

.media-frame {
  position: relative;
  z-index: 1;
  width: min(100%, 520px);
  aspect-ratio: 1;
  border: 1px solid rgba(255, 77, 141, 0.35);
  transition: transform 0.25s ease-out;
  overflow: hidden;
}

.media-frame img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-mark {
  position: absolute;
  right: 1.2rem;
  bottom: 1rem;
  margin: 0;
  font-family: 'Syne', sans-serif;
  font-size: clamp(3rem, 8vw, 5rem);
  font-weight: 800;
  letter-spacing: 0.08em;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.12);
}

.detail-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2.5rem 2rem;
  background:
    radial-gradient(ellipse 70% 40% at 100% 0%, rgba(255, 77, 141, 0.08), transparent 55%),
    #ffffff;
}

.category {
  margin: 0 0 0.65rem;
  color: #ff4d8d;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 0.8rem;
  font-size: clamp(1.9rem, 4vw, 3rem);
  line-height: 1.05;
}

.big-price {
  font-size: 1.9rem;
  margin: 0 0 0.65rem;
}

.stock-line {
  margin: 0 0 1.5rem;
  color: #5c5c5c;
  font-weight: 500;
}

.stock-line.out {
  color: #d4146a;
}

.qty-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.3rem;
  padding: 1rem 0;
  border-top: 1px solid #f3d6e3;
  border-bottom: 1px solid #f3d6e3;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.78rem;
}

.qty-controls {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.qty-controls button {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid #050505;
  background: #ffffff;
  color: #050505;
  font-size: 1.1rem;
  transition: background 0.2s ease, color 0.2s ease;
}

.qty-controls button:hover {
  background: #050505;
  color: #ffffff;
}

.qty-value {
  min-width: 1.5rem;
  text-align: center;
  font-family: 'Syne', sans-serif;
  font-size: 1.15rem;
}

.add-btn {
  border: 0;
  border-radius: 999px;
  padding: 1rem 1.4rem;
  background: #ff4d8d;
  color: #ffffff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: transform 0.25s ease, background 0.25s ease, opacity 0.25s ease;
}

.add-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  background: #ff5f98;
}

.add-btn:disabled {
  opacity: 0.45;
}

@media (max-width: 860px) {
  .detail-stage {
    grid-template-columns: 1fr;
  }

  .detail-media {
    min-height: 44vh;
    padding: 1.25rem;
  }

  .detail-copy {
    padding: 1.8rem 1.25rem 2.6rem;
  }
}

@media (max-width: 480px) {
  .detail-media {
    min-height: 34vh;
    padding: 0.9rem;
  }

  .media-frame {
    width: min(100%, 360px);
  }

  .detail-copy {
    padding: 1.4rem 1rem calc(2rem + env(safe-area-inset-bottom));
  }

  .qty-controls button,
  .add-btn {
    min-height: 44px;
  }

  .qty-controls button {
    width: 44px;
  }
}
</style>
