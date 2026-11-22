import { CONFIG } from "../config.js";

/**
 * Esquemas de URL aceptados al importar. Se excluyen javascript:, data:, blob:, file:, etc.,
 * que el navegador no permite abrir desde una extension o que suponen un riesgo.
 */
const IMPORTABLE_URL_PATTERN = /^(https?:\/\/|chrome:\/\/|edge:\/\/|about:)/i;
const FAVICON_URL_PATTERN = /^(https?:\/\/|data:image\/)/i;
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const MAX_WORKSPACE_NAME_LENGTH = 48;
const MAX_TAB_TITLE_LENGTH = 500;
const MAX_TABS_PER_WORKSPACE = 500;
const MAX_IMPORTED_WORKSPACES = 200;

function generateWorkspaceId() {
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Firma de contenido para detectar si un workspace importado es identico a uno existente.
 */
function workspaceSignature(ws) {
  const urls = (Array.isArray(ws?.tabs) ? ws.tabs : []).map((tab) => tab?.url || "");
  return JSON.stringify([ws?.name || "", urls]);
}

/**
 * Valida y normaliza una entrada individual de workspace. Lanza si la estructura no es valida.
 */
function sanitizeWorkspace(item) {
  if (!item || typeof item !== "object" || typeof item.name !== "string" || !Array.isArray(item.tabs)) {
    throw new Error("Invalid workspace entry");
  }

  const tabs = item.tabs
    .filter(
      (tabItem) =>
        tabItem &&
        typeof tabItem.url === "string" &&
        IMPORTABLE_URL_PATTERN.test(tabItem.url.trim())
    )
    .slice(0, MAX_TABS_PER_WORKSPACE)
    .map((tabItem) => {
      const url = tabItem.url.trim();
      const title =
        typeof tabItem.title === "string" && tabItem.title.trim() ? tabItem.title : url;
      return {
        title: title.slice(0, MAX_TAB_TITLE_LENGTH),
        url,
        favIconUrl:
          typeof tabItem.favIconUrl === "string" && FAVICON_URL_PATTERN.test(tabItem.favIconUrl)
            ? tabItem.favIconUrl
            : ""
      };
    });

  return {
    id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : "",
    name: item.name.trim().slice(0, MAX_WORKSPACE_NAME_LENGTH) || "Workspace",
    color:
      typeof item.color === "string" && COLOR_PATTERN.test(item.color)
        ? item.color
        : CONFIG.COLORS.PRIMARY,
    createdAt: Number(item.createdAt) || Date.now(),
    tabs
  };
}

/**
 * Fusiona un respaldo JSON (ya parseado) con los workspaces existentes sin destruir datos:
 *  - Un workspace identico (mismo id, nombre y URLs) a uno existente se omite.
 *  - Si el id coincide con uno existente (o repetido dentro del archivo) pero el contenido
 *    difiere, se conserva el existente y el importado recibe un id nuevo.
 * Devuelve { workspaces, added, skipped }. Lanza Error si el formato es invalido.
 */
export function mergeImportedWorkspaces(parsed, existing = []) {
  const list = Array.isArray(parsed) ? parsed : parsed?.workspaces;
  if (!Array.isArray(list)) {
    throw new Error("Invalid format");
  }
  if (list.length > MAX_IMPORTED_WORKSPACES) {
    throw new Error("Too many workspaces");
  }

  const sanitized = list.map(sanitizeWorkspace);
  const result = Array.isArray(existing) ? [...existing] : [];
  const byId = new Map(result.map((ws) => [ws.id, ws]));
  let added = 0;
  let skipped = 0;

  for (const ws of sanitized) {
    const sameId = ws.id ? byId.get(ws.id) : undefined;
    if (sameId && workspaceSignature(sameId) === workspaceSignature(ws)) {
      skipped += 1;
      continue;
    }
    if (!ws.id || sameId) {
      let newId = generateWorkspaceId();
      while (byId.has(newId)) newId = generateWorkspaceId();
      ws.id = newId;
    }
    byId.set(ws.id, ws);
    result.push(ws);
    added += 1;
  }

  return { workspaces: result, added, skipped };
}
