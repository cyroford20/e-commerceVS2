import axios from 'axios';

// A phone cannot reach the developer computer through localhost. Use the local
// API only during Vite development and the deployed API for production builds.
const configuredApiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
const apiBase =
  configuredApiBase ||
  (import.meta.env.DEV
    ? 'http://localhost:3000/api'
    : 'https://e-commercevs2.onrender.com/api');

const api = axios.create({
  baseURL: apiBase,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to every request (if logged in)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------- AUTH ----------

export const registerUser = (name, email, password) => {
  return api.post('/auth/register', { name, email, password });
};

export const loginUser = (email, password) => {
  return api.post('/auth/login', { email, password });
};

// ---------- PRODUCTS ----------

export const getProducts = () => {
  return api.get('/products');
};

export const getOwnerProducts = () => api.get('/products/admin/catalog');

export const getProductById = (id) => {
  return api.get(`/products/${id}`);
};

export const getProductByBarcode = (barcode) => {
  return api.get('/products/barcode', { params: { code: barcode } });
};

export const checkProductBarcodeConflict = (barcode, excludeProductId = null) => {
  return api.get('/products/barcode/conflict', {
    params: { code: barcode, exclude_id: excludeProductId || undefined },
  });
};

export const validateBuild = (build) => api.post('/products/build/validate', build);

// ---------- ORDERS ----------

export const createOrder = (items, deliveryAddress, deliveryPhone, deliveryZoneId, deliveryInstructions = '', paymentMethod = 'cod') => {
  return api.post('/orders', {
    items,
    delivery_address: deliveryAddress,
    delivery_phone: deliveryPhone,
    delivery_zone_id: deliveryZoneId,
    delivery_instructions: deliveryInstructions,
    payment_method: paymentMethod,
  });
};

export const getDeliveryZones = () => api.get('/delivery/zones');
export const getAdminDeliveryZones = () => api.get('/delivery/zones', { params: { all: true } });
export const searchPhilippineBarangays = (query) => api.get('/delivery/admin/locations', { params: { q: query } });

export const getAdminDeliveryDashboard = () => api.get('/delivery/admin/dashboard');
export const getAdminShipments = (params = {}) => api.get('/delivery/admin/shipments', { params });
export const assignShipment = (shipmentId, riderId) =>
  api.post(`/delivery/admin/shipments/${shipmentId}/assign`, { rider_id: riderId });
export const autoAssignShipment = (shipmentId) =>
  api.post(`/delivery/admin/shipments/${shipmentId}/auto-assign`);
export const updateShipmentEta = (shipmentId, estimatedAt) =>
  api.put(`/delivery/admin/shipments/${shipmentId}/eta`, { estimated_delivery_at: estimatedAt });
export const getDeliveryRiders = () => api.get('/delivery/admin/riders');
export const createDeliveryRider = (rider) => api.post('/delivery/admin/riders', rider);
export const updateDeliveryRider = (id, rider) => api.put(`/delivery/admin/riders/${id}`, rider);
export const getDeliveryVehicles = () => api.get('/delivery/admin/vehicles');
export const createDeliveryVehicle = (vehicle) => api.post('/delivery/admin/vehicles', vehicle);
export const updateDeliveryVehicle = (id, vehicle) => api.put(`/delivery/admin/vehicles/${id}`, vehicle);
export const createDeliveryZone = (zone) => api.post('/delivery/admin/zones', zone);
export const savePhilippineDeliveryZone = (zone) => api.post('/delivery/admin/zones/from-psgc', zone);
export const updateDeliveryZone = (id, zone) => api.put(`/delivery/admin/zones/${id}`, zone);
export const getCodSummary = (params = {}) => api.get('/delivery/admin/cod', { params });
export const remitShipmentCod = (shipmentId, actualAmount, notes = '') =>
  api.post(`/delivery/admin/shipments/${shipmentId}/cod-remittance`, {
    actual_amount: actualAmount,
    notes,
  });
export const getRiderShipments = () => api.get('/delivery/rider/shipments');
export const acceptShipment = (shipmentId) =>
  api.put(`/delivery/rider/shipments/${shipmentId}/accept`);
export const updateRiderShipment = (shipmentId, data) => {
  const body = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) body.append(key, value);
  });
  return api.put(`/delivery/rider/shipments/${shipmentId}/status`, body);
};
export const updateShipmentLocation = (shipmentId, latitude, longitude, accuracy) =>
  api.post(`/delivery/rider/shipments/${shipmentId}/location`, { latitude, longitude, accuracy });
export const getCustomerShipment = (orderId) =>
  api.get(`/delivery/customer/orders/${orderId}/shipment`);
export const getDeliveryNotifications = () => api.get('/delivery/notifications');
export const markDeliveryNotificationRead = (id) => api.put(`/delivery/notifications/${id}/read`);
export const getShipmentProof = async (shipmentId) => {
  const response = await api.get(`/delivery/shipments/${shipmentId}/proof`, { responseType: 'blob' });
  return URL.createObjectURL(response.data);
};

export const createPosOrder = (items, customerId = null) => {
  return api.post('/orders/pos', {
    items,
    customer_id: customerId || null,
  });
};

export const getUserOrders = (userId) => {
  return api.get(`/orders/user/${userId}`);
};

export const getAllOrders = () => {
  return api.get('/orders');
};

export const getDeliveryPersons = () => {
  return api.get('/auth/delivery-persons');
};

export const createDeliveryPerson = (name, email, password) => {
  return api.post('/auth/delivery-persons', { name, email, password });
};

export const updateDelivery = (orderId, status, deliveryPersonId) => {
  return api.put(`/orders/${orderId}/delivery`, {
    status,
    delivery_person_id: deliveryPersonId || null,
  });
};

export const getAssignedDeliveries = () => {
  return api.get('/orders/assigned');
};

export const acceptAssignedDelivery = (orderId) => {
  return api.put(`/orders/${orderId}/accept`);
};

export const updateDeliveryLocation = (orderId, latitude, longitude, accuracy) => {
  return api.put(`/orders/${orderId}/delivery-location`, {
    latitude,
    longitude,
    accuracy,
  });
};

export const getDeliveryLocation = (orderId) => {
  return api.get(`/orders/${orderId}/delivery-location`);
};

export const updateAssignedDelivery = (
  orderId,
  status,
  recipientName = null,
  proofConfirmed = false,
  proofPhoto = null
) => {
  const body = new FormData();
  body.append('status', status);
  body.append('recipient_name', recipientName || '');
  body.append('proof_confirmed', String(proofConfirmed));
  if (proofPhoto) body.append('proof_photo', proofPhoto);
  return api.put(`/orders/${orderId}/delivery-status`, body);
};

export const getProofPhoto = async (eventId) => {
  const response = await api.get(`/orders/proof/${eventId}`, {
    responseType: 'blob',
  });
  return URL.createObjectURL(response.data);
};

export const getMe = () => {
  return api.get('/auth/me');
};

export const updateMe = (name) => {
  return api.put('/auth/me', { name });
};

export const getCustomers = () => {
  return api.get('/auth/customers');
};

export const createProduct = (product) => {
  return api.post('/products', product);
};

export const updateProduct = (id, product) => {
  return api.put(`/products/${id}`, product);
};

export const deleteProduct = (id) => {
  return api.delete(`/products/${id}`);
};

// ---------- AUTH HELPERS ----------

export const saveAuth = (token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
};

export const getUser = () => {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
};

export const getToken = () => {
  return localStorage.getItem('token');
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const isLoggedIn = () => {
  return !!localStorage.getItem('token');
};

export const getRole = () => {
  return getUser()?.role || '';
};

export const isStoreOwner = () => {
  return getRole() === 'store-owner';
};

export const homeForRole = (role) => {
  if (role === 'store-owner') return '/store';
  if (role === 'delivery-person') return '/delivery';
  return '/home';
};

// ---------- CART HELPERS (localStorage) ----------

export const getCart = () => {
  const cart = localStorage.getItem('cart');
  return cart ? JSON.parse(cart) : [];
};

export const saveCart = (cart) => {
  localStorage.setItem('cart', JSON.stringify(cart));
};

export const addToCart = (product, quantity = 1) => {
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id);

  if (existing) {
    existing.quantity += quantity;
    existing.name = product.name;
    existing.price = parseFloat(product.price);
    existing.image_url = product.image_url;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      image_url: product.image_url,
      quantity,
    });
  }

  saveCart(cart);
  return cart;
};

export const updateCartItem = (productId, quantity) => {
  let cart = getCart();

  if (quantity <= 0) {
    cart = cart.filter((item) => item.id !== productId);
  } else {
    const item = cart.find((i) => i.id === productId);
    if (item) item.quantity = quantity;
  }

  saveCart(cart);
  return cart;
};

export const removeFromCart = (productId) => {
  const cart = getCart().filter((item) => item.id !== productId);
  saveCart(cart);
  return cart;
};

export const clearCart = () => {
  localStorage.removeItem('cart');
};

export const getCartTotal = () => {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
};

export const getCartCount = () => {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
};

export default api;
