import { useMemo, useState } from 'react'
import { Skeleton } from '../../design-system/componentes/index.js'
import { Desplegable } from '../../components/Desplegable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { AgenteProvider } from '../../context/AgenteContext'
import { AgentePage } from '../../features/agente/AgentePage'
import { useDatos } from '../../hooks/useDatos'
import * as nicoApi from '../../services/nico'

// Empresa, área y dispositivo del ESP físico (el agente con IA): con ellos abre siempre el chat.
function delEsp(empresas) {
  for (const e of empresas) {
    for (const a of e.areas) {
      const d = a.dispositivos.find((x) => x.fisico)
      if (d) return { empresa: e.num, area: a.num, dispositivo: d.num }
    }
  }
  return { empresa: empresas[0]?.num, area: 'todas', dispositivo: null }
}

function Chat({ empresas }) {
  const inicial = useMemo(() => delEsp(empresas), [empresas])
  const [eleccion, setEleccion] = useState(inicial)
  const empresa = empresas.find((e) => e.num === eleccion.empresa) ?? empresas[0]
  const area = eleccion.area === 'todas' ? null : (empresa?.areas.find((a) => a.num === eleccion.area) ?? null)
  const dispositivos = useMemo(
    () =>
      area
        ? area.dispositivos
        : (empresa?.areas.flatMap((a) => a.dispositivos.map((d) => ({ ...d, nombre: `${d.nombre} · ${a.nombre}` }))) ?? []),
    [empresa, area],
  )
  const elegir = (cambio) => setEleccion((e) => ({ ...e, ...cambio }))

  const acciones = (
    <div className="ui-consola-filtros">
      <Desplegable
        icon="building-2"
        value={empresa?.num ?? ''}
        onChange={(v) => elegir({ empresa: Number(v), area: 'todas' })}
        placeholder="Sin empresas"
        disabled={!empresas.length}
        options={empresas.map((e) => ({ value: e.num, label: e.nombre }))}
      />
      <Desplegable
        icon="map-pin"
        value={area?.num ?? 'todas'}
        onChange={(v) => elegir({ area: v === 'todas' ? 'todas' : Number(v) })}
        disabled={!empresa}
        options={[{ value: 'todas', label: 'Todas las áreas' }, ...(empresa?.areas ?? []).map((a) => ({ value: a.num, label: a.nombre }))]}
      />
    </div>
  )
  return (
    <AgenteProvider dispositivos={dispositivos} agenteInicial={inicial.dispositivo}>
      <AgentePage consola eyebrow={empresa ? `${empresa.nombre} · respondes como su administrador` : 'Consola de Nico AI'} acciones={acciones} />
    </AgenteProvider>
  )
}

// Chat de la consola: el mismo Nico AI de la web, eligiendo empresa y área; el selector del chat
// muestra los dispositivos (ESP) del área. Se responde como administrador de esa empresa.
export default function ChatConsola() {
  const { estado, datos, reintentar } = useDatos(nicoApi.arbol, [])
  if (estado !== 'listo' && estado !== 'vacio') {
    return (
      <Pantalla eyebrow="Consola de Nico AI" titulo="Nico AI">
        {estado === 'error' ? <EstadoError reintentar={reintentar} /> : <Skeleton variant="card" />}
      </Pantalla>
    )
  }
  return <Chat empresas={datos?.empresas ?? []} />
}
