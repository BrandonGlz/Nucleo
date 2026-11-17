import { Encabezado } from '../layouts/Encabezado'
import { CifrasClave } from './CifrasClave'

// Composición común de cada pantalla: encabezado, tarjeta de cifras clave y contenido.
export function Pantalla({ eyebrow, titulo, acciones, volver, cifras, children }) {
  return (
    <>
      <Encabezado eyebrow={eyebrow} titulo={titulo} acciones={acciones} volver={volver} />
      {cifras && <CifrasClave {...cifras} />}
      {children}
    </>
  )
}
