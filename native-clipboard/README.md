# Figma native clipboard lab

Esta carpeta es un laboratorio para trabajar el pegado nativo de Figma sin eliminar la version SVG.

## Por que existe

El navegador solo puede copiar formatos web estandar como `image/svg+xml` y texto. Para pegar nodos reales de Figma, como frames y Auto Layout nativo, hace falta escribir formatos privados del portapapeles del sistema. Esos formatos no estan documentados, asi que primero hay que inspeccionar muestras copiadas desde Figma.

## Flujo de investigacion

1. En Figma, crea un frame simple.
2. Copialo con `Ctrl+C`.
3. Ejecuta `scripts/read-clipboard-formats.ps1`.
4. Revisa los formatos detectados.
5. Ejecuta `scripts/save-clipboard-sample.ps1 -Name simple-frame`.
6. Repite con casos pequenos:
   - texto
   - imagen
   - rectangulo
   - frame
   - auto layout horizontal
   - auto layout vertical
7. Usa `scripts/restore-clipboard-sample.ps1 -Name simple-frame` para comprobar que la muestra puede volver a pegarse en Figma.

## Objetivo

Construir un generador que produzca los formatos nativos de Figma desde nuestro modelo intermedio. El modo SVG sigue siendo el fallback estable.
