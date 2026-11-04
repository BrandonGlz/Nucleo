import { HEALTH } from '../../api'
import { apiRequest } from './client'

export function getHealth({ signal } = {}) {
  return apiRequest(HEALTH, { signal })
}
