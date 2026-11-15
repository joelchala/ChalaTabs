# INSTALACIÓN (dist)

## Google Chrome / Microsoft Edge

1. Descarga y descomprime `ChalaTabs_<version>.chromium.zip` (o `ChalaTabs_<version>.edge.zip` desde [Releases](https://github.com/joelchala/ChalaTabs/releases)), o ejecuta localmente:
   ```bash
   node tools/make-mv3.mjs
   ```
2. Abre `chrome://extensions/` en Chrome o `edge://extensions/` en Microsoft Edge.
3. Activa el **Modo de desarrollador**.
4. Haz clic en **Cargar descomprimida**.
5. Selecciona la carpeta `dist/build/ChalaTabs.chromium/`.

## Cómo conservar tus Workspaces al actualizar manualmente

- Conserva la extensión cargada desde la misma ruta local y reemplaza únicamente el contenido de la carpeta cuando actualices manualmente.
- También puedes exportar tus Workspaces en formato `.json` desde el botón **Exportar** de ChalaTabs antes de actualizar.
