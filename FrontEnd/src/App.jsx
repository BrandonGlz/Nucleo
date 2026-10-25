import { Route, Routes } from 'react-router-dom'
import { modulos } from './features'
import { MainLayout } from './layouts/MainLayout'
import { HomePage } from './pages/HomePage'

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {modulos.map(({ ruta, Pagina }) => (
          <Route key={ruta} path={ruta} element={<Pagina />} />
        ))}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </MainLayout>
  )
}

export default App
