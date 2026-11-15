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
      const absPath = path.join(SRC, relPath);
      assert.ok(fs.existsSync(absPath), `Referenced asset missing in src/: ${relPath}`);
    }
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

  const makeEvent = () => ({ addListener: () => {} });
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
        discardedIds.push(id);
        const tab = mockTabs.find((t) => t.id === id);
        if (tab) tab.discarded = true;
        return tab;
      }
    },
    storage: {
      local: {
        get: async (keys) => {
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

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode);
  }
  console.log(`\nAll ${passed} checks passed.`);
}

run();
