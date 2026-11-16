import { Capacitor } from '@capacitor/core';
import { PushNotifications, type PermissionStatus, type PushNotificationSchema } from '@capacitor/push-notifications';
import { toast } from 'sonner';
import { getInstalledVersion } from './live-update';

const DEVICE_ID_KEY = 'leadsflow_push_device_id';
const FCM_TOKEN_KEY = 'leadsflow_fcm_token';
const PENDING_ROUTE_KEY = 'leadsflow_pending_push_route';

let initialized = false;
let activeUserId: string | null = null;
let registrationPromise: Promise<void> | null = null;
type PermissionState = PermissionStatus['receive'];
let permissionState: PermissionState = 'prompt';

// Importação dinâmica evita um ciclo de módulos: utils/api usa native.ts para OAuth,
// enquanto native.ts inicializa este serviço.
async function authenticatedRequest(endpoint: string, method: string, body?: unknown) {
  const { apiRequest } = await import('./app/utils/api');
  return apiRequest(endpoint, method, body);
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function getDeviceId(): string {
  let value = localStorage.getItem(DEVICE_ID_KEY);
  if (!value) {
    value = randomId();
    localStorage.setItem(DEVICE_ID_KEY, value);
  }
  return value;
}

function safeDashboardRoute(value: unknown): string {
  if (typeof value !== 'string') return '/dashboard/notifications';
  const route = value.trim();
  if (route === '/' || route === '/dashboard' || route.startsWith('/dashboard/')) return route;
  return '/dashboard/notifications';
}

function setPermissionState(value: PermissionState) {
  permissionState = value;
  window.dispatchEvent(new CustomEvent('leadflow:push-permission', { detail: value }));
}

async function markNotificationRead(notificationId: unknown) {
  if (typeof notificationId !== 'string' || !notificationId) return;
  try {
    await authenticatedRequest(`/notifications/${encodeURIComponent(notificationId)}/read`, 'PUT');
    window.dispatchEvent(new Event('leadflow:notifications-changed'));
  } catch {
    // A navegação não deve ficar bloqueada se o aparelho estiver sem rede.
  }
}

function openPushRoute(data: Record<string, unknown> = {}) {
  const route = safeDashboardRoute(data.action_url ?? data.actionUrl);
  localStorage.setItem(PENDING_ROUTE_KEY, route);
  void markNotificationRead(data.notification_id ?? data.notificationId);
  if (localStorage.getItem('leadflow_access_token')) consumePendingPushNavigation();
}

function showForegroundNotification(notification: PushNotificationSchema) {
  const data = (notification.data || {}) as Record<string, unknown>;
  // Mensagem de cliente com a inbox aberta: já aparece na lista, sem aviso por cima
  if (data.category === 'messages' && window.location.pathname.startsWith('/dashboard/inbox')) return;
  const title = notification.title || 'Nova notificação';
  toast(title, {
    description: notification.body,
    duration: 6000,
    action: {
      label: 'Abrir',
      onClick: () => openPushRoute(data),
    },
  });
  window.dispatchEvent(new Event('leadflow:notifications-changed'));
}

async function createAndroidChannels() {
  if (Capacitor.getPlatform() !== 'android') return;
  await Promise.all([
    PushNotifications.createChannel({
      id: 'leadsflow_messages',
      name: 'Mensagens',
      description: 'Novas mensagens e respostas de clientes',
      importance: 5,
      visibility: 0,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#2563EB',
    }),
    PushNotifications.createChannel({
      id: 'leadsflow_reminders',
      name: 'Lembretes',
      description: 'Tarefas e lembretes importantes',
      importance: 5,
      visibility: 0,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#2563EB',
    }),
    PushNotifications.createChannel({
      id: 'leadsflow_general',
      name: 'Atualizações',
      description: 'Leads, campanhas e avisos do sistema',
      importance: 3,
      visibility: 0,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#2563EB',
    }),
  ]);
}

async function registerTokenWithBackend(token: string) {
  if (!activeUserId || !localStorage.getItem('leadflow_access_token')) return;
  localStorage.setItem(FCM_TOKEN_KEY, token);
  const appVersion = await getInstalledVersion().catch(() => null);
  await authenticatedRequest('/notifications/devices/register', 'POST', {
    token,
    platform: Capacitor.getPlatform(),
    deviceId: getDeviceId(),
    deviceName: `Android · ${navigator.userAgent.slice(0, 180)}`,
    appVersion: appVersion || undefined,
    locale: navigator.language,
  });
}

// APK anterior ao 1.4 (sem o plugin nativo) com este código por atualização ao vivo: não há push
const pushAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');

export async function initPushNotifications(): Promise<void> {
  if (!pushAvailable() || initialized) return;
  initialized = true;

  await createAndroidChannels().catch((error) =>
    console.warn('[Push] Não foi possível criar os canais Android:', error));

  await PushNotifications.addListener('registration', ({ value }) => {
    void registerTokenWithBackend(value).catch((error) =>
      console.warn('[Push] Não foi possível registar o dispositivo:', error));
  });
  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('[Push] Registo FCM recusado:', error.error);
  });
  await PushNotifications.addListener('pushNotificationReceived', showForegroundNotification);
  await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    openPushRoute((notification.data || {}) as Record<string, unknown>);
  });

  const status = await PushNotifications.checkPermissions();
  setPermissionState(status.receive);
}

export function syncPushRegistration(userId: string): Promise<void> {
  if (!pushAvailable()) return Promise.resolve();
  activeUserId = userId;
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    await initPushNotifications();
    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    setPermissionState(status.receive);
    if (status.receive !== 'granted') return;
    await PushNotifications.register();
  })().finally(() => {
    registrationPromise = null;
  });
  return registrationPromise;
}

export async function unregisterCurrentPushDevice(): Promise<void> {
  if (!pushAvailable()) return;
  const deviceId = getDeviceId();
  const token = localStorage.getItem(FCM_TOKEN_KEY);
  try {
    await authenticatedRequest('/notifications/devices/unregister', 'POST', { deviceId, token });
  } finally {
    activeUserId = null;
  }
}

export function consumePendingPushNavigation(): void {
  const route = localStorage.getItem(PENDING_ROUTE_KEY);
  if (!route || !localStorage.getItem('leadflow_access_token')) return;
  localStorage.removeItem(PENDING_ROUTE_KEY);
  const target = safeDashboardRoute(route);
  if (window.location.pathname !== target) {
    window.history.pushState({ dashboardPage: true, source: 'push' }, '', target);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function getPushPermissionState(): Promise<PermissionState | 'web'> {
  if (!pushAvailable()) return 'web';
  const status = await PushNotifications.checkPermissions();
  setPermissionState(status.receive);
  return status.receive;
}

export function currentPushPermissionState(): PermissionState {
  return permissionState;
}
