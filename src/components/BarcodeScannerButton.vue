<template>
  <div class="scanner-control">
    <button type="button" class="scanner-button" :disabled="scanning || disabled" @click="startScanner">
      {{ scanning ? 'Scanning...' : label }}
    </button>

    <div
      v-if="scanning && !nativeScanning"
      class="barcode-scanner-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-title"
      aria-describedby="scanner-description"
    >
      <div class="scanner-card">
        <div class="scanner-camera-window">
          <video ref="videoElement" class="scanner-video" autoplay muted playsinline aria-hidden="true"></video>
          <div class="scanner-frame" aria-hidden="true"></div>
          <span v-if="!cameraReady" class="scanner-loading" role="status">Starting camera...</span>
        </div>
        <h2 id="scanner-title">Scan barcode</h2>
        <p id="scanner-description">Camera access is used only to scan a product barcode. Point the rear camera at the barcode.</p>
        <button type="button" class="scanner-cancel" @click="stopScanner">Cancel</button>
      </div>
    </div>

    <Teleport to="body">
      <p v-if="errorMessage" class="scanner-error" role="alert">{{ errorMessage }}</p>
    </Teleport>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import {
  BarcodeDetector as BarcodeDetectorPonyfill,
  prepareZXingModule,
} from 'barcode-detector/ponyfill';
import readerWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

defineProps({
  label: { type: String, default: 'Scan barcode' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['scanned']);
const route = useRoute();
const scanning = ref(false);
const nativeScanning = ref(false);
const cameraReady = ref(false);
const errorMessage = ref('');
const videoElement = ref(null);
let scanHandled = false;
let scannerSession = 0;
let cameraStream;
let detectionTimer;
let decoderReady;

const barcodeFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
const nativeBarcodeFormats = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
  BarcodeFormat.Code128,
];

const prepareDecoder = () => {
  decoderReady ??= prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => path.endsWith('.wasm') ? readerWasmUrl : `${prefix}${path}`,
    },
    fireImmediately: true,
  });
  return decoderReady;
};

const cleanup = () => {
  scannerSession += 1;
  if (detectionTimer) {
    window.clearTimeout(detectionTimer);
    detectionTimer = undefined;
  }
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = undefined;
  if (videoElement.value) {
    videoElement.value.pause();
    videoElement.value.srcObject = null;
  }
  cameraReady.value = false;
  nativeScanning.value = false;
  scanning.value = false;
};

const stopScanner = () => cleanup();

const formatCameraError = (error) => {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) {
    return 'Camera access is blocked. Allow camera permission in your device settings, then try again.';
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) {
    return 'No camera was found on this device.';
  }
  if (['NotReadableError', 'TrackStartError'].includes(error?.name)) {
    return 'The camera is busy in another app. Close it and try scanning again.';
  }
  return error?.message || 'Could not start the camera. Check camera permission and try again.';
};

const finishScan = (value) => {
  if (scanHandled) return;
  scanHandled = true;
  cleanup();
  emit('scanned', value);
};

const scanVideo = async (session, detector, video, detectorState, canvas, context) => {
  if (session !== scannerSession || !scanning.value || scanHandled) return;

  if (!detectorState.inProgress && video.readyState >= 2) {
    detectorState.inProgress = true;
    try {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) throw new Error('The camera has not produced a frame yet.');
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.drawImage(video, 0, 0, width, height);
      const results = await detector.detect(canvas);
      if (session !== scannerSession) return;
      detectorState.consecutiveErrors = 0;
      const value = results.find((item) => item.rawValue?.trim())?.rawValue?.trim();
      if (value) {
        await finishScan(value);
        return;
      }
    } catch (error) {
      if (session === scannerSession) {
        detectorState.consecutiveErrors += 1;
        console.warn('Barcode frame decode failed:', error);
        if (detectorState.consecutiveErrors >= 8) {
          errorMessage.value = `Camera is on, but barcode decoding failed: ${error?.message || 'unsupported camera frame'}`;
          cleanup();
          return;
        }
      }
    } finally {
      detectorState.inProgress = false;
    }
  }

  if (session === scannerSession && scanning.value) {
    detectionTimer = window.setTimeout(() => scanVideo(session, detector, video, detectorState, canvas, context), 200);
  }
};

const startScanner = async () => {
  if (scanning.value) return;
  errorMessage.value = '';
  scanHandled = false;
  cameraReady.value = false;
  scanning.value = true;
  const session = ++scannerSession;

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    nativeScanning.value = true;
    try {
      const { supported } = await BarcodeScanner.isSupported();
      if (!supported) throw new Error('No supported camera was found on this device.');

      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        throw new Error('Google Barcode Scanner is installing. Wait for setup to finish, then scan again.');
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: nativeBarcodeFormats,
        autoZoom: true,
      });
      if (session !== scannerSession) return;

      const value = barcodes.find((barcode) => barcode.rawValue?.trim())?.rawValue?.trim();
      if (value) {
        finishScan(value);
      } else {
        cleanup();
        errorMessage.value = 'Scan canceled or no barcode detected. Try scanning again.';
      }
    } catch (error) {
      const stillActive = session === scannerSession;
      cleanup();
      if (stillActive) errorMessage.value = formatCameraError(error);
    }
    return;
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Live camera access is unavailable. Install and open the mobile app, then try again.');
    }
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      throw new Error('Camera access requires HTTPS or the installed mobile app.');
    }

    await nextTick();
    if (session !== scannerSession) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (session !== scannerSession) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    cameraStream = stream;
    const video = videoElement.value;
    if (!video) throw new Error('The camera preview could not be displayed. Close the scanner and retry.');
    video.srcObject = stream;
    await video.play();
    if (session !== scannerSession) return;

    await prepareDecoder();
    if (session !== scannerSession) return;

    const detector = new BarcodeDetectorPonyfill({ formats: barcodeFormats });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Barcode camera preview is unavailable on this device.');
    cameraReady.value = true;
    scanVideo(session, detector, video, { inProgress: false, consecutiveErrors: 0 }, canvas, context);
  } catch (error) {
    const stillActive = session === scannerSession;
    cleanup();
    if (stillActive) errorMessage.value = formatCameraError(error);
  }
};

onBeforeUnmount(() => {
  cleanup();
});

watch(() => route.fullPath, () => {
  if (scanning.value) stopScanner();
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
  min-height: 44px;
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
  position: fixed;
  z-index: 12000;
  right: max(1rem, env(safe-area-inset-right));
  bottom: calc(1rem + env(safe-area-inset-bottom));
  left: max(1rem, env(safe-area-inset-left));
  width: fit-content;
  max-width: 32rem;
  margin: 0 auto;
  padding: .8rem 1rem;
  border: 1px solid #f3d6e3;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 36px rgba(0, 0, 0, .2);
  color: #a51052;
  font-size: .9rem;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
}

.barcode-scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: rgba(5, 5, 5, 0.4);
  color: #fff;
}

.scanner-card {
  display: grid;
  justify-items: center;
  gap: 0.65rem;
  box-sizing: border-box;
  width: min(90vw, 360px);
  padding: 1.5rem;
  border-radius: 20px;
  background: rgba(23, 16, 23, 0.94);
  text-align: center;
}

.scanner-camera-window {
  position: relative;
  width: min(100%, 400px);
  height: min(54vw, 250px);
  overflow: hidden;
  border-radius: 14px;
  background: #000;
}

.scanner-video {
  display: block;
  width: 100%;
  height: 100%;
  background: #000;
  object-fit: cover;
}

.scanner-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: .85rem;
  text-shadow: 0 1px 4px #000;
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

</style>
