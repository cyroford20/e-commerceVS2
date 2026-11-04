<template>
  <div class="cart-line">
    <img :src="item.image_url" :alt="item.name" />

    <div class="info">
      <h2>{{ item.name }}</h2>
      <p class="price-text">₱{{ formatPrice(item.price) }}</p>
      <p class="subtotal">Subtotal ₱{{ formatPrice(item.price * item.quantity) }}</p>
    </div>

    <div class="qty-controls">
      <button type="button" @click="$emit('decrease', item)">−</button>
      <span class="qty">{{ item.quantity }}</span>
      <button type="button" @click="$emit('increase', item)">+</button>
      <button type="button" class="remove" @click="$emit('remove', item)" aria-label="Remove">
        <ion-icon :icon="trashOutline"></ion-icon>
      </button>
    </div>
  </div>
</template>

<script setup>
import { IonIcon } from '@ionic/vue';
import { trashOutline } from 'ionicons/icons';

defineProps({
  item: { type: Object, required: true },
});

defineEmits(['increase', 'decrease', 'remove']);

const formatPrice = (price) => parseFloat(price).toFixed(2);
</script>

<style scoped>
.cart-line {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) auto;
  gap: 0.9rem;
  align-items: center;
  padding: 0.85rem;
  border: 1px solid #f3d6e3;
  background: rgba(255, 255, 255, 0.9);
}

img {
  width: 88px;
  height: 88px;
  object-fit: cover;
  background: #fff0f5;
}

h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.subtotal {
  margin: 0.2rem 0 0;
  color: #5c5c5c;
  font-size: 0.85rem;
}

.qty-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.qty-controls button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #0a0a0a;
  background: #ffffff;
  cursor: pointer;
}

.qty-controls button.remove {
  border-color: #d4146a;
  color: #d4146a;
}

.qty {
  min-width: 24px;
  text-align: center;
  font-weight: 700;
  font-family: 'Syne', sans-serif;
}

@media (max-width: 600px) {
  .cart-line {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  img {
    width: 72px;
    height: 72px;
  }

  .qty-controls {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
