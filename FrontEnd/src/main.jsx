import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { SesionProvider } from './context/SesionContext'
import './design-system/estilos/index.css'
import './styles/global.css'

// nicoai.bynucleo.com (o nicoai.localhost en desarrollo) abre la consola de Nico AI: la misma web
// con otro marco, solo para el superusuario. Se descarga aparte, así que no pesa en la web normal.
const ES_CONSOLA = window.location.hostname.startsWith('nicoai.')
const ConsolaApp = lazy(() => import('./consola/ConsolaApp.jsx'))
if (ES_CONSOLA) document.title = 'Nico AI'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        {ES_CONSOLA ? (
          <Suspense fallback={null}>
            <ConsolaApp />
          </Suspense>
        ) : (
          <App />
        )}
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
)
