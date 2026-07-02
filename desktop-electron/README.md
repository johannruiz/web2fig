# Web2Fig Desktop

Version local de Web2Fig con `Importar URL` mediante Electron y Playwright.

## Uso

```bash
npm install
npm run install:browsers
npm start
```

La app abre una ventana desktop y conserva el flujo de Web2Fig. Puedes importar una carpeta completa, elegir un HTML y luego una carpeta de assets por separado, o usar `Importar URL`. En ese ultimo caso Electron llama al proceso principal, Playwright abre la web en Chromium, espera el render y devuelve el HTML resultante al editor para convertirlo.

## Notas

- Esta version no esta pensada para GitHub Pages.
- Requiere Node.js y dependencias instaladas localmente.
- Algunas webs pueden seguir bloqueando automatizacion, login, captchas o recursos protegidos.
