# Landing de Núcleo (info.bynucleo.com)

«Descubre Núcleo»: página pública que presenta la plataforma web, la app móvil, el dispositivo y
Nico AI, con los pasos para integrarse y los planes. Nico la narra: cada sección abre con su
explicación y un Nico guía flotante cambia de frase según la sección visible.

Diseño: modo oscuro y claro (sigue al sistema; el botón del menú lo cambia y lo recuerda), con la
regla 60/30/10 (neutros / verde Núcleo `#2BC47A` / lima `#C6EF4E` solo de acento). Cada sección
está pensada para caber en una pantalla de escritorio, bento grids de 12 columnas, Nico en soft 3D (halo, sombra de
contacto, flotación e inclinación con el puntero) y animaciones de entrada y salida con el scroll
(clases `.anim` + `data-anim`, títulos `.titulo-partido`). Todo respeta «reducir movimiento».

Son archivos estáticos, sin build ni dependencias externas:

```text
Landing/
├── index.html      Contenido y secciones
├── estilos.css     Estilos (quiebres en 1100, 900 y 560 px)
├── landing.js      Tema, planes, contacto, navegación, animaciones, pestañas, dispositivo, visor y Nico guía
├── tema.js         Aplica el tema guardado o el del sistema antes de pintar (sin parpadeo)
├── favicon.png     Cara de Nico (también apple-touch-icon.png)
├── fuentes/        Plus Jakarta Sans (.woff2)
└── medios/
    ├── nico/        Nico recortado sin fondo (.webp)
    ├── pasos/       Ilustraciones de «Intégrate a Núcleo en tres pasos»
    ├── capturas/    Capturas reales de la web y la app, en claro/ y oscuro/ (empresa demo de sembrar_demo)
    ├── video/       Videos de Nico y su primer cuadro
    └── dispositivo/ Dibujo y cuatro vistas del dispositivo (de Docs/nucleo3d)
```

- **Planes y precios:** se cambian en `landing.js` (`PLANES`, `COMPARAR`, `DESCUENTO_ANUAL`,
  `PRECIO_EQUIPO`); las tarjetas y la tabla se generan solas. El correo de ventas es `CORREO_CONTACTO`: todos los botones con `data-contacto` abren un correo
  con ese asunto y copian la dirección (no hay alta de cuentas en la web; «Entrar» va a bynucleo.com).
- **Probar en local:** `python3 -m http.server 8099 -d Landing` y abrir `http://localhost:8099`.
- **Producción:** Caddy la sirve para el host `info.bynucleo.com` (`deploy/nucleo.caddy`) por el túnel
  de Cloudflare (`deploy/cloudflared.yml`); se publica con el deploy normal. El DNS se crea una vez con
  `cloudflared tunnel route dns nucleo info.bynucleo.com`.
