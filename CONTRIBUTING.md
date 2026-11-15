# Contribuciones

Gracias por tu interés en contribuir a **ChalaTabs**.

---

### Reportar errores o proponer mejoras

Si encuentras algún error o quieres proponer una nueva función para el gestor de pestañas, abre un reporte en [GitHub Issues](https://github.com/joelchala/ChalaTabs/issues).

---

### Desarrollo local y pruebas

1. Clona el repositorio y modifica los archivos dentro de `src/`.
2. Ejecuta las pruebas de verificación:
   ```bash
   node tests/verify.mjs
   ```
3. Genera la compilación desempaquetada y los paquetes `.zip` para Chrome y Edge:
   ```bash
   node tools/make-mv3.mjs
   ```
4. Carga `dist/build/ChalaTabs.chromium` (o `src/`) como extensión descomprimida en `chrome://extensions` o `edge://extensions`.

---

### Traducciones

Las cadenas de la interfaz se encuentran en `src/_locales/es/messages.json` y `src/_locales/en/messages.json`. Toda nueva clave debe existir en ambos archivos y pasar la verificación de `tests/verify.mjs`.
