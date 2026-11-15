# Política de privacidad de ChalaTabs

*Última actualización: 15 de noviembre de 2026* · [English version below](#chalatabs-privacy-policy)

ChalaTabs es una extensión de navegador de código abierto que organiza pestañas en espacios de trabajo, suspende pestañas inactivas para ahorrar RAM y permite buscar pestañas al instante. Publicada por Joel Chala bajo la licencia MIT.

## Resumen

**ChalaTabs no recopila, transmite, vende ni comparte ningún dato personal ni de navegación.** No tiene servidores propios, no incluye analíticas ni telemetría y no requiere crear una cuenta.

## Qué datos se manejan y dónde

- **Tus espacios de trabajo (Workspaces) y configuración** (nombre, color y lista de pestañas guardadas, intervalo de auto-suspensión y marcas temporales locales de actividad de pestañas) se guardan únicamente en tu navegador mediante `chrome.storage.local`. Nunca salen de tu dispositivo, salvo que tú mismo exportes un respaldo en formato `.json`.
- **La búsqueda y suspensión de pestañas** se ejecutan localmente dentro del navegador usando las APIs nativas `chrome.tabs` y `chrome.alarms`. ChalaTabs no registra tu historial externo ni envía a ningún servidor las direcciones que visitas.

## Conexiones de red

En su uso normal, ChalaTabs **no realiza ninguna conexión a servidores externos**.

Las únicas conexiones externas ocurren por una acción directa tuya al hacer clic en los enlaces del pie de página:

- **Repositorio de código abierto (GitHub):** abre la página del proyecto en GitHub. Aplica la política de privacidad de GitHub.
- **Donaciones (PayPal):** el botón «Apoyar el proyecto (PayPal)» abre una página de PayPal. ChalaTabs no recibe ni procesa datos de pago; aplica la política de privacidad de PayPal. Donar es opcional y no desbloquea ninguna función.

## Permisos que solicita la extensión

| Permiso | Para qué se usa |
|---|---|
| `tabs` | Listar tus pestañas abiertas en el buscador, enfocar la pestaña elegida, capturar sesiones como Workspaces y suspender pestañas inactivas con `chrome.tabs.discard` |
| `storage` | Guardar tus Workspaces, configuración de auto-suspensión y tiempos locales de inactividad en `chrome.storage.local` |
| `alarms` | Programar la comprobación periódica de inactividad para la función opcional de auto-suspensión |
| `sidePanel` | Permitir abrir la interfaz de ChalaTabs en el panel lateral del navegador |

ChalaTabs **no** solicita `<all_urls>` ni permisos de acceso al contenido de las páginas web. Ninguno de los permisos solicitados se utiliza para recopilar información.

## Cambios a esta política

Cualquier cambio se publicará en este mismo archivo; el historial completo es público en el [repositorio](https://github.com/joelchala/ChalaTabs/commits/main/PRIVACY.md).

## Contacto

Para preguntas sobre privacidad, abre un reporte en <https://github.com/joelchala/ChalaTabs/issues>.

---

# ChalaTabs Privacy Policy

*Last updated: November 15, 2026*

ChalaTabs is an open-source browser extension that organizes tabs into Workspaces, suspends inactive tabs to save RAM, and lets you search tabs instantly. Published by Joel Chala under the MIT license.

## Summary

**ChalaTabs does not collect, transmit, sell or share any personal or browsing data.** It has no servers of its own, includes no analytics or telemetry, and requires no account.

## What data is handled, and where

- **Your Workspaces and settings** (Workspace names, colors, saved tab URLs/titles, auto-suspend timeout, and local tab inactivity timestamps) are stored only in your browser using `chrome.storage.local`. They never leave your device unless you manually export a local `.json` backup file.
- **Tab searching and tab suspension** run locally inside your browser using native `chrome.tabs` and `chrome.alarms` APIs. ChalaTabs does not log your browsing history or send visited URLs anywhere.

## Network connections

In normal use, ChalaTabs **makes no connection to external servers**.

External connections only happen as a result of your own direct click on footer links:

- **GitHub repository:** opens the project page on GitHub. GitHub's privacy policy applies.
- **Donations (PayPal):** the "Support the project (PayPal)" button opens a PayPal page. ChalaTabs does not receive or process payment data; PayPal's privacy policy applies. Donating is optional and unlocks no features.

## Permissions requested by the extension

| Permission | What it is used for |
|---|---|
| `tabs` | Listing open tabs in instant search, switching to a chosen tab, saving sessions as Workspaces, and suspending inactive tabs via `chrome.tabs.discard` |
| `storage` | Storing your Workspaces, auto-suspend preferences, and local tab activity timestamps in `chrome.storage.local` |
| `alarms` | Scheduling periodic inactivity checks for the optional auto-suspend feature |
| `sidePanel` | Letting you open and pin ChalaTabs inside the browser's Side Panel |

ChalaTabs does **not** request `<all_urls>` or content host permissions. None of the requested permissions is used to collect information.

## Changes to this policy

Any change will be published in this same file; the full history is public in the [repository](https://github.com/joelchala/ChalaTabs/commits/main/PRIVACY.md).

## Contact

For privacy questions, open an issue at <https://github.com/joelchala/ChalaTabs/issues>.
