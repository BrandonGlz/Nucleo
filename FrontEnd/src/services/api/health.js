import { apiRequest } from './client'

export function getHealth({ signal } = {}) {
  return apiRequest('/health/', { signal })
}
