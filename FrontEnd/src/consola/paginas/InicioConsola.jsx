import { useNavigate } from 'react-router-dom'
import { Card, IconCircle } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'

const ACCESOS = [
  ['/chat', 'sparkles', 'Chat', 'Pregunta a Nico con el dispositivo de cualquier empresa y área.'],
  ['/banco', 'book-open', 'Banco de respuestas', 'Respuestas fijas, rutas y lo que aprendió de los 👍.'],
  ['/registro', 'history', 'Registro de preguntas', 'Lo que preguntan los usuarios; enseña desde las 👎 y las no entendidas.'],
  ['/herramientas', 'wrench', 'Herramientas', 'Qué puede consultar Nico, para qué sirve cada herramienta y cuáles están activas.'],
  ['/documentos', 'file-code', 'Documentos', 'SOUL, IDENTITY, AGENTS y los demás .md que guían a la IA.'],
]

// Inicio de la consola: cifras del agente y accesos a cada sección.
export default function InicioConsola() {
  const { datos } = useDatos(nicoApi.resumen, [])
  const navegar = useNavigate()
  const d = datos
  const cifras = d
    ? {
        principal: { etiqueta: 'Preguntas a Nico', valor: d.preguntas.toLocaleString('es-MX'), unidad: 'registradas', sub: `${d.no_entendidas} no entendidas` },
        cifras: [
          { etiqueta: 'Respuestas en el banco', valor: d.banco, tono: 'verde' },
          { etiqueta: '👍 / 👎', valor: `${d.positivas} / ${d.negativas}` },
          { etiqueta: 'Herramientas apagadas', valor: d.herramientas_inactivas },
          { etiqueta: 'Documentos activos', valor: d.documentos_activos },
        ],
      }
    : { principal: { etiqueta: 'Preguntas a Nico', valor: '—', tonoValor: 'apagado' } }
  return (
    <Pantalla eyebrow="Consola de Nico AI" titulo="Inicio" cifras={cifras}>
      <div className="ui-consola-accesos">
        {ACCESOS.map(([ruta, icono, titulo, texto]) => (
          <Card key={ruta} className="ui-consola-acceso" interactive onClick={() => navegar(ruta)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navegar(ruta)}>
            <IconCircle name={icono} tone="accent" size="md" />
            <strong>{titulo}</strong>
            <p>{texto}</p>
          </Card>
        ))}
      </div>
    </Pantalla>
  )
}
