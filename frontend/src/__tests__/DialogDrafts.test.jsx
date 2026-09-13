/**
 * A dialog must not throw away what the user is typing.
 *
 * PropertyDetail, PanelDetail and CircuitDetail hand their dialogs live
 * query data. The reset effect used to depend on that object, so any
 * refetch returning a different object re-seeded the form. Structural
 * sharing keeps the identity stable while nothing has changed, which is why
 * this never showed up in ordinary use — but the moment a colleague edits
 * the same record, or any refetch returns different data, the draft
 * disappeared mid-sentence with nothing said about it.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import PropertyDialog from '../components/PropertyDialog'

const noop = () => {}

test('et nytt objekt for samme rad beholder utkastet', async () => {
  const first = { id: 1, name: 'Opprinnelig', address: 'Veien 1' }
  const refetched = { id: 1, name: 'Opprinnelig', address: 'Veien 1' }

  const { rerender } = render(
    <PropertyDialog open initial={first} onSave={noop} onClose={noop} />
  )
  await userEvent.clear(screen.getByLabelText(/navn/i))
  await userEvent.type(screen.getByLabelText(/navn/i), 'Mitt utkast')

  rerender(<PropertyDialog open initial={refetched} onSave={noop} onClose={noop} />)

  expect(screen.getByLabelText(/navn/i)).toHaveValue('Mitt utkast')
})

test('utkastet overlever selv om noen andre endrer raden', async () => {
  const mine = { id: 1, name: 'Opprinnelig', address: 'Veien 1' }
  const theirs = { id: 1, name: 'Endret av en kollega', address: 'Veien 1' }

  const { rerender } = render(
    <PropertyDialog open initial={mine} onSave={noop} onClose={noop} />
  )
  await userEvent.clear(screen.getByLabelText(/navn/i))
  await userEvent.type(screen.getByLabelText(/navn/i), 'Mitt utkast')

  rerender(<PropertyDialog open initial={theirs} onSave={noop} onClose={noop} />)

  // Their change is not silently pasted over what is being typed. Losing
  // unsaved work is the worse of the two failures.
  expect(screen.getByLabelText(/navn/i)).toHaveValue('Mitt utkast')
})

test('en annen rad fyller skjemaet på nytt', async () => {
  const one = { id: 1, name: 'Første', address: 'Veien 1' }
  const two = { id: 2, name: 'Andre', address: 'Veien 2' }

  const { rerender } = render(
    <PropertyDialog open initial={one} onSave={noop} onClose={noop} />
  )
  await userEvent.type(screen.getByLabelText(/navn/i), ' endret')

  rerender(<PropertyDialog open initial={two} onSave={noop} onClose={noop} />)

  expect(screen.getByLabelText(/navn/i)).toHaveValue('Andre')
})
