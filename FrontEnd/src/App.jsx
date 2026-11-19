import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSesion } from './context/SesionContext'
import { acceso, inicioDe, modulos, puedeVer, recuperar, solicitarAcceso } from './features'
import { MainLayout } from './layouts/MainLayout'
import { HomePage } from './pages/HomePage'

// Sin sesión, cualquier ruta del marco lleva a /acceso; un rol sin permiso vuelve a su inicio.
// Con la verificación en dos pasos pendiente (la exige el rol) o una contraseña temporal por cambiar,
// solo se puede abrir el perfil.
function Protegida({ modulo, children }) {
  const { usuario, rol, segundoFactorPendiente } = useSesion()
  const location = useLocation()
  if (!usuario) return <Navigate to="/acceso" replace state={{ desde: location.pathname }} />
  const pendiente = segundoFactorPendiente || usuario.debe_cambiar_password
  if (pendiente && modulo && modulo.ruta !== '/perfil') return <Navigate to="/perfil" replace />
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
      {/* Recuperar la contraseña: pedir el enlace (/recuperar) y usarlo (/restablecer?uid&token) */}
      {['/recuperar', '/restablecer'].map((ruta) => (
        <Route
          key={ruta}
          path={ruta}
          element={
            <Suspense fallback={<div className="ui-cargando-seccion" aria-busy="true" />}>
              <recuperar.Pagina />
            </Suspense>
          }
        />
      ))}
      <Route
        path={solicitarAcceso.ruta}
        element={
          usuario ? (
            <Navigate to={inicioDe(rol)} replace />
          ) : (
            <Suspense fallback={<div className="ui-cargando-seccion" aria-busy="true" />}>
              <solicitarAcceso.Pagina />
            </Suspense>
          )
        }
      />
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
                <Suspense fallback={<div className="ui-cargando-seccion" aria-busy="true" />}>
                  <m.Pagina />
                </Suspense>
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
