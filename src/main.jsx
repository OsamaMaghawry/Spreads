import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import ErrorBoundary from '@/components/common/ErrorBoundary.jsx'
import '@/index.css'

// The outermost net. Anything that escapes the boundaries further in lands
// here instead of unmounting the document and leaving a white screen with no
// message and no way back -- which is what a trader got when the close ticket
// threw. Padded, because at this level there is no Layout around it.
ReactDOM.createRoot(document.getElementById('root')).render(
  <div>
    <ErrorBoundary label="the app">
      <App />
    </ErrorBoundary>
  </div>
)
