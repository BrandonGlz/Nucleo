import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSesion } from '../context/SesionContext'
import { AccesoConsola } from '../consola/AccesoConsola'
import { AdminLayout } from './AdminLayout'
import { OCULTAS, SECCIONES } from './secciones'
import '../consola/consola.css'
import './admin.css'

// Solo el superusuario (administrador de plataforma) entra; cualquier otra sesión vuelve al acceso.
function Protegida({ children }) {
  const { usuario, rol } = useSesion()
  const location = useLocation()
  if (!usuario || rol !== 'ADMINPLAT') return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />
  return children
}

// Consola de administración de Núcleo (admin.bynucleo.com): seguridad, accesos y equipos de
// todas las organizaciones.
export default function AdminApp() {
  const { usuario, rol } = useSesion()
  const dentro = usuario && rol === 'ADMINPLAT'
  return (
    <Routes>
      <Route
        path="/acceso"
        element={
          dentro ? (
            <Navigate to="/" replace />
          ) : (
            <AccesoConsola
              nombre="Consola de administración"
              lema="Seguridad, accesos y equipos de todas las organizaciones."
              soloSuper="Esta consola es solo para el superusuario de Núcleo."
            />
          )
        }
      />
      <Route
        element={
          <Protegida>
            <AdminLayout />
          </Protegida>
        }
      >
        {[...SECCIONES, ...OCULTAS].map((s) => (
          <Route key={s.ruta} path={s.ruta} element={<s.Pagina />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
