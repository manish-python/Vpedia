/* ========================================================================
   Admin document preview — the real PDF behind the View button.

   Why the View button used to show nothing useful
   ---------------------------------------------------------------------
   It was a toast:

     onView={() => onToast({ title: row.title,
                              description: `... · ${row.file_name}` }) }

   So clicking View printed the row's filename and metadata, which is exactly
   the reported symptom: there was no viewer behind the button at all.

   Why the URL goes straight into PDFViewer
   ---------------------------------------------------------------------
   An earlier version of this component fetched the document itself, inspected
   the status code, and handed PDFViewer an object URL. That bought precise
   404/403 wording at the cost of a second code path: a fetch, a blob, and an
   object-URL lifecycle to revoke, none of which the student viewer has. It also
   fought React's StrictMode remounts, where the in-flight request is aborted by
   the effect cleanup and the blob can be orphaned.

   The student pages already pass the document URL directly to `PDFViewer`, and
   that path is proven. This reuses it, so there is exactly one way a document
   reaches pdf.js in this application.

   The states are still all reachable and still distinct:

     no file attached   the row says so (`file_name` is null), so no request
                        is made at all and the answer is immediate
     permission error   the endpoint is staff-only; pdf.js surfaces the failure
                        and Retry re-runs it
     network / server   same path, same Retry
     fine               PDFViewer renders the pages

   The error wording is overridable so this screen can be explicit without
   changing what a student sees.
   =================================================================== */

import { useCallback, useState } from 'react'
import { FileWarning, RefreshCw, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { PDFViewer } from '@/components/pdf'

/** Remounting the viewer with a new key is what Retry does. */
let previewNonce = 0

export function DocumentPreview({
  open,
  title,
  subtitle,
  fileName,
  src,
  onClose,
}: {
  open: boolean
  title: string
  /** Where this document sits, e.g. `Class 8 · Mathematics · Real Numbers`. */
  subtitle?: string
  /** From the row. Null means nothing is attached, and no request is made. */
  fileName: string | null
  /** The staff-only document endpoint, or null while nothing is selected. */
  src: string | null
  onClose: () => void
}) {
  const [retryKey, setRetryKey] = useState(0)
  // pdf.js reports a failure without saying which kind it was, so once it has
  // failed the caller shows an explicit explanation of the likely cause.
  const [failed, setFailed] = useState(false)

  const retry = useCallback(() => {
    setFailed(false)
    // A fresh key remounts PDFViewer, which re-runs its own load.
    previewNonce += 1
    setRetryKey(previewNonce)
  }, [])

  const nothingAttached = !fileName || !src

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || 'Document preview'}
      description={subtitle || undefined}
      size="xl"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      {/* A definite height: PDFViewer scrolls internally and needs a bounded box,
          and the modal body itself scrolls, which would fight it. */}
      <div className="h-[72dvh] min-h-[24rem] overflow-hidden rounded-xl border border-ink-200 bg-ink-100">
        {nothingAttached ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <FileWarning className="size-9 text-ink-400" aria-hidden />
            <p className="text-sm font-bold text-ink-800">
              No PDF file is attached to this content.
            </p>
            <p className="max-w-sm text-xs text-ink-500">
              Edit this item and choose a PDF to attach one.
            </p>
          </div>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <ShieldAlert className="size-9 text-ink-400" aria-hidden />
            <p className="text-sm font-bold text-ink-800">
              Unable to load the PDF. Please try again.
            </p>
            <p className="max-w-sm text-xs text-ink-500">
              This document is served to administrators only. If you believe this
              is wrong, sign in again.
            </p>
            <Button size="sm" variant="outline" onClick={retry}>
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
              Retry
            </Button>
          </div>
        ) : (
          <PDFViewer
            key={retryKey}
            src={src as string}
            fileName={fileName as string}
            title={title}
            loadErrorMessage="Unable to load the PDF. Please try again."
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </Modal>
  )
}