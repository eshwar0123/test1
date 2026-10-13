import { useEffect } from 'react'

/**
 * Auto clears alert message after given delay
 * @param msg { type, text }
 * @param setMsg setter
 * @param delay milliseconds (default 3000)
 */
export default function useAutoDismissAlert(msg, setMsg, delay = 3000) {
  useEffect(() => {
    if (!msg?.text) return

    const timer = setTimeout(() => {
      setMsg({ type: '', text: '' })
    }, delay)

    return () => clearTimeout(timer)
  }, [msg?.text, delay, setMsg])
}
