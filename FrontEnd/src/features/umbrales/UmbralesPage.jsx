import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Input, Select, Skeleton, ThresholdSlider } from '../../design-system/componentes/index.js'
import { GraficaAjustable } from '../../components/GraficaAjustable'
import { EstadoError } from '../../components/EstadoError'
import { Pantalla } from '../../components/Pantalla'
import { useSesion } from '../../context/SesionContext'
import { useDatos } from '../../hooks/useDatos'
import * as dispositivosApi from '../../services/dispositivos'
import * as lecturasApi from '../../services/lecturas'
import * as umbralesApi from '../../services/umbrales'
import * as usuariosApi from '../../services/usuarios'
import { nivelLectura, nombreCorto, pagina, puedeEditar, rangoUmbral, UNIDAD, VARIABLE } from '../../utils/convertir'
import { haceCuanto, hora, num } from '../../utils/formato'

const LIMITES = ['peligro_min', 'advertencia_min', 'advertencia_max', 'peligro_max']
const ETIQUETA = { peligro_min: 'Peligro mín', advertencia_min: 'Advertencia mín', advertencia_max: 'Advertencia máx', peligro_max: 'Peligro máx' }
const ESCALA = { TEMP: [0, 40, 0.5], HUM: [0, 100, 1], AIRE: [0, 2000, 50] }

async function cargar(disp, rol) {
  const [umb, lecturas, serie] = await Promise.all([
    umbralesApi.lista(disp),
    dispositivosApi.ultimasLecturas(disp),
    lecturasApi.serie(disp, 'HUM'),
  ])
  let usuarios = []
  if (puedeEditar(rol)) {
    try {
      usuarios = pagina(await usuariosApi.lista())
    } catch {
      usuarios = []
    }
  }
  return { umbrales: pagina(umb), lecturas, serie, usuarios }
}

const ordenValido = (u) => {
  const [a, b, c, d] = LIMITES.map((k) => Number(u[k]))
  return [a, b, c, d].every((x) => x !== '' && !Number.isNaN(x)) && a <= b && b < c && c <= d
}

export function UmbralesPage() {
  const { rol } = useSesion()
  const editable = puedeEditar(rol)
  const [params, setParams] = useSearchParams()
  const disp = params.get('dispositivo') || '5'
  const lista = useDatos(() => dispositivosApi.lista(), [])
  const { estado, datos, reintentar, actualizar } = useDatos(() => cargar(disp, rol), [disp, rol])
  const [borrador, setBorrador] = useState({})
  const [aviso, setAviso] = useState(null)
  // Cuando llegan umbrales nuevos (otro dispositivo o después de guardar) el borrador se reinicia.
  const [base, setBase] = useState(null)
  if (datos && datos !== base) {
    setBase(datos)
    setBorrador(Object.fromEntries(datos.umbrales.map((u) => [u.variable, { ...u }])))
  }

  const dispositivos = pagina(lista.datos)
  const actual = dispositivos.find((d) => d.num === Number(disp))
  const cambiados = datos ? datos.umbrales.filter((u) => LIMITES.some((k) => Number(borrador[u.variable]?.[k]) !== Number(u[k]))) : []
  const invalidos = Object.values(borrador).filter((u) => !ordenValido(u))
  const ultimo = datos?.umbrales.reduce((a, b) => (a && a.fecha_actualizacion > b.fecha_actualizacion ? a : b), null)
  const autor = datos?.usuarios.find((u) => u.num === ultimo?.configurado_por)
  const lectura = (v) => datos?.lecturas.find((l) => l.variable === v)

  const cambiar = (variable, cambios) => {
    setAviso(null)
    setBorrador((b) => ({ ...b, [variable]: { ...b[variable], ...cambios } }))
  }
  const guardar = async () => {
    try {
      const nuevos = await Promise.all(
        cambiados.map((u) => umbralesApi.guardar(u.num, Object.fromEntries(LIMITES.map((k) => [k, Number(borrador[u.variable][k]).toFixed(2)])))),
      )
      actualizar((d) => ({ ...d, umbrales: d.umbrales.map((u) => nuevos.find((n) => n.num === u.num) ?? u) }))
      setAviso('Umbral guardado.')
    } catch {
      setAviso('No se pudo guardar el umbral. Revisa los valores.')
    }
  }

  const hum = lectura('HUM')
  const uHum = borrador.HUM
  const nivelHum = hum && uHum ? nivelLectura(hum.valor, uHum) : 'normal'
  const cifras = datos
    ? {
        principal: {
          etiqueta: `Humedad actual · ${actual?.nombre ?? ''}`,
          valor: num(hum?.valor, 0),
          unidad: '%HR',
          tonoUnidad: nivelHum !== 'normal' ? 'peligro' : undefined,
          tonoSub: nivelHum !== 'normal' ? 'peligro' : 'lima',
          sub: nivelHum === 'critical' ? `Supera el máximo de ${Number(uHum.peligro_max)} %HR · umbral por dispositivo` : `En rango · ${rangoUmbral(uHum, '%HR')}`,
        },
        cifras: [
          ...['TEMP', 'AIRE'].map((v) => ({
            etiqueta: VARIABLE[v].corta,
            valor: num(lectura(v)?.valor, VARIABLE[v].decimales),
            unidad: UNIDAD[v],
            sub: `Umbral ${rangoUmbral(borrador[v], UNIDAD[v])}`,
            tono: nivelLectura(lectura(v)?.valor, borrador[v]) === 'normal' ? 'lima' : 'peligro',
          })),
          { etiqueta: 'Último cambio', valor: ultimo ? hora(ultimo.fecha_actualizacion) : '—', sub: autor ? `Por ${nombreCorto(autor)}` : haceCuanto(ultimo?.fecha_actualizacion) },
        ],
      }
    : { principal: { etiqueta: 'Umbrales', valor: '—', tonoValor: 'apagado' } }

  return (
    <Pantalla eyebrow="Grupo Altamira · rango permitido por dispositivo" titulo="Umbrales" cifras={cifras}>
      <Card>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
          <div style={{ width: 360 }}>
            <Select
              label="Dispositivo"
              icon="cpu"
              value={disp}
              onChange={(e) => setParams({ dispositivo: e.target.value })}
              options={dispositivos.map((d) => ({ value: String(d.num), label: `${d.nombre} · ${d.codigo_mqtt}` }))}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Aplica a {actual?.nombre ?? '…'}</span>
            <span className="ui-muted" style={{ fontSize: 13 }}>
              {aviso ?? `El umbral es por dispositivo${ultimo ? ` · último cambio ${autor ? `por ${nombreCorto(autor)} ` : ''}· ${haceCuanto(ultimo.fecha_actualizacion)}` : ''}`}
            </span>
          </div>
          {editable && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" disabled={!cambiados.length} onClick={() => setBorrador(Object.fromEntries(datos.umbrales.map((u) => [u.variable, { ...u }])))}>
                Cancelar
              </Button>
              <Button disabled={!cambiados.length || invalidos.length > 0} onClick={guardar}>
                Guardar umbral
              </Button>
            </div>
          )}
        </div>
      </Card>
      {!editable && (
        <Alert level="info" title="Solo administradores y supervisores pueden editar">
          Puedes consultar los umbrales de cada dispositivo. Si necesitas un cambio, pídeselo al supervisor de tu área.
        </Alert>
      )}
      {estado === 'error' && <EstadoError reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 24, flex: 'none' }}>
            {['TEMP', 'HUM', 'AIRE'].map((v) => {
              const u = borrador[v]
              if (!u) return null
              const [min, max, step] = ESCALA[v]
              const malo = !ordenValido(u)
              return (
                <div key={v} className="ui-umbral">
                  <ThresholdSlider
                    label={VARIABLE[v].etiqueta}
                    icon={VARIABLE[v].icono}
                    unit={UNIDAD[v]}
                    min={min}
                    max={max}
                    step={step}
                    value={[Number(u.peligro_min), Number(u.peligro_max)]}
                    onChange={([a, b]) => cambiar(v, { peligro_min: a, peligro_max: b })}
                    current={Number(lectura(v)?.valor)}
                    disabled={!editable}
                  />
                  {!editable && (
                    <div className="ui-umbral__adv ui-umbral__adv--texto">
                      <span className="ui-muted">Advertencia</span>
                      <strong className="ui-num">
                        {Number(u.advertencia_min)} – {Number(u.advertencia_max)} {UNIDAD[v]}
                      </strong>
                    </div>
                  )}
                  {editable && (
                  <div className="ui-umbral__adv">
                    {['advertencia_min', 'advertencia_max'].map((k, i) => (
                      <Input
                        key={k}
                        label={ETIQUETA[k]}
                        type="number"
                        value={u[k] === '' ? '' : String(Number(u[k]))}
                        suffix={UNIDAD[v]}
                        disabled={!editable}
                        onChange={(e) => cambiar(v, { [k]: e.target.value })}
                        error={malo && i === 0 ? 'Debe quedar dentro del rango y ser menor que el máximo.' : undefined}
                      />
                    ))}
                  </div>
                  )}
                </div>
              )
            })}
          </div>
          <Card className="nc-grow" style={{ minHeight: 140 }}>
            <div className="nc-card__head" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="nc-card__title">Vista previa contra las últimas lecturas</h3>
                <p className="nc-card__sub">Humedad · hoy · {rangoUmbral(uHum, '%HR')}</p>
              </div>
            </div>
            <GraficaAjustable
              data={datos.serie.map((p) => ({ label: hora(p.periodo), time: hora(p.periodo), value: Number(p.promedio) }))}
              unit="%HR"
              threshold={uHum ? { min: Number(uHum.peligro_min), max: Number(uHum.peligro_max) } : undefined}
              tooltip={false}
              minimo={90}
            />
          </Card>
        </>
      )}
    </Pantalla>
  )
}
