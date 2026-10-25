import { formatDateTime } from '../utils/formatDate'

const statusContent = {
  checking: {
    title: 'Comprobando la API…',
    description: 'Consultando el endpoint de salud del backend.',
  },
  online: {
    title: 'API disponible',
    description: 'El frontend se comunicó correctamente con el backend.',
  },
  offline: {
    title: 'API no disponible',
    description: 'Revisa que Django esté ejecutándose y que la URL sea correcta.',
  },
}

export function HealthStatusCard({ status, data, error, onRefresh }) {
  const content = statusContent[status] ?? statusContent.checking
  const isChecking = status === 'checking'

  return (
    <section className={`status-card status-card--${status}`} aria-live="polite">
      <div className="status-card__heading">
        <span className="status-card__indicator" aria-hidden="true" />
        <div>
          <p className="eyebrow">Backend</p>
          <h2>{content.title}</h2>
        </div>
      </div>

      <p className="status-card__description">{content.description}</p>

      {error && (
        <p className="status-card__error" role="alert">
          {error}
        </p>
      )}

      {data && (
        <dl className="status-card__details">
          <div>
            <dt>Servicio</dt>
            <dd>{data.service}</dd>
          </div>
          <div>
            <dt>Versión</dt>
            <dd>{data.version}</dd>
          </div>
          <div>
            <dt>Última respuesta</dt>
            <dd>{formatDateTime(data.timestamp)}</dd>
          </div>
        </dl>
      )}

      <button
        className="button"
        type="button"
        onClick={onRefresh}
        disabled={isChecking}
      >
        {isChecking ? 'Comprobando…' : 'Volver a comprobar'}
      </button>
    </section>
  )
}
