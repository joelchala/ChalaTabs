import { CONFIG } from "./config.js";

const INTERNAL_URL_PREFIXES = CONFIG.PROTECTED_URL_PREFIXES;

/**
 * Indica si una URL pertenece a un esquema interno o protegido del navegador.
 */
export function isProtectedTabUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return false;
  }
  const normalized = rawUrl.trim().toLowerCase();
  return INTERNAL_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Determina si una pestana es elegible para ser suspendida con chrome.tabs.discard.
 * Excluye pestanas activas, fijadas (pinned), reproduciendo audio (audible),
 * ya suspendidas (discarded) y paginas internas del navegador.
 */
export function isSuspendableTab(tab) {
  if (!tab || typeof tab.id !== "number") {
    return false;
  }
  if (tab.active || tab.pinned || tab.audible || tab.discarded) {
    return false;
  }
  const url = tab.url || tab.pendingUrl || "";
  if (!url) {
    return false;
  }
  return !isProtectedTabUrl(url);
}

/**
 * Cola de exclusion mutua para serializar todas las operaciones de lectura-modificacion-escritura
 * sobre el registro de actividad. Evita que eventos concurrentes (onActivated, onUpdated,
 * onRemoved, alarma) se pisen entre si y pierdan actualizaciones.
 */
let activityQueue = Promise.resolve();

export function withActivityLock(task) {
  const run = activityQueue.then(task, task);
  activityQueue = run.catch(() => {});
  return run;
}

/**
 * Lee configuracion y registro de actividad desde chrome.storage.local.
 */
async function getStorageState() {
  const keys = [
    CONFIG.STORAGE_KEYS.SETTINGS,
    CONFIG.STORAGE_KEYS.TAB_ACTIVITY
  ];
  const data = await chrome.storage.local.get(keys);
  const settings = {
    ...CONFIG.DEFAULT_SETTINGS,
    ...(data[CONFIG.STORAGE_KEYS.SETTINGS] || {})
  };
  const tabActivity = {
    ...(data[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] || {})
  };
  return { settings, tabActivity };
}

/**
 * Actualiza el timestamp de ultima actividad para una pestana especifica.
 */
export function touchTabActivity(tabId, timestamp = Date.now()) {
  if (typeof tabId !== "number") {
    return Promise.resolve();
  }
  return withActivityLock(async () => {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.TAB_ACTIVITY);
    const tabActivity = { ...(data[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] || {}) };
    tabActivity[String(tabId)] = timestamp;
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.TAB_ACTIVITY]: tabActivity
    });
  });
}

/**
 * Elimina el registro de actividad de una pestana cerrada.
 */
export function removeTabActivity(tabId) {
  return withActivityLock(async () => {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.TAB_ACTIVITY);
    const tabActivity = { ...(data[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] || {}) };
    if (Object.prototype.hasOwnProperty.call(tabActivity, String(tabId))) {
      delete tabActivity[String(tabId)];
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.TAB_ACTIVITY]: tabActivity
      });
    }
  });
}

/**
 * Traslada el registro de actividad cuando Chrome reemplaza una pestana por otra (prerender, etc.).
 */
function replaceTabActivity(addedTabId, removedTabId) {
  return withActivityLock(async () => {
    const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.TAB_ACTIVITY);
    const tabActivity = { ...(data[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] || {}) };
    const previous = tabActivity[String(removedTabId)];
    delete tabActivity[String(removedTabId)];
    tabActivity[String(addedTabId)] = Number(previous) || Date.now();
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.TAB_ACTIVITY]: tabActivity
    });
  });
}

/**
 * Inicializa valores por defecto en almacenamiento local y sincroniza pestanas abiertas.
 * Con resetActivity=true (arranque del navegador) descarta los timestamps previos: los IDs de
 * pestana no son persistentes entre sesiones y podrian coincidir con pestanas antiguas.
 */
export async function initializeExtensionState({ resetActivity = false } = {}) {
  const settings = await withActivityLock(async () => {
    const data = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.SETTINGS,
      CONFIG.STORAGE_KEYS.WORKSPACES,
      CONFIG.STORAGE_KEYS.TAB_ACTIVITY
    ]);

    const updates = {};
    const mergedSettings = {
      ...CONFIG.DEFAULT_SETTINGS,
      ...(data[CONFIG.STORAGE_KEYS.SETTINGS] || {})
    };

    if (!data[CONFIG.STORAGE_KEYS.SETTINGS]) {
      updates[CONFIG.STORAGE_KEYS.SETTINGS] = mergedSettings;
    }
    if (!Array.isArray(data[CONFIG.STORAGE_KEYS.WORKSPACES])) {
      updates[CONFIG.STORAGE_KEYS.WORKSPACES] = [];
    }

    const tabs = await chrome.tabs.query({});
    const existingActivity = resetActivity ? {} : data[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] || {};
    const now = Date.now();
    const nextActivity = {};

    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      const key = String(tab.id);
      nextActivity[key] = tab.active || tab.audible ? now : Number(existingActivity[key]) || now;
    }
    updates[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] = nextActivity;

    await chrome.storage.local.set(updates);
    return mergedSettings;
  });

  await configureAutoSuspendAlarm(settings.autoSuspendMinutes);
  await updateBadge();
}

/**
 * Actualiza el contador del icono de la extension con pestanas activas y color de estado.
 */
export async function updateBadge() {
  if (!chrome.action?.setBadgeText) {
    return { activeCount: 0, suspendedCount: 0 };
  }
  const tabs = await chrome.tabs.query({});
  let activeCount = 0;
  let suspendedCount = 0;

  for (const tab of tabs) {
    if (tab.discarded) {
      suspendedCount += 1;
    } else {
      activeCount += 1;
    }
  }

  const text = activeCount > 0 ? String(activeCount) : "";
  const color = suspendedCount > 0 ? CONFIG.COLORS.PRIMARY : CONFIG.COLORS.ACCENT;

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (typeof chrome.action.setBadgeTextColor === "function") {
    await chrome.action.setBadgeTextColor({ color: CONFIG.COLORS.BG_DARK });
  }

  return { activeCount, suspendedCount };
}

/**
 * Configura o detiene la alarma periodica de auto-suspension.
 */
export async function configureAutoSuspendAlarm(minutes) {
  await chrome.alarms.clear(CONFIG.AUTOSUSPEND_ALARM_NAME);
  const parsed = Number(minutes);
  if (Number.isFinite(parsed) && parsed > 0) {
    chrome.alarms.create(CONFIG.AUTOSUSPEND_ALARM_NAME, {
      periodInMinutes: CONFIG.AUTOSUSPEND_CHECK_INTERVAL_MINUTES
    });
  }
}

/**
 * Suspende de inmediato todas las pestanas inactivas elegibles (opcionalmente por ventana).
 */
export async function suspendInactiveTabs(windowId = null) {
  const queryInfo = windowId !== null && windowId !== undefined ? { windowId } : {};
  const tabs = await chrome.tabs.query(queryInfo);
  let suspendedCount = 0;

  for (const tab of tabs) {
    if (!isSuspendableTab(tab)) {
      continue;
    }
    try {
      await chrome.tabs.discard(tab.id);
      suspendedCount += 1;
    } catch {
      // Ignora pestanas que el navegador no permita descartar en ese instante
    }
  }

  await updateBadge();
  return {
    suspendedCount,
    totalChecked: tabs.length
  };
}

/**
 * Suspende una pestana especifica si cumple las reglas de seguridad.
 */
export async function suspendSingleTab(tabId) {
  if (typeof tabId !== "number") {
    return { suspended: false };
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isSuspendableTab(tab)) {
      return { suspended: false };
    }
    await chrome.tabs.discard(tabId);
    await updateBadge();
    return { suspended: true };
  } catch {
    return { suspended: false };
  }
}

/**
 * Evalua la inactividad de cada pestana abierta y suspende las que superen el umbral configurado.
 */
export function checkAutoSuspend(now = Date.now()) {
  // Se ejecuta dentro del lock: cualquier touchTabActivity que llegue durante los discard
  // queda en cola y se aplica despues, sin ser sobrescrito por este snapshot.
  return withActivityLock(() => runAutoSuspendCheck(now));
}

async function runAutoSuspendCheck(now) {
  const { settings, tabActivity } = await getStorageState();
  const minutes = Number(settings.autoSuspendMinutes);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { suspendedCount: 0, totalChecked: 0, disabled: true };
  }

  const tabs = await chrome.tabs.query({});
  const thresholdMs = minutes * 60 * 1000;
  const nextActivity = {};
  let suspendedCount = 0;

  for (const tab of tabs) {
    if (typeof tab.id !== "number") continue;
    const key = String(tab.id);
    const lastActive = Number(tabActivity[key]) || now;

    if (tab.active || tab.audible) {
      nextActivity[key] = now;
      continue;
    }

    nextActivity[key] = lastActive;
    const inactiveMs = now - lastActive;

    if (isSuspendableTab(tab) && inactiveMs >= thresholdMs) {
      try {
        await chrome.tabs.discard(tab.id);
        suspendedCount += 1;
      } catch {
        // Ignora pestanas protegidas por el navegador
      }
    }
  }

  await chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.TAB_ACTIVITY]: nextActivity
  });

  if (suspendedCount > 0) {
    await updateBadge();
  }

  return {
    suspendedCount,
    totalChecked: tabs.length,
    disabled: false
  };
}

/**
 * Calcula un resumen de estado para el popup o panel lateral.
 */
async function getStatusSummary() {
  const tabs = await chrome.tabs.query({});
  let activeCount = 0;
  let suspendedCount = 0;

  for (const tab of tabs) {
    if (tab.discarded) {
      suspendedCount += 1;
    } else {
      activeCount += 1;
    }
  }

  const estimatedRamSavedMb = suspendedCount * CONFIG.ESTIMATED_MB_PER_DISCARDED_TAB;
  const { settings } = await getStorageState();

  return {
    activeCount,
    suspendedCount,
    estimatedRamSavedMb,
    autoSuspendMinutes: Number(settings.autoSuspendMinutes) || 0
  };
}

/**
 * Registra todos los listeners de ciclo de vida, pestanas, alarmas y mensajeria MV3.
 */
export function registerListeners() {
  chrome.runtime.onInstalled.addListener(() => {
    initializeExtensionState().catch(() => {});
  });

  chrome.runtime.onStartup.addListener(() => {
    initializeExtensionState({ resetActivity: true }).catch(() => {});
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    touchTabActivity(tabId).catch(() => {});
    updateBadge().catch(() => {});
  });

  chrome.tabs.onCreated.addListener((tab) => {
    if (typeof tab?.id === "number") {
      touchTabActivity(tab.id).catch(() => {});
    }
    updateBadge().catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.audible === true || (tab?.active && changeInfo.status === "complete")) {
      touchTabActivity(tabId).catch(() => {});
    }
    if ("discarded" in changeInfo || changeInfo.status === "complete") {
      updateBadge().catch(() => {});
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    removeTabActivity(tabId).catch(() => {});
    updateBadge().catch(() => {});
  });

  if (chrome.tabs.onReplaced) {
    chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      replaceTabActivity(addedTabId, removedTabId).catch(() => {});
    });
  }

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === CONFIG.AUTOSUSPEND_ALARM_NAME) {
      checkAutoSuspend().catch(() => {});
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((err) => {
        sendResponse({ ok: false, error: String(err?.message || err || "UNKNOWN_ERROR") });
      });
    return true;
  });
}

/**
 * Procesa los mensajes del popup / panel lateral. Cualquier excepcion se propaga al caller,
 * que siempre responde con { ok: false, error } para no dejar el puerto abierto sin respuesta.
 */
export async function handleMessage(message) {
  switch (message?.type) {
    case "SUSPEND_INACTIVE_TABS": {
      const result = await suspendInactiveTabs(message.windowId ?? null);
      return { ok: true, ...result };
    }
    case "SUSPEND_SINGLE_TAB": {
      const result = await suspendSingleTab(message.tabId);
      return { ok: true, ...result };
    }
    case "SET_AUTOSUSPEND_MINUTES": {
      const parsed = Number(message.minutes);
      const minutes = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
      const { settings } = await getStorageState();
      const nextSettings = { ...settings, autoSuspendMinutes: minutes };
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.SETTINGS]: nextSettings
      });
      await configureAutoSuspendAlarm(minutes);
      return { ok: true, autoSuspendMinutes: minutes };
    }
    case "GET_STATUS_SUMMARY": {
      const summary = await getStatusSummary();
      return { ok: true, ...summary };
    }
    default:
      return { ok: false, error: "UNKNOWN_ACTION" };
  }
}

if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  chrome.tabs &&
  chrome.alarms &&
  chrome.storage
) {
  registerListeners();
}
