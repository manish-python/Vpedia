import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileWarning,
  Menu,
  Minus,
  Plus,
  Printer,
  X,
} from 'lucide-react'

import { IconButton } from '@/components/common/IconButton'
import { Spinner } from '@/components/common/Spinner'
import { Skeleton } from '@/components/common/Skeleton'
import { ErrorState } from '@/components/common/EmptyState'
import { useDebounce } from '@/hooks/useDebounce'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { cn } from '@/utils/cn'

/* ========================================================================
   PDF worker
   Bundled locally rather than pulled from a CDN, so the viewer works offline
   and no third party is added to the critical path.
   ===================================================================== */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/* ========================================================================
   PDFViewer
   A real document viewer: thumbnail rail, continuous page flow, page
   jump, zoom in/out with a percentage readout, fit-to-width and print.

   The source is always a document reference obtained from the content
   service — never a permanent URL baked into the component.
   ===================================================================== */

export interface PDFViewerProps {
  src: string
  fileName: string
  title: string
  className?: string
  /**
   * Overrides the wording shown when the document cannot be opened.
   *
   * pdf.js reports a failure without saying which kind it was, so an
   * administrator previewing a staff-only document needs to be told that is the
   * likely cause. Omitted, the student wording is unchanged.
   */
  loadErrorMessage?: string
  /** Notified once when the document fails to open, so the caller can react. */
  onError?: () => void
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.25

export function PDFViewer({
  src,
  fileName,
  title,
  className,
  loadErrorMessage,
  onError,
}: PDFViewerProps) {
  const isMobile = useIsMobile()

  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(true)
  const [containerWidth, setContainerWidth] = useState(0)
  const [railOpen, setRailOpen] = useState(!isMobile)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef(new Map<number, HTMLDivElement>())
  const pageJump = useRef<number | null>(null)
  // Where the container sat when a jump started, so a reader scrolling away
  // from a jump can release it instead of waiting for a landing that never comes.
  const jumpScrollTop = useRef<number | null>(null)

  // Measure the viewport so fit-to-width can compute a real scale.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setContainerWidth(node.clientWidth)

    return () => observer.disconnect()
  }, [])

  const A4_WIDTH = 595
  const padding = 48
  const fitScale = useMemo(() => {
    if (!containerWidth) return 1
    return Math.min((containerWidth - padding) / A4_WIDTH, ZOOM_MAX)
  }, [containerWidth])

  const effectiveScale = fitWidth ? fitScale : scale

  // Track which page is in view while scrolling.
  const handleScroll = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    // A programmatic jump suppresses tracking until the target page arrives, so
    // the pages it flies past do not fight the number it is heading for.
    //
    // It is released as soon as the target is reached, *or* as soon as the
    // container moves somewhere the jump did not put it — otherwise a jump that
    // never lands latches here and the reported page stops tracking entirely.
    if (pageJump.current !== null) {
      const node = pageRefs.current.get(pageJump.current)
      const arrived =
        !node || node.getBoundingClientRect().top <= container.getBoundingClientRect().top + 40
      const wandered = Math.abs(container.scrollTop - (jumpScrollTop.current ?? container.scrollTop)) > 4
      if (arrived || wandered) pageJump.current = null
      else return
    }

    const containerTop = container.getBoundingClientRect().top
    let current = 1
    for (let page = 1; page <= numPages; page += 1) {
      const node = pageRefs.current.get(page)
      if (!node) continue
      if (node.getBoundingClientRect().top - containerTop <= 80) current = page
      else break
    }
    setCurrentPage(current)
  }, [numPages])

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.min(Math.max(page, 1), numPages || 1)
      pageJump.current = clamped
      // Remembered so `handleScroll` can tell "still flying to the target" from
      // "the reader scrolled somewhere else and this jump is now stale".
      jumpScrollTop.current = scrollRef.current?.scrollTop ?? null
      setCurrentPage(clamped)
      pageRefs.current.get(clamped)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [numPages],
  )

  const zoomBy = useCallback((delta: number) => {
    setFitWidth(false)
    setScale((prev) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta)))
  }, [])

  const zoomLabel = `${Math.round(effectiveScale * 100)}%`

  const onLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total)
    setStatus('ready')
  }, [])

  const onLoadError = useCallback(() => {
    setStatus('error')
    setErrorMessage(
      loadErrorMessage ?? 'This document could not be opened. Try again in a moment.',
    )
    onError?.()
  }, [loadErrorMessage, onError])

  const toolbar = (
    <PDFToolbar
      fileName={fileName}
      currentPage={currentPage}
      numPages={numPages}
      zoomLabel={zoomLabel}
      onPrev={() => goToPage(currentPage - 1)}
      onNext={() => goToPage(currentPage + 1)}
      onPageInput={(value) => goToPage(value)}
      onZoomOut={() => zoomBy(-ZOOM_STEP)}
      onZoomIn={() => zoomBy(ZOOM_STEP)}
      onFit={() => setFitWidth(true)}
      onToggleRail={() => setRailOpen((v) => !v)}
      onPrint={() => window.print()}
      src={src}
    />
  )

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-ink-100', className)}>
      {toolbar}

      <div className="flex min-h-0 flex-1">
        {/* Thumbnail rail */}
        {railOpen && status === 'ready' ? (
          <PDFThumbnailRail
            fileName={fileName}
            src={src}
            numPages={numPages}
            currentPage={currentPage}
            onSelect={goToPage}
            onClose={() => setRailOpen(false)}
          />
        ) : null}

        {/* Page flow */}
        <div ref={scrollRef} onScroll={handleScroll} className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
          <Document
            file={src}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            loading={
              <div role="status" className="flex flex-col items-center gap-3 py-20">
                <Spinner size={28} className="text-brand-600" />
                <p className="text-sm font-medium text-ink-500">Opening {title}…</p>
              </div>
            }
            error={
              <ErrorState
                title="Unable to open document"
                message={errorMessage}
                onRetry={() => setStatus('loading')}
              />
            }
            className="flex flex-col items-center gap-5"
          >
            {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
              <div
                key={page}
                ref={(node) => {
                  if (node) pageRefs.current.set(page, node)
                  else pageRefs.current.delete(page)
                }}
                className="scroll-mt-4"
              >
                <PDFPage pageNumber={page} scale={effectiveScale} />
              </div>
            ))}
          </Document>

          {status === 'loading' && numPages === 0 ? (
            <div className="mx-auto max-w-3xl space-y-4">
              <Skeleton className="h-96 rounded-xl" />
              <Skeleton className="h-96 rounded-xl opacity-70" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
   PDFToolbar
   ------------------------------------------------------------------ */

function PDFToolbar({
  fileName,
  currentPage,
  numPages,
  zoomLabel,
  onPrev,
  onNext,
  onPageInput,
  onZoomOut,
  onZoomIn,
  onFit,
  onToggleRail,
  onPrint,
  src,
}: {
  fileName: string
  currentPage: number
  numPages: number
  zoomLabel: string
  onPrev: () => void
  onNext: () => void
  onPageInput: (page: number) => void
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
  onToggleRail: () => void
  onPrint: () => void
  src: string
}) {
  const [draft, setDraft] = useState(String(currentPage))
  const debouncedDraft = useDebounce(draft, 400)
  /**
   * Set only by a keystroke in the page box.
   *
   * This is the whole fix for "I scroll and it snaps back". `currentPage` is
   * rewritten by `handleScroll` as the reader scrolls, and this input mirrors it,
   * so without this flag the debounced draft was almost always a *stale* page
   * number whenever it landed — and a stale number read as "the reader asked for
   * this page", which called `goToPage`, which called `scrollIntoView`, which
   * dragged the viewport back to where the reader had just left. Continuous
   * scrolling could therefore never get past the first screenful.
   */
  const editedByUser = useRef(false)

  useEffect(() => {
    if (!editedByUser.current) return
    editedByUser.current = false
    const parsed = Number.parseInt(debouncedDraft, 10)
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= (numPages || 1)) {
      onPageInput(parsed)
      return
    }
    // Refused, so show where the reader actually is rather than leaving a number
    // in the box that goes nowhere.
    setDraft(String(currentPage))
  }, [debouncedDraft, onPageInput, numPages, currentPage])

  // Mirroring the reader's page must never look like an edit.
  useEffect(() => {
    editedByUser.current = false
    setDraft(String(currentPage))
  }, [currentPage])

  return (
    <div className="no-print flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-3 py-2.5 sm:gap-3 sm:px-4">
      <IconButton label="Toggle page thumbnails" size="sm" variant="ghost" onClick={onToggleRail}>
        <Menu className="size-4.5" aria-hidden />
      </IconButton>

      <span className="hidden min-w-0 flex-1 truncate text-sm font-semibold text-ink-700 lg:block">
        {fileName}
      </span>

      <div className="flex items-center gap-1.5">
        <IconButton
          label="Previous page"
          size="sm"
          onClick={onPrev}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="size-4.5" aria-hidden />
        </IconButton>

        <label className="flex items-center gap-1.5">
          <span className="sr-only">Current page</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={numPages || 1}
            value={draft}
            onChange={(event) => {
              editedByUser.current = true
              setDraft(event.target.value)
            }}
            className="h-9 w-12 rounded-lg border border-hairline text-center text-sm font-semibold text-ink-800"
          />
        </label>

        <span className="text-sm font-semibold text-ink-500">/ {numPages || '—'}</span>

        <IconButton
          label="Next page"
          size="sm"
          onClick={onNext}
          disabled={currentPage >= numPages}
        >
          <ChevronRight className="size-4.5" aria-hidden />
        </IconButton>
      </div>

      <div className="flex items-center gap-1.5">
        <IconButton label="Zoom out" size="sm" onClick={onZoomOut}>
          <Minus className="size-4.5" aria-hidden />
        </IconButton>
        <span
          aria-live="off"
          className="min-w-12 text-center text-sm font-semibold text-ink-700 nums"
        >
          {zoomLabel}
        </span>
        <IconButton label="Zoom in" size="sm" onClick={onZoomIn}>
          <Plus className="size-4.5" aria-hidden />
        </IconButton>
        <IconButton label="Fit to width" size="sm" variant="soft" onClick={onFit}>
          <Expand className="size-4.5" aria-hidden />
        </IconButton>
        <IconButton label="Print document" size="sm" onClick={onPrint} className="hidden sm:inline-flex">
          <Printer className="size-4.5" aria-hidden />
        </IconButton>
        <a
          href={src}
          download={fileName}
          aria-label="Download document"
          className="hidden size-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 sm:inline-flex"
        >
          <Download className="size-4.5" aria-hidden />
        </a>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
   PDFThumbnailRail
   ------------------------------------------------------------------ */

function PDFThumbnailRail({
  src,
  numPages,
  currentPage,
  onSelect,
  onClose,
}: {
  fileName: string
  src: string
  numPages: number
  currentPage: number
  onSelect: (page: number) => void
  onClose: () => void
}) {
  return (
    <aside
      aria-label="Page thumbnails"
      className="hidden w-40 shrink-0 overflow-y-auto border-r border-ink-200 bg-ink-50 p-3 md:block"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold tracking-wide text-ink-500 uppercase">Pages</span>
        <IconButton label="Close thumbnails" size="sm" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>

      <ul className="space-y-2.5">
        {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
          <li key={page}>
            <PDFThumbnail
              src={src}
              pageNumber={page}
              isActive={page === currentPage}
              onSelect={() => onSelect(page)}
            />
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function PDFThumbnail({
  src,
  pageNumber,
  isActive,
  onSelect,
}: {
  src: string
  pageNumber: number
  isActive: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? 'true' : undefined}
      aria-label={`Go to page ${pageNumber}`}
      className={cn(
        'block w-full overflow-hidden rounded-lg border-2 bg-white transition-shadow',
        isActive
          ? 'border-brand-600 shadow-card'
          : 'border-transparent shadow-card hover:border-brand-300',
      )}
    >
      <Document file={src} loading={<div className="aspect-[1/1.41] w-full skeleton-base" />}>
        <Page
          pageNumber={pageNumber}
          scale={0.24}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          className="pdf-page"
        />
      </Document>
      <span
        className={cn(
          'block border-t py-0.5 text-center text-[0.625rem] font-bold nums',
          isActive ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500',
        )}
      >
        {pageNumber}
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------------
   PDFPage
   ------------------------------------------------------------------ */

/**
 * One page of the open document.
 *
 * Must be rendered inside a react-pdf `<Document>` — the viewer keeps a
 * single Document instance so the file is parsed once, not once per page.
 */
export function PDFPage({
  pageNumber,
  scale,
}: {
  pageNumber: number
  scale: number
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <figure className="pdf-page pdf-page-shadow m-0 overflow-hidden rounded-xl bg-white shadow-card">
      <div className="relative">
        {!loaded ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Spinner className="text-ink-300" />
          </div>
        ) : null}

        <Page
          pageNumber={pageNumber}
          scale={scale}
          onRenderSuccess={() => setLoaded(true)}
          onRenderError={() => setLoaded(true)}
          renderAnnotationLayer
          renderTextLayer
          className={cn('transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0')}
          loading={
            <div className="flex aspect-[1/1.41] w-[595px] max-w-full items-center justify-center">
              <Spinner className="text-ink-300" />
            </div>
          }
          error={
            <div className="flex aspect-[1/1.41] w-[595px] max-w-full flex-col items-center justify-center gap-2 p-6 text-center">
              <FileWarning className="size-6 text-ink-300" aria-hidden />
              <p className="text-xs font-medium text-ink-500">Page unavailable</p>
            </div>
          }
        />
      </div>

      <figcaption className="border-t border-hairline py-1.5 text-center text-xs font-semibold text-ink-400 nums">
        {pageNumber}
      </figcaption>
    </figure>
  )
}
