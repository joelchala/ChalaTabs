# ChalaTabs: ficha para Edge Add-ons

Material listo para copiar y pegar en **Microsoft Partner Center (Edge Add-ons)**. Sirve también para la Chrome Web Store, cambiando el paquete.

## 1. Packages (paquete)

| Tienda | Archivo a subir |
|---|---|
| Edge Add-ons | `store/paquetes/ChalaTabs_1.0.0.edge.zip` |
| Chrome Web Store | `store/paquetes/ChalaTabs_1.0.0.chromium.zip` |

Ambos se generan localmente con `node tools/make-mv3.mjs` o en GitHub Actions al publicar una etiqueta en <https://github.com/joelchala/ChalaTabs/releases>.

## 2. Availability (disponibilidad)

- **Visibility:** Public
- **Markets:** todos

## 3. Properties (propiedades)

- **Category:** Productivity
- **Privacy policy requirements:** la extensión **no** accede, recopila ni transmite información personal → responder **No**
- **Privacy policy URL:** `https://github.com/joelchala/ChalaTabs/blob/main/PRIVACY.md`
- **Website URL:** `https://github.com/joelchala/ChalaTabs`
- **Support contact details:** `https://github.com/joelchala/ChalaTabs/issues`
- **Mature content:** No

## 4. Privacy (privacidad)

**Single purpose (propósito único):**

> ChalaTabs organizes browser tabs into workspaces, suspends inactive tabs to save RAM, and lets users search open or saved tabs instantly.

**Justificación de permisos** (pegar en el campo de cada permiso):

| Permiso | Justificación |
|---|---|
| `tabs` | Lists open tabs in the instant search bar, focuses a selected tab, saves active sessions into workspaces, and suspends inactive tabs natively with `chrome.tabs.discard`. |
| `storage` | Stores the user's saved workspaces, auto-suspend preferences, and local tab inactivity timestamps inside `chrome.storage.local`. |
| `alarms` | Schedules periodic local checks for the optional auto-suspend timer so inactive tabs can be discarded even when the MV3 service worker wakes up. |
| `sidePanel` | Allows the user to open and pin the ChalaTabs interface inside the browser's Side Panel for comfortable workspace management. |

**Remote code:** No. All code is included in the package.

**Data usage:** the extension does not collect or transmit any user data. No marcar ninguna categoría de datos y aceptar las tres declaraciones de cumplimiento.

## 5. Store listings (ficha)

Crear dos idiomas: **Spanish** y **English**. El nombre y la descripción corta se leen del paquete (`_locales`).

### Imágenes (carpeta `store/`)

| Campo | Archivo | Tamaño |
|---|---|---|
| Extension logo | `logo-300x300.png` | 300×300 |
| Small promotional tile | `promo-440x280.png` | 440×280 |
| Screenshots | `captura-1-popup.png`, `captura-2-workspaces.png`, `captura-3-bienvenida.png` | 1280×800 |

### Descripción (español)

```
ChalaTabs es un gestor de pestañas de código abierto, rápido y privado para organizar sesiones en Espacios de Trabajo (Workspaces), ahorrar memoria RAM y buscar cualquier pestaña al instante.

CARACTERÍSTICAS
• Buscador instantáneo en tiempo real con foco automático y navegación por teclado (ArrowUp, ArrowDown, Enter)
• Busca simultáneamente entre todas tus pestañas abiertas (en cualquier ventana) y tus Workspaces guardados
• Espacios de trabajo con nombre y color para guardar la sesión completa o solo las pestañas seleccionadas
• Abre un Workspace en la ventana actual o en una ventana nueva, añade la pestaña activa o quita pestañas individuales
• Suspensión inteligente con un clic usando la API nativa chrome.tabs.discard (sin romper URLs ni páginas externas)
• Auto-suspensión configurable (15, 30, 60 minutos o desactivado) protegiendo pestañas activas, fijadas o con audio
• Indicador visual de memoria RAM ahorrada y contador de pestañas activas vs. suspendidas
• Compatible con Popup rápido y Panel Lateral (sidePanel)
• Respaldo local en JSON para exportar e importar tus Workspaces

PRIVACIDAD Y CÓDIGO ABIERTO
ChalaTabs no recopila, transmite, vende ni comparte ningún dato personal ni de navegación. Solo solicita los permisos indispensables (tabs, storage, alarms, sidePanel), sin <all_urls> ni rastreadores.

Código fuente bajo licencia MIT: https://github.com/joelchala/ChalaTabs
ChalaTabs es 100% gratuito. Las donaciones por PayPal son opcionales y no desbloquean funciones.
```

### Description (English)

```
ChalaTabs is a fast, private, open-source tab manager for organizing sessions into Workspaces, saving RAM, and jumping to any tab instantly.

FEATURES
• Real-time instant search with automatic focus and keyboard navigation (ArrowUp, ArrowDown, Enter)
• Filters both currently open tabs across all windows and saved tabs inside Workspaces
• Color-coded Workspaces to save the full session or only selected tabs
• Restore a Workspace in the current window or a new window, add the active tab, or remove individual tabs
• One-click smart tab suspension using native chrome.tabs.discard (no external redirect pages or broken URLs)
• Configurable auto-suspend timer (15, 30, 60 min or disabled) protecting active, pinned, and audible tabs
• Live metrics for active vs. suspended tabs and estimated RAM saved
• Works both as a quick Popup and inside the browser Side Panel
• Local JSON export and import backups for your Workspaces

PRIVACY & OPEN SOURCE
ChalaTabs does not collect, transmit, sell, or share any personal or browsing data. It uses only minimal permissions (tabs, storage, alarms, sidePanel), with no <all_urls> and no trackers.

MIT open-source repository: https://github.com/joelchala/ChalaTabs
ChalaTabs is 100% free. Optional PayPal donations unlock no features.
```

### Search terms (máximo 7)

```
gestor de pestañas
tab manager
workspaces
suspender pestañas
ahorrar ram
buscar pestañas
productividad
```

## 6. Notes for certification (notas para el revisor)

```
ChalaTabs is a 100% free, open-source (MIT) Manifest V3 tab organizer and RAM saver. Source code: https://github.com/joelchala/ChalaTabs

No account or credentials are needed to test it.

How to test:
1. Open several tabs across one or more windows and click the ChalaTabs toolbar icon (or open it in Side Panel via the top-right panel icon).
2. Type in the auto-focused search bar to filter open tabs and press Enter or click a result to switch to it.
3. Click "Suspend inactive tabs" to discard eligible background tabs via chrome.tabs.discard and see the suspended counter and estimated RAM saved update immediately. Pinned and audible tabs are protected.
4. Switch to the "Workspaces" tab, click "+ Save current session", choose a name, color, and tabs, and save. You can restore the workspace in the current or a new window, or export/import a local JSON backup.

The extension uses only minimal permissions (tabs, storage, alarms, sidePanel), has no <all_urls> host permissions, contains no remote code, and makes zero network requests on its own. Footer links only open GitHub or an optional PayPal donation page when clicked by the user.
```

## Antes de enviar

- [ ] Subir `ChalaTabs_1.0.0.edge.zip` en **Packages**.
- [ ] Verificar que el nombre «ChalaTabs» y la descripción corta aparezcan correctamente desde `_locales`.
- [ ] Subir las imágenes de `store/` (`logo-300x300.png`, `promo-440x280.png`, `captura-1-popup.png`, `captura-2-workspaces.png`, `captura-3-bienvenida.png`).
