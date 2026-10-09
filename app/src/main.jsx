import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/styles/index.css'

// The user's own Fontbit fonts. The stylesheet is generated locally and is not in the public repo;
// when it is missing the app falls back to the free fonts.
import.meta.glob('./styles/*.local.css', { eager: true })

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
