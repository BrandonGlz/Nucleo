import React from 'react'

// Indicador que se desliza hasta la opción elegida (Tabs, PeriodFilter, ChipFilter). Mide la posición
// real del botón activo dentro de la caja (offsetLeft/Top y su tamaño) y vuelve a medir al cambiar el
// tamaño de la caja o de cualquier opción. La primera vez se coloca sin animar; después cada cambio se
// desliza (la clase «is-deslizando» activa la transición en CSS).
//   activo: selector de la opción elegida; opciones: selector de todas; deps: cuándo volver a medir.
function useIndicadorDeslizante(activo, opciones, deps) {
  var caja = React.useRef(null);
  const [medida, setMedida] = React.useState(null);
  const [deslizar, setDeslizar] = React.useState(false);

  React.useLayoutEffect(function () {
    var el = caja.current;
    if (!el) return undefined;
    function medir() {
      var b = el.querySelector(activo);
      setMedida(function (prev) {
        if (!b) return null;
        var m = { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight };
        return prev && prev.x === m.x && prev.y === m.y && prev.w === m.w && prev.h === m.h ? prev : m;
      });
    }
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    var ro = new ResizeObserver(medir);
    ro.observe(el);
    el.querySelectorAll(opciones).forEach(function (b) { ro.observe(b); });
    return function () { ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(function () {
    if (!medida || deslizar) return undefined;
    var id = requestAnimationFrame(function () { setDeslizar(true); });
    return function () { cancelAnimationFrame(id); };
  }, [medida, deslizar]);

  return { caja: caja, medida: medida, deslizar: deslizar };
}

// Estilo del indicador: ancho, alto y posición de la opción medida.
function estiloIndicador(m) {
  return { width: m.w, height: m.h, transform: 'translate(' + m.x + 'px, ' + m.y + 'px)' };
}

export { useIndicadorDeslizante, estiloIndicador }
