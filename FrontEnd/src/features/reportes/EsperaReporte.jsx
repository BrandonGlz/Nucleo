import { Check } from 'lucide-react'
import { Badge, Button } from '../../design-system/componentes/index.js'
import { medidaHoja } from './medidas'
import { VisorHoja } from './VisorHoja'

const PASOS = ['Reuniendo lecturas', 'Calculando cifras', 'Redactando con IA', 'Armando PDF']

function Pasos({ paso }) {
  return (
    <ol className="ui-espera__pasos" aria-label="Pasos de generación">
      {PASOS.map((texto, i) => {
        const numero = i + 1
        const hecho = numero < paso
        const actual = numero === paso
        return (
          <li
            key={texto}
            className={hecho ? 'is-hecho' : actual ? 'is-actual' : 'is-pendiente'}
            data-paso={numero}
            data-actual={actual ? 'true' : undefined}
          >
            <span className="ui-espera__marca" aria-hidden>
              {hecho ? <Check size={13} /> : actual ? <span className="ui-espera__spinner" /> : null}
            </span>
            <span>{texto}</span>
          </li>
        )
      })}
    </ol>
  )
}

// Hoja esqueleto de un reporte que se está generando, con el paso real del procesador.
export function EsperaReporte({ reporte, onRepetir }) {
  const conf = reporte.formato_conf ?? {}
  const hoja = { tamano: 'carta', orientacion: 'vertical', ...(conf.hoja ?? {}) }
  const medida = medidaHoja(hoja)
  const paso = Math.min(4, Math.max(1, Number(reporte.paso) || 1))
  const fallo = reporte.estado === 'FALLO'
  return (
    <div className={`ui-espera${fallo ? ' is-fallo' : ''}`}>
      <VisorHoja className="ui-espera__visor">
        <article
          className="ui-hoja ui-hoja--espera"
          style={{ width: medida.ancho, minHeight: medida.alto }}
          aria-label="Generando reporte"
        >
          <div className="ui-esqueleto__membrete">
            <span className="ui-esqueleto__bloque" style={{ width: 126, height: 10 }} />
            <span className="ui-esqueleto__bloque" style={{ width: 176, height: 10 }} />
            <span className="ui-esqueleto__bloque" style={{ width: 68, height: 10, marginLeft: 'auto' }} />
          </div>
          <div className="ui-esqueleto__titulo">
            <span className="ui-esqueleto__bloque" style={{ width: '54%', height: 24 }} />
            <span className="ui-esqueleto__bloque" style={{ width: '32%', height: 12 }} />
          </div>
          <div className="ui-esqueleto__ficha">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="ui-esqueleto__bloque" style={{ height: 10 }} />
            ))}
          </div>
          <div className="ui-esqueleto__cifras">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="ui-esqueleto__cifra">
                <span className="ui-esqueleto__bloque" style={{ width: '52%', height: 8 }} />
                <span className="ui-esqueleto__bloque" style={{ width: '72%', height: 18 }} />
              </div>
            ))}
          </div>
          <div className="ui-esqueleto__rejilla">
            {[0, 1, 2].map((i) => (
              <div key={i} className="ui-esqueleto__tarjeta">
                <span className="ui-esqueleto__bloque" style={{ width: '42%', height: 8 }} />
                <span className="ui-esqueleto__bloque" style={{ width: '76%', height: 16 }} />
                <span className="ui-esqueleto__bloque" style={{ width: '100%', height: 8 }} />
              </div>
            ))}
          </div>
          <div className="ui-esqueleto__texto">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="ui-esqueleto__bloque"
                style={{ width: i === 3 ? '62%' : '100%', height: 10 }}
              />
            ))}
          </div>
        </article>
      </VisorHoja>
      <div className="ui-espera__pie">
        {fallo ? (
          <div className="ui-espera__fallo">
            <Badge tone="danger" icon="triangle-alert">
              Falló
            </Badge>
            <p className="ui-muted">{reporte.error || 'El reporte no se pudo generar.'}</p>
            <Button size="sm" icon="refresh-cw" onClick={onRepetir}>
              Generar de nuevo
            </Button>
          </div>
        ) : (
          <Pasos paso={paso} />
        )}
      </div>
    </div>
  )
}
