# HTML to Figma Clipboard

Primera version local para convertir HTML renderizado a SVG pegable en Figma.

## Uso

Abre `index.html` en el navegador o sirve la carpeta en localhost. Pega HTML, importa un archivo, carga una carpeta local o usa `HTML + assets`, presiona `Convertir` y luego `Copiar para Figma`.

Esta version es 100% estatica y esta pensada para GitHub Pages.

## Alcance actual

- Renderiza HTML en un `iframe`.
- Importa archivos `.html` y `.htm` desde el dispositivo.
- Importa carpetas locales con recursos relativos.
- Importa un HTML externo junto a una carpeta de assets seleccionada aparte.
- Permite fijar el viewport de exportacion con presets Desktop, Tablet y Mobile, o dimensiones manuales.
- Mantiene el modo Editable y agrega modo Hibrido para rasterizar solo nodos complejos.
- Incluye una opcion experimental para preparar grupos candidatos a Auto Layout al pegar en Figma.
- Ejecuta JavaScript en el preview antes de convertir.
- Lee estilos computados del DOM.
- Exporta imagenes `<img>` y fondos `background-image`; intenta incorporarlas como `data:` para que Figma las pegue mejor.
- Coloca imagenes con recorte SVG para respetar mejor `object-fit`, `object-position` y evitar deformaciones sin crear grupos extra.
- Reconstruye texto por lineas medidas en el navegador, conservando mejor ancho, espaciado y decoracion.
- Genera SVG con cajas, textos e imagenes.
- Detecta candidatos de Auto Layout para la siguiente fase.
- Copia SVG al portapapeles como formato avanzado si el navegador lo permite, o como texto SVG.

## Siguiente fase

- Crear un modelo intermedio de layout.
- Traducir flex/grid a estructuras equivalentes de Figma.
- Investigar el formato nativo del portapapeles de Figma para pegar frames con Auto Layout real.

## Clipboard nativo de Figma

La version SVG se mantiene como fallback estable. El trabajo nativo vive en `native-clipboard/` e incluye scripts para:

- listar formatos reales del portapapeles;
- guardar muestras copiadas desde Figma;
- restaurar muestras para probar pegado;
- documentar el modelo intermedio que luego alimentara SVG o Figma nativo.
