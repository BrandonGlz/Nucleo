# Flujo de trabajo con Git

Cómo se organizan las ramas y cómo se escriben los commits en Núcleo.

## Ramas

```text
main       Solo entregas estables, con un tag por etapa
dev        Integración; siempre debe funcionar
backend    Trabajo del backend (BackEnd/)
frontend   Trabajo de la web (FrontEnd/)
mobile     Trabajo de la app móvil (Mobile/)
iot        Trabajo del firmware y del broker (IoT/ y Mosquitto/)
```

- Cada área trabaja solo en su rama: así dos áreas no editan los mismos archivos a la vez.
- La documentación (`Context/`, `Docs/`, READMEs) y `Database/` no tienen rama propia: viajan
  con la rama del área que las modifica. Un cambio que toca varias áreas se coordina en `dev`.
- Para evitar conflictos al integrar, se trae `dev` a la rama del área con frecuencia
  (`git merge dev`) y se suben cambios pequeños.
- Si dos personas trabajan a la vez dentro de una misma área, cada una usa una rama corta
  (`feature/<tarea>` o `fix/<tarea>`) que sale de la rama del área y vuelve a ella.
- Cada área se integra a `dev` con un pull request y las pruebas pasando.
- `dev` pasa a `main` solo al cerrar una etapa; esa versión lleva un tag con el nombre de la
  etapa (por ejemplo `etapa-1` o `v0.1.0`).
- Nadie trabaja directo sobre `main` ni sobre `dev`.

## Commits

Un commit es un solo cambio lógico, con un mensaje de **una línea** con la forma
`tipo(alcance): resumen`:

- **Tipo:** `feat` (funcionalidad nueva), `fix` (corrección), `docs` (solo documentación),
  `test` (pruebas), `refactor` (reorganiza sin cambiar el comportamiento), `perf` (rendimiento),
  `style` (formato sin cambiar el código), `chore` (dependencias, configuración, tareas
  menores) y `revert` (deshace un commit).
- **Alcance** (opcional): `backend`, `web`, `mobile`, `iot`, `mosquitto`, `db` o el nombre de
  una app como `alertas`.
- **Resumen:** en español, con el verbo en presente (`agrega`, `corrige`, `elimina`), sin punto
  final y de máximo 72 caracteres.
- **Cuerpo:** solo si el porqué no es evidente; va separado por una línea en blanco y no
  repite lo que ya muestra el cambio.
- **Cambio que rompe compatibilidad:** se marca con `!` (por ejemplo `feat(backend)!:`) y
  se explica en el cuerpo.
- No se agregan coautores ni etiquetas automáticas de herramientas: el commit va a nombre de
  quien lo hizo.

Cuál usar según la situación:

- `feat(backend): agrega serie de lecturas por hora` — "agregaste una función."
- `fix(iot): reenvía las lecturas encoladas al reconectar` — "arreglaste un error."
- `docs: actualiza la guía de instalación` — "cambiaste solo documentación."
- `test(backend): cubre la caducidad del token` — "agregaste o ajustaste pruebas."
- `refactor(web): mueve el cliente HTTP a services/api` — "reorganizaste código sin cambiar su comportamiento."
- `chore(mobile): actualiza expo a 58.0.19` — "actualizaste dependencias."
- `chore(mosquitto): limita cada usuario a su tópico` — "cambiaste configuración."
- `revert: deshace "feat(backend): agrega serie por hora"` — "deshiciste un commit."

Se evita: `cambios`, `varios arreglos`, listas de archivos o párrafos que repiten el cambio.
Si un commit necesita muchas líneas para explicarse, probablemente son varios commits.
