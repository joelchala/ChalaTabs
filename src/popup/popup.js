import { CONFIG } from "../config.js";
import { mergeImportedWorkspaces } from "./workspace-import.js";

/**
 * Modo de vista segun el parametro ?view= de la URL:
 *  - "popup" (por defecto): popup de la accion, se cierra tras navegar.
 *  - "sidepanel": panel lateral (definido en manifest.side_panel.default_path).
 *  - "tab": pagina completa en una pestana (usada para importar respaldos de forma fiable).
 * Popup y panel lateral comparten el mismo HTML, por eso se distinguen por query string y no por
 * documentUrl/getContexts, que daba falsos positivos cuando habia un panel lateral abierto.
 */
const URL_PARAMS = new URLSearchParams(window.location.search);
const VIEW_MODE = ["sidepanel", "tab"].includes(URL_PARAMS.get("view"))
  ? URL_PARAMS.get("view")
  : "popup";

const state = {
  openTabs: [],
  workspaces: [],
  autoSuspendMinutes: CONFIG.DEFAULT_SETTINGS.autoSuspendMinutes,
  activeView: "open",
  searchQuery: "",
  selectedSearchIndex: -1,
  selectedColor: CONFIG.WORKSPACE_COLORS[0],
  collapsedWorkspaces: new Set(),
  toastTimer: null,
  currentWindowId: null
};

const dom = {};

/**
 * Indica si la interfaz es persistente (panel lateral o pestana) y no debe cerrarse tras una accion.
 */
function isPersistentView() {
  return VIEW_MODE !== "popup";
}

/**
 * Cierra la ventana solo cuando se ejecuta como popup de la accion.
 */
function closeIfPopup() {
  if (!isPersistentView()) {
    window.close();
  }
}

/**
 * Envia un mensaje al service worker y devuelve la respuesta, o null si fallo.
 * Muestra un toast de error en lugar de dejar una promesa rechazada sin capturar.
 */
async function sendRuntimeMessage(message) {
  try {
    const res = await chrome.runtime.sendMessage(message);
    if (!res || res.ok === false) {
      showToast(t("toastActionError"), true);
      return null;
    }
    return res;
  } catch {
    showToast(t("toastActionError"), true);
    return null;
  }
}

/**
 * Traduce una clave desde chrome.i18n con respaldo seguro.
 */
function t(key, substitutions) {
  if (typeof chrome !== "undefined" && chrome.i18n?.getMessage) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    if (msg) return msg;
  }
  return key;
}

/**
 * Aplica traducciones a todos los elementos marcados con data-i18n*.
 */
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const val = t(el.dataset.i18n);
    if (val && val !== el.dataset.i18n) {
      el.textContent = val;
    }
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const val = t(el.dataset.i18nPlaceholder);
    if (val && val !== el.dataset.i18nPlaceholder) {
      el.placeholder = val;
    }
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const val = t(el.dataset.i18nTitle);
    if (val && val !== el.dataset.i18nTitle) {
      el.title = val;
    }
  });
}

/**
 * Muestra una notificacion temporal en la parte inferior de la interfaz.
 */
function showToast(message, isError = false) {
  if (!dom.toastBanner) return;
  clearTimeout(state.toastTimer);
  dom.toastBanner.textContent = message;
  dom.toastBanner.classList.toggle("toast-error", isError);
  dom.toastBanner.classList.remove("hidden");
  state.toastTimer = setTimeout(() => {
    dom.toastBanner.classList.add("hidden");
  }, 2800);
}

/**
 * Verifica si una URL utiliza un esquema interno o protegido del navegador.
 */
function isProtectedUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return false;
  }
  const normalized = rawUrl.trim().toLowerCase();
  return CONFIG.PROTECTED_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Verifica si una pestana apunta a un esquema interno o protegido del navegador.
 */
function isProtectedTab(tab) {
  const url = tab?.url || tab?.pendingUrl || "";
  return isProtectedUrl(url);
}

/**
 * Extrae el dominio legible de una URL sin lanzar excepciones.
 */
function formatDomain(rawUrl) {
  if (!rawUrl) return "";
  if (isProtectedUrl(rawUrl)) {
    return rawUrl;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, "") || rawUrl;
  } catch {
    return rawUrl;
  }
}

/**
 * Formatea MB o GB estimados de memoria ahorrada.
 */
function formatRamMb(mb) {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

/**
 * Verifica si una URL puede suspenderse (replica la logica visual de background).
 */
function canTabBeSuspended(tab) {
  if (!tab || tab.active || tab.pinned || tab.audible || tab.discarded) {
    return false;
  }
  const url = tab.url || tab.pendingUrl || "";
  return Boolean(url) && !isProtectedTab(tab);
}

/**
 * Crea un elemento SVG de globo seguro como respaldo cuando no hay favicon.
 */
function createFallbackFavicon() {
  const wrap = document.createElement("span");
  wrap.className = "tab-favicon-fallback";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "9");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18");
  svg.append(circle, path);
  wrap.appendChild(svg);
  return wrap;
}

/**
 * Crea el icono (favicon o respaldo SVG) de una pestana de forma segura.
 */
function createTabIconElement(favIconUrl) {
  if (
    favIconUrl &&
    (favIconUrl.startsWith("http://") ||
      favIconUrl.startsWith("https://") ||
      favIconUrl.startsWith("data:image/"))
  ) {
    const img = document.createElement("img");
    img.className = "tab-favicon";
    img.src = favIconUrl;
    img.alt = "";
    img.addEventListener("error", () => {
      img.replaceWith(createFallbackFavicon());
    });
    return img;
  }
  return createFallbackFavicon();
}

/**
 * Adapta el layout segun el modo de vista y cachea el ID de la ventana actual.
 * El windowId se cachea aqui para poder llamar a chrome.sidePanel.open() de forma sincrona
 * dentro del click (un await previo invalida el user gesture que exige Chrome).
 */
async function detectViewContext() {
  if (isPersistentView()) {
    document.body.classList.add("is-sidepanel");
  }
  if (VIEW_MODE === "sidepanel") {
    dom.btnSidePanel?.classList.add("hidden");
  }
  try {
    const currentWin = await chrome.windows.getCurrent();
    state.currentWindowId = currentWin?.id ?? null;
  } catch {
    state.currentWindowId = null;
  }
}

/**
 * Carga pestanas abiertas, workspaces guardados y configuracion desde Chrome/storage.
 */
async function loadState() {
  const [tabs, storageData] = await Promise.all([
    chrome.tabs.query({}),
    chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.WORKSPACES,
      CONFIG.STORAGE_KEYS.SETTINGS
    ])
  ]);

  state.openTabs = tabs || [];
  state.workspaces = Array.isArray(storageData[CONFIG.STORAGE_KEYS.WORKSPACES])
    ? storageData[CONFIG.STORAGE_KEYS.WORKSPACES]
    : [];

  const settings = {
    ...CONFIG.DEFAULT_SETTINGS,
    ...(storageData[CONFIG.STORAGE_KEYS.SETTINGS] || {})
  };
  state.autoSuspendMinutes = Number(settings.autoSuspendMinutes) || 0;

  if (dom.selectAutoSuspend) {
    dom.selectAutoSuspend.value = String(state.autoSuspendMinutes);
  }
}

/**
 * Lee la lista de workspaces directamente desde storage (fuente de verdad compartida).
 */
async function readStoredWorkspaces() {
  const data = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.WORKSPACES);
  const list = data[CONFIG.STORAGE_KEYS.WORKSPACES];
  return Array.isArray(list) ? list : [];
}

let workspaceMutationQueue = Promise.resolve();

/**
 * Aplica una mutacion sobre la copia MAS RECIENTE de los workspaces en storage y la guarda.
 * Evita que popup y panel(es) lateral(es) abiertos a la vez se sobrescriban con estados viejos.
 * Si el guardado falla, state.workspaces no se modifica. Devuelve { ok, result }.
 */
function mutateWorkspaces(mutator) {
  const run = workspaceMutationQueue.then(async () => {
    try {
      const fresh = await readStoredWorkspaces();
      const result = await mutator(fresh);
      if (result === false) {
        state.workspaces = fresh;
        return { ok: false, result };
      }
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.WORKSPACES]: fresh
      });
      state.workspaces = fresh;
      return { ok: true, result };
    } catch {
      showToast(t("toastSaveError"), true);
      return { ok: false, result: undefined };
    }
  });
  workspaceMutationQueue = run.catch(() => {});
  return run;
}

/**
 * Actualiza los contadores superiores y el indicador estimado de RAM ahorrada.
 */
function renderMetrics() {
  let activeCount = 0;
  let suspendedCount = 0;

  for (const tab of state.openTabs) {
    if (tab.discarded) {
      suspendedCount += 1;
    } else {
      activeCount += 1;
    }
  }

  const ramSavedMb = suspendedCount * CONFIG.ESTIMATED_MB_PER_DISCARDED_TAB;

  dom.metricActiveCount.textContent = String(activeCount);
  dom.metricSuspendedCount.textContent = String(suspendedCount);
  dom.metricRamSaved.textContent = formatRamMb(ramSavedMb);
  dom.badgeOpenCount.textContent = String(state.openTabs.length);
  dom.badgeWorkspaceCount.textContent = String(state.workspaces.length);
}

/**
 * Enfoca una pestana abierta y su ventana contenedora.
 */
async function jumpToOpenTab(tab) {
  try {
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    closeIfPopup();
  } catch {
    // Evita excepciones si el navegador restringe el cambio de foco en esa pestana o ventana
  }
}

/**
 * Abre una pestana guardada en un workspace o la enfoca si ya existe abierta.
 */
async function jumpToSavedTab(savedTab) {
  if (!savedTab?.url) return;
  const existing = state.openTabs.find((tItem) => tItem.url === savedTab.url);
  if (existing) {
    await jumpToOpenTab(existing);
    return;
  }
  try {
    await chrome.tabs.create({ url: savedTab.url, active: true });
    closeIfPopup();
  } catch {
    showToast(t("toastTabOpenError"), true);
  }
}

/**
 * Crea una fila visual para una pestana abierta.
 */
function buildOpenTabRow(tab, isSearchResult = false) {
  const isProtected = isProtectedTab(tab);
  const row = document.createElement("div");
  row.className = "tab-item search-jump-item";
  if (tab.active) row.classList.add("is-active-tab");
  if (tab.discarded) row.classList.add("is-discarded");

  row.addEventListener("click", () => jumpToOpenTab(tab));

  const main = document.createElement("div");
  main.className = "tab-main";
  main.appendChild(createTabIconElement(tab.favIconUrl));

  const info = document.createElement("div");
  info.className = "tab-info";

  const titleRow = document.createElement("div");
  titleRow.className = "tab-title-row";

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title || tab.url || "Tab";
  titleRow.appendChild(title);

  if (tab.discarded) {
    const b = document.createElement("span");
    b.className = "pill-badge pill-suspended";
    b.textContent = t("tabSuspendedBadge");
    titleRow.appendChild(b);
  }
  if (tab.pinned) {
    const b = document.createElement("span");
    b.className = "pill-badge pill-pinned";
    b.textContent = t("tabPinnedBadge");
    titleRow.appendChild(b);
  }
  if (tab.audible) {
    const b = document.createElement("span");
    b.className = "pill-badge pill-audible";
    b.textContent = t("tabAudibleBadge");
    titleRow.appendChild(b);
  }
  if (isProtected) {
    const b = document.createElement("span");
    b.className = "pill-badge pill-protected";
    b.textContent = t("protectedTabBadge");
    titleRow.appendChild(b);
  }

  const metaRow = document.createElement("div");
  metaRow.className = "tab-meta-row";
  const domain = document.createElement("span");
  domain.className = "tab-domain";
  domain.textContent = formatDomain(tab.url || tab.pendingUrl);
  metaRow.appendChild(domain);

  info.append(titleRow, metaRow);
  main.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "tab-actions";

  if (canTabBeSuspended(tab)) {
    const suspendBtn = document.createElement("button");
    suspendBtn.type = "button";
    suspendBtn.className = "row-action-btn";
    suspendBtn.title = t("suspendSingleTabTitle");
    suspendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    suspendBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await sendRuntimeMessage({ type: "SUSPEND_SINGLE_TAB", tabId: tab.id });
      await refreshAll();
    });
    actions.appendChild(suspendBtn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  if (isProtected) {
    closeBtn.className = "row-action-btn is-disabled";
    closeBtn.disabled = true;
    closeBtn.setAttribute("aria-disabled", "true");
    closeBtn.title = t("protectedTabCloseTitle");
    actions.classList.add("is-protected-actions");
    actions.title = t("protectedTabCloseTitle");
    actions.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  } else {
    closeBtn.className = "row-action-btn danger";
    closeBtn.title = t("closeTabTitle");
    closeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // Evita excepciones en consola si el navegador impide cerrar la pestana o ya no existe
      }
      await refreshAll();
    });
  }

  actions.appendChild(closeBtn);

  row.append(main, actions);
  if (isSearchResult) {
    row.dataset.jumpType = "open";
    row.dataset.tabId = String(tab.id);
  }
  return row;
}

/**
 * Crea una fila de resultado de busqueda perteneciente a un Workspace guardado.
 */
function buildSavedTabSearchRow(savedTab, workspace) {
  const row = document.createElement("div");
  row.className = "tab-item search-jump-item";
  row.dataset.jumpType = "saved";
  row.addEventListener("click", () => jumpToSavedTab(savedTab));

  const main = document.createElement("div");
  main.className = "tab-main";
  main.appendChild(createTabIconElement(savedTab.favIconUrl));

  const info = document.createElement("div");
  info.className = "tab-info";

  const titleRow = document.createElement("div");
  titleRow.className = "tab-title-row";

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = savedTab.title || savedTab.url;

  const wsBadge = document.createElement("span");
  wsBadge.className = "pill-workspace";
  wsBadge.style.borderLeft = `3px solid ${workspace.color || CONFIG.COLORS.PRIMARY}`;
  wsBadge.textContent = workspace.name;

  titleRow.append(title, wsBadge);

  const metaRow = document.createElement("div");
  metaRow.className = "tab-meta-row";
  const domain = document.createElement("span");
  domain.className = "tab-domain";
  domain.textContent = formatDomain(savedTab.url);
  metaRow.appendChild(domain);

  info.append(titleRow, metaRow);
  main.appendChild(info);
  row.appendChild(main);
  return row;
}

/**
 * Renderiza la vista de pestanas abiertas (agrupadas por ventana o resultados unificados al buscar).
 */
function renderOpenTabsView() {
  const container = dom.openTabsContainer;
  container.innerHTML = "";
  const query = state.searchQuery.trim().toLowerCase();

  if (query) {
    const matchingOpen = state.openTabs.filter((tab) => {
      const title = (tab.title || "").toLowerCase();
      const url = (tab.url || tab.pendingUrl || "").toLowerCase();
      return title.includes(query) || url.includes(query);
    });

    const matchingSaved = [];
    for (const ws of state.workspaces) {
      const wsMatches = ws.name.toLowerCase().includes(query);
      for (const savedTab of ws.tabs || []) {
        const title = (savedTab.title || "").toLowerCase();
        const url = (savedTab.url || "").toLowerCase();
        if (wsMatches || title.includes(query) || url.includes(query)) {
          matchingSaved.push({ savedTab, workspace: ws });
        }
      }
    }

    if (matchingOpen.length === 0 && matchingSaved.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = t("noOpenTabsMatch");
      container.appendChild(empty);
      return;
    }

    if (matchingOpen.length > 0) {
      const hdr = document.createElement("div");
      hdr.className = "group-header";
      const label = document.createElement("span");
      label.textContent = t("searchResultsOpenTabs");
      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = String(matchingOpen.length);
      hdr.append(label, count);
      container.appendChild(hdr);

      for (const tab of matchingOpen) {
        container.appendChild(buildOpenTabRow(tab, true));
      }
    }

    if (matchingSaved.length > 0) {
      const hdr = document.createElement("div");
      hdr.className = "group-header";
      const label = document.createElement("span");
      label.textContent = t("searchResultsWorkspaces");
      const count = document.createElement("span");
      count.className = "group-count";
      count.textContent = String(matchingSaved.length);
      hdr.append(label, count);
      container.appendChild(hdr);

      for (const item of matchingSaved) {
        container.appendChild(buildSavedTabSearchRow(item.savedTab, item.workspace));
      }
    }

    updateSearchSelectionHighlight();
    return;
  }

  if (state.openTabs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("noOpenTabsMatch");
    container.appendChild(empty);
    return;
  }

  const windowsMap = new Map();
  for (const tab of state.openTabs) {
    if (!windowsMap.has(tab.windowId)) {
      windowsMap.set(tab.windowId, []);
    }
    windowsMap.get(tab.windowId).push(tab);
  }

  let winNumber = 1;
  for (const [, tabsInWindow] of windowsMap.entries()) {
    const hdr = document.createElement("div");
    hdr.className = "group-header";
    const label = document.createElement("span");
    label.textContent = t("windowGroupTitle", [String(winNumber)]);
    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = String(tabsInWindow.length);
    hdr.append(label, count);
    container.appendChild(hdr);

    for (const tab of tabsInWindow) {
      container.appendChild(buildOpenTabRow(tab, false));
    }
    winNumber += 1;
  }

  updateSearchSelectionHighlight();
}

/**
 * Abre todas las pestanas de un workspace en la ventana actual o en una nueva.
 * Cada pestana se abre de forma independiente: una URL que el navegador rechace
 * (esquema interno, file://, javascript:...) ya no aborta la apertura del resto.
 */
async function openWorkspace(workspace, inNewWindow = false) {
  const urls = (workspace.tabs || [])
    .map((item) => item.url)
    .filter((url) => typeof url === "string" && url.length > 0);

  if (urls.length === 0) return;

  let opened = 0;
  let failed = 0;
  let targetWindowId = null;
  let placeholderTabId = null;

  try {
    if (inNewWindow) {
      const win = await chrome.windows.create({ focused: true });
      targetWindowId = win.id;
      placeholderTabId = win.tabs?.[0]?.id ?? null;
    } else {
      targetWindowId =
        state.currentWindowId ?? (await chrome.windows.getCurrent()).id;
    }
  } catch {
    showToast(t("toastActionError"), true);
    return;
  }

  for (const url of urls) {
    try {
      await chrome.tabs.create({
        windowId: targetWindowId,
        url,
        active: opened === 0
      });
      opened += 1;
    } catch {
      failed += 1;
    }
  }

  if (inNewWindow) {
    try {
      if (opened === 0) {
        await chrome.windows.remove(targetWindowId);
      } else if (placeholderTabId !== null) {
        await chrome.tabs.remove(placeholderTabId);
      }
    } catch {
      // La ventana o pestana temporal ya no existe
    }
  }

  if (failed > 0) {
    showToast(t("toastWorkspaceOpenPartial", [String(opened), String(failed)]), true);
    return;
  }
  closeIfPopup();
}

/**
 * Anade la pestana activa actual a un workspace existente.
 */
async function addCurrentTabToWorkspace(workspaceId) {
  let activeTab;
  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    activeTab = null;
  }
  if (!activeTab?.url) return;

  const { ok } = await mutateWorkspaces((list) => {
    const target = list.find((ws) => ws.id === workspaceId);
    if (!target) return false;
    target.tabs = Array.isArray(target.tabs) ? target.tabs : [];
    target.tabs.push({
      title: activeTab.title || activeTab.url,
      url: activeTab.url,
      favIconUrl: activeTab.favIconUrl || ""
    });
    return true;
  });

  state.collapsedWorkspaces.delete(workspaceId);
  renderAll();
  if (ok) showToast(t("toastTabAddedToWorkspace"));
}

/**
 * Renderiza la vista de Workspaces guardados con soporte de filtrado.
 */
function renderWorkspacesView() {
  const container = dom.workspacesContainer;
  container.innerHTML = "";
  const query = state.searchQuery.trim().toLowerCase();

  const filtered = state.workspaces.filter((ws) => {
    if (!query) return true;
    if ((ws.name || "").toLowerCase().includes(query)) return true;
    return (ws.tabs || []).some(
      (tab) =>
        (tab.title || "").toLowerCase().includes(query) ||
        (tab.url || "").toLowerCase().includes(query)
    );
  });

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.workspaces.length === 0 ? t("noWorkspacesYet") : t("noWorkspacesMatch");
    container.appendChild(empty);
    return;
  }

  for (const ws of filtered) {
    const card = document.createElement("article");
    card.className = "workspace-card";
    card.style.borderLeftColor = ws.color || CONFIG.COLORS.PRIMARY;

    const header = document.createElement("div");
    header.className = "workspace-card-header";

    const titleGroup = document.createElement("div");
    titleGroup.className = "workspace-title-group";
    titleGroup.addEventListener("click", () => {
      if (state.collapsedWorkspaces.has(ws.id)) {
        state.collapsedWorkspaces.delete(ws.id);
      } else {
        state.collapsedWorkspaces.add(ws.id);
      }
      renderWorkspacesView();
    });

    const dot = document.createElement("span");
    dot.className = "workspace-dot";
    dot.style.backgroundColor = ws.color || CONFIG.COLORS.PRIMARY;

    const name = document.createElement("span");
    name.className = "workspace-name";
    name.textContent = ws.name;

    const count = document.createElement("span");
    count.className = "workspace-count";
    count.textContent = String((ws.tabs || []).length);

    titleGroup.append(dot, name, count);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "row-action-btn danger";
    deleteBtn.title = t("deleteWorkspaceTitle");
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
    deleteBtn.addEventListener("click", async () => {
      const { ok } = await mutateWorkspaces((list) => {
        const idx = list.findIndex((item) => item.id === ws.id);
        if (idx < 0) return false;
        list.splice(idx, 1);
        return true;
      });
      renderAll();
      if (ok) showToast(t("toastWorkspaceDeleted"));
    });

    header.append(titleGroup, deleteBtn);

    const actions = document.createElement("div");
    actions.className = "workspace-actions";

    const btnCurrentWin = document.createElement("button");
    btnCurrentWin.type = "button";
    btnCurrentWin.className = "ws-btn";
    btnCurrentWin.textContent = t("openInCurrentWindow");
    btnCurrentWin.addEventListener("click", () => openWorkspace(ws, false));

    const btnNewWin = document.createElement("button");
    btnNewWin.type = "button";
    btnNewWin.className = "ws-btn ws-btn-accent";
    btnNewWin.textContent = t("openInNewWindow");
    btnNewWin.addEventListener("click", () => openWorkspace(ws, true));

    const btnAddTab = document.createElement("button");
    btnAddTab.type = "button";
    btnAddTab.className = "ws-btn";
    btnAddTab.textContent = t("addCurrentTabToWorkspace");
    btnAddTab.addEventListener("click", () => addCurrentTabToWorkspace(ws.id));

    actions.append(btnCurrentWin, btnNewWin, btnAddTab);
    card.append(header, actions);

    const isCollapsed = state.collapsedWorkspaces.has(ws.id) && !query;
    const tabsToShow = (ws.tabs || []).filter((tab) => {
      if (!query || (ws.name || "").toLowerCase().includes(query)) return true;
      return (
        (tab.title || "").toLowerCase().includes(query) ||
        (tab.url || "").toLowerCase().includes(query)
      );
    });

    if (!isCollapsed && tabsToShow.length > 0) {
      const list = document.createElement("div");
      list.className = "workspace-tabs-list";

      tabsToShow.forEach((savedTab) => {
        const originalIndex = (ws.tabs || []).indexOf(savedTab);
        const tabRow = document.createElement("div");
        tabRow.className = "ws-tab-row search-jump-item";
        tabRow.addEventListener("click", () => jumpToSavedTab(savedTab));

        tabRow.appendChild(createTabIconElement(savedTab.favIconUrl));

        const tabTitle = document.createElement("span");
        tabTitle.className = "ws-tab-title";
        tabTitle.textContent = savedTab.title || savedTab.url;
        tabTitle.title = savedTab.url;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "row-action-btn danger";
        removeBtn.title = t("removeTabFromWorkspace");
        removeBtn.innerHTML = `&times;`;
        removeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await mutateWorkspaces((list) => {
            const target = list.find((item) => item.id === ws.id);
            if (!target || !Array.isArray(target.tabs)) return false;
            // Usa el indice original si sigue apuntando a la misma URL; si otra instancia
            // modifico la lista entretanto, busca la pestana por URL.
            let idx = originalIndex;
            if (target.tabs[idx]?.url !== savedTab.url) {
              idx = target.tabs.findIndex((item) => item?.url === savedTab.url);
            }
            if (idx < 0) return false;
            target.tabs.splice(idx, 1);
            return true;
          });
          renderAll();
        });

        tabRow.append(tabTitle, removeBtn);
        list.appendChild(tabRow);
      });

      card.appendChild(list);
    }

    container.appendChild(card);
  }

  updateSearchSelectionHighlight();
}

/**
 * Actualiza el resaltado visual del resultado seleccionado por teclado.
 */
function updateSearchSelectionHighlight() {
  const activePane =
    state.activeView === "open" ? dom.openTabsContainer : dom.workspacesContainer;
  const items = Array.from(activePane.querySelectorAll(".search-jump-item"));
  items.forEach((el, idx) => {
    el.classList.toggle("is-selected", idx === state.selectedSearchIndex);
  });
  if (state.selectedSearchIndex >= 0 && items[state.selectedSearchIndex]) {
    items[state.selectedSearchIndex].scrollIntoView({ block: "nearest" });
  }
}

/**
 * Cambia entre la vista de Pestanas Abiertas y Workspaces.
 */
function setActiveView(viewName) {
  state.activeView = viewName;
  state.selectedSearchIndex = -1;
  const isOpen = viewName === "open";

  dom.tabBtnOpen.classList.toggle("active", isOpen);
  dom.tabBtnOpen.setAttribute("aria-selected", String(isOpen));
  dom.tabBtnWorkspaces.classList.toggle("active", !isOpen);
  dom.tabBtnWorkspaces.setAttribute("aria-selected", String(!isOpen));

  dom.viewOpenTabs.classList.toggle("hidden", !isOpen);
  dom.viewWorkspaces.classList.toggle("hidden", isOpen);
  updateSearchSelectionHighlight();
}

/**
 * Renderiza toda la interfaz con el estado actual.
 */
function renderAll() {
  renderMetrics();
  renderOpenTabsView();
  renderWorkspacesView();
}

async function refreshAll() {
  await loadState();
  renderAll();
}

/**
 * Abre el modal para guardar la sesion actual como Workspace.
 */
async function openSaveWorkspaceModal() {
  await loadState();
  dom.workspaceNameInput.value = "";
  state.selectedColor = CONFIG.WORKSPACE_COLORS[0];

  dom.colorPicker.innerHTML = "";
  for (const hex of CONFIG.WORKSPACE_COLORS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    if (hex === state.selectedColor) swatch.classList.add("selected");
    swatch.style.backgroundColor = hex;
    swatch.setAttribute("aria-label", hex);
    swatch.addEventListener("click", () => {
      state.selectedColor = hex;
      dom.colorPicker.querySelectorAll(".color-swatch").forEach((s) => {
        s.classList.toggle("selected", s === swatch);
      });
    });
    dom.colorPicker.appendChild(swatch);
  }

  dom.modalTabsList.innerHTML = "";
  for (const tab of state.openTabs) {
    const label = document.createElement("label");
    label.className = "modal-tab-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.tabId = String(tab.id);

    const text = document.createElement("span");
    text.className = "modal-tab-label";
    text.textContent = tab.title || tab.url;

    label.append(checkbox, text);
    dom.modalTabsList.appendChild(label);
  }

  dom.saveWorkspaceModal.classList.remove("hidden");
  dom.workspaceNameInput.focus();
}

function closeSaveWorkspaceModal() {
  dom.saveWorkspaceModal.classList.add("hidden");
}

/**
 * Exporta todos los Workspaces a un archivo JSON local.
 */
function exportWorkspacesToJson() {
  const payload = {
    app: CONFIG.APP_NAME,
    version: CONFIG.VERSION,
    exportedAt: new Date().toISOString(),
    workspaces: state.workspaces
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `chalatabs-workspaces-${datePart}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(t("toastBackupExported"));
}

/**
 * Importa Workspaces desde un archivo JSON local validando su estructura.
 */
async function handleImportJsonFile(file) {
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);

    // Valida antes de tocar storage; si el formato es invalido lanza y no se modifica nada.
    mergeImportedWorkspaces(parsed, []);

    let summary = { added: 0, skipped: 0 };
    const { ok } = await mutateWorkspaces((list) => {
      const merged = mergeImportedWorkspaces(parsed, list);
      list.splice(0, list.length, ...merged.workspaces);
      summary = merged;
      return true;
    });
    if (!ok) return;

    renderAll();
    setActiveView("workspaces");
    showToast(t("toastBackupImported", [String(summary.added)]));
  } catch {
    showToast(t("toastBackupError"), true);
  } finally {
    dom.importFileInput.value = "";
  }
}

/**
 * Configura enlaces externos del pie de pagina utilizando CONFIG.
 */
function setupFooterLinks() {
  const linkTargets = [
    [dom.linkPaypalDonate, CONFIG.PAYPAL_DONATE_URL],
    [dom.linkGithubRepo, CONFIG.GITHUB_REPO_URL],
    [dom.linkChalablock, CONFIG.SUITE_LINKS.chalablock],
    [dom.linkChalaVPN, CONFIG.SUITE_LINKS.chalavpn]
  ];

  for (const [el, url] of linkTargets) {
    if (!el || !url) continue;
    el.href = url;
    el.target = "_blank";
    el.rel = "noopener noreferrer";
    el.addEventListener("click", async (e) => {
      if (typeof chrome !== "undefined" && chrome.tabs?.create) {
        e.preventDefault();
        try {
          await chrome.tabs.create({ url, active: true });
        } catch {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      }
    });
  }
}

function cacheDomReferences() {
  dom.btnExport = document.getElementById("btnExport");
  dom.btnImport = document.getElementById("btnImport");
  dom.importFileInput = document.getElementById("importFileInput");
  dom.btnSidePanel = document.getElementById("btnSidePanel");
  dom.searchInput = document.getElementById("searchInput");
  dom.btnClearSearch = document.getElementById("btnClearSearch");
  dom.metricActiveCount = document.getElementById("metricActiveCount");
  dom.metricSuspendedCount = document.getElementById("metricSuspendedCount");
  dom.metricRamSaved = document.getElementById("metricRamSaved");
  dom.btnSuspendInactive = document.getElementById("btnSuspendInactive");
  dom.selectAutoSuspend = document.getElementById("selectAutoSuspend");
  dom.tabBtnOpen = document.getElementById("tabBtnOpen");
  dom.tabBtnWorkspaces = document.getElementById("tabBtnWorkspaces");
  dom.badgeOpenCount = document.getElementById("badgeOpenCount");
  dom.badgeWorkspaceCount = document.getElementById("badgeWorkspaceCount");
  dom.viewOpenTabs = document.getElementById("viewOpenTabs");
  dom.viewWorkspaces = document.getElementById("viewWorkspaces");
  dom.openTabsContainer = document.getElementById("openTabsContainer");
  dom.workspacesContainer = document.getElementById("workspacesContainer");
  dom.btnOpenSaveModal = document.getElementById("btnOpenSaveModal");
  dom.saveWorkspaceModal = document.getElementById("saveWorkspaceModal");
  dom.saveWorkspaceForm = document.getElementById("saveWorkspaceForm");
  dom.btnCloseModalX = document.getElementById("btnCloseModalX");
  dom.btnCancelModal = document.getElementById("btnCancelModal");
  dom.workspaceNameInput = document.getElementById("workspaceNameInput");
  dom.colorPicker = document.getElementById("colorPicker");
  dom.modalTabsList = document.getElementById("modalTabsList");
  dom.btnSelectAllTabs = document.getElementById("btnSelectAllTabs");
  dom.btnDeselectAllTabs = document.getElementById("btnDeselectAllTabs");
  dom.toastBanner = document.getElementById("toastBanner");
  dom.linkPaypalDonate = document.getElementById("linkPaypalDonate");
  dom.linkGithubRepo = document.getElementById("linkGithubRepo");
  dom.linkChalablock = document.getElementById("linkChalablock");
  dom.linkChalaVPN = document.getElementById("linkChalaVPN");
}

function bindEvents() {
  dom.btnSidePanel.addEventListener("click", () => {
    const firefoxSidebar = globalThis.browser?.sidebarAction || chrome.sidebarAction;
    if (firefoxSidebar?.open) {
      Promise.resolve(firefoxSidebar.open())
        .then(() => closeIfPopup())
        .catch(() => showToast(t("toastSidePanelError"), true));
      return;
    }
    if (!chrome.sidePanel?.open || state.currentWindowId === null) {
      showToast(t("toastSidePanelError"), true);
      return;
    }
    // Llamada sincrona (sin await previo) para conservar el user gesture que exige Chrome.
    chrome.sidePanel
      .open({ windowId: state.currentWindowId })
      .then(() => closeIfPopup())
      .catch(() => showToast(t("toastSidePanelError"), true));
  });

  dom.btnExport.addEventListener("click", exportWorkspacesToJson);

  dom.btnImport.addEventListener("click", () => {
    if (VIEW_MODE === "popup") {
      // El dialogo nativo de archivos hace perder el foco al popup y Chrome lo cierra
      // antes de recibir el archivo. Se abre la interfaz en una pestana completa.
      chrome.tabs
        .create({ url: chrome.runtime.getURL("popup/index.html?view=tab&import=1"), active: true })
        .then(() => window.close())
        .catch(() => dom.importFileInput.click());
      return;
    }
    dom.importFileInput.click();
  });

  dom.importFileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) handleImportJsonFile(file);
  });

  dom.searchInput.addEventListener("input", () => {
    state.searchQuery = dom.searchInput.value;
    state.selectedSearchIndex = state.searchQuery.trim() ? 0 : -1;
    dom.btnClearSearch.classList.toggle("hidden", !state.searchQuery);
    renderOpenTabsView();
    renderWorkspacesView();
  });

  dom.btnClearSearch.addEventListener("click", () => {
    dom.searchInput.value = "";
    state.searchQuery = "";
    state.selectedSearchIndex = -1;
    dom.btnClearSearch.classList.add("hidden");
    renderOpenTabsView();
    renderWorkspacesView();
    dom.searchInput.focus();
  });

  dom.searchInput.addEventListener("keydown", (e) => {
    const activePane =
      state.activeView === "open" ? dom.openTabsContainer : dom.workspacesContainer;
    const items = Array.from(activePane.querySelectorAll(".search-jump-item"));
    if (items.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.selectedSearchIndex = (state.selectedSearchIndex + 1) % items.length;
      updateSearchSelectionHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.selectedSearchIndex =
        state.selectedSearchIndex <= 0 ? items.length - 1 : state.selectedSearchIndex - 1;
      updateSearchSelectionHighlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const targetIndex = state.selectedSearchIndex >= 0 ? state.selectedSearchIndex : 0;
      items[targetIndex]?.click();
    }
  });

  dom.btnSuspendInactive.addEventListener("click", async () => {
    const res = await sendRuntimeMessage({ type: "SUSPEND_INACTIVE_TABS" });
    await refreshAll();
    if (!res) return;
    if (res.suspendedCount > 0) {
      showToast(t("toastSuspendedCount", [String(res.suspendedCount)]));
    } else {
      showToast(t("toastNoTabsToSuspend"));
    }
  });

  dom.selectAutoSuspend.addEventListener("change", async () => {
    const previous = state.autoSuspendMinutes;
    const minutes = Number(dom.selectAutoSuspend.value) || 0;
    const res = await sendRuntimeMessage({
      type: "SET_AUTOSUSPEND_MINUTES",
      minutes
    });
    if (res) {
      state.autoSuspendMinutes = Number(res.autoSuspendMinutes) || 0;
    } else {
      // Revierte el selector para no mostrar un valor que no se guardo
      state.autoSuspendMinutes = previous;
      dom.selectAutoSuspend.value = String(previous);
    }
  });

  dom.tabBtnOpen.addEventListener("click", () => setActiveView("open"));
  dom.tabBtnWorkspaces.addEventListener("click", () => setActiveView("workspaces"));

  dom.btnOpenSaveModal.addEventListener("click", openSaveWorkspaceModal);
  dom.btnCloseModalX.addEventListener("click", closeSaveWorkspaceModal);
  dom.btnCancelModal.addEventListener("click", closeSaveWorkspaceModal);

  dom.saveWorkspaceModal.addEventListener("click", (e) => {
    if (e.target === dom.saveWorkspaceModal) {
      closeSaveWorkspaceModal();
    }
  });

  dom.btnSelectAllTabs.addEventListener("click", () => {
    dom.modalTabsList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = true;
    });
  });

  dom.btnDeselectAllTabs.addEventListener("click", () => {
    dom.modalTabsList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
  });

  dom.saveWorkspaceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = dom.workspaceNameInput.value.trim();
    if (!name) return;

    const selectedIds = new Set(
      Array.from(dom.modalTabsList.querySelectorAll('input[type="checkbox"]:checked')).map(
        (cb) => Number(cb.dataset.tabId)
      )
    );

    const tabsToSave = state.openTabs
      .filter((tab) => selectedIds.has(tab.id) && (tab.url || tab.pendingUrl))
      .map((tab) => ({
        title: tab.title || tab.url || tab.pendingUrl,
        url: tab.url || tab.pendingUrl,
        favIconUrl: tab.favIconUrl || ""
      }));

    if (tabsToSave.length === 0) {
      showToast(t("toastNoTabsSelected"), true);
      return;
    }

    const newWorkspace = {
      id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      name: name.slice(0, 48),
      color: state.selectedColor,
      createdAt: Date.now(),
      tabs: tabsToSave
    };

    const { ok } = await mutateWorkspaces((list) => {
      list.unshift(newWorkspace);
      return true;
    });
    if (!ok) return;

    closeSaveWorkspaceModal();
    renderAll();
    setActiveView("workspaces");
    showToast(t("toastWorkspaceSaved"));
  });

  // Sincroniza cambios hechos por otra instancia (popup / panel lateral / pestana).
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      let needsRender = false;
      const wsChange = changes[CONFIG.STORAGE_KEYS.WORKSPACES];
      if (wsChange) {
        state.workspaces = Array.isArray(wsChange.newValue) ? wsChange.newValue : [];
        needsRender = true;
      }
      const settingsChange = changes[CONFIG.STORAGE_KEYS.SETTINGS];
      if (settingsChange?.newValue) {
        state.autoSuspendMinutes = Number(settingsChange.newValue.autoSuspendMinutes) || 0;
        dom.selectAutoSuspend.value = String(state.autoSuspendMinutes);
      }
      if (needsRender) renderAll();
    });
  }

  // Refresco en vivo con debounce si el usuario abre/cierra/suspende pestanas mientras el sidePanel esta abierto
  if (chrome.tabs?.onCreated) {
    let refreshDebounceTimer = null;
    const liveRefresh = () => {
      clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = setTimeout(() => {
        refreshAll();
      }, 120);
    };
    chrome.tabs.onCreated.addListener(liveRefresh);
    chrome.tabs.onRemoved.addListener(liveRefresh);
    chrome.tabs.onUpdated.addListener(liveRefresh);
    chrome.tabs.onActivated.addListener(liveRefresh);
  }
}

async function init() {
  cacheDomReferences();
  applyTranslations();
  setupFooterLinks();
  await detectViewContext();
  await refreshAll();
  bindEvents();
  dom.searchInput?.focus();
  if (VIEW_MODE === "tab" && URL_PARAMS.get("import") === "1") {
    setActiveView("workspaces");
    showToast(t("toastImportInTab"));
  }
}

document.addEventListener("DOMContentLoaded", init);
