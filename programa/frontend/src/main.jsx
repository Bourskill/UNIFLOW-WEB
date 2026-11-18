import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Arranque } from './componentes/Arranque.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Arranque>
      <App />
    </Arranque>
  </StrictMode>,
)
