import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

let passed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`PASS: ${name}`);
    })
    .catch((err) => {
      console.error(`FAIL: ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function assertPngDimensions(filePath, expectedWidth, expectedHeight) {
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(fs.existsSync(filePath), `Missing PNG file: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 24, `PNG too small: ${filePath}`);
  assert.ok(buf.subarray(0, 8).equals(pngSig), `Invalid PNG signature: ${filePath}`);
  assert.equal(buf.subarray(12, 16).toString("ascii"), "IHDR", `Missing IHDR: ${filePath}`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, expectedWidth, `${path.basename(filePath)} width mismatch`);
  assert.equal(height, expectedHeight, `${path.basename(filePath)} height mismatch`);
}

async function run() {
  // 1. Validacion sintactica con node --check en src/ y tools/
  await test("Syntax check on JS modules (src/ and tools/)", () => {
    const jsFiles = [
      path.join(SRC, "config.js"),
      path.join(SRC, "background.js"),
      path.join(SRC, "popup", "popup.js"),
      path.join(SRC, "popup", "workspace-import.js"),
      path.join(ROOT, "tools", "make-mv3.mjs")
    ];
    for (const file of jsFiles) {
      assert.ok(fs.existsSync(file), `Missing JS file: ${file}`);
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    }
  });

  // 2. Validacion de src/manifest.json y permisos minimos
  await test("Manifest V3 permissions, structure, and referenced assets in src/", () => {
    const manifestPath = path.join(SRC, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.default_locale, "es");
    assert.deepEqual(
      [...(manifest.permissions || [])].sort(),
      ["alarms", "sidePanel", "storage", "tabs"]
    );
    assert.equal(manifest.host_permissions, undefined, "Must not declare host_permissions");
    assert.equal(
      JSON.stringify(manifest).includes("<all_urls>"),
      false,
      "Must not include <all_urls>"
    );

    const referencedPaths = [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      manifest.side_panel?.default_path,
      ...Object.values(manifest.icons || {}),
      ...Object.values(manifest.action?.default_icon || {})
    ].filter(Boolean);

    for (const relPath of referencedPaths) {
      const cleanPath = relPath.split(/[?#]/)[0];
      const absPath = path.join(SRC, cleanPath);
      assert.ok(fs.existsSync(absPath), `Referenced asset missing in src/: ${relPath}`);
    }

    // Popup y panel lateral deben distinguirse por query string (bug: falso positivo de sidePanel)
    assert.equal(manifest.action.default_popup, "popup/index.html");
    assert.match(manifest.side_panel.default_path, /\?view=sidepanel$/);
  });

  // 3. Validacion de _locales y atributos data-i18n* en src/popup/index.html
  await test("Locales parity (es & en) and HTML data-i18n coverage", () => {
    const esPath = path.join(SRC, "_locales", "es", "messages.json");
    const enPath = path.join(SRC, "_locales", "en", "messages.json");
    const esMsgs = JSON.parse(fs.readFileSync(esPath, "utf8"));
    const enMsgs = JSON.parse(fs.readFileSync(enPath, "utf8"));

    const esKeys = Object.keys(esMsgs).sort();
    const enKeys = Object.keys(enMsgs).sort();
    assert.deepEqual(esKeys, enKeys, "es and en locale keys must match identically");

    for (const key of esKeys) {
      assert.ok(esMsgs[key]?.message?.trim(), `Empty es message for ${key}`);
      assert.ok(enMsgs[key]?.message?.trim(), `Empty en message for ${key}`);
    }

    // Limite de tiendas (Chrome Web Store y Microsoft Edge Add-ons: max 132 caracteres para description y 45 para name)
    for (const [locale, msgs] of [["es", esMsgs], ["en", enMsgs]]) {
      assert.ok(
        msgs.extName.message.length <= 45,
        `extName in locale '${locale}' exceeds 45 chars (${msgs.extName.message.length})`
      );
      assert.ok(
        msgs.extDescription.message.length <= 132,
        `extDescription in locale '${locale}' exceeds 132 chars (${msgs.extDescription.message.length})`
      );
    }

    const html = fs.readFileSync(path.join(SRC, "popup", "index.html"), "utf8");
    const i18nMatches = [...html.matchAll(/data-i18n(?:-(?:placeholder|title))?="([^"]+)"/g)].map(
      (m) => m[1]
    );
    assert.ok(i18nMatches.length > 0, "Expected data-i18n attributes in src/popup/index.html");
    for (const key of i18nMatches) {
      assert.ok(esMsgs[key], `Missing key '${key}' in src/_locales/es/messages.json`);
      assert.ok(enMsgs[key], `Missing key '${key}' in src/_locales/en/messages.json`);
    }

    const popupJs = fs.readFileSync(path.join(SRC, "popup", "popup.js"), "utf8");
    const runtimeKeys = [...popupJs.matchAll(/\bt\("([^"]+)"/g)].map((m) => m[1]);
    for (const key of runtimeKeys) {
      assert.ok(esMsgs[key], `Missing runtime i18n key '${key}' in es`);
      assert.ok(enMsgs[key], `Missing runtime i18n key '${key}' in en`);
    }

    assert.equal(
      html.includes('<span class="brand-badge">MV3</span>'),
      false,
      "Header must not include MV3 technical badge"
    );
    assert.match(
      html,
      /<a[^>]*id="linkPaypalDonate"[^>]*href="https:\/\/www\.paypal\.com\/ncp\/payment\/VSWPSS7D4ZRH2"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
      "PayPal donation link must point to official URL with target=_blank and rel=noopener noreferrer"
    );
    assert.equal(
      esMsgs.githubRepoLink.message,
      "Código Abierto en GitHub",
      "Spanish githubRepoLink must be translated as 'Código Abierto en GitHub'"
    );
    assert.ok(
      html.includes('<span data-i18n="githubRepoLink">Código Abierto en GitHub</span>'),
      "Static HTML fallback for githubRepoLink must be in Spanish"
    );
  });

  // 4. Validacion binaria de iconos PNG de la extension (16, 32, 48, 128)
  await test("Extension PNG icon signatures and exact dimensions (16, 32, 48, 128)", () => {
    for (const size of [16, 32, 48, 128]) {
      assertPngDimensions(path.join(SRC, "icons", `icon${size}.png`), size, size);
    }
  });

  // 5. Validacion de estructura estilo ChalaBlock (dist/, store/, paquetes e imagenes)
  await test("Build output, store packages, listings, and store PNG dimensions", () => {
    const version = fs.readFileSync(path.join(ROOT, "dist", "version"), "utf8").trim();
    assert.ok(version.length > 0, "dist/version must not be empty");

    const builtManifestPath = path.join(ROOT, "dist", "build", "ChalaTabs.chromium", "manifest.json");
    assert.ok(fs.existsSync(builtManifestPath), "Missing dist/build/ChalaTabs.chromium/manifest.json");
    const builtManifest = JSON.parse(fs.readFileSync(builtManifestPath, "utf8"));
    assert.equal(builtManifest.version, version);

    const chromiumZip = path.join(ROOT, "store", "paquetes", `ChalaTabs_${version}.chromium.zip`);
    const edgeZip = path.join(ROOT, "store", "paquetes", `ChalaTabs_${version}.edge.zip`);
    assert.ok(fs.existsSync(chromiumZip), `Missing package: ${chromiumZip}`);
    assert.ok(fs.existsSync(edgeZip), `Missing package: ${edgeZip}`);
    assert.ok(fs.statSync(chromiumZip).size > 1000, "Chromium zip package appears empty");
    assert.ok(fs.statSync(edgeZip).size > 1000, "Edge zip package appears empty");

    assert.ok(fs.existsSync(path.join(ROOT, "store", "ficha-tienda.md")), "Missing store/ficha-tienda.md");
    assert.ok(fs.existsSync(path.join(ROOT, "store", "ficha-chrome-web-store.md")), "Missing store/ficha-chrome-web-store.md");

    assertPngDimensions(path.join(ROOT, "store", "logo-300x300.png"), 300, 300);
    assertPngDimensions(path.join(ROOT, "store", "promo-440x280.png"), 440, 280);
    assertPngDimensions(path.join(ROOT, "store", "destacada-1400x560.png"), 1400, 560);
    assertPngDimensions(path.join(ROOT, "store", "captura-1-popup.png"), 1280, 800);
    assertPngDimensions(path.join(ROOT, "store", "captura-2-workspaces.png"), 1280, 800);
    assertPngDimensions(path.join(ROOT, "store", "captura-3-bienvenida.png"), 1280, 800);
  });

  // 6. Pruebas funcionales de src/background.js con mock de chrome.*
  const store = {};
  let mockTabs = [];
  const discardedIds = [];
  const createdAlarms = [];
  let badgeState = { text: "", color: "" };

  const makeEvent = () => {
    const listeners = [];
    return { listeners, addListener: (fn) => listeners.push(fn) };
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  let failStorageGet = false;
  globalThis.chrome = {
    runtime: {
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
      onMessage: makeEvent()
    },
    tabs: {
      onActivated: makeEvent(),
      onCreated: makeEvent(),
      onUpdated: makeEvent(),
      onRemoved: makeEvent(),
      query: async (q = {}) => {
        if (q.windowId !== undefined) {
          return mockTabs.filter((t) => t.windowId === q.windowId);
        }
        return [...mockTabs];
      },
      get: async (id) => mockTabs.find((t) => t.id === id),
      discard: async (id) => {
        await tick();
        discardedIds.push(id);
        const tab = mockTabs.find((t) => t.id === id);
        if (tab) tab.discarded = true;
        return tab;
      }
    },
    storage: {
      local: {
        get: async (keys) => {
          await tick();
          if (failStorageGet) {
            throw new Error("Simulated storage failure");
          }
          if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) {
              if (k in store) out[k] = store[k];
            }
            return out;
          }
          if (typeof keys === "string") {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          return { ...store };
        },
        set: async (obj) => {
          await tick();
          Object.assign(store, obj);
        }
      }
    },
    alarms: {
      onAlarm: makeEvent(),
      clear: async () => true,
      create: (name, info) => {
        createdAlarms.push({ name, info });
      }
    },
    action: {
      setBadgeText: async ({ text }) => {
        badgeState.text = text;
      },
      setBadgeBackgroundColor: async ({ color }) => {
        badgeState.color = color;
      },
      setBadgeTextColor: async () => {}
    }
  };

  const bg = await import("../src/background.js");
  const { CONFIG } = await import("../src/config.js");

  await test("CONFIG defines official PayPal donation URL and protected URL prefixes", () => {
    assert.equal(
      CONFIG.PAYPAL_DONATE_URL,
      "https://www.paypal.com/ncp/payment/VSWPSS7D4ZRH2"
    );
    assert.ok(Array.isArray(CONFIG.PROTECTED_URL_PREFIXES));
    for (const scheme of ["chrome://", "edge://", "about:", "file://", "chrome-extension://"]) {
      assert.ok(
        CONFIG.PROTECTED_URL_PREFIXES.includes(scheme),
        `Missing protected scheme: ${scheme}`
      );
    }
  });

  await test("isSuspendableTab enforces active, pinned, audible, discarded, and internal URL guards", () => {
    assert.equal(
      bg.isSuspendableTab({
        id: 1,
        active: false,
        pinned: false,
        audible: false,
        discarded: false,
        url: "https://developer.mozilla.org"
      }),
      true
    );
    assert.equal(
      bg.isSuspendableTab({ id: 2, active: true, pinned: false, audible: false, discarded: false, url: "https://a.com" }),
      false
    );
    assert.equal(
      bg.isSuspendableTab({ id: 3, active: false, pinned: true, audible: false, discarded: false, url: "https://a.com" }),
      false
    );
    assert.equal(
      bg.isSuspendableTab({ id: 4, active: false, pinned: false, audible: true, discarded: false, url: "https://a.com" }),
      false
    );
    assert.equal(
      bg.isSuspendableTab({ id: 5, active: false, pinned: false, audible: false, discarded: true, url: "https://a.com" }),
      false
    );
    for (const protectedUrl of [
      "chrome://extensions",
      "edge://settings",
      "about:blank",
      "file:///C:/Users/demo/index.html",
      "chrome-extension://abcdef/popup.html",
      "EDGE://flags"
    ]) {
      assert.equal(bg.isProtectedTabUrl(protectedUrl), true, `Expected protected: ${protectedUrl}`);
      assert.equal(
        bg.isSuspendableTab({
          id: 99,
          active: false,
          pinned: false,
          audible: false,
          discarded: false,
          url: protectedUrl
        }),
        false,
        `Expected non-suspendable: ${protectedUrl}`
      );
    }
  });

  await test("suspendInactiveTabs discards only eligible inactive tabs", async () => {
    discardedIds.length = 0;
    mockTabs = [
      { id: 10, windowId: 1, active: true, pinned: false, audible: false, discarded: false, url: "https://active.test" },
      { id: 11, windowId: 1, active: false, pinned: true, audible: false, discarded: false, url: "https://pinned.test" },
      { id: 12, windowId: 1, active: false, pinned: false, audible: true, discarded: false, url: "https://music.test" },
      { id: 13, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: "https://idle1.test" },
      { id: 14, windowId: 2, active: false, pinned: false, audible: false, discarded: false, url: "https://idle2.test" },
      { id: 15, windowId: 2, active: false, pinned: false, audible: false, discarded: false, url: "chrome://flags" }
    ];

    const res = await bg.suspendInactiveTabs();
    assert.equal(res.suspendedCount, 2);
    assert.deepEqual(discardedIds, [13, 14]);
    assert.equal(badgeState.text, "4");
    assert.equal(badgeState.color, CONFIG.COLORS.PRIMARY);
  });

  await test("checkAutoSuspend respects configured inactivity minutes threshold", async () => {
    discardedIds.length = 0;
    const now = 1_700_000_000_000;
    const thirtyMinMs = 30 * 60 * 1000;

    store[CONFIG.STORAGE_KEYS.SETTINGS] = { autoSuspendMinutes: 30 };
    store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] = {
      "21": now - thirtyMinMs - 10_000,
      "22": now - 5 * 60 * 1000,
      "23": now - thirtyMinMs - 10_000,
      "24": now - thirtyMinMs - 10_000
    };

    mockTabs = [
      { id: 21, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: "https://stale.test" },
      { id: 22, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: "https://recent.test" },
      { id: 23, windowId: 1, active: false, pinned: false, audible: true, discarded: false, url: "https://video.test" },
      { id: 24, windowId: 1, active: false, pinned: true, audible: false, discarded: false, url: "https://pinned.test" }
    ];

    const res = await bg.checkAutoSuspend(now);
    assert.equal(res.suspendedCount, 1);
    assert.deepEqual(discardedIds, [21]);
  });

  await test("Concurrent touchTabActivity/removeTabActivity calls do not lose updates", async () => {
    store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] = { "900": 1, "901": 1 };
    const ids = Array.from({ length: 20 }, (_, i) => 100 + i);
    await Promise.all([
      ...ids.map((id) => bg.touchTabActivity(id, 5000 + id)),
      bg.removeTabActivity(900),
      bg.removeTabActivity(901)
    ]);
    const activity = store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY];
    for (const id of ids) {
      assert.equal(activity[String(id)], 5000 + id, `Lost activity update for tab ${id}`);
    }
    assert.equal("900" in activity, false, "Removed tab 900 reappeared");
    assert.equal("901" in activity, false, "Removed tab 901 reappeared");
  });

  await test("checkAutoSuspend does not overwrite a touch that happens while discarding", async () => {
    discardedIds.length = 0;
    const now = 1_800_000_000_000;
    const stale = now - 60 * 60 * 1000;
    store[CONFIG.STORAGE_KEYS.SETTINGS] = { autoSuspendMinutes: 30 };
    store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] = { "31": stale, "32": stale, "33": stale };
    mockTabs = [
      { id: 31, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: "https://a.test" },
      { id: 32, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: "https://b.test" },
      { id: 33, windowId: 1, active: false, pinned: true, audible: false, discarded: false, url: "https://c.test" }
    ];
    const checkPromise = bg.checkAutoSuspend(now);
    await tick();
    const touchPromise = bg.touchTabActivity(33, now + 1);
    await Promise.all([checkPromise, touchPromise]);
    assert.equal(
      store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY]["33"],
      now + 1,
      "Touch during auto-suspend check was overwritten by stale snapshot"
    );
  });

  await test("initializeExtensionState resets stale activity on browser startup (tab IDs reused)", async () => {
    const before = Date.now();
    store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] = { "41": 1000, "42": 1000 };
    mockTabs = [
      { id: 41, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: "https://x.test" },
      { id: 42, windowId: 1, active: false, pinned: false, audible: false, discarded: false, url: "https://y.test" }
    ];
    await bg.initializeExtensionState({ resetActivity: true });
    const activity = store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY];
    assert.ok(activity["41"] >= before, "Tab 41 inherited stale timestamp after startup");
    assert.ok(activity["42"] >= before, "Tab 42 inherited stale timestamp after startup");

    // Sin reset (onInstalled/update) se conservan los timestamps existentes
    store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY] = { "41": 1000, "42": 1000 };
    await bg.initializeExtensionState();
    assert.equal(store[CONFIG.STORAGE_KEYS.TAB_ACTIVITY]["41"], 1000);
  });

  await test("onMessage always responds, even when the handler throws", async () => {
    const listener = chrome.runtime.onMessage.listeners[0];
    assert.equal(typeof listener, "function", "onMessage listener not registered");

    const send = (message) =>
      new Promise((resolve) => {
        const keepOpen = listener(message, {}, resolve);
        assert.equal(keepOpen, true, "Listener must return true for async response");
      });

    failStorageGet = true;
    let res;
    try {
      res = await send({ type: "SET_AUTOSUSPEND_MINUTES", minutes: 15 });
    } finally {
      failStorageGet = false;
    }
    assert.equal(res.ok, false);
    assert.match(res.error, /Simulated storage failure/);

    const unknown = await send({ type: "NOPE" });
    assert.deepEqual(unknown, { ok: false, error: "UNKNOWN_ACTION" });

    const negative = await send({ type: "SET_AUTOSUSPEND_MINUTES", minutes: -5 });
    assert.equal(negative.ok, true);
    assert.equal(negative.autoSuspendMinutes, 0);
  });

  const { mergeImportedWorkspaces } = await import("../src/popup/workspace-import.js");

  await test("mergeImportedWorkspaces rejects invalid formats", () => {
    assert.throws(() => mergeImportedWorkspaces({ foo: 1 }, []));
    assert.throws(() => mergeImportedWorkspaces([{ name: 1, tabs: [] }], []));
    assert.throws(() => mergeImportedWorkspaces([{ name: "ok" }], []));
    assert.throws(() => mergeImportedWorkspaces(null, []));
  });

  await test("mergeImportedWorkspaces never silently replaces existing workspaces", () => {
    const existing = [
      { id: "ws_a", name: "Trabajo", color: "#10B981", createdAt: 1, tabs: [{ title: "A", url: "https://a.test", favIconUrl: "" }] }
    ];

    // Mismo id con contenido distinto -> se conservan ambos
    const collide = mergeImportedWorkspaces(
      [{ id: "ws_a", name: "Otro", tabs: [{ url: "https://b.test" }] }],
      existing
    );
    assert.equal(collide.workspaces.length, 2);
    assert.equal(collide.workspaces[0].name, "Trabajo", "Existing workspace was replaced");
    assert.notEqual(collide.workspaces[1].id, "ws_a", "Imported workspace must get a new id");
    assert.equal(collide.added, 1);

    // Mismo id y contenido identico -> se omite (reimportar el mismo respaldo no duplica)
    const same = mergeImportedWorkspaces(
      { workspaces: [{ id: "ws_a", name: "Trabajo", tabs: [{ url: "https://a.test" }] }] },
      existing
    );
    assert.equal(same.workspaces.length, 1);
    assert.equal(same.skipped, 1);

    // Ids duplicados dentro del mismo archivo
    const dupInFile = mergeImportedWorkspaces(
      [
        { id: "ws_x", name: "Uno", tabs: [] },
        { id: "ws_x", name: "Dos", tabs: [] }
      ],
      []
    );
    const ids = dupInFile.workspaces.map((ws) => ws.id);
    assert.equal(new Set(ids).size, 2, "Duplicate ids inside file must be resolved");

    // El array existente no se muta
    assert.equal(existing.length, 1);
  });

  await test("mergeImportedWorkspaces filters dangerous URLs and sanitizes fields", () => {
    const { workspaces } = mergeImportedWorkspaces(
      [
        {
          name: "  " + "N".repeat(100) + "  ",
          color: "#fff; background:url(x)",
          tabs: [
            { url: "javascript:alert(1)", title: "x" },
            { url: "data:text/html,<script>1</script>" },
            { url: "file:///C:/secret.txt" },
            { url: "  https://ok.test/page  ", title: "OK", favIconUrl: "javascript:alert(1)" },
            { url: "chrome://settings" },
            { url: 42 }
          ]
        }
      ],
      []
    );
    const [ws] = workspaces;
    assert.equal(ws.name.length, 48);
    assert.equal(ws.color, CONFIG.COLORS.PRIMARY);
    assert.deepEqual(
      ws.tabs.map((tab) => tab.url),
      ["https://ok.test/page", "chrome://settings"]
    );
    assert.equal(ws.tabs[0].favIconUrl, "");
    assert.ok(ws.id.startsWith("ws_"));
  });

  await test("Popup source: no await before sidePanel.open and no getContexts-based detection", () => {
    const popupJs = fs.readFileSync(path.join(SRC, "popup", "popup.js"), "utf8");
    assert.equal(popupJs.includes("runtime.getContexts("), false, "getContexts detection gives false positives");
    assert.equal(
      /await\s+chrome\.windows\.getCurrent\(\);\s*await\s+chrome\.sidePanel\.open/.test(popupJs),
      false,
      "sidePanel.open must not be preceded by an await (user gesture is lost)"
    );
    assert.match(popupJs, /URLSearchParams\(window\.location\.search\)/);
  });

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
  console.log(`\nAll ${passed} checks passed.`);
}

run();
