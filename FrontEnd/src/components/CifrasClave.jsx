import { LogoMark } from '../design-system/componentes/index.js'

// Tarjeta oscura de cifras clave que abre cada pantalla (clase nc-ink).
// principal: { etiqueta, valor, unidad, titulo, sub, tonoValor, tonoUnidad, tonoSub }
// barra: { desde, ancho, marca } en porcentaje · cifras: [{ etiqueta, valor, unidad, sub, tono }]
// Los tonos son lima, peligro, tenue, apagado o claro.
const tono = (t) => (t ? `tono-${t}` : undefined)

export function CifrasClave({ principal, barra, cifras = [] }) {
  return (
    <section className="nc-ink" data-theme="dark" aria-label="Cifras clave">
      <div className="nc-ink__deco" style={{ right: -180, top: -250, width: 480, height: 480 }} />
      <div className="nc-ink__deco" style={{ right: -100, top: -170, width: 320, height: 320 }} />
      <div className="nc-ink__deco" style={{ right: -50, bottom: -70, border: 0, opacity: 0.16 }}>
        <LogoMark tone="lima" size={180} />
      </div>

      <div className="nc-ink__principal">
        <span className="ui-eyebrow">{principal.etiqueta}</span>
        {principal.valor != null && (
          <div className={`nc-ink__valor ${tono(principal.tonoValor) ?? ''}`}>
            {principal.valor}
            {principal.unidad && (
              <span className={`nc-ink__unidad ${tono(principal.tonoUnidad) ?? ''}`}> {principal.unidad}</span>
            )}
          </div>
        )}
        {principal.titulo && <div className="nc-ink__titulo">{principal.titulo}</div>}
        {barra && (
          <div className="nc-ink__barra">
            <div className="nc-ink__banda" style={{ left: `${barra.desde}%`, width: `${barra.ancho}%` }} />
            <div className="nc-ink__marca" style={{ left: `${barra.marca}%` }} />
          </div>
        )}
        {principal.sub && <span className={`nc-ink__sub ${tono(principal.tonoSub) ?? ''}`}>{principal.sub}</span>}
      </div>

      <div style={{ flex: 1 }} />
      {cifras.map((c) => (
        <div key={c.etiqueta} className="nc-ink__cifra">
          <span className="ui-eyebrow">{c.etiqueta}</span>
          <div className={`nc-ink__cifra-valor ${tono(c.tono) ?? ''}`}>
            {c.valor}
            {c.unidad && <span className="nc-ink__cifra-unidad"> {c.unidad}</span>}
          </div>
          {c.sub && <span className="nc-ink__cifra-sub">{c.sub}</span>}
        </div>
      ))}
    </section>
  )
}
