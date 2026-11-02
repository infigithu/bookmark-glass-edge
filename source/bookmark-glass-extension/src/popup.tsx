import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import Popup from './pages/Popup'

createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup /></React.StrictMode>)
