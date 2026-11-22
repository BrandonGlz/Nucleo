import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../../design-system/componentes/index.js'
import { useSesion } from '../../context/SesionContext'
import * as auth from '../../services/auth'
import { fotoDe } from '../../utils/foto'

const TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const MAXIMO = 5 * 1024 * 1024 // la API rechaza más de 5 MB

const mensaje = (err, porDefecto) => err?.datos?.foto?.[0] || err?.datos?.detail || porDefecto

// Foto de perfil en «Datos de la cuenta»: avatar grande, «Cambiar foto» (elige, muestra la vista
// previa y la sube) y «Quitar foto». La API la recorta a 256×256; el usuario de la sesión se
// actualiza para que el encabezado y el menú la muestren al instante.
export function FotoPerfil({ nombre, size = 64 }) {
  const { usuario, actualizarUsuario } = useSesion()
  const entrada = useRef(null)
  const [previa, setPrevia] = useState(null)
  const [estado, setEstado] = useState(null) // 'subiendo' | 'quitando' | null
  const [error, setError] = useState('')

  // La URL temporal de la vista previa se libera al cambiarla o al salir.
  useEffect(() => () => previa && URL.revokeObjectURL(previa), [previa])

  const ocupado = estado !== null
  const foto = previa || fotoDe(usuario)

  async function elegir(e) {
    const archivo = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!archivo) return
    setError('')
    if (!TIPOS.includes(archivo.type)) {
      setError('Elige una imagen JPEG, PNG o WebP.')
      return
    }
    if (archivo.size > MAXIMO) {
      setError('La foto no puede pasar de 5 MB.')
      return
    }
    setPrevia(URL.createObjectURL(archivo))
    setEstado('subiendo')
    try {
      actualizarUsuario(await auth.subirFoto(archivo))
    } catch (err) {
      setError(mensaje(err, 'No se pudo subir la foto. Inténtalo de nuevo.'))
    } finally {
      setPrevia(null)
      setEstado(null)
    }
  }

  async function quitar() {
    setError('')
    setEstado('quitando')
    try {
      actualizarUsuario(await auth.quitarFoto())
    } catch (err) {
      setError(mensaje(err, 'No se pudo quitar la foto. Inténtalo de nuevo.'))
    } finally {
      setEstado(null)
    }
  }

  return (
    <div className="foto-perfil">
      <div className={`foto-perfil__marco${ocupado ? ' is-cargando' : ''}`} aria-busy={ocupado || undefined}>
        {/* `key`: con otra foto el avatar vuelve a intentar cargarla (y a caer en las iniciales si falla). */}
        <Avatar key={foto || 'iniciales'} name={nombre} src={foto} size={size} />
        {ocupado && <span className="foto-perfil__giro" aria-hidden="true" />}
      </div>
      <div className="foto-perfil__acciones">
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={elegir}
        />
        <button type="button" className="ui-link" disabled={ocupado} onClick={() => entrada.current?.click()}>
          {estado === 'subiendo' ? 'Subiendo…' : usuario?.foto_url ? 'Cambiar foto' : 'Subir foto'}
        </button>
        {usuario?.foto_url && !previa && (
          <button type="button" className="ui-link foto-perfil__quitar" disabled={ocupado} onClick={quitar}>
            {estado === 'quitando' ? 'Quitando…' : 'Quitar foto'}
          </button>
        )}
      </div>
      {error && (
        <span className="foto-perfil__error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
