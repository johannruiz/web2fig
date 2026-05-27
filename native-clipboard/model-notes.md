# Intermediate model notes

El objetivo del modo nativo no es generar SVG. Es generar nodos equivalentes a Figma.

## Salida esperada

```json
{
  "type": "FRAME",
  "name": "Page",
  "x": 0,
  "y": 0,
  "width": 1440,
  "height": 1200,
  "fills": [{ "type": "SOLID", "color": "#ffffff" }],
  "layoutMode": "NONE",
  "children": []
}
```

## Tipos iniciales

- `FRAME`
- `RECTANGLE`
- `TEXT`
- `IMAGE`
- `GROUP`

## Layout

Cuando el DOM usa flex:

```json
{
  "type": "FRAME",
  "layoutMode": "HORIZONTAL",
  "itemSpacing": 16,
  "paddingLeft": 24,
  "paddingRight": 24,
  "paddingTop": 12,
  "paddingBottom": 12
}
```

Cuando no hay layout confiable, usar posicion absoluta.

## Regla de producto

El modo SVG sigue siendo el fallback estable. El modo nativo debe ser experimental hasta que podamos:

1. leer muestras copiadas desde Figma;
2. restaurarlas al portapapeles;
3. modificar valores simples sin romper el pegado;
4. generar frames/textos/imagenes desde cero.

## Hallazgos del clipboard real

Las muestras validas de Figma usan el formato `HTML Format` del portapapeles. Dentro del HTML hay dos bloques en base64:

- `(figmeta)`: JSON pequeño con `fileKey`, `pasteID` y `dataType: "scene"`.
- `(figma)`: buffer binario propietario de Figma.

El buffer `(figma)` observado tiene esta estructura inicial:

```text
fig-kiwij + cabecera de 7 bytes + bloque comun comprimido + bloque variable
```

En las muestras actuales, los primeros `30872` bytes son comunes entre `rect-pure`, `text-pure` y `rect-only`.
Desde el byte `30872` empieza el bloque variable:

```text
uint32 little-endian con el tamano comprimido + frame Zstandard
```

Al descomprimir ese frame aparecen los nodos reales de la escena. Ejemplos:

- `rect-pure`: 277 bytes comprimidos, 353 bytes descomprimidos, contiene `Document`, `Page 1`, `Rectangle 17`.
- `text-pure`: 2311 bytes comprimidos, 3612 bytes descomprimidos, contiene `Document`, `Page 1`, `Hola mundo`, `Inter`, `Regular`.
- `simple-frame`: 152240 bytes comprimidos, 481796 bytes descomprimidos.

Esto confirma que el camino viable para el modo nativo es:

1. conservar el bloque comun de Figma;
2. generar o modificar el bloque variable de escena;
3. comprimirlo con Zstandard;
4. reconstruir el HTML de portapapeles con `(figmeta)` y `(figma)`.
