import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PageHeading } from '@/layouts/AppLayout'
import { SearchBar } from '@/components/search/SearchBar'
import { SearchEmptyState, SearchResults } from '@/components/search/SearchResults'
import { useDebounce, useSeo } from '@/hooks'
import { usePurchase } from '@/context/PurchaseContext'
import { search } from '@/services/libraryService'
import type { SearchHit } from '@/types'

/* ========================================================================
   Global search
   ---------------------------------------------------------------------
   The service signature already matches a server-side `GET /search?q=`
   endpoint, so moving this to the backend changes only the service body.
   =================================================================== */

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('q') ?? '')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const debouncedTerm = useDebounce(term, 280)
  const { unlockedClasses } = usePurchase()

  useSeo({
    title: 'Search',
    description: 'Search subjects, chapters, notes and PYQs.',
    path: '/search',
    noIndex: true,
  })

  // Keep the URL shareable without spamming history on every keystroke.
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedTerm.trim()) next.set('q', debouncedTerm.trim())
    setParams(next, { replace: true })
  }, [debouncedTerm, setParams])

  useEffect(() => {
    const query = debouncedTerm.trim()
    if (query.length < 2) {
      setHits([])
      setIsSearching(false)
      return
    }

    const controller = new AbortController()
    setIsSearching(true)

    void search(query, unlockedClasses, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return
        setHits(results)
      })
      .catch(() => {
        if (!controller.signal.aborted) setHits([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSearching(false)
      })

    return () => controller.abort()
  }, [debouncedTerm, unlockedClasses])

  const hasQuery = term.trim().length >= 2

  return (
    <div className="space-y-6">
      <PageHeading
        title="Search"
        subtitle="Find subjects, chapters, notes, PYQs and practice papers."
      />

      <SearchBar
        value={term}
        onChange={setTerm}
        autoFocus
        size="lg"
        placeholder="Search for subjects, chapters, notes..."
      />

      {hasQuery ? (
        <SearchResults hits={hits} isLoading={isSearching} />
      ) : (
        <SearchEmptyState hasQuery={false} onClear={() => setTerm('')} />
      )}

      {hasQuery && !isSearching && hits.length === 0 ? null : null}
    </div>
  )
}
