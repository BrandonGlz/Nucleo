import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSesion } from '../context/SesionContext'
import { usarConsola } from '../services/agente'
import { AccesoConsola } from './AccesoConsola'
import { ConsolaLayout } from './ConsolaLayout'
import { SECCIONES } from './secciones'
import './consola.css'

// En la consola el chat usa las rutas de /nico/ (cualquier dispositivo de cualquier empresa).
usarConsola()

// Solo el superusuario (administrador de plataforma) entra; cualquier otra sesión vuelve al acceso.
function Protegida({ children }) {
  const { usuario, rol } = useSesion()
  const location = useLocation()
  if (!usuario || rol !== 'ADMINPLAT') return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />
  return children
}

export default function ConsolaApp() {
  const { usuario, rol } = useSesion()
  const dentro = usuario && rol === 'ADMINPLAT'
  return (
    <Routes>
      <Route path="/acceso" element={dentro ? <Navigate to="/" replace /> : <AccesoConsola />} />
      <Route
        element={
          <Protegida>
            <ConsolaLayout />
          </Protegida>
        }
      >
        {SECCIONES.map((s) => (
          <Route key={s.ruta} path={s.ruta} element={<s.Pagina />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
