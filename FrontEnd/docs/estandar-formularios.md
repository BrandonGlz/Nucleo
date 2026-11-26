# Estándar de formularios en modal

Todos los formularios dentro de un `Modal` siguen estas reglas. No cambian los campos ni la
validación de cada módulo; solo su acomodo.

## Anchos

| Tamaño | Ancho | Uso |
|---|---:|---|
| Chico | 420 px | Una o dos preguntas, confirmaciones y secretos. |
| Mediano | 640 px | La mayoría de los formularios. Es el valor por omisión de `Modal`. |
| Grande | 880 px | Formularios con secciones, como «Datos de la empresa». |

El ancho nunca pasa de `100vw − 32 px`.

## Campos

- Desde 560 px de ancho del modal, los campos van en una cuadrícula de dos columnas
  (`.ui-grid-2`). Los campos cortos se emparejan: Calle | Número, Colonia | Ciudad,
  Teléfono | —.
- Los campos largos (nombre de la empresa, descripción, URL, correo) ocupan las dos columnas
  con `.ui-form-ancho`.
- En móvil (≤ 900 px) todo va en una columna y el modal ocupa el ancho disponible.

## Secciones

- Las secciones llevan un título chico en mayúsculas, como «MARCA EN REPORTES».
- «Datos de la empresa» usa el tamaño grande: datos a la izquierda en dos columnas y la marca
  a la derecha (logo, «Subir logo»/«Quitar logo» como botones, color y «Aplicar color»).

## Alto y pie

- El modal mide como máximo `100dvh − 64 px`.
- La cabecera y los botones quedan fijos; si el contenido no cabe, solo hace scroll
  `.ui-modal__cuerpo`, nunca la página.
- Los botones van abajo a la derecha: «Cancelar» y la acción principal.

## Modales revisados

| Modal | Tamaño | Cambio |
|---|---|---|
| Programaciones · Nueva/editar programación | Mediano | Campos en dos columnas. |
| Reportes · Predeterminado de áreas | Mediano | Ancho estándar. |
| Reportes · Formato del reporte | Chico | Ancho estándar. |
| Reportes · Versiones del formato | Mediano | Ancho estándar. |
| Perfil · Códigos de recuperación | Mediano | Ancho estándar. |
| Perfil · Confirmar código | Chico | Ancho estándar. |
| Empresa y áreas · Datos de la empresa | Grande | Datos en dos columnas y marca a la derecha; botones de logo. |
| Empresa y áreas · Editar/Agregar área | Mediano | Nombre y descripción en dos columnas. |
| Empresa y áreas · Eliminar área | Chico | Ancho estándar. |
| Organizaciones · Editar/Nueva | Mediano | Ancho estándar. |
| Organizaciones · Primer administrador | Mediano | Ancho estándar. |
| Organizaciones · Cambiar estado | Chico | Ancho estándar. |
| Integraciones · Secreto | Chico | Ancho estándar. |
| Integraciones · Nuevo token | Mediano | Campos en dos columnas. |
| Integraciones · Nuevo webhook | Mediano | Nombre y URL en columnas; eventos a todo el ancho. |
| Usuarios · Agregar usuario | Mediano | Ancho estándar; campos ya emparejados. |
| Usuarios · Editar usuario | Mediano | Ancho estándar. |
| Administración · Confirmación | Chico | Ancho estándar. |
| Consola · Herramientas, respuestas y generación | Mediano | Ancho estándar. |
| Asistente de reportes | Especial (1120 px) | Conserva su asistente de tres pasos. |
