# Landing de Núcleo (info.bynucleo.com)

Página pública que presenta la plataforma web, la app móvil, el dispositivo y Nico AI, con los
planes. Nico la narra: cada sección abre con su explicación y un Nico guía flotante cambia de frase
según la sección visible.

Son archivos estáticos, sin build ni dependencias externas:

```text
Landing/
├── index.html      Contenido y secciones
├── estilos.css     Estilos (quiebres móviles en 1100, 900 y 560 px)
├── landing.js      Navegación, apariciones, pestañas, puntos del dispositivo, Nico guía y planes
├── fuentes/        Plus Jakarta Sans (.woff2)
└── medios/
    ├── nico/        Nico recortado sin fondo (.webp)
    ├── pasos/       Ilustraciones de «Intégrate a Núcleo en tres pasos»
    ├── capturas/    Capturas reales de la web y la app (empresa demo de sembrar_demo)
    ├── video/       Videos de Nico y su primer cuadro
    └── dispositivo/ Dibujos del dispositivo (de Docs/nucleo3d)
```

- **Planes y precios:** se cambian en `landing.js` (`PLANES`, `COMPARAR`, `DESCUENTO_ANUAL`,
  `PRECIO_EQUIPO`); las tarjetas y la tabla se generan solas. El correo de ventas es `CORREO_CONTACTO`.
- **Probar en local:** `python3 -m http.server 8099 -d Landing` y abrir `http://localhost:8099`.
- **Producción:** Caddy la sirve para el host `info.bynucleo.com` (`deploy/nucleo.caddy`) por el túnel
  de Cloudflare (`deploy/cloudflared.yml`); se publica con el deploy normal. El DNS se crea una vez con
  `cloudflared tunnel route dns nucleo info.bynucleo.com`.
