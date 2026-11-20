import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { OrchestratorSnapshot, Run } from '../types'
import { useOrchestratorStore } from '../store'
import { OrchestratorDock } from './orchestrator-dock'

const timestamp = '2026-01-01T00:00:00.000Z'

afterEach(() => {
  useOrchestratorStore.setState({
    snapshot: OrchestratorSnapshot.parse({}),
    activeRunId: null,
    messages: [],
    error: null,
    busy: false,
  })
})

describe('OrchestratorDock', () => {
  it('renders an empty run state without a render loop', async () => {
    const { getByText, getByPlaceholder } = await render(<OrchestratorDock />)

    await expect.element(getByText('Orchestrator', { exact: true })).toBeInTheDocument()
    await expect
      .element(getByPlaceholder('Jelaskan pekerjaan untuk orchestrator…'))
      .toBeInTheDocument()
  })

  it('keeps Approve disabled until the plan is ready', async () => {
    const run = Run.parse({
      id: 'run-test',
      request: 'Buat landing page',
      projectRoot: 'C:/repo',
      state: 'draft',
      settings: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    useOrchestratorStore.setState({
      snapshot: OrchestratorSnapshot.parse({ runs: [run] }),
      activeRunId: run.id,
    })

    const { getByRole, getByText } = await render(<OrchestratorDock />)

    await expect.element(getByText('Buat rencana', { exact: true })).toBeInTheDocument()
    await expect
      .element(getByRole('button', { name: 'Approve & run' }))
      .toBeDisabled()
  })
})
