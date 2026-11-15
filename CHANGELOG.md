# Historial de cambios

## 1.0.0

- Lanzamiento inicial de **ChalaTabs** (Manifest V3) para Google Chrome y Microsoft Edge.
- Buscador instantáneo en tiempo real para pestañas abiertas en todas las ventanas y pestañas guardadas en Workspaces, con navegación por teclado (`ArrowUp`, `ArrowDown`, `Enter`).
- Espacios de trabajo (Workspaces) con etiquetas de color, captura completa o selectiva de pestañas, apertura en ventana actual o nueva, adición de pestaña activa y eliminación individual.
- Suspensión inteligente de pestañas inactivas con `chrome.tabs.discard` y auto-suspensión configurable mediante `chrome.alarms` (`15`, `30`, `60` minutos o desactivado), protegiendo pestañas activas, fijadas (`pinned`) y con audio (`audible`).
- Soporte para Popup y Panel Lateral (`sidePanel`) con interfaz «Escudo Cibernético».
- Respaldo local de Workspaces en JSON (exportación e importación).
- Internacionalización completa en español (`es`, predeterminado) e inglés (`en`).
