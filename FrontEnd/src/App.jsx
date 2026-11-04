import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSesion } from './context/SesionContext'
import { acceso, modulos } from './features'
import { MainLayout } from './layouts/MainLayout'
import { HomePage } from './pages/HomePage'

// Sin sesión, cualquier ruta del marco lleva a /acceso; un rol sin permiso vuelve al panel.
function Protegida({ roles, children }) {
  const { usuario, rol } = useSesion()
  const location = useLocation()
  if (!usuario) return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />
  if (roles && !roles.includes(rol)) return <Navigate to="/panel" replace />
  return children
}

function App() {
  const { usuario } = useSesion()
  return (
    <Routes>
      <Route path="/" element={<Navigate to={usuario ? '/panel' : '/acceso'} replace />} />
      <Route path={acceso.ruta} element={usuario ? <Navigate to="/panel" replace /> : <acceso.Pagina />} />
      <Route path="/estado" element={<HomePage />} />
      <Route
        element={
          <Protegida>
            <MainLayout />
          </Protegida>
        }
      >
        {modulos.map(({ ruta, Pagina, roles }) => (
          <Route
            key={ruta}
            path={ruta}
            element={
              <Protegida roles={roles}>
                <Pagina />
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
