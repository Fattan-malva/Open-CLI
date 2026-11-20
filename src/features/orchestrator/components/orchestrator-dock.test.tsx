import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { OrchestratorDock } from './orchestrator-dock'

describe('OrchestratorDock', () => {
  it('renders an empty run state without a render loop', async () => {
    const { getByText, getByPlaceholder } = await render(<OrchestratorDock />)

    await expect.element(getByText('Orchestrator', { exact: true })).toBeInTheDocument()
    await expect
      .element(getByPlaceholder('Jelaskan pekerjaan untuk orchestrator…'))
      .toBeInTheDocument()
  })
})
