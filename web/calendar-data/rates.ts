import { type Rate, rate, rateList } from '@shared/rates.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

import { calendarKeys } from './queries'

const segment = encodeURIComponent

async function listRates() {
  const { rates } = await apiFetch('/rates', { schema: rateList })
  return rates
}

function setRate({
  from,
  to,
  rate: value,
}: Pick<Rate, 'from' | 'to' | 'rate'>) {
  return apiFetch(`/admin/rates/${segment(from)}/${segment(to)}`, {
    method: 'PUT',
    body: { rate: value },
    schema: rate,
  })
}

function clearRate({ from, to }: Pick<Rate, 'from' | 'to'>) {
  return apiFetch(`/admin/rates/${segment(from)}/${segment(to)}`, {
    method: 'DELETE',
  })
}

/** Every stored rate, which the home-currency estimate reads beside a trip. */
export function useRates() {
  return useQuery({ queryKey: calendarKeys.rates(), queryFn: listRates })
}

function useRefreshRates() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: calendarKeys.rates() })
  }
}

/** Sets one pair's rate, which also clears its reverse on the server. */
export function useSetRate() {
  const refresh = useRefreshRates()
  return useMutation({ mutationFn: setRate, onSuccess: refresh })
}

/** Clears one pair's rate in both directions. */
export function useClearRate() {
  const refresh = useRefreshRates()
  return useMutation({ mutationFn: clearRate, onSuccess: refresh })
}
