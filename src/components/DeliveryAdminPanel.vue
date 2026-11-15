<template>
  <div class="delivery-admin">
    <nav class="module-tabs" aria-label="Delivery management sections">
      <button v-for="item in sections" :key="item.id" :class="{ active: section === item.id }" @click="section = item.id">
        {{ item.label }}
      </button>
    </nav>

    <p v-if="error" class="notice error">{{ error }}</p>
    <p v-if="message" class="notice success">{{ message }}</p>
    <div v-if="loading" class="empty">Loading delivery records?</div>

    <template v-else>
      <section v-if="section === 'overview'" class="panel-grid">
        <div class="stat-grid">
          <article v-for="stat in stats" :key="stat.label" class="stat-card">
            <strong>{{ stat.value }}</strong><span>{{ stat.label }}</span>
          </article>
        </div>
        <article class="panel">
          <header><h3>Deliveries, last 7 days</h3><span>Daily outcomes</span></header>
          <div class="chart">
            <div v-for="day in dashboard.daily || []" :key="day.day" class="chart-day">
              <div class="chart-bars">
                <span class="bar delivered" :style="{ height: barHeight(day.delivered) }" :title="`${day.delivered} delivered`"></span>
                <span class="bar failed" :style="{ height: barHeight(day.failed) }" :title="`${day.failed} failed`"></span>
              </div>
              <small>{{ shortDay(day.day) }}</small>
            </div>
          </div>
          <div class="legend"><span class="delivered-dot"></span> Delivered <span class="failed-dot"></span> Failed</div>
        </article>
        <article class="panel">
          <header><h3>Weekly report</h3><span>Last 8 weeks</span></header>
          <div v-for="row in dashboard.weekly || []" :key="row.period" class="report-row">
            <span>{{ shortPeriod(row.period, 'week') }}</span><b>{{ row.delivered }} delivered</b><small>{{ row.failed }} failed</small>
          </div>
        </article>
        <article class="panel">
          <header><h3>Monthly report</h3><span>Last 6 months</span></header>
          <div v-for="row in dashboard.monthly || []" :key="row.period" class="report-row">
            <span>{{ shortPeriod(row.period, 'month') }}</span><b>{{ row.delivered }} delivered</b><small>{{ row.failed }} failed</small>
          </div>
        </article>
        <article class="panel">
          <header><h3>Rider performance</h3><span>Completed outcomes</span></header>
          <div v-for="rider in riders" :key="rider.id" class="performance-row">
            <span>{{ rider.name }}</span><div class="performance-track"><i :style="{ width: `${rider.success_rate || 0}%` }"></i></div>
            <b>{{ rider.success_rate || 0 }}%</b><small>{{ rider.delivered_count }} delivered ? {{ rider.failed_count }} failed</small>
          </div>
        </article>
        <article class="panel">
          <header><h3>Collected delivery fees</h3><span>Successfully delivered shipments</span></header>
          <div class="cash-summary"><p><span>Delivery fees</span><strong>PHP {{ money(dashboard.delivery_fees_collected) }}</strong></p><p><span>Success rate</span><strong>{{ dashboard.success_rate || 0 }}%</strong></p><p><span>Failed rate</span><strong>{{ dashboard.failure_rate || 0 }}%</strong></p></div>
        </article>
        <article class="panel">
          <header><h3>Today?s COD</h3><span>Collection totals</span></header>
          <div class="cash-summary">
            <p><span>Expected</span><strong>PHP {{ money(dashboard.cod?.expected) }}</strong></p>
            <p><span>Collected</span><strong>PHP {{ money(dashboard.cod?.actual) }}</strong></p>
            <p><span>Discrepancy</span><strong>PHP {{ money(dashboard.cod?.discrepancy) }}</strong></p>
          </div>
        </article>
      </section>

      <section v-else-if="section === 'shipments'" class="panel">
        <header class="section-head">
          <div><h3>Shipments</h3><p>Dispatch and follow every online order.</p></div>
          <button class="secondary" @click="loadAll">Refresh</button>
        </header>
        <div class="filters">
          <input v-model="search" placeholder="Search shipment, customer, address" />
          <select v-model="statusFilter">
            <option value="">All statuses</option>
            <option v-for="status in statuses" :key="status" :value="status">{{ label(status) }}</option>
          </select>
        </div>
        <div v-if="filteredShipments.length === 0" class="empty">No shipments match these filters.</div>
        <article v-for="shipment in filteredShipments" :key="shipment.id" class="shipment-card">
          <div class="shipment-head">
            <div><span class="code">{{ shipment.shipment_code }}</span><span class="pill">{{ label(shipment.status) }}</span>
              <h4>Order #{{ shipment.order_id }} ? {{ shipment.customer_name || 'Customer' }}</h4>
              <p>{{ shipment.delivery_address }} ? {{ shipment.delivery_phone }}</p>
              <small v-if="shipment.delivery_instructions">Instructions: {{ shipment.delivery_instructions }}</small>
              <small>{{ shipment.zone_name || 'No zone' }} ? delivery PHP {{ money(shipment.delivery_fee) }} ? order PHP {{ money(shipment.order_total) }}</small>
            </div>
            <div class="rider-info">
              <strong>{{ shipment.rider_name || 'No rider assigned' }}</strong>
              <small v-if="shipment.plate_number">{{ shipment.plate_number }}</small>
              <button v-if="shipment.latitude != null || shipment.delivery_address" class="secondary map-toggle" type="button" @click="mapOpen[shipment.id] = !mapOpen[shipment.id]">
                {{ mapOpen[shipment.id] ? 'Hide in-app map' : 'View in-app map' }}
              </button>
              <small v-if="shipment.location_recorded_at">Updated {{ dateTime(shipment.location_recorded_at) }}</small>
              <small v-if="shipment.estimated_delivery_at">ETA {{ dateTime(shipment.estimated_delivery_at) }}</small>
            </div>
          </div>
          <div v-if="mapOpen[shipment.id]" class="in-app-map">
            <LiveDeliveryMap
              :location="shipment.latitude != null ? { latitude: shipment.latitude, longitude: shipment.longitude } : null"
              :address="shipment.delivery_address || ''"
            />
          </div>
          <div v-if="!['delivered','cancelled','return_to_warehouse'].includes(shipment.status)" class="eta-row">
            <label>Estimated delivery <input v-model="etaDraft[shipment.id]" type="datetime-local" /></label>
            <button class="secondary" :disabled="!etaDraft[shipment.id] || busyId === shipment.id" @click="saveEta(shipment)">Save ETA</button>
          </div>
          <div v-if="canAssign(shipment)" class="assign-row">
            <select v-model="assignment[shipment.id]">
              <option value="">Choose available rider</option>
              <option v-for="rider in assignableRiders(shipment)" :key="rider.id" :value="String(rider.id)">
                {{ rider.name }} ? {{ rider.workload }} queued
              </option>
            </select>
            <button class="primary" :disabled="!assignment[shipment.id] || busyId === shipment.id" @click="assign(shipment)">Assign</button>
            <button class="secondary" :disabled="busyId === shipment.id" @click="autoAssign(shipment)">Auto assign</button>
          </div>
          <details v-if="shipment.history?.length || shipment.attempts?.length">
            <summary>History ({{ shipment.history?.length || 0 }}) ? attempts ({{ shipment.attempts?.length || 0 }})</summary>
            <div v-for="event in shipment.history" :key="event.id" class="history-line">
              <b>{{ label(event.status) }}</b><span>{{ event.note }}</span><small>{{ dateTime(event.created_at) }}</small>
            </div>
            <div v-for="record in shipment.assignment_history" :key="`assignment-${record.id}`" class="history-line">
              <b>{{ record.rider_name }} ? {{ label(record.state) }}</b><span>Assigned by {{ record.assigned_by || 'system' }}</span>
              <small>{{ dateTime(record.assigned_at) }}<template v-if="record.accepted_at"> ? accepted {{ dateTime(record.accepted_at) }}</template></small>
            </div>
            <div v-for="attempt in shipment.attempts" :key="`attempt-${attempt.id}`" class="history-line">
              <b>{{ label(attempt.result) }}</b><span>{{ label(attempt.failure_reason) }} {{ attempt.notes }}</span>
              <small>{{ dateTime(attempt.attempted_at) }}<template v-if="attempt.rescheduled_for"> ? new time {{ dateTime(attempt.rescheduled_for) }}</template></small>
            </div>
          </details>
          <div v-if="shipment.status === 'delivered' && shipment.payment_method === 'cod' && !shipment.cod_remitted_at" class="remit-row">
            <span>COD collected: PHP {{ money(shipment.actual_cod) }} (expected {{ money(shipment.expected_cod) }})</span>
            <input v-model="remittance[shipment.id]" type="number" min="0" step="0.01" placeholder="Amount remitted" />
            <button class="secondary" :disabled="busyId === shipment.id || remittance[shipment.id] === undefined" @click="remit(shipment)">Record remittance</button>
          </div>
          <p v-else-if="shipment.cod_remitted_at" class="remitted">COD remitted {{ dateTime(shipment.cod_remitted_at) }}</p>
        </article>
      </section>

      <section v-else-if="section === 'riders'" class="panel">
        <header><h3>Riders</h3><p>Login accounts reuse the existing users table.</p></header>
        <form class="form-grid" @submit.prevent="createRider">
          <input v-model="riderForm.name" required placeholder="Full name" />
          <input v-model="riderForm.email" required type="email" placeholder="Email / login" />
          <input v-model="riderForm.password" required minlength="8" type="password" placeholder="Temporary password (8+ characters)" />
          <input v-model="riderForm.phone" type="tel" placeholder="Phone" />
          <select v-model="riderForm.vehicle_id"><option value="">No vehicle</option><option v-for="vehicle in activeVehicles" :key="vehicle.id" :value="String(vehicle.id)">{{ vehicle.plate_number }} ? {{ vehicle.description }}</option></select>
          <select v-model="riderForm.zone_ids" multiple aria-label="Zones this rider covers"><option v-for="zone in zones" :key="zone.id" :value="String(zone.id)">{{ zone.name }}</option></select>
          <button class="primary" :disabled="saving">{{ saving ? 'Creating?' : 'Create rider' }}</button>
        </form>
        <p class="form-hint">Choose coverage zones with Ctrl or Command. Riders without zones configured can cover any zone for automatic assignment.</p>
        <div class="rider-list">
          <article v-for="rider in riders" :key="rider.id" class="rider-row">
            <div class="rider-edit">
              <strong>{{ rider.email }}</strong>
              <input v-model="rider.name" aria-label="Rider name" placeholder="Rider name" />
              <input v-model="rider.phone" aria-label="Rider phone" placeholder="Phone" />
              <select v-model="rider.vehicle_id"><option value="">No vehicle</option><option v-for="vehicle in activeVehicles" :key="vehicle.id" :value="String(vehicle.id)">{{ vehicle.plate_number }}</option></select>
              <select v-model="rider.edit_zone_ids" multiple aria-label="Rider coverage zones"><option v-for="zone in zones" :key="zone.id" :value="String(zone.id)">{{ zone.name }}</option></select>
              <small>{{ rider.workload }} open assignment(s) ? {{ rider.delivered_count }} delivered ? {{ rider.success_rate }}% success</small>
            </div>
            <select :value="rider.availability" @change="saveRider(rider, { availability: $event.target.value })"><option value="available">Available</option><option value="unavailable">Unavailable</option></select>
            <button class="secondary" @click="saveRider(rider, {})">Save details</button>
            <button class="secondary" @click="saveRider(rider, { active: !rider.active })">{{ rider.active ? 'Deactivate' : 'Reactivate' }}</button>
          </article>
        </div>
      </section>

      <section v-else-if="section === 'zones'" class="panel">
        <header><h3>Delivery zones and fees</h3><p>Search the nationwide PSGC list, set an editable fee, then activate the barangays your store serves.</p></header>
        <form class="zone-search" @submit.prevent="searchBarangays">
          <input v-model="zoneSearch" required minlength="2" placeholder="Search barangay, city, province, or region" />
          <button class="secondary" :disabled="zoneSearchLoading">{{ zoneSearchLoading ? 'Searching...' : 'Search locations' }}</button>
        </form>
        <p v-if="zoneSearchResults.length" class="form-hint">Showing up to 50 locations. Set a fee to enable delivery; fees remain editable.</p>
        <div v-if="zoneSearchResults.length" class="zone-list location-results">
          <article v-for="location in zoneSearchResults" :key="location.psgc_code" class="zone-row">
            <div>
              <strong>{{ location.barangay }}</strong>
              <span>{{ location.city }}<template v-if="location.province">, {{ location.province }}</template> · {{ location.region }}</span>
              <small>PSGC {{ location.psgc_code }}<template v-if="location.zone_id"> · {{ location.zone_active ? 'Active' : 'Inactive' }}</template></small>
            </div>
            <label>Fee PHP <input v-model.number="location.delivery_fee" required type="number" min="0" step="0.01" placeholder="Set fee" /></label>
            <button class="secondary" :disabled="saving || location.delivery_fee === null || location.delivery_fee === ''" @click="saveLocationZone(location)">
              {{ location.zone_id ? 'Save & activate' : 'Enable zone' }}
            </button>
          </article>
        </div>
        <p v-else-if="zoneSearchDone" class="form-hint">No locations matched that search.</p>
        <form class="form-grid" @submit.prevent="createZone">
          <input v-model="zoneForm.name" required placeholder="Zone name" />
          <input v-model="zoneForm.city" required placeholder="City / municipality" />
          <input v-model="zoneForm.barangay" required placeholder="Barangay" />
          <input v-model="zoneForm.delivery_fee" required type="number" min="0" step="0.01" placeholder="Fee (PHP)" />
          <button class="primary" :disabled="saving">Add zone</button>
        </form>
        <p v-if="zones.length === 0" class="form-hint" role="status">
          No delivery zones are configured. Add each barangay the store serves and its delivery fee; checkout stays unavailable until an active zone exists.
        </p>
        <div class="zone-list">
          <article v-for="zone in zones" :key="zone.id" class="zone-row">
            <div class="zone-edit"><input v-model="zone.name" aria-label="Zone name" /><input v-model="zone.city" aria-label="Zone city" /><input v-model="zone.barangay" aria-label="Zone barangay" /></div>
            <label>Fee <input v-model.number="zone.delivery_fee" type="number" min="0" step="0.01" /></label>
            <label class="check"><input v-model="zone.active" type="checkbox" /> Active</label>
            <button class="secondary" @click="saveZone(zone)">Save</button>
          </article>
        </div>
      </section>

      <section v-else-if="section === 'vehicles'" class="panel">
        <header><h3>Company vehicles</h3><p>Assign company motorcycles or vehicles to riders.</p></header>
        <form class="form-grid" @submit.prevent="createVehicle">
          <input v-model="vehicleForm.plate_number" required placeholder="Plate number" />
          <input v-model="vehicleForm.description" placeholder="Make / model" />
          <button class="primary" :disabled="saving">Add vehicle</button>
        </form>
        <div class="zone-list">
          <article v-for="vehicle in vehicles" :key="vehicle.id" class="zone-row">
            <div class="zone-edit"><input v-model="vehicle.plate_number" aria-label="Vehicle plate number" /><input v-model="vehicle.description" aria-label="Vehicle description" /></div>
            <label class="check"><input v-model="vehicle.active" type="checkbox" /> Active</label>
            <button class="secondary" @click="saveVehicle(vehicle)">Save</button>
          </article>
        </div>
      </section>

      <section v-else class="panel">
        <header><h3>COD reports</h3><p>Daily rider collections and remittances.</p></header>
        <div class="filters"><label>From <input v-model="codFrom" type="date" /></label><label>To <input v-model="codTo" type="date" /></label><button class="secondary" @click="loadCod">Load report</button></div>
        <div class="table-wrap"><table><thead><tr><th>Rider</th><th>Orders</th><th>Expected</th><th>Collected</th><th>Variance</th><th>Remitted</th></tr></thead>
          <tbody><tr v-for="row in codRows" :key="row.rider_user_id"><td>{{ row.rider_name }}</td><td>{{ row.collections }}</td><td>PHP {{ money(row.expected) }}</td><td>PHP {{ money(row.collected) }}</td><td>PHP {{ money(row.discrepancy) }}</td><td>PHP {{ money(row.remitted) }}</td></tr>
            <tr v-if="!codRows.length"><td colspan="6" class="empty">No COD transactions for this period.</td></tr></tbody></table></div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  assignShipment, autoAssignShipment, createDeliveryRider, createDeliveryVehicle,
  createDeliveryZone, getAdminDeliveryDashboard, getAdminDeliveryZones,
  getAdminShipments, getCodSummary, getDeliveryRiders, getDeliveryVehicles,
  remitShipmentCod, savePhilippineDeliveryZone, searchPhilippineBarangays,
  updateDeliveryRider, updateDeliveryVehicle, updateDeliveryZone, updateShipmentEta,
} from '../services/api';
import LiveDeliveryMap from './LiveDeliveryMap.vue';

const props = defineProps({ active: { type: Boolean, default: true } });

const sections = [
  { id: 'overview', label: 'Overview' }, { id: 'shipments', label: 'Shipments' },
  { id: 'riders', label: 'Riders' }, { id: 'zones', label: 'Zones & fees' },
  { id: 'vehicles', label: 'Vehicles' }, { id: 'cod', label: 'COD' },
];
const statuses = ['ready_for_delivery', 'rider_assigned', 'accepted_by_rider', 'picked_up', 'out_for_delivery', 'delivered', 'delivery_failed', 'rescheduled', 'return_to_warehouse', 'cancelled'];
const section = ref('overview');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');
const dashboard = ref({ daily: [] });
const shipments = ref([]);
const riders = ref([]);
const zones = ref([]);
const zoneSearch = ref('');
const zoneSearchResults = ref([]);
const zoneSearchLoading = ref(false);
const zoneSearchDone = ref(false);
const vehicles = ref([]);
const codRows = ref([]);
const assignment = reactive({});
const remittance = reactive({});
const etaDraft = reactive({});
const mapOpen = reactive({});
const busyId = ref(null);
const search = ref('');
const statusFilter = ref('');
const riderForm = ref({ name: '', email: '', password: '', phone: '', vehicle_id: '', zone_ids: [] });
const zoneForm = ref({ name: '', city: '', barangay: '', delivery_fee: '' });
const vehicleForm = ref({ plate_number: '', description: '' });
const nowDate = new Date().toISOString().slice(0, 10);
const codFrom = ref(nowDate);
const codTo = ref(nowDate);
let pollTimer;

const stats = computed(() => [
  ['Shipments', dashboard.value.total], ['Ready', dashboard.value.ready],
  ['Assigned', dashboard.value.assigned], ['Active', dashboard.value.active],
  ['Delivered', dashboard.value.delivered], ['Failed', dashboard.value.failed],
  ['Riders available', dashboard.value.available], ['Riders unavailable', dashboard.value.unavailable],
].map(([label, value]) => ({ label, value: value ?? 0 })));
const activeVehicles = computed(() => vehicles.value.filter((vehicle) => vehicle.active));
const filteredShipments = computed(() => shipments.value.filter((shipment) => {
  if (statusFilter.value && shipment.status !== statusFilter.value) return false;
  const query = search.value.trim().toLowerCase();
  if (!query) return true;
  return [shipment.shipment_code, shipment.customer_name, shipment.delivery_address, shipment.delivery_phone]
    .some((value) => String(value || '').toLowerCase().includes(query));
}));
const availableRiders = computed(() => riders.value.filter((rider) => rider.active && rider.availability === 'available'));

const label = (value = '') => String(value || 'unknown').split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
const money = (value) => Number(value || 0).toFixed(2);
const toLocalDateTimeInput = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const dateTime = (value) => value ? new Date(value).toLocaleString('en-PH') : '';
const shortDay = (value) => new Date(value).toLocaleDateString('en-PH', { weekday: 'short' });
const shortPeriod = (value, kind) => new Date(value).toLocaleDateString('en-PH', kind === 'week'
  ? { month: 'short', day: 'numeric' }
  : { month: 'short', year: '2-digit' });
const barHeight = (value) => `${Math.max(4, Math.min(100, Number(value || 0) * 16))}%`;
const canAssign = (shipment) => ['ready_for_delivery', 'rider_assigned', 'delivery_failed', 'rescheduled', 'return_to_warehouse'].includes(shipment.status);
const assignableRiders = (shipment) => availableRiders.value.filter((rider) =>
  !rider.coverage?.length || !shipment.delivery_zone_id || rider.coverage.some((zone) => zone.id === shipment.delivery_zone_id)
);
const loadAll = async () => {
  loading.value = shipments.value.length === 0;
  error.value = '';
  try {
    const [summary, shipmentList, riderList, zoneList, vehicleList] = await Promise.all([
      getAdminDeliveryDashboard(), getAdminShipments(), getDeliveryRiders(), getAdminDeliveryZones(), getDeliveryVehicles(),
    ]);
    dashboard.value = summary.data;
    shipments.value = shipmentList.data;
    riders.value = riderList.data.map((rider) => ({
      ...rider,
      vehicle_id: rider.vehicle_id ? String(rider.vehicle_id) : '',
      edit_zone_ids: (rider.coverage || []).map((zone) => String(zone.id)),
    }));
    zones.value = zoneList.data;
    vehicles.value = vehicleList.data;
    shipments.value.forEach((shipment) => { assignment[shipment.id] = String(shipment.rider_user_id || ''); });
    shipments.value.forEach((shipment) => {
      if (shipment.estimated_delivery_at && etaDraft[shipment.id] === undefined) {
        etaDraft[shipment.id] = toLocalDateTimeInput(shipment.estimated_delivery_at);
      }
    });
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load delivery management data.';
  } finally {
    loading.value = false;
  }
};

const loadCod = async () => {
  try { codRows.value = (await getCodSummary({ from: codFrom.value, to: codTo.value })).data; }
  catch (err) { error.value = err.response?.data?.message || 'Could not load COD report.'; }
};
const assign = async (shipment) => {
  busyId.value = shipment.id; error.value = ''; message.value = '';
  try { await assignShipment(shipment.id, Number(assignment[shipment.id])); message.value = `Rider assigned to ${shipment.shipment_code}.`; await loadAll(); }
  catch (err) { error.value = err.response?.data?.message || 'Could not assign rider.'; }
  finally { busyId.value = null; }
};
const autoAssign = async (shipment) => {
  busyId.value = shipment.id; error.value = ''; message.value = '';
  try { await autoAssignShipment(shipment.id); message.value = `A rider was automatically assigned to ${shipment.shipment_code}.`; await loadAll(); }
  catch (err) { error.value = err.response?.data?.message || 'No rider could be assigned.'; }
  finally { busyId.value = null; }
};
const saveEta = async (shipment) => {
  busyId.value = shipment.id; error.value = '';
  try {
    await updateShipmentEta(shipment.id, new Date(etaDraft[shipment.id]).toISOString());
    message.value = 'Estimated delivery time updated.';
    await loadAll();
  } catch (err) { error.value = err.response?.data?.message || 'Could not update ETA.'; }
  finally { busyId.value = null; }
};
const createRider = async () => {
  saving.value = true; error.value = ''; message.value = '';
  try {
    await createDeliveryRider({ ...riderForm.value, vehicle_id: riderForm.value.vehicle_id || null, zone_ids: riderForm.value.zone_ids.map(Number) });
    riderForm.value = { name: '', email: '', password: '', phone: '', vehicle_id: '', zone_ids: [] };
    message.value = 'Rider account created.'; await loadAll();
  } catch (err) { error.value = err.response?.data?.message || 'Could not create rider.'; }
  finally { saving.value = false; }
};
const saveRider = async (rider, change) => {
  error.value = ''; message.value = '';
  try {
    const payload = {
      name: rider.name, phone: rider.phone || '', vehicle_id: rider.vehicle_id || null,
      active: change.active ?? rider.active, availability: change.availability ?? rider.availability,
      zone_ids: (rider.edit_zone_ids || (rider.coverage || []).map((zone) => String(zone.id))).map(Number),
    };
    await updateDeliveryRider(rider.id, payload); message.value = 'Rider details updated.'; await loadAll();
  } catch (err) { error.value = err.response?.data?.message || 'Could not update rider.'; }
};
const createZone = async () => {
  saving.value = true; error.value = '';
  try { await createDeliveryZone({ ...zoneForm.value, delivery_fee: Number(zoneForm.value.delivery_fee) }); zoneForm.value = { name: '', city: '', barangay: '', delivery_fee: '' }; message.value = 'Delivery zone added.'; await loadAll(); }
  catch (err) { error.value = err.response?.data?.message || 'Could not create zone.'; }
  finally { saving.value = false; }
};
const searchBarangays = async () => {
  zoneSearchLoading.value = true;
  zoneSearchDone.value = false;
  error.value = '';
  try {
    const response = await searchPhilippineBarangays(zoneSearch.value.trim());
    zoneSearchResults.value = response.data.map((location) => ({
      ...location,
      delivery_fee: location.delivery_fee == null ? '' : Number(location.delivery_fee),
    }));
    zoneSearchDone.value = true;
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not search Philippine locations.';
  } finally {
    zoneSearchLoading.value = false;
  }
};
const saveLocationZone = async (location) => {
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    await savePhilippineDeliveryZone({
      psgc_code: location.psgc_code,
      delivery_fee: Number(location.delivery_fee),
      active: true,
    });
    message.value = `${location.barangay}, ${location.city} is now an active delivery zone.`;
    await Promise.all([loadAll(), searchBarangays()]);
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not save the delivery zone.';
  } finally {
    saving.value = false;
  }
};
const saveZone = async (zone) => {
  try { await updateDeliveryZone(zone.id, { ...zone, delivery_fee: Number(zone.delivery_fee) }); message.value = 'Delivery zone updated.'; await loadAll(); }
  catch (err) { error.value = err.response?.data?.message || 'Could not update zone.'; }
};
const createVehicle = async () => {
  saving.value = true; error.value = '';
  try { await createDeliveryVehicle(vehicleForm.value); vehicleForm.value = { plate_number: '', description: '' }; message.value = 'Vehicle added.'; await loadAll(); }
  catch (err) { error.value = err.response?.data?.message || 'Could not add vehicle.'; }
  finally { saving.value = false; }
};
const saveVehicle = async (vehicle) => {
  try { await updateDeliveryVehicle(vehicle.id, vehicle); message.value = 'Vehicle updated.'; await loadAll(); }
  catch (err) { error.value = err.response?.data?.message || 'Could not update vehicle.'; }
};
const remit = async (shipment) => {
  busyId.value = shipment.id; error.value = '';
  try { await remitShipmentCod(shipment.id, Number(remittance[shipment.id])); message.value = 'COD remittance recorded.'; await Promise.all([loadAll(), loadCod()]); }
  catch (err) { error.value = err.response?.data?.message || 'Could not record remittance.'; }
  finally { busyId.value = null; }
};

watch(() => props.active, async (active) => {
  window.clearInterval(pollTimer);
  if (!active) return;
  await Promise.all([loadAll(), loadCod()]);
  if (props.active) pollTimer = window.setInterval(loadAll, 15000);
}, { immediate: true });
onBeforeUnmount(() => window.clearInterval(pollTimer));
</script>

<style scoped>
.delivery-admin { display: grid; gap: 1rem; }
.module-tabs { display: flex; gap: .45rem; overflow-x: auto; padding: .2rem; }
.module-tabs button, .primary, .secondary { min-height: 44px; border: 0; border-radius: 10px; padding: .72rem .95rem; font: inherit; font-weight: 700; cursor: pointer; white-space: nowrap; }
.module-tabs button { background: #fff; color: #50434a; }
.module-tabs button.active, .primary { background: #ff4d8d; color: white; }
.secondary { background: #171217; color: white; }
.panel { padding: 1.1rem; border: 1px solid rgba(255,255,255,.7); border-radius: 18px; background: rgba(255,255,255,.92); color: #211a1e; }
.panel > header, .section-head { display: flex; justify-content: space-between; align-items: start; gap: 1rem; margin-bottom: 1rem; }
.panel h3 { margin: 0 0 .3rem; }
.panel header p, .panel header span { margin: 0; color: #75666e; font-size: .85rem; }
.stat-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .7rem; }
.stat-card { display: grid; gap: .3rem; padding: 1rem; border-radius: 16px; background: #211a1e; color: white; }
.stat-card strong { font-size: 1.6rem; color: #ff75a7; }.stat-card span { color: #dfd4d9; font-size: .8rem; }
.panel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }.panel-grid .stat-grid { grid-column: 1/-1; }
.chart { display: flex; justify-content: space-around; align-items: end; min-height: 130px; padding: .8rem 0; }
.chart-day { display: grid; justify-items: center; gap: .35rem; height: 120px; }.chart-bars { display: flex; align-items: end; gap: 4px; height: 100px; }
.bar { width: 13px; min-height: 4px; border-radius: 6px 6px 2px 2px; }.bar.delivered,.delivered-dot { background: #29a56c; }.bar.failed,.failed-dot { background: #e76772; }.chart-day small { color: #75666e; }
.legend { display: flex; align-items: center; gap: .4rem; color: #75666e; font-size: .8rem; }.delivered-dot,.failed-dot { width: 9px; height: 9px; border-radius: 50%; }.failed-dot { margin-left: .6rem; }.report-row { display: grid; grid-template-columns: 1fr auto auto; gap: .8rem; padding: .45rem 0; border-bottom: 1px solid #eee5ea; font-size: .82rem; }.report-row small { color: #75666e; }.performance-row { display: grid; grid-template-columns: 90px 1fr 45px; align-items: center; gap: .45rem; padding: .4rem 0; font-size: .82rem; }.performance-row small { grid-column: 2/-1; color: #75666e; }.performance-track { height: 8px; border-radius: 10px; background: #eee5ea; }.performance-track i { display: block; height: 100%; border-radius: inherit; background: #29a56c; }
.cash-summary p { display: flex; justify-content: space-between; border-bottom: 1px solid #eee5ea; padding: .45rem 0; margin: 0; }
.filters,.assign-row,.remit-row { display: flex; gap: .55rem; align-items: center; flex-wrap: wrap; margin: .8rem 0; }.filters > input { flex: 1; min-width: 200px; }.filters label { display: flex; gap: .4rem; align-items: center; }
input,select { min-width: 0; min-height: 44px; padding: .7rem; border: 1px solid #e4d5dc; border-radius: 9px; background: white; color: #211a1e; font: inherit; }.filters select { min-width: 170px; }
.shipment-card,.rider-row,.zone-row { padding: .9rem 0; border-top: 1px solid #eee5ea; }.shipment-head { display: flex; justify-content: space-between; gap: 1rem; }.shipment-head h4 { margin: .55rem 0 .25rem; }.shipment-head p { margin: 0 0 .35rem; color: #5e5058; }.shipment-head small,.rider-info small { color: #75666e; }.code { font-weight: 800; color: #be235f; margin-right: .55rem; }.pill { display: inline-block; border-radius: 20px; padding: .25rem .55rem; background: #fff0f5; color: #a52054; font-size: .75rem; font-weight: 700; }
.rider-info { display: grid; justify-items: end; align-content: start; gap: .25rem; text-align: right; }.rider-info a { color: #b32258; font-size: .8rem; }.assign-row select { flex: 1; }.shipment-card details { margin-top: .7rem; }.shipment-card summary { cursor: pointer; font-size: .85rem; font-weight: 700; }.history-line { display: grid; grid-template-columns: 150px 1fr auto; gap: .6rem; padding: .4rem; border-top: 1px solid #eee5ea; font-size: .82rem; }.history-line small { color: #75666e; }.remit-row input { width: 145px; }.remitted { color: #277e5a; font-size: .85rem; }
.form-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: .6rem; margin: 1rem 0; }.form-grid select[multiple] { min-height: 82px; }.form-hint { color: #75666e; font-size: .78rem; }.rider-row,.zone-row { display: flex; justify-content: space-between; align-items: center; gap: .7rem; }.rider-row > div,.zone-row > div { display: grid; gap: .18rem; flex: 1; }.rider-row span,.rider-row small,.zone-row span { color: #75666e; font-size: .8rem; }.zone-row label { display: flex; gap: .35rem; align-items: center; }.zone-row label input[type=number] { width: 110px; }.check input { accent-color: #ff4d8d; }
.zone-search { display: flex; gap: .6rem; margin: 1rem 0; }.zone-search input { flex: 1; }.location-results { max-height: 36rem; overflow-y: auto; padding: 0 .4rem; }.location-results .zone-row > div { min-width: 12rem; }
.rider-edit { grid-template-columns: repeat(2,minmax(0,1fr)); }.zone-edit { display: flex !important; gap: .4rem; }
.eta-row { display: flex; flex-wrap: wrap; align-items: center; gap: .55rem; margin: .8rem 0; }.eta-row label { display: flex; align-items: center; gap: .4rem; }
.table-wrap { overflow-x: auto; }table { width: 100%; border-collapse: collapse; text-align: left; }th,td { padding: .65rem; border-bottom: 1px solid #eee5ea; white-space: nowrap; }th { color: #75666e; font-size: .8rem; }
.notice { border-radius: 10px; padding: .7rem .9rem; margin: 0; }.notice.error { background: #fff0f0; color: #9e2635; }.notice.success { background: #e9f7ef; color: #237347; }.empty { padding: 1.2rem; text-align: center; color: #75666e; }
@media(max-width:760px) { .stat-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.panel-grid { grid-template-columns: 1fr; }.panel-grid .stat-grid { grid-column: auto; }.shipment-head { display: grid; }.rider-info { justify-items: start; text-align: left; }.form-grid { grid-template-columns: 1fr; }.rider-row,.zone-row { align-items: stretch; flex-direction: column; }.history-line { grid-template-columns: 1fr; gap: .2rem; } }
</style>
