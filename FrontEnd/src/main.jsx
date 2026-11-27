import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ProveedorConfirmacion } from './components/Confirmar'
import { SesionProvider } from './context/SesionContext'
import './design-system/estilos/index.css'
import './styles/fluido.css'
import './styles/global.css'
import './styles/analitica.css'
import './styles/movil.css'

// nicoai.bynucleo.com (o nicoai.localhost en desarrollo) abre la consola de Nico AI y
// admin.bynucleo.com (admin.localhost) la consola de administración: la misma web con otro marco,
// solo para el superusuario. Cada una se descarga aparte, así que no pesa en la web normal.
const HOST = window.location.hostname
const CONSOLAS = {
  'nicoai.': { titulo: 'Nico AI', App: lazy(() => import('./consola/ConsolaApp.jsx')) },
  'admin.': { titulo: 'Núcleo Admin', App: lazy(() => import('./admin/AdminApp.jsx')) },
}
const consola = Object.entries(CONSOLAS).find(([prefijo]) => HOST.startsWith(prefijo))?.[1]
if (consola) document.title = consola.titulo

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <ProveedorConfirmacion>
          {consola ? (
            <Suspense fallback={null}>
              <consola.App />
            </Suspense>
          ) : (
            <App />
          )}
        </ProveedorConfirmacion>
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
)
