import { onlineManager } from '@tanstack/react-query'

import { createQueryClient } from '@/calendar-data/query-client'
import { ApiFailure } from '@/lib/api'

afterEach(() => {
  onlineManager.setOnline(true)
})

describe('the query client offline', () => {
  it('fails a write at once rather than pausing it until the connection returns', async () => {
    onlineManager.setOnline(false)
    const client = createQueryClient()
    const write = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new ApiFailure('network', 0, null)),
    })

    await expect(write.execute(undefined)).rejects.toMatchObject({
      code: 'network',
    })
  })
})
