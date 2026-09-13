/**
 * Failures have to be visible.
 *
 * The bug that started this: deleting equipment failed with a 500 and the
 * UI said "Kunne ikke slette utstyret." — the same sentence it shows when a
 * business rule refuses the delete. The user could not tell whether to
 * change something or to report something.
 *
 * Three quarters of the mutations in this app had no onError at all, so
 * they failed in complete silence.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { errorMessage } from '../api/errors'
import { ToastProvider, notify } from '../components/Toast'
import { t } from '../i18n/no'
import * as api from '../api/client'
import Properties from '../pages/Properties'

function axiosError(status, detail) {
  const err = new Error('request failed')
  if (status) err.response = { status, data: detail === undefined ? {} : { detail } }
  return err
}

describe('errorMessage', () => {
  test('a caller message wins for a status it expects', () => {
    const msg = errorMessage(axiosError(409, 'Cannot delete'), { 409: 'Kan ikke slette' }, 'fallback')
    expect(msg).toBe('Kan ikke slette')
  })

  test('a crash is distinguishable from a refusal', () => {
    const refusal = errorMessage(axiosError(409), { 409: 'Kan ikke slette' }, 'fallback')
    const crash = errorMessage(axiosError(500), { 409: 'Kan ikke slette' }, 'fallback')

    expect(refusal).not.toBe(crash)
    expect(crash).toBe(t.common.serverError)
  })

  test('no response at all reads as a network problem', () => {
    expect(errorMessage(axiosError(null), {}, 'fallback')).toBe(t.common.networkError)
  })

  test('an expired session says so', () => {
    expect(errorMessage(axiosError(401), {}, 'fallback')).toBe(t.common.notSignedIn)
  })

  test('an unexpected status falls back to the server detail', () => {
    // English, but it describes a case nobody anticipated, which the user
    // can at least report. Better than a generic shrug.
    expect(errorMessage(axiosError(418, 'Teapot refused'), {}, 'fallback')).toBe('Teapot refused')
  })

  test('FastAPI validation errors are unwrapped', () => {
    const err = new Error('x')
    err.response = { status: 422, data: { detail: [{ msg: 'Feltet er påkrevd' }] } }
    expect(errorMessage(err, {}, 'fallback')).toBe('Feltet er påkrevd')
  })

  test('a status with no detail uses the caller fallback', () => {
    expect(errorMessage(axiosError(400), {}, 'Kunne ikke lagre')).toBe('Kunne ikke lagre')
  })
})

describe('the toast floor', () => {
  test('a mutation with no onError still surfaces', async () => {
    // Exactly the MutationCache wiring from main.jsx.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      mutationCache: new MutationCache({
        onError: (error, _v, _c, mutation) => {
          if (mutation.options.onError) return
          notify(errorMessage(error, {}, t.common.unknownError))
        },
      }),
    })

    vi.spyOn(api, 'getProperties').mockResolvedValue([])
    // createProperty has no onError in Properties.jsx, so before the
    // MutationCache this failure produced nothing on screen at all.
    vi.spyOn(api, 'createProperty').mockRejectedValue(axiosError(500))

    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>
            <Properties />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )

    await userEvent.click(await screen.findByText(t.property.add))
    await userEvent.type(screen.getByLabelText(/navn/i), 'Testbolig')
    await userEvent.type(screen.getByLabelText(/adresse/i), 'Testveien 1')
    await userEvent.click(screen.getByText(t.common.save))

    await waitFor(() => expect(screen.getByTestId('toast')).toBeInTheDocument())
    expect(screen.getByTestId('toast')).toHaveTextContent(t.common.serverError)
  })
})
