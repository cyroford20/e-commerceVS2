import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { updateShipmentLocation } from './api';

/** @type {import('@capacitor-community/background-geolocation').BackgroundGeolocationPlugin} */
const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const watchers = new Map();
const locationSendInterval = 10000;

const isNative = Capacitor.isNativePlatform();

const notifyStatus = (watcher, message) => {
  watcher.onStatus?.(message);
};

const stopAfterCallback = (shipmentId, watcher) => {
  stopWatcher(shipmentId, watcher).catch((error) => {
    console.error('Could not stop the native location watcher.', error);
    notifyStatus(watcher, 'Could not stop location sharing. Reopen the delivery screen and try again.');
  });
};

const stopWatcher = async (shipmentId, watcher) => {
  watcher.stopped = true;
  if (watchers.get(shipmentId) === watcher) watchers.delete(shipmentId);

  if (watcher.webWatchId !== null) {
    navigator.geolocation.clearWatch(watcher.webWatchId);
    watcher.webWatchId = null;
  }
  if (watcher.nativeWatcherId) {
    const id = watcher.nativeWatcherId;
    watcher.nativeWatcherId = null;
    await BackgroundGeolocation.removeWatcher({ id });
  }
};

const shareLocation = async (shipmentId, watcher, location) => {
  if (watcher.stopped || !location) return;
  const now = Date.now();
  if (now - watcher.lastSentAt < locationSendInterval) return;
  watcher.lastSentAt = now;

  try {
    await updateShipmentLocation(
      shipmentId,
      location.latitude,
      location.longitude,
      location.accuracy
    );
    notifyStatus(watcher, 'Your location is being shared with the customer.');
  } catch (error) {
    const status = error.response?.status;
    if ([401, 403, 409].includes(status)) {
      const message = status === 409
        ? 'Location sharing stopped because this shipment is no longer active.'
        : 'Location sharing stopped because your rider session is no longer authorized.';
      notifyStatus(watcher, message);
      watcher.onStopped?.();
      await stopWatcher(shipmentId, watcher).catch((stopError) => {
        console.error('Could not stop the location watcher after an authorization error.', stopError);
        notifyStatus(watcher, 'Could not stop location sharing. Reopen the delivery screen and try again.');
      });
      return;
    }

    notifyStatus(watcher, 'Location update failed temporarily. Sharing will retry automatically.');
  }
};

const requestBackgroundNotificationPermission = async () => {
  if (Capacitor.getPlatform() !== 'android') return;

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== 'granted') {
    throw new Error('Allow notifications so Android can show the active background location-sharing notice.');
  }
};

export const isRiderLocationSharing = (shipmentId) =>
  watchers.has(String(shipmentId));

export const startRiderLocationSharing = async (shipmentId, { onStatus, onStopped } = {}) => {
  const key = String(shipmentId);
  const existing = watchers.get(key);
  if (existing) return existing.startPromise;

  const watcher = {
    stopped: false,
    lastSentAt: 0,
    nativeWatcherId: null,
    webWatchId: null,
    onStatus,
    onStopped,
    startPromise: null,
  };
  watchers.set(key, watcher);

  watcher.startPromise = (async () => {
    if (isNative) {
      await requestBackgroundNotificationPermission();
      const id = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'Black Elite delivery tracking',
          backgroundMessage: 'Sharing rider location until the active delivery is complete.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 10,
        },
        (location, error) => {
          if (watcher.stopped) return;
          if (error) {
            const message = error.code === 'NOT_AUTHORIZED'
              ? 'Location permission is required. Allow location access in device settings; on iOS, choose Always to share in the background.'
              : 'Background location is unavailable. Check your device location settings.';
            notifyStatus(watcher, message);
            watcher.onStopped?.();
            stopAfterCallback(key, watcher);
            return;
          }
          if (location) void shareLocation(key, watcher, location);
        }
      );
      if (watcher.stopped) {
        await BackgroundGeolocation.removeWatcher({ id });
        return;
      }
      watcher.nativeWatcherId = id;
      notifyStatus(watcher, 'Location sharing is active, including while the app is in the background.');
      return;
    }

    if (!navigator.geolocation) {
      throw new Error('Location is unavailable in this browser.');
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      throw new Error('Web location sharing requires HTTPS.');
    }

    watcher.webWatchId = navigator.geolocation.watchPosition(
      (position) => void shareLocation(key, watcher, position.coords),
      (error) => {
        const message = error.code === 1
          ? 'Location permission was denied. Allow it in device settings, then turn sharing on again.'
          : 'Current location is unavailable. Check device location settings and try again.';
        notifyStatus(watcher, message);
        watcher.onStopped?.();
        stopAfterCallback(key, watcher);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    notifyStatus(watcher, 'Location sharing is active while this app is open.');
  })();

  try {
    await watcher.startPromise;
  } catch (error) {
    if (watchers.get(key) === watcher) watchers.delete(key);
    throw error;
  }
};

export const stopRiderLocationSharing = async (shipmentId) => {
  const key = String(shipmentId);
  const watcher = watchers.get(key);
  if (watcher) await stopWatcher(key, watcher);
};

export const stopAllRiderLocationSharing = async () => {
  await Promise.all(
    Array.from(watchers.entries(), ([shipmentId, watcher]) =>
      stopWatcher(shipmentId, watcher)
    )
  );
};
