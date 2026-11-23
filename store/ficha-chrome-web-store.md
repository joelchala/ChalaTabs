# ChalaTabs: ficha para Chrome Web Store

Material listo para pegar en <https://chrome.google.com/webstore/devconsole> (cuenta de desarrollador `info@chaladev.site`). Los textos largos de descripción son los mismos de [ficha-tienda.md](ficha-tienda.md), sección 5.

## 0. Antes de empezar

- En **Account**: correo de contacto `info@chaladev.site` verificado y declaración de **non-trader** (proyecto gratuito sin ventas).
- Si al subir el paquete aparece el diálogo **«Aceptar subidas de CRX verificadas»**, pulsar **Cancelar** si no deseas gestionar firma manual de CRX.

## 1. Package (paquete)

Subir `store/paquetes/ChalaTabs_1.0.0.chromium.zip` (también disponible al crear releases en <https://github.com/joelchala/ChalaTabs/releases>).

## 2. Store listing (ficha)

| Campo | Valor |
|---|---|
| Title / Summary | Se leen del paquete (`_locales`: «ChalaTabs» y descripción corta) |
| Description | Texto en español de `ficha-tienda.md`; añadir English como segundo idioma |
| Category | **Productivity > Workflow & Planning** (o **Productivity > Tools**) |
| Language | Español (añadir English como segundo idioma) |
| Store icon (128×128) | `src/icons/icon128.png` (y `store/logo-300x300.png` si se solicita logo de 300×300) |
| Screenshots (1280×800) | `captura-1-popup.png`, `captura-2-workspaces.png`, `captura-3-bienvenida.png` |
| Small promo tile (440×280) | `promo-440x280.png` |
| Marquee promo tile (1400×560) | `destacada-1400x560.png` (opcional) |
| Official URL | Dejar en «None» |
| Homepage URL | `https://chaladev.site` (o `https://github.com/joelchala/ChalaTabs`) |
| Support URL | `https://chaladev.site/#privacidad` (o `https://github.com/joelchala/ChalaTabs/issues`) |
| Mature content | No |

## 3. Privacy practices (prácticas de privacidad)

**Single purpose:**

```
ChalaTabs organizes browser tabs into workspaces, suspends inactive tabs to save RAM, and lets users search open or saved tabs instantly.
```

**Permission justifications** (un campo por permiso):

| Permiso | Texto |
|---|---|
| `tabs` | Lists currently open tabs across all windows in the instant search bar, switches focus to a selected tab, captures open sessions into workspaces, and suspends inactive tabs natively with `chrome.tabs.discard`. |
| `storage` | Stores the user's saved workspaces, auto-suspend settings, and local tab inactivity timestamps inside `chrome.storage.local`. Nothing leaves the device. |
| `alarms` | Schedules periodic local checks for the optional auto-suspend interval (`15`, `30`, `60` minutes) in the Manifest V3 service worker. |
| `sidePanel` | Allows the user to open and keep ChalaTabs pinned in the browser's Side Panel to manage tabs and workspaces comfortably. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** no marcar ninguna categoría de datos. Marcar las tres certificaciones.

**Privacy policy URL:** `https://github.com/joelchala/ChalaTabs/blob/main/PRIVACY.md`

## 4. Distribution (distribución)

- **Payments:** Free of charge
- **Visibility:** Public
- **Regions:** All regions

## 5. Test instructions (instrucciones de prueba)

Usuario y contraseña: dejar vacíos. Pegar en «Additional instructions» (menos de 500 caracteres):

```
No login needed.
1. Open tabs and click the ChalaTabs icon (or open Side Panel).
2. Type in the search box and press Enter to switch tabs.
3. Click "Suspend inactive tabs" to discard background tabs via chrome.tabs.discard (pinned/audible stay active).
4. In Workspaces, save the session with name/color, restore it, or export/import JSON.
MIT open source, minimal permissions (no <all_urls>), no remote code or telemetry.
Source: https://github.com/joelchala/ChalaTabs
```
