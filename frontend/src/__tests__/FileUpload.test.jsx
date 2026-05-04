import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FileUpload from '../components/FileUpload'
import * as api from '../api/client'

function wrapper(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(api, 'getConnectionPointFiles').mockResolvedValue([])
})

it('viser feilmelding ved ugyldig filtype', async () => {
  wrapper(<FileUpload connectionPointId={1} onUploaded={() => {}} />)
  const file = new File(['content'], 'virus.exe', { type: 'application/octet-stream' })
  const input = screen.getByTestId('file-input')
  await userEvent.upload(input, file)
  expect(screen.getByText(/filtype ikke støttet/i)).toBeInTheDocument()
})

it('viser feilmelding ved fil over 20 MB', async () => {
  wrapper(<FileUpload connectionPointId={1} onUploaded={() => {}} />)
  const largeContent = new Uint8Array(21 * 1024 * 1024)
  const file = new File([largeContent], 'stor.jpg', { type: 'image/jpeg' })
  const input = screen.getByTestId('file-input')
  await userEvent.upload(input, file)
  expect(screen.getByText(/for stor/i)).toBeInTheDocument()
})

it('kaller onUploaded ved vellykket opplasting', async () => {
  const onUploaded = vi.fn()
  vi.spyOn(api, 'uploadFile').mockResolvedValue({ id: 1, filename: 'test.jpg' })
  wrapper(<FileUpload connectionPointId={1} onUploaded={onUploaded} />)
  const file = new File(['fake jpeg'], 'test.jpg', { type: 'image/jpeg' })
  const input = screen.getByTestId('file-input')
  await userEvent.upload(input, file)
  await waitFor(() => expect(onUploaded).toHaveBeenCalled())
})

describe('FileUpload — accepted types', () => {
  it('accepts image/jpeg without error', async () => {
    vi.spyOn(api, 'uploadFile').mockResolvedValue({ id: 2, filename: 'photo.jpg' })
    wrapper(<FileUpload connectionPointId={1} />)
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByTestId('file-input'), file)
    expect(screen.queryByText(/filtype ikke støttet/i)).not.toBeInTheDocument()
  })

  it('accepts image/png without error', async () => {
    vi.spyOn(api, 'uploadFile').mockResolvedValue({ id: 3, filename: 'img.png' })
    wrapper(<FileUpload connectionPointId={1} />)
    const file = new File(['data'], 'img.png', { type: 'image/png' })
    await userEvent.upload(screen.getByTestId('file-input'), file)
    expect(screen.queryByText(/filtype ikke støttet/i)).not.toBeInTheDocument()
  })

  it('accepts application/pdf without error', async () => {
    vi.spyOn(api, 'uploadFile').mockResolvedValue({ id: 4, filename: 'doc.pdf' })
    wrapper(<FileUpload connectionPointId={1} />)
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByTestId('file-input'), file)
    expect(screen.queryByText(/filtype ikke støttet/i)).not.toBeInTheDocument()
  })

  it('rejects text/plain with Norwegian error', async () => {
    wrapper(<FileUpload connectionPointId={1} />)
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    await userEvent.upload(screen.getByTestId('file-input'), file)
    expect(screen.getByText(/filtype ikke støttet/i)).toBeInTheDocument()
  })
})
