import { Encabezado } from '../layouts/Encabezado'
import { CifrasClave } from './CifrasClave'

// Composición común de cada pantalla: encabezado, tarjeta de cifras clave y contenido.
export function Pantalla({ eyebrow, titulo, acciones, cifras, children }) {
  return (
    <>
      <Encabezado eyebrow={eyebrow} titulo={titulo} acciones={acciones} />
      {cifras && <CifrasClave {...cifras} />}
      {children}
    </>
  )
}
