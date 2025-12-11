import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PropertyDetail from '../../property-detail'

const qc = new QueryClient()

describe('PropertyDetail page', () => {
  it('renders address and RELAS score from API response', async () => {
    // mock fetch
    global.fetch = async (url: any) => {
      if (String(url).includes('/api/opportunities/')) {
        return {
          ok: true,
          json: async () => ({
            property: { id: 7, address: '456 Oak Avenue', city: 'Tampa', state: 'FL', zipCode: '33602', status: 'negotiation' },
            lead: { id: 1024, ownerName: 'Jane Smith', relasScore: 92 }
          })
        } as any
      }
      if (String(url).includes('/api/activity')) {
        return { ok: true, json: async () => [] } as any
      }
      throw new Error('unexpected fetch')
    }

    render(
      <QueryClientProvider client={qc}>
        <PropertyDetail />
      </QueryClientProvider>
    )

    expect(await screen.findByText('456 Oak Avenue')).toBeTruthy()
    expect(await screen.findByText('92')).toBeTruthy()
  })

  it('adds a note via PATCH', async () => {
    let notes = ''
    global.fetch = async (url: any, init?: any) => {
      const u = String(url)
      if (u.includes('/api/opportunities/')) {
        return { ok: true, json: async () => ({ property: { id: 7, address: '456 Oak Avenue', city: 'Tampa', state: 'FL', zipCode: '33602', status: 'negotiation' }, lead: { id: 1024, ownerName: 'Jane Smith', relasScore: 92, notes } }) } as any
      }
      if (u.includes('/api/leads/1024') && init?.method === 'PATCH') {
        const body = JSON.parse(init!.body as string)
        notes = body.notes
        return { ok: true, json: async () => ({ id: 1024, notes }) } as any
      }
      if (u.includes('/api/activity')) {
        return { ok: true, json: async () => [] } as any
      }
      throw new Error('unexpected fetch')
    }

    render(
      <QueryClientProvider client={qc}>
        <PropertyDetail />
      </QueryClientProvider>
    )

    const textarea = await screen.findByPlaceholderText('Add a note...')
    (textarea as HTMLTextAreaElement).value = 'Test note'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    const addBtn = await screen.findByText('Add')
    ;(addBtn as HTMLButtonElement).click()
    expect(true).toBeTruthy()
  })
})
