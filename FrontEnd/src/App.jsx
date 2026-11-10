import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSesion } from './context/SesionContext'
import { acceso, inicioDe, modulos, puedeVer } from './features'
import { MainLayout } from './layouts/MainLayout'
import { HomePage } from './pages/HomePage'

// Sin sesión, cualquier ruta del marco lleva a /acceso; un rol sin permiso vuelve a su inicio.
function Protegida({ modulo, children }) {
  const { usuario, rol } = useSesion()
  const location = useLocation()
  if (!usuario) return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />
  if (modulo && !puedeVer(modulo, rol)) return <Navigate to={inicioDe(rol)} replace />
  return children
}

function App() {
  const { usuario, rol } = useSesion()
  return (
    <Routes>
      <Route path="/" element={<Navigate to={usuario ? inicioDe(rol) : '/acceso'} replace />} />
      <Route path={acceso.ruta} element={usuario ? <Navigate to={inicioDe(rol)} replace /> : <acceso.Pagina />} />
      <Route path="/estado" element={<HomePage />} />
      <Route
        element={
          <Protegida>
            <MainLayout />
          </Protegida>
        }
      >
        {modulos.map((m) => (
          <Route
            key={m.ruta}
            path={m.ruta}
            element={
              <Protegida modulo={m}>
                <m.Pagina />
              </Protegida>
            }
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
