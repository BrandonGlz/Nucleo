import { useCallback, useEffect, useState } from 'react'
import { getHealth } from '../services/api/health'

const initialState = {
  status: 'checking',
  data: null,
  error: null,
}

export function useHealthCheck() {
  const [result, setResult] = useState(initialState)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    getHealth({ signal: controller.signal })
      .then((data) => {
        setResult({ status: 'online', data, error: null })
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          return
        }
        setResult({ status: 'offline', data: null, error: error.message })
      })

    return () => controller.abort()
  }, [attempt])

  const refresh = useCallback(() => {
    setResult((current) => ({ ...current, status: 'checking', error: null }))
    setAttempt((current) => current + 1)
  }, [])

  return { ...result, refresh }
}
