import { HealthStatusCard } from '../components/HealthStatusCard'
import { useHealthCheck } from '../hooks/useHealthCheck'
import { API_BASE_URL } from '../services/api/client'

export function HomePage() {
  const { status, data, error, refresh } = useHealthCheck()

  return (
    <section className="home">
      <div className="home__intro">
        <p className="eyebrow">Entorno de desarrollo</p>
        <h1>Núcleo está funcionando</h1>
        <p className="home__lead">
          Base inicial para la gestión y el monitoreo del ambiente. El frontend
          está preparado para consumir la API de Django, mientras el firmware IoT
          y PostgreSQL completan el entorno local.
        </p>
      </div>

      <div className="home__grid">
        <HealthStatusCard
          status={status}
          data={data}
          error={error}
          onRefresh={refresh}
        />

        <article className="info-card">
          <p className="eyebrow">Configuración</p>
          <h2>Endpoint de la API</h2>
          <code className="endpoint">{API_BASE_URL}</code>
          <p>
            La URL se define con <code>VITE_API_BASE_URL</code>. El frontend
            consulta <code>/health/</code> al cargar esta pantalla.
          </p>
          <ul className="next-steps">
            <li>Backend Django y PostgreSQL se inician por separado.</li>
            <li>Las credenciales viven en archivos <code>.env</code> locales.</li>
            <li>El firmware ESP32 se compila de forma independiente.</li>
          </ul>
        </article>
      </div>
    </section>
  )
}
