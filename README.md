<h1 align="center">
<img src="src/icons/icon.svg" height="48" width="48" alt="">
<br>
ChalaTabs
</h1>

<p align="center">
Gestor de pestañas en espacios de trabajo, ahorro de RAM y buscador instantáneo para Chrome, Edge y otros navegadores Chromium.<br>
Rápido, privado y pensado para quienes navegan con orden y eficiencia.
</p>

***

## Qué es

ChalaTabs organiza tus pestañas en **Espacios de Trabajo (Workspaces)**, suspende pestañas inactivas para liberar memoria RAM mediante la API nativa `chrome.tabs.discard` y te permite saltar al instante a cualquier pestaña abierta o guardada. Funciona con Manifest V3 sin procesos externos ni servidores a los que se envíen tus datos.

- **Autor y mantenimiento:** Joel Chala
- **Licencia:** [MIT](LICENSE.txt)
- **Privacidad:** [no recopila ningún dato](PRIVACY.md)

## Características

- **Buscador instantáneo en tiempo real:** barra superior con foco automático al abrir la extensión; filtra pestañas abiertas en todas las ventanas y pestañas guardadas en Workspaces, con navegación por teclado (`ArrowUp`, `ArrowDown`, `Enter`).
- **Espacios de trabajo (Workspaces):** guarda todas las pestañas abiertas o las que selecciones con un nombre y etiqueta de color; ábrelos en la ventana actual o en una nueva, añade la pestaña actual o elimina pestañas individuales.
- **Suspensión inteligente de pestañas:** suspende con un clic todas las pestañas inactivas usando `chrome.tabs.discard(tabId)` sin romper URLs ni depender de páginas externas.
- **Auto-suspensión configurable:** opción mediante `chrome.alarms` (`15`, `30`, `60` minutos o desactivado) excluyendo pestañas fijadas (`pinned`), reproduciendo audio (`audible`) o activas.
- **Indicador de memoria RAM ahorrada:** contador en tiempo real de pestañas activas vs. suspendidas y memoria estimada liberada.
- **Popup y Panel Lateral (`sidePanel`):** usa ChalaTabs como popup ágil o fíjalo en el panel lateral de Chrome/Edge.
- **Respaldo local JSON:** exporta e importa todos tus Workspaces en archivos `.json` locales.
- **Permisos mínimos indispensables:** solo solicita `tabs`, `storage`, `alarms` y `sidePanel` (sin `<all_urls>` ni permisos invasivos).
- **Bilingüe (`_locales`):** español (`es`, predeterminado) e inglés (`en`).
- **Sin telemetría, sin cuentas, sin servidores, sin muros de pago.**

## Instalación

ChalaTabs se distribuye en paquetes listos para cargar o compilar localmente:

1. Descarga una versión compilada desde las [versiones publicadas](https://github.com/joelchala/ChalaTabs/releases) o genera la carpeta localmente (ver más abajo).
2. Abre `chrome://extensions` (Chrome) o `edge://extensions` (Edge).
3. Activa el **Modo de desarrollador**.
4. Pulsa **Cargar descomprimida** y elige la carpeta `dist/build/ChalaTabs.chromium` (o `src/`).

## Compilar / Empaquetar

Requisitos: Node.js 22 o superior (sin dependencias externas de npm). En Windows sirve PowerShell o Git Bash.

```bash
git clone https://github.com/joelchala/ChalaTabs.git
```

```bash
cd ChalaTabs && node tools/make-mv3.mjs
```

También puedes usar el script Bash:

```bash
bash tools/make-mv3.sh
```

En una compilación local, la extensión desempaquetada queda en `dist/build/ChalaTabs.chromium/` y los paquetes listos para subir a tiendas quedan en `store/paquetes/ChalaTabs_1.0.0.chromium.zip` y `store/paquetes/ChalaTabs_1.0.0.edge.zip`. El código fuente de la extensión está en [`src/`](src/).

Para ejecutar las pruebas automatizadas:

```bash
node tests/verify.mjs
```

Cada versión se compila y empaqueta automáticamente en GitHub Actions al publicar una etiqueta ([build.yml](.github/workflows/build.yml)).

## Hoja de ruta

| Mejora | Qué aporta |
|---|---|
| Publicación en Chrome Web Store y Edge Add-ons | Instalación con un clic y actualizaciones automáticas |
| Atajos de teclado globales configurables | Suspender pestañas o abrir el buscador directo desde cualquier ventana |
| Estadísticas históricas locales de RAM | Registro opcional local del ahorro acumulado |

Las sugerencias son bienvenidas en los [reportes del repositorio](https://github.com/joelchala/ChalaTabs/issues).

## Apoyar el proyecto

ChalaTabs es 100% gratuito y de código abierto. Si te resulta útil, puedes hacer una [donación opcional por PayPal](https://www.paypal.com/ncp/payment/VSWPSS7D4ZRH2). Donar no desbloquea ninguna función.

## Suite Chala y licencia

ChalaTabs forma parte de la **Suite Chala** de herramientas gratuitas y privadas junto a [Chalablock](https://github.com/joelchala/Chalablock) y [ChalaVPN](https://github.com/joelchala/ChalaVPN).

Todo el proyecto se distribuye bajo la [Licencia MIT](LICENSE.txt): puedes usarlo, estudiarlo, modificarlo y redistribuirlo libremente.
