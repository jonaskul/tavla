import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ToastProvider, notify } from './components/Toast'
import { errorMessage } from './api/errors'
import './index.css'
import { t } from './i18n/no'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
  // Catches every mutation that does not handle its own error. Adding
  // onError to each of the forty-odd mutations instead is the same "remember
  // it everywhere" pattern that has already failed twice in this codebase;
  // three quarters of them had no handler and failed in silence. Mutations
  // that do define onError still show it inline, which is better — this is
  // only the floor.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return
      notify(errorMessage(error, {}, t.common.unknownError))
    },
  }),
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
