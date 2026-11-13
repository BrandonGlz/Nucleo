import { BarChart, Card, Skeleton } from '../../design-system/componentes/index.js'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'
import { VIAS } from '../catalogos'
import { BarrasHorizontales } from '../comunes'

const dia = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '')
const porcentaje = (n, total) => (total ? Math.round((n / total) * 100) : 0)
// La barra resaltada al abrir: la de más preguntas.
const mayor = (serie) => serie.reduce((m, x, i) => (x.total > serie[m].total ? i : m), 0)

// Inicio de la consola: dashboard de uso de Nico (cifras y gráficas).
export default function InicioConsola() {
  const { estado, datos: d, reintentar } = useDatos(nicoApi.resumen, [])
  const cifras = d
    ? {
        principal: { etiqueta: 'Preguntas a Nico', valor: d.preguntas.toLocaleString('es-MX'), unidad: 'registradas', sub: `${d.no_entendidas} no entendidas` },
        cifras: [
          { etiqueta: 'Respuestas en el banco', valor: d.banco, tono: 'verde' },
          { etiqueta: 'Útiles / no útiles', valor: `${d.positivas} / ${d.negativas}` },
          { etiqueta: 'Herramientas apagadas', valor: d.herramientas_inactivas },
          { etiqueta: 'Documento en cada respuesta', valor: d.documentos_activos ? 'Sí' : 'No' },
        ],
      }
    : { principal: { etiqueta: 'Preguntas a Nico', valor: '—', tonoValor: 'apagado' } }

  const resueltas = d ? d.preguntas - d.no_entendidas : 0
  return (
    <Pantalla eyebrow="Consola de Nico AI" titulo="Inicio" cifras={cifras}>
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {d && (
        <div className="ui-consola-dash">
          <Card className="ui-consola-dash__ancha" title="Preguntas por día" subtitle="Últimos 14 días, sin las precargas del chat.">
            <BarChart
              data={d.por_dia.map((x) => ({ label: dia(x.fecha), value: x.total }))}
              decimals={0}
              unit="preg."
              height={220}
              label="Preguntas por día"
              activeIndex={mayor(d.por_dia)}
            />
          </Card>
          <Card title="Cómo se resolvieron" subtitle={`${porcentaje(resueltas, d.preguntas)} % se respondió sin problema.`}>
            <BarrasHorizontales
              filas={d.por_via
                .filter((x) => x.total > 0)
                .sort((a, b) => b.total - a.total)
                .map((x) => ({
                  clave: x.via,
                  etiqueta: VIAS[x.via]?.label ?? x.via,
                  valor: x.total,
                  color: VIAS[x.via]?.color,
                  nota: `${porcentaje(x.total, d.preguntas)} %`,
                }))}
            />
          </Card>
          <Card className="ui-consola-dash__ancha" title="Horario de uso" subtitle="Preguntas por hora del día (hora de Tijuana).">
            <BarChart
              data={d.por_hora.map((x) => ({ label: x.hora % 3 === 0 ? `${x.hora} h` : '', value: x.total }))}
              decimals={0}
              unit="preg."
              height={200}
              label="Preguntas por hora"
              activeIndex={mayor(d.por_hora)}
            />
          </Card>
          <Card title="Tiempo de respuesta" subtitle="Promedio por tipo de petición, de la más lenta a la más rápida.">
            <BarrasHorizontales
              filas={[...d.tiempo_por_via]
                .sort((a, b) => b.segundos - a.segundos)
                .map((x) => ({
                  clave: x.via,
                  etiqueta: VIAS[x.via]?.label ?? x.via,
                  valor: x.segundos,
                  texto: `${x.segundos.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`,
                  color: VIAS[x.via]?.color,
                }))}
            />
          </Card>
        </div>
      )}
    </Pantalla>
  )
}
