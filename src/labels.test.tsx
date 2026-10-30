import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { createTestRuntime } from './test/runtime'

const NOW = new Date('2026-03-08T12:00:00.000Z').getTime()

function setup() {
  const runtime = createTestRuntime(NOW)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  return { runtime, user }
}

const createForm = () => screen.getByRole('form', { name: 'Create label' })

async function createLabel(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  colour = 'Blue',
) {
  // The create-label form lives behind the "New label" toggle.
  await user.click(screen.getByRole('button', { name: 'New label' }))

  const form = createForm()

  await user.type(
    within(form).getByRole('textbox', { name: 'New label name' }),
    name,
  )
  await user.click(within(form).getByRole('radio', { name: colour }))
  await user.click(within(form).getByRole('button', { name: 'Create label' }))
}

describe('Labels', () => {
  it('starts Unlabeled with no labels on first launch', () => {
    setup()

    expect(
      screen.getByRole('status', { name: 'Active label' }),
    ).toHaveTextContent('Unlabeled')
    expect(screen.getByText('No labels yet.')).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Labels' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(
      within(list).getByRole('button', { name: 'New label' }),
    ).toBeInTheDocument()
  })

  it('creates labels with a name and colour and lists them in creation order', async () => {
    const { user } = setup()

    await createLabel(user, 'Work', 'Blue')
    await createLabel(user, 'Rest', 'Green')

    const list = screen.getByRole('list', { name: 'Labels' })
    const items = within(list).getAllByRole('listitem')

    expect(items).toHaveLength(3)
    expect(within(items[0]).getByRole('button', { name: 'Rest' }))
      .toHaveAccessibleDescription('Green')
    expect(within(items[1]).getByRole('button', { name: 'Work' }))
      .toHaveAccessibleDescription('Blue')
    expect(
      within(items[2]).getByRole('button', { name: 'New label' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Active label' }),
    ).toHaveTextContent('Unlabeled')
  })

  it('activates a label on tap and deselects to Unlabeled on a second tap', async () => {
    const { user } = setup()

    await createLabel(user, 'Work', 'Blue')
    await createLabel(user, 'Rest', 'Green')

    const work = screen.getByRole('button', { name: 'Work' })
    const rest = screen.getByRole('button', { name: 'Rest' })
    const activeLabel = screen.getByRole('status', { name: 'Active label' })

    await user.click(work)

    expect(activeLabel).toHaveTextContent('Work')
    expect(work).toHaveAttribute('aria-pressed', 'true')

    await user.click(rest)

    expect(activeLabel).toHaveTextContent('Rest')
    expect(work).toHaveAttribute('aria-pressed', 'false')
    expect(rest).toHaveAttribute('aria-pressed', 'true')

    await user.click(rest)

    expect(activeLabel).toHaveTextContent('Unlabeled')
    expect(rest).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects labels with number keys by position and ignores digits typed into fields', async () => {
    const { user } = setup()

    await createLabel(user, 'Work')
    await createLabel(user, 'Rest')
    await createLabel(user, 'Play')

    const activeLabel = screen.getByRole('status', { name: 'Active label' })

    // Labels are sorted by name, so the number keys map to sorted positions.
    await user.keyboard('2')
    expect(activeLabel).toHaveTextContent('Rest')

    await user.keyboard('3')
    expect(activeLabel).toHaveTextContent('Work')

    await user.keyboard('9')
    expect(activeLabel).toHaveTextContent('Work')

    await user.keyboard('1')
    expect(activeLabel).toHaveTextContent('Play')

    // The create form is closed again after each create; reopen it for the typing check.
    await user.click(screen.getByRole('button', { name: 'New label' }))
    const nameInput = within(createForm()).getByRole('textbox', {
      name: 'New label name',
    })
    await user.click(nameInput)
    await user.type(nameInput, '2')

    expect(activeLabel).toHaveTextContent('Play')
  })

  it('trims label names before creating them', async () => {
    const { user } = setup()

    await createLabel(user, '  Deep work  ')

    expect(
      screen.getByRole('button', { name: 'Deep work' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '  Deep work  ' }),
    ).not.toBeInTheDocument()
  })

  it('rejects a blank label name', async () => {
    const { user } = setup()

    await createLabel(user, '   ')

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a label name.')
    expect(screen.getByText('No labels yet.')).toBeInTheDocument()
  })

  it('rejects a duplicate label name regardless of case and spacing', async () => {
    const { user } = setup()

    await createLabel(user, 'Work')
    await createLabel(user, '  work  ')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A label with that name already exists.',
    )
    expect(
      within(screen.getByRole('list', { name: 'Labels' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(2)
  })

  it('renames a label while keeping it active and in place', async () => {
    const { user } = setup()

    await createLabel(user, 'Work', 'Blue')
    await createLabel(user, 'Rest', 'Green')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    await user.click(screen.getByRole('button', { name: 'Manage labels' }))
    await user.click(screen.getByRole('button', { name: 'Edit Work' }))

    const form = screen.getByRole('form', { name: 'Edit Work' })
    const nameInput = within(form).getByRole('textbox', {
      name: 'Label name',
    })

    await user.clear(nameInput)
    await user.type(nameInput, 'Focus')
    await user.click(
      within(form).getByRole('button', { name: 'Save changes' }),
    )

    const list = screen.getByRole('list', { name: 'Labels' })
    const items = within(list).getAllByRole('listitem')

    expect(within(items[0]).getByRole('button', { name: 'Focus' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(items[1]).getByRole('button', { name: 'Rest' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      screen.getByRole('status', { name: 'Active label' }),
    ).toHaveTextContent('Focus')
  })

  it('recolours a label everywhere it appears', async () => {
    const { user } = setup()

    await createLabel(user, 'Work', 'Blue')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    await user.click(screen.getByRole('button', { name: 'Manage labels' }))
    await user.click(screen.getByRole('button', { name: 'Edit Work' }))

    const form = screen.getByRole('form', { name: 'Edit Work' })

    await user.click(within(form).getByRole('radio', { name: 'Amber' }))
    await user.click(
      within(form).getByRole('button', { name: 'Save changes' }),
    )

    expect(
      screen.getByRole('button', { name: 'Work' }),
    ).toHaveAccessibleDescription('Amber')
    expect(
      screen.getByRole('status', { name: 'Active label' }),
    ).toHaveAccessibleDescription('Amber')
  })

  it('rejects a rename that is blank or duplicates another label', async () => {
    const { user } = setup()

    await createLabel(user, 'Work')
    await createLabel(user, 'Rest')
    await user.click(screen.getByRole('button', { name: 'Manage labels' }))
    await user.click(screen.getByRole('button', { name: 'Edit Work' }))

    const form = screen.getByRole('form', { name: 'Edit Work' })
    const nameInput = within(form).getByRole('textbox', {
      name: 'Label name',
    })

    await user.clear(nameInput)
    await user.type(nameInput, '   ')
    await user.click(
      within(form).getByRole('button', { name: 'Save changes' }),
    )

    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Enter a label name.',
    )

    await user.clear(nameInput)
    await user.type(nameInput, 'rest')
    await user.click(
      within(form).getByRole('button', { name: 'Save changes' }),
    )

    expect(within(form).getByRole('alert')).toHaveTextContent(
      'A label with that name already exists.',
    )
    expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument()
  })
})
