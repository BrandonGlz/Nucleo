import { useState } from 'react'
import { Alert, Button, Card, Input, Skeleton, Toggle } from '../../design-system/componentes/index.js'
import { Pantalla } from '../../components/Pantalla'
import { useDatos } from '../../hooks/useDatos'
import * as adminApi from '../../services/admin'
import { ROL } from '../../utils/convertir'
import { fecha, useAviso } from '../../consola/utilidades'
import { ROLES } from '../catalogos'
import { ErrorCarga } from '../comunes'
import { erroresDeCampo, mensajeError } from '../utilidades'

// Campos numéricos con sus límites (los mismos que valida la API).
const NUMEROS = [
  { campo: 'dias_sesion', label: 'Días para que caduque una sesión', min: 1, max: 90, hint: 'Días sin uso; después hay que volver a entrar.' },
  { campo: 'intentos_login_por_minuto', label: 'Intentos de acceso por minuto', min: 3, max: 60, hint: 'Por IP; al pasarlos la API responde 429.' },
  { campo: 'dias_auditoria', label: 'Días que se guarda la auditoría', min: 30, max: 3650, hint: 'Lo más viejo se borra solo.' },
]
const EDITABLES = ['dias_sesion', 'intentos_login_por_minuto', 'roles_2fa_obligatorio', 'dias_auditoria', 'ota_todos']
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function Formulario({ inicial, guardado, avisar }) {
  const [f, setF] = useState(() => ({ ...inicial, roles_2fa_obligatorio: [...inicial.roles_2fa_obligatorio] }))
  const [errores, setErrores] = useState({})
  const [general, setGeneral] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const cambios = Object.fromEntries(EDITABLES.filter((k) => !igual(f[k], inicial[k])).map((k) => [k, f[k]]))
  const fueraDeRango = NUMEROS.some(({ campo, min, max }) => {
    const n = Number(f[campo])
    return f[campo] === '' || !Number.isInteger(n) || n < min || n > max
  })
  const alternarRol = (r) =>
    setF((x) => ({
      ...x,
      roles_2fa_obligatorio: x.roles_2fa_obligatorio.includes(r)
        ? x.roles_2fa_obligatorio.filter((y) => y !== r)
        : ROLES.filter((y) => y === r || x.roles_2fa_obligatorio.includes(y)),
    }))

  const guardar = async (e) => {
    e.preventDefault()
    setEnviando(true)
    setErrores({})
    setGeneral(null)
    try {
      const cuerpo = Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, NUMEROS.some((n) => n.campo === k) ? Number(v) : v]))
      guardado(await adminApi.guardarPoliticas(cuerpo))
      avisar('Políticas guardadas.')
    } catch (err) {
      const porCampo = erroresDeCampo(err)
      const conocidos = Object.keys(porCampo).filter((k) => EDITABLES.includes(k))
      setErrores(porCampo)
      if (!conocidos.length) setGeneral(mensajeError(err))
    }
    setEnviando(false)
  }

  return (
    <form className="ui-admin-politicas" onSubmit={guardar} noValidate>
      <Card title="Sesiones y accesos" subtitle="Aplican a la web y a la app de todas las organizaciones.">
        <div className="ui-admin-campos">
          {NUMEROS.map(({ campo, label, min, max, hint }) => (
            <Input
              key={campo}
              label={label}
              type="number"
              min={min}
              max={max}
              value={f[campo]}
              hint={`${hint} Entre ${min} y ${max}.`}
              error={errores[campo]}
              onChange={(e) => setF({ ...f, [campo]: e.target.value })}
            />
          ))}
        </div>
      </Card>
      <Card title="Verificación en dos pasos obligatoria" subtitle="Quien tenga uno de estos roles debe configurarla antes de usar Núcleo.">
        <ul className="ui-admin-roles">
          {ROLES.map((r) => (
            <li key={r}>
              <Toggle label={ROL[r]} checked={f.roles_2fa_obligatorio.includes(r)} onChange={() => alternarRol(r)} />
            </li>
          ))}
        </ul>
        {errores.roles_2fa_obligatorio && <p className="ui-admin-error">{errores.roles_2fa_obligatorio}</p>}
      </Card>
      <Card title="Firmware de los ESP32" subtitle="Cuando se publica una versión nueva del firmware.">
        <Toggle
          label="La actualización (OTA) llega a todos los equipos"
          checked={f.ota_todos}
          onChange={(v) => setF({ ...f, ota_todos: v })}
        />
        <p className="ui-muted ui-consola-ayuda" style={{ marginTop: 8 }}>
          Apagado, solo la reciben los equipos marcados con OTA en «Dispositivos».
        </p>
        {errores.ota_todos && <p className="ui-admin-error">{errores.ota_todos}</p>}
      </Card>
      {general && (
        <Alert level="critical" title="No se guardaron los cambios">
          {general}
        </Alert>
      )}
      <div className="ui-admin-guardar">
        <span className="ui-muted ui-consola-cuenta">
          Última modificación: {fecha(inicial.actualizado)}
          {inicial.actualizado_por ? ` · ${inicial.actualizado_por}` : ''}
        </span>
        <div style={{ flex: 1 }} />
        <Button
          type="button"
          variant="ghost"
          disabled={!Object.keys(cambios).length || enviando}
          onClick={() => {
            setF({ ...inicial, roles_2fa_obligatorio: [...inicial.roles_2fa_obligatorio] })
            setErrores({})
            setGeneral(null)
          }}
        >
          Descartar
        </Button>
        <Button type="submit" icon="save" disabled={!Object.keys(cambios).length || fueraDeRango || enviando}>
          {enviando ? 'Guardando…' : 'Guardar políticas'}
        </Button>
      </div>
    </form>
  )
}

// Políticas de seguridad de toda la plataforma.
export default function PoliticasAdmin() {
  const { estado, datos, error, reintentar, actualizar } = useDatos(adminApi.politicas, [])
  const [aviso, avisar] = useAviso()
  return (
    <Pantalla
      eyebrow="Reglas de seguridad de toda la plataforma"
      titulo="Políticas"
      acciones={aviso}
      cifras={
        datos
          ? {
              principal: { etiqueta: 'Sesiones caducan a los', valor: datos.dias_sesion, unidad: datos.dias_sesion === 1 ? 'día' : 'días', sub: 'sin uso' },
              cifras: [
                { etiqueta: 'Intentos por minuto', valor: datos.intentos_login_por_minuto },
                { etiqueta: 'Roles con 2 pasos', valor: datos.roles_2fa_obligatorio.length, tono: 'verde' },
                { etiqueta: 'Auditoría', valor: datos.dias_auditoria, unidad: 'días' },
                { etiqueta: 'OTA', valor: datos.ota_todos ? 'Todos' : 'Elegidos' },
              ],
            }
          : { principal: { etiqueta: 'Sesiones caducan a los', valor: '—', tonoValor: 'apagado' } }
      }
    >
      {estado === 'error' && <ErrorCarga error={error} reintentar={reintentar} />}
      {estado === 'cargando' && <Skeleton variant="card" />}
      {estado === 'listo' && datos && (
        <Formulario key={datos.actualizado} inicial={datos} guardado={(p) => actualizar(() => p)} avisar={avisar} />
      )}
    </Pantalla>
  )
}
