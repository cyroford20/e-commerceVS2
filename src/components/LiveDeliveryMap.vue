<template>
  <div class="live-map-shell">
    <div ref="mapElement" class="live-map" aria-label="Live delivery map"></div>
    <p v-if="mapError" class="map-message">{{ mapError }}</p>
    <p v-else-if="!location" class="map-message">Waiting for the courier's first location.</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps({
  location: { type: Object, default: null },
  address: { type: String, default: '' },
});

const mapElement = ref(null);
const mapError = ref('');
let map;
let courierMarker;
let destinationMarker;
let routeLine;
let geocodeTimer;

const courierPoint = () => {
  if (!props.location) return null;
  return [Number(props.location.latitude), Number(props.location.longitude)];
};

const updateCourier = () => {
  const point = courierPoint();
  if (!map || !point || point.some((value) => !Number.isFinite(value))) return;
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
  if (destinationMarker) {
    routeLine?.setLatLngs([point, destinationMarker.getLatLng()]);
  } else {
    map.setView(point, 15);
  }
};

const geocodeDestination = async () => {
  if (!map || !props.address.trim()) return;
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
        props.address
      )}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!response.ok) throw new Error('Geocoding request failed.');
    const results = await response.json();
    const result = results[0];
    if (!result) {
      mapError.value = 'Delivery address could not be located on the map.';
      return;
    }
    const point = [Number(result.lat), Number(result.lon)];
    destinationMarker?.remove();
    routeLine?.remove();
    destinationMarker = L.circleMarker(point, {
      radius: 8,
      color: '#198754',
      fillColor: '#36b37e',
      fillOpacity: 0.9,
      weight: 3,
    }).addTo(map);
    destinationMarker.bindPopup('Delivery destination');
    const courier = courierPoint();
    routeLine = L.polyline(courier ? [courier, point] : [point], {
      color: '#ff4d8d',
      dashArray: '8 8',
      weight: 4,
    }).addTo(map);
    const bounds = courier ? L.latLngBounds([courier, point]) : L.latLngBounds([point]);
    map.fitBounds(bounds, { padding: [28, 28] });
  } catch (error) {
    mapError.value = 'Map destination lookup is temporarily unavailable.';
  }
};

const scheduleGeocode = () => {
  window.clearTimeout(geocodeTimer);
  geocodeTimer = window.setTimeout(geocodeDestination, 350);
};

onMounted(() => {
  map = L.map(mapElement.value, { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  updateCourier();
  scheduleGeocode();
  window.setTimeout(() => map?.invalidateSize(), 0);
});

watch(() => props.location, updateCourier, { deep: true });
watch(() => props.address, scheduleGeocode);

onBeforeUnmount(() => {
  window.clearTimeout(geocodeTimer);
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
