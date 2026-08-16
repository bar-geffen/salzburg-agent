// Loads the trip tables once, keeps them fresh, and exposes the mutations.
//
// Freshness without websockets (PR 1): refetch when the tab becomes visible,
// when the window regains focus, and on demand. That covers the realistic case —
// you put the phone down, Ori saves something, you pick it up again. None of it
// is throwaway: PR 3 keeps the visibility refetch as insurance against a
// websocket that quietly died in a lift.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FETCHERS,
  fetchTripData,
  keepJournalEntry,
  keepRecommendation,
  rejectRecommendation,
  saveJournalText,
} from './trip-data'

const EMPTY = {
  trip: null,
  flights: [],
  accommodation: [],
  activities: [],
  recommendations: [],
  journal: [],
}

export function useTripData() {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Guards against a slow first load resolving after a fast refresh and
  // overwriting it with staler rows.
  const loadId = useRef(0)

  const refreshAll = useCallback(async ({ silent = false } = {}) => {
    const id = ++loadId.current
    if (!silent) setRefreshing(true)
    try {
      const next = await fetchTripData()
      if (id === loadId.current) {
        setData(next)
        setError('')
      }
    } catch (err) {
      if (id === loadId.current) setError(err.message || "Couldn't load your trip.")
    } finally {
      if (id === loadId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  /** Refetch a single table — cheaper than refreshAll after a mutation. */
  const refreshTable = useCallback(async table => {
    const fetcher = FETCHERS[table]
    if (!fetcher) return
    try {
      const rows = await fetcher()
      setData(prev => ({ ...prev, [table]: rows }))
    } catch {
      // A failed background refresh shouldn't surface an error over working
      // content — the next focus or manual refresh will retry.
    }
  }, [])

  useEffect(() => {
    refreshAll({ silent: true })
  }, [refreshAll])

  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible') refreshAll({ silent: true })
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [refreshAll])

  // Mutations splice the row the server returned back into local state, so the
  // UI updates immediately but can't drift from what was actually written.
  const applyRow = useCallback((table, row) => {
    setData(prev => ({
      ...prev,
      [table]: prev[table].map(r => (r.id === row.id ? row : r)),
    }))
  }, [])

  const keepRec = useCallback(
    async id => applyRow('recommendations', await keepRecommendation(id)),
    [applyRow],
  )

  // Rejected rows leave the list entirely — fetchRecommendations filters them
  // out, so patching in place would leave a ghost card until the next refetch.
  const rejectRec = useCallback(async id => {
    await rejectRecommendation(id)
    setData(prev => ({
      ...prev,
      recommendations: prev.recommendations.filter(r => r.id !== id),
    }))
  }, [])

  const keepJournal = useCallback(
    async id => applyRow('journal', await keepJournalEntry(id)),
    [applyRow],
  )

  const saveJournal = useCallback(
    async (id, text) => applyRow('journal', await saveJournalText(id, text)),
    [applyRow],
  )

  return {
    ...data,
    loading,
    error,
    refreshing,
    refreshAll,
    refreshTable,
    keepRec,
    rejectRec,
    keepJournal,
    saveJournal,
  }
}
