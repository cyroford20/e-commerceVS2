<template>
  <div class="live-map-shell">
    <div ref="mapElement" class="live-map" aria-label="Live delivery map"></div>
    <p v-if="mapMessage" class="map-message" role="status">{{ mapMessage }}</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps({ location: { type: Object, default: null } });

const mapElement = ref(null);
const mapMessage = ref('Waiting for the courier to share a location.');
let map;
let courierMarker;

const courierPoint = () => {
  if (!props.location) return null;
  return [Number(props.location.latitude), Number(props.location.longitude)];
};

const updateCourier = () => {
  const point = courierPoint();
  if (!map) return;
  if (!point || point.some((value) => !Number.isFinite(value))) {
    mapMessage.value = 'Waiting for the courier to share a location.';
    return;
  }
  mapMessage.value = '';
  if (!courierMarker) {
    courierMarker = L.circleMarker(point, {
      radius: 9,
      color: '#d4146a',
      fillColor: '#ff4d8d',
      fillOpacity: 0.95,
      weight: 3,
    }).addTo(map);
    courierMarker.bindPopup('Courier location');
  } else {
    courierMarker.setLatLng(point);
  }
  map.setView(point, 15);
};

onMounted(() => {
  map = L.map(mapElement.value, { zoomControl: true }).setView([12.8797, 121.774], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  updateCourier();
  window.setTimeout(() => map?.invalidateSize(), 0);
});

watch(() => props.location, updateCourier, { deep: true });

onBeforeUnmount(() => {
  map?.remove();
});
</script>

<style scoped>
.live-map-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid #f3d6e3;
  border-radius: 12px;
  background: #f4f4f4;
}

.live-map {
  width: 100%;
  height: clamp(210px, 52vw, 260px);
}

.map-message {
  position: absolute;
  right: 0.65rem;
  bottom: 0.65rem;
  left: 0.65rem;
  margin: 0;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: #666;
  font-size: 0.75rem;
}

@media (max-width: 480px) {
  .live-map-shell {
    margin-top: 0.85rem;
    border-radius: 10px;
  }

  .live-map {
    height: 220px;
  }
}
</style>
