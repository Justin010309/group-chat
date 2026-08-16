import { useState } from 'react'
import { Login } from './pages/Login'
import { useSessionStore } from './stores/session'

function App(): React.JSX.Element {
  const token = useSessionStore((s) => s.token)
  const [ready, setReady] = useState(!!token)

  if (!ready) return <Login onSuccess={() => setReady(true)} />
  return <div>Chat 页面（Phase B 实现）</div>
}

export default App
