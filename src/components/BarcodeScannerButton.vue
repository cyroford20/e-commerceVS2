<template>
  <div class="scanner-control">
    <button type="button" class="scanner-button" :disabled="scanning" @click="startScanner">
      {{ scanning ? 'Scanning...' : label }}
    </button>

    <div v-if="scanning" class="barcode-scanner-overlay">
      <div class="scanner-card">
        <div class="scanner-camera-window">
          <video
            v-if="isWeb"
            ref="videoElement"
            class="scanner-video"
            autoplay
            muted
            playsinline
          ></video>
          <div class="scanner-frame" aria-hidden="true"></div>
        </div>
        <h2>Scan barcode</h2>
        <p>Point the camera at the product barcode.</p>
        <button type="button" class="scanner-cancel" @click="stopScanner">Cancel</button>
      </div>
    </div>

    <p v-if="errorMessage" class="scanner-error">{{ errorMessage }}</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue';
import 'barcode-detector/polyfill';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

defineProps({
  label: { type: String, default: 'Scan barcode' },
});

const emit = defineEmits(['scanned']);
const scanning = ref(false);
const errorMessage = ref('');
const videoElement = ref(null);
const isWeb = Capacitor.getPlatform() === 'web';
let scanListener;

const cleanup = async () => {
  document.body.classList.remove('barcode-scanner-active');
  if (scanListener) {
    await scanListener.remove();
    scanListener = null;
  }
  await BarcodeScanner.stopScan().catch(() => {});
  scanning.value = false;
};

const stopScanner = async () => {
  await cleanup();
};

const startScanner = async () => {
  errorMessage.value = '';
  scanning.value = true;
  document.body.classList.add('barcode-scanner-active');

  try {
    const support = await BarcodeScanner.isSupported();
    if (!support.supported) {
      throw new Error('Barcode scanning is not supported on this device or browser.');
    }

    const eventName = isWeb ? 'barcodesScanned' : 'barcodeScanned';
    scanListener = await BarcodeScanner.addListener(eventName, async (result) => {
      const barcode = result.barcode || result.barcodes?.[0];
      const value = barcode?.rawValue?.trim();
      if (!value) return;
      await cleanup();
      emit('scanned', value);
    });

    if (isWeb) {
      await BarcodeScanner.startScan({ videoElement: videoElement.value });
    } else {
      await BarcodeScanner.startScan();
    }
  } catch (error) {
    await cleanup();
    errorMessage.value = error.message || 'Could not start the barcode scanner.';
  }
};

onBeforeUnmount(() => {
  cleanup();
});
</script>

<style scoped>
.scanner-control {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
}

.scanner-button,
.scanner-cancel {
  border: 1px solid #e8c8d8;
  border-radius: 999px;
  padding: 0.65rem 0.9rem;
  background: #fff;
  color: #d4146a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.scanner-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.scanner-error {
  margin: 0;
  color: #d4146a;
  font-size: 0.8rem;
}

.barcode-scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: rgba(5, 5, 5, 0.82);
  color: #fff;
}

.scanner-card {
  display: grid;
  justify-items: center;
  gap: 0.65rem;
  width: min(90vw, 360px);
  padding: 1.5rem;
  border-radius: 20px;
  background: rgba(23, 16, 23, 0.82);
  text-align: center;
}

.scanner-camera-window {
  position: relative;
  width: 220px;
  height: 140px;
  overflow: hidden;
  border-radius: 14px;
  background: transparent;
}

.scanner-video {
  width: 100%;
  height: 100%;
  background: #000;
  object-fit: cover;
}

.scanner-card h2,
.scanner-card p {
  margin: 0;
}

.scanner-card p {
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.9rem;
}

.scanner-frame {
  position: absolute;
  inset: 10px 0;
  border: 2px solid #ff4d8d;
  border-radius: 14px;
  pointer-events: none;
}

.scanner-cancel {
  margin-top: 0.35rem;
  background: #ff4d8d;
  border-color: #ff4d8d;
  color: #fff;
}

:global(body.barcode-scanner-active) {
  visibility: hidden;
  --background: transparent;
  --ion-background-color: transparent;
  background: transparent !important;
}

:global(html.barcode-scanner-active),
:global(body.barcode-scanner-active ion-app),
:global(body.barcode-scanner-active ion-router-outlet),
:global(body.barcode-scanner-active .ion-page),
:global(body.barcode-scanner-active ion-content) {
  --background: transparent !important;
  --ion-background-color: transparent !important;
  background: transparent !important;
}

:global(body.barcode-scanner-active #app) {
  background: transparent !important;
}

:global(body.barcode-scanner-active .barcode-scanner-overlay) {
  visibility: visible;
}
</style>
