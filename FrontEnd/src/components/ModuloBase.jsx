// Contenido provisional de cada módulo. Al implementar un módulo se reemplaza por su pantalla real.
export function ModuloBase({ titulo, descripcion, carpeta }) {
  return (
    <section className="modulo">
      <p className="eyebrow">Módulo</p>
      <h1>{titulo}</h1>
      <p className="modulo__saludo">Hola mundo, este es el módulo de {titulo}.</p>
      <p className="modulo__descripcion">{descripcion}</p>
      <p>
        Carpeta de trabajo: <code>{carpeta}</code>
      </p>
    </section>
  )
}
