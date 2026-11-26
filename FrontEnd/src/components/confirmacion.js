const porOmision = {
  confirmar: () => Promise.resolve(false),
  aviso: () => {},
}
let control = porOmision

// Confirmación con el diseño de Núcleo. Devuelve una promesa true/false.
export const confirmar = (opciones) => control.confirmar(opciones)
// Aviso breve con el Toast existente; se cierra solo a los 5 s.
export const aviso = (texto, opciones) => control.aviso(texto, opciones)

// El proveedor registra sus funciones al montarse; al desmontarse vuelve al no-op.
export function registrarControl(nuevo) {
  control = nuevo
  return () => {
    if (control === nuevo) control = porOmision
  }
}
