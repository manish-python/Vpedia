/* ========================================================================
   Students, Classes & pricing, Payments, Purchases, UPI settings

   Existing behaviour, better presentation. The business rules are untouched:
   pricing still applies only to future purchases, approval and rejection still
   run through the existing backend services, and student accounts stay
   read-only because nothing in the platform supports editing them.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { fieldErrors } from '@/services/client'
import {
  adminClasses, adminPayments, adminPurchases, adminStudents, adminUPI,
  approveAdminPayment, rejectAdminPayment, updateAdminClass, updateAdminUPI,
} from '@/admin/service'
import type {
  AdminClass, AdminPayment, AdminPurchase, AdminQuery, AdminStudent,
} from '@/admin/types'
import {
  DataTable, ErrorState, PageHeader, Pagination, StatusBadge, TableEmpty, Toolbar,
  absoluteTime, money, relativeTime,
} from '@/admin/ui'

const PAGE_SIZE = 25

/* ========================================================================
   Students
   ===================================================================== */

export function AdminStudentsPage() {
  const [params] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminStudent[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<AdminStudent | null>(null)

  const debouncedSearch = useDebounce(search, 350)

  const query = useMemo<AdminQuery>(
    () => ({ page, page_size: PAGE_SIZE, ...(debouncedSearch ? { search: debouncedSearch } : {}) }),
    [page, debouncedSearch],
  )

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      adminStudents(query, signal)
        .then((response) => {
          setRows(response.results)
          setCount(response.count)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Could not load students.')
        })
        .finally(() => setLoading(false))
    },
    [query],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Accounts created through Google sign-in. Read-only — nothing here can be edited."
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or email…"
        onClear={() => setSearch('')}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => load()} title="Unable to load students" />
      ) : (
        <>
          <DataTable<AdminStudent>
            columns={[
              {
                key: 'name',
                header: 'Name',
                cell: (row) => (
                  <span className="font-semibold text-ink-900">{row.full_name || row.email}</span>
                ),
              },
              { key: 'email', header: 'Email', cell: (row) => row.email },
              {
                key: 'class',
                header: 'Selected class',
                cell: (row) =>
                  row.selected_class ? (
                    row.selected_class.name
                  ) : (
                    <span className="text-ink-400">Not selected</span>
                  ),
              },
              {
                key: 'purchases',
                header: 'Active purchases',
                align: 'right',
                cell: (row) => <span className="nums font-bold">{row.active_purchases}</span>,
              },
              {
                key: 'joined',
                header: 'Registered',
                cell: (row) => (
                  <time dateTime={row.date_joined} title={absoluteTime(row.date_joined)}>
                    {relativeTime(row.date_joined)}
                  </time>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (row) =>
                  row.is_active ? (
                    <StatusBadge value="ACTIVE" label="Active" />
                  ) : (
                    <StatusBadge value="INACTIVE" label="Disabled" />
                  ),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            loading={loading}
            onRowClick={setDetail}
            empty={
              <TableEmpty
                title="No students match that search"
                description="Students appear here automatically after their first Google sign-in."
              />
            }
          />

          <Pagination page={page} pageCount={Math.max(1, Math.ceil(count / PAGE_SIZE))} onChange={setPage} total={count} />
        </>
      )}

      <StudentDrawer student={detail} onClose={() => setDetail(null)} />
    </>
  )
}

function StudentDrawer({ student, onClose }: { student: AdminStudent | null; onClose: () => void }) {
  return (
    <Modal
      open={student !== null}
      onClose={onClose}
      title="Student"
      description={student?.email}
    >
      {student ? (
        <dl className="space-y-3 text-sm">
          <Detail label="Name" value={student.full_name || '—'} />
          <Detail label="Email" value={student.email} />
          <Detail
            label="Selected class"
            value={student.selected_class?.name ?? 'Not selected'}
          />
          <Detail label="Selected stream" value={student.selected_stream?.name ?? 'Not applicable'} />
          <Detail label="Active purchases" value={String(student.active_purchases)} />
          <Detail label="Email verified" value={student.email_verified ? 'Yes' : 'No'} />
          <Detail label="Account status" value={student.is_active ? 'Active' : 'Disabled'} />
          <Detail label="Registered" value={absoluteTime(student.date_joined)} />
        </dl>
      ) : null}
      <p className="mt-5 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-500">
        Student accounts are created and owned by Google sign-in. Access is granted by approving a
        payment, so there is nothing here to edit.
      </p>
    </Modal>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 pb-2.5 last:border-0">
      <dt className="shrink-0 text-xs font-bold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold text-ink-800">{value}</dd>
    </div>
  )
}

/* ========================================================================
   Classes & pricing
   ===================================================================== */

export function AdminClassesPage() {
  const { push } = useToast()
  const [rows, setRows] = useState<AdminClass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<number | null>(null)

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    adminClasses(signal)
      .then((response) => setRows(response.results))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Could not load classes.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const save = async (row: AdminClass, price: string, active: boolean) => {
    setSaving(row.id)
    try {
      await updateAdminClass(row.id, { price, is_active: active })
      push({
        tone: 'success',
        title: `${row.name} updated`,
        description: 'Existing purchases keep the amount they were made at.',
      })
      load()
    } catch (cause) {
      push({
        tone: 'error',
        title: 'Could not update the class',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Classes & pricing"
        subtitle="The price set here applies to future purchases. Historical purchases keep their original amount."
      />

      {error ? (
        <ErrorState message={error} onRetry={() => load()} title="Unable to load classes" />
      ) : (
        <DataTable<AdminClass>
          columns={[
            { key: 'class', header: 'Class', cell: (row) => <span className="font-semibold text-ink-900">{row.name}</span> },
            {
              key: 'price',
              header: 'Future purchase price',
              cell: (row) => <PriceCell row={row} saving={saving === row.id} onSave={save} />,
            },
            {
              key: 'subjects',
              header: 'Subjects',
              align: 'right',
              cell: (row) => <span className="nums">{row.subject_count}</span>,
            },
            {
              key: 'purchases',
              header: 'Purchases',
              align: 'right',
              cell: (row) => <span className="nums">{row.purchase_count}</span>,
            },
            {
              key: 'streams',
              header: 'Streams',
              cell: (row) => (row.has_streams ? 'Required' : 'Not applicable'),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (row) => (
                <StatusBadge
                  value={row.is_active ? 'ACTIVE' : 'INACTIVE'}
                  label={row.is_active ? 'Active' : 'Inactive'}
                />
              ),
            },
          ]}
          rows={rows}
          rowKey={(row) => row.id}
          loading={loading}
          empty={<TableEmpty title="No classes configured" />}
        />
      )}
    </>
  )
}

function PriceCell({
  row,
  saving,
  onSave,
}: {
  row: AdminClass
  saving: boolean
  onSave: (row: AdminClass, price: string, active: boolean) => Promise<void>
}) {
  const [price, setPrice] = useState(row.price)
  const [active, setActive] = useState(row.is_active)
  const dirty = price !== row.price || active !== row.is_active

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`price-${row.id}`}>
        {row.name} price
      </label>
      <input
        id={`price-${row.id}`}
        inputMode="decimal"
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        className="nums w-24 rounded-lg border border-hairline px-2.5 py-1.5 text-sm outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
      />
      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-600">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          className="size-4 rounded border-ink-300"
        />
        Active
      </label>
      <Button
        size="sm"
        variant={dirty ? 'primary' : 'ghost'}
        disabled={!dirty}
        loading={saving}
        onClick={() => void onSave(row, price, active)}
      >
        Save
      </Button>
    </div>
  )
}

/* ========================================================================
   Payments
   ===================================================================== */

const PAYMENT_TABS = ['PENDING', 'APPROVED', 'REJECTED'] as const

export function AdminPaymentsPage() {
  const { push } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const status = (PAYMENT_TABS as readonly string[]).includes(statusParam ?? '')
    ? statusParam!
    : 'PENDING'
  const focusPayment = searchParams.get('payment')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminPayment[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<AdminPayment | null>(null)

  const debouncedSearch = useDebounce(search, 350)

  const query = useMemo<AdminQuery>(
    () => ({
      page,
      page_size: PAGE_SIZE,
      status,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [page, status, debouncedSearch],
  )

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      adminPayments(query, signal)
        .then((response) => {
          setRows(response.results)
          setCount(response.count)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Could not load payments.')
        })
        .finally(() => setLoading(false))
    },
    [query],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [status, debouncedSearch])

  /**
   * Changing the status tab closes any open review panel.
   *
   * The detail view renders *instead of* the list, so without this the previous
   * filter's payment stayed on screen under the new tab's heading - an
   * "Approved" tab showing a pending payment.
   */
  useEffect(() => {
    setSelected(null)
  }, [status])

  /** A notification links to `/admin-panel/payments?payment=<id>`; open it. */
  useEffect(() => {
    if (!focusPayment) return
    const match = rows.find((row) => String(row.id) === focusPayment)
    if (match) {
      setSelected(match)
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete('payment')
        return next
      })
    }
  }, [focusPayment, rows, setSearchParams])

  const setStatus = (value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('status', value)
    setSearchParams(next, { replace: true })
  }

  const refresh = () => {
    load()
  }

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Manual UPI proofs. Approval runs through the existing backend service — the workflow is unchanged."
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-white p-1">
        {PAYMENT_TABS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            aria-current={status === value ? 'page' : undefined}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${
              status === value ? 'bg-brand-600 text-white' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            {value.charAt(0) + value.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email or UTR…"
        onClear={() => setSearch('')}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => load()} title="Unable to load payments" />
      ) : selected ? (
        <PaymentReview
          payment={selected}
          onClose={() => setSelected(null)}
          onDone={refresh}
          onToast={push}
        />
      ) : (
        <>
          <DataTable<AdminPayment>
            columns={[
              {
                key: 'student',
                header: 'Student',
                cell: (row) => (
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{row.student_name || row.email}</p>
                    <p className="truncate text-xs text-ink-400">{row.email}</p>
                  </div>
                ),
              },
              { key: 'class', header: 'Class', cell: (row) => row.class_name },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                cell: (row) => <span className="nums font-bold">{money(row.amount)}</span>,
              },
              { key: 'utr', header: 'UTR', cell: (row) => <code className="text-xs">{row.utr}</code> },
              {
                key: 'submitted',
                header: 'Submitted',
                cell: (row) => (
                  <time dateTime={row.submitted_at} title={absoluteTime(row.submitted_at)}>
                    {relativeTime(row.submitted_at)}
                  </time>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (row) => <StatusBadge value={row.status} />,
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            loading={loading}
            onRowClick={setSelected}
            empty={
              <TableEmpty
                title={`No ${status.toLowerCase()} payments`}
                description="Payment proofs appear here as students submit them."
              />
            }
          />

          <Pagination page={page} pageCount={Math.max(1, Math.ceil(count / PAGE_SIZE))} onChange={setPage} total={count} />
        </>
      )}
    </>
  )
}

function PaymentReview({
  payment,
  onClose,
  onDone,
  onToast,
}: {
  payment: AdminPayment
  onClose: () => void
  onDone: () => void
  onToast: (toast: { tone: 'success' | 'error' | 'info'; title: string; description?: string }) => void
}) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  const act = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !reason.trim()) {
      setReasonError('A reason is required so the student knows what to fix.')
      return
    }
    setReasonError(null)
    setBusy(action)
    try {
      if (action === 'approve') {
        await approveAdminPayment(payment.id)
        onToast({
          tone: 'success',
          title: 'Payment approved',
          description: `${payment.class_name} access is now active for ${payment.email}.`,
        })
      } else {
        await rejectAdminPayment(payment.id, reason.trim())
        onToast({ tone: 'success', title: 'Payment rejected', description: reason })
      }
      onDone()
    } catch (cause) {
      onToast({
        tone: 'error',
        title: `Could not ${action} the payment`,
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onClose} className="text-sm font-bold text-brand-700 hover:underline">
            ← Back to the queue
          </button>
          <h2 className="mt-3 text-xl font-black text-ink-900">Payment request #{payment.id}</h2>
        </div>
        <StatusBadge value={payment.status} />
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Detail label="Student" value={payment.student_name || '—'} />
        <Detail label="Email" value={payment.email} />
        <Detail label="Class" value={payment.class_name} />
        <Detail label="Amount" value={money(payment.amount)} />
        <Detail label="UTR" value={payment.utr} />
        <Detail label="Transaction ID" value={payment.transaction_id || '—'} />
        <Detail label="Submitted" value={absoluteTime(payment.submitted_at)} />
        <Detail label="Reviewed by" value={payment.reviewed_by_email || '—'} />
      </dl>

      {payment.rejection_reason ? (
        <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          Rejected: {payment.rejection_reason}
        </p>
      ) : null}

      {payment.screenshot_url ? (
        <figure className="mt-6">
          <img
            src={payment.screenshot_url}
            alt={`Payment screenshot submitted for ${payment.class_name}`}
            className="max-h-96 w-full rounded-xl border border-hairline bg-ink-50 object-contain"
          />
          <figcaption className="mt-1.5 text-xs text-ink-400">
            Student-submitted proof. Always compare the UTR against the amount before approving.
          </figcaption>
        </figure>
      ) : null}

      {payment.status === 'PENDING' ? (
        <div className="mt-6 border-t border-hairline pt-5">
          <label htmlFor="reject-reason" className="block text-sm font-bold text-ink-800">
            Rejection reason <span className="text-rose-600">*</span>
          </label>
          <p className="mt-0.5 text-xs text-ink-500">Required only when rejecting.</p>
          <textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={reasonError ? true : undefined}
            rows={3}
            placeholder="e.g. UTR does not match any transaction for this amount."
            className="mt-2 w-full rounded-xl border border-hairline p-3 text-sm outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
          />
          {reasonError ? (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">
              {reasonError}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => void act('approve')}
              loading={busy === 'approve'}
              disabled={busy !== null}
              leadingIcon={<CheckCircle2 className="size-4" />}
            >
              Approve & activate access
            </Button>
            <Button
              variant="danger"
              onClick={() => void act('reject')}
              loading={busy === 'reject'}
              disabled={busy !== null}
              leadingIcon={<XCircle className="size-4" />}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ========================================================================
   Purchases
   ===================================================================== */

export function AdminPurchasesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AdminPurchase[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 350)

  const query = useMemo<AdminQuery>(() => {
    const params: AdminQuery = { page, page_size: PAGE_SIZE }
    if (debouncedSearch) params.search = debouncedSearch
    if (status) params.status = status
    return params
  }, [page, debouncedSearch, status])

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      adminPurchases(query, signal)
        .then((response) => {
          setRows(response.results)
          setCount(response.count)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Could not load purchases.')
        })
        .finally(() => setLoading(false))
    },
    [query],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status])

  return (
    <>
      <PageHeader title="Purchases" subtitle="Every class access request and where it stands." />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search student, email or class…"
        onClear={() => {
          setSearch('')
          setStatus('')
        }}
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'REJECTED', label: 'Rejected' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          },
        ]}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => load()} title="Unable to load purchases" />
      ) : (
        <>
          <DataTable<AdminPurchase>
            columns={[
              {
                key: 'student',
                header: 'Student',
                cell: (row) => (
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{row.student_name || row.email}</p>
                    <p className="truncate text-xs text-ink-400">{row.email}</p>
                  </div>
                ),
              },
              { key: 'class', header: 'Class', cell: (row) => row.class_name },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                cell: (row) => <span className="nums font-bold">{money(row.amount)}</span>,
              },
              { key: 'status', header: 'Status', cell: (row) => <StatusBadge value={row.status} /> },
              {
                key: 'created',
                header: 'Requested',
                cell: (row) => (
                  <time dateTime={row.created_at} title={absoluteTime(row.created_at)}>
                    {relativeTime(row.created_at)}
                  </time>
                ),
              },
              {
                key: 'activated',
                header: 'Activated',
                cell: (row) =>
                  row.activated_at ? (
                    <time dateTime={row.activated_at} title={absoluteTime(row.activated_at)}>
                      {relativeTime(row.activated_at)}
                    </time>
                  ) : (
                    <span className="text-ink-400">—</span>
                  ),
              },
              {
                key: 'approved',
                header: 'Approved by',
                cell: (row) => row.approved_by_email ?? <span className="text-ink-400">—</span>,
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            loading={loading}
            empty={<TableEmpty title="No purchases match these filters" />}
          />

          <Pagination page={page} pageCount={Math.max(1, Math.ceil(count / PAGE_SIZE))} onChange={setPage} total={count} />
        </>
      )}
    </>
  )
}

/* ========================================================================
   UPI settings
   ===================================================================== */

export function AdminUpiPage() {
  const { push } = useToast()
  const [data, setData] = useState<{ upi_id: string; display_name: string; instructions: string; is_active: boolean; qr_code_url: string | null } | null>(null)
  const [upiId, setUpiId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    adminUPI(signal)
      .then((value) => {
        setData(value)
        setUpiId(value.upi_id)
        setDisplayName(value.display_name)
        setInstructions(value.instructions)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Could not load UPI settings.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const save = async () => {
    setSaving(true)
    setErrors({})
    const form = new FormData()
    form.append('upi_id', upiId)
    form.append('display_name', displayName)
    form.append('instructions', instructions)
    if (file) form.append('qr_code', file)

    try {
      const next = await updateAdminUPI(form)
      setData(next)
      setFile(null)
      push({ tone: 'success', title: 'UPI settings updated', description: 'Students see these values immediately.' })
    } catch (cause) {
      const fields = fieldErrors(cause)
      if (Object.keys(fields).length) setErrors(fields)
      push({
        tone: 'error',
        title: 'Could not save UPI settings',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <>
        <PageHeader title="UPI settings" />
        <ErrorState message={error} onRetry={() => load()} title="Unable to load UPI settings" />
      </>
    )
  }

  if (loading || !data) {
    return (
      <>
        <PageHeader title="UPI settings" />
        <div className="h-96 animate-pulse rounded-2xl border border-hairline bg-white" aria-busy />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="UPI settings"
        subtitle="Students see these values on the manual payment page. Nothing about the payment workflow changes here."
        action={
          <Button onClick={() => void save()} loading={saving} disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </Button>
        }
      />

      <div className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-hairline bg-white p-5">
          <label htmlFor="upi-id" className="block text-sm font-bold text-ink-800">
            UPI ID <span className="text-rose-600">*</span>
          </label>
          <input
            id="upi-id"
            value={upiId}
            onChange={(event) => setUpiId(event.target.value)}
            aria-invalid={errors.upi_id ? true : undefined}
            className="mt-1.5 w-full rounded-xl border border-hairline px-3 py-2.5 text-sm outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
          />
          {errors.upi_id ? (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">
              {errors.upi_id.join(' ')}
            </p>
          ) : null}

          <label htmlFor="upi-name" className="mt-4 block text-sm font-bold text-ink-800">
            Display name
          </label>
          <input
            id="upi-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-hairline px-3 py-2.5 text-sm outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
          />

          <label htmlFor="upi-instructions" className="mt-4 block text-sm font-bold text-ink-800">
            Instructions
          </label>
          <textarea
            id="upi-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={4}
            className="mt-1.5 w-full rounded-xl border border-hairline p-3 text-sm outline-none focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-100"
          />
        </div>

        <div className="rounded-2xl border border-hairline bg-white p-5">
          <h2 className="text-sm font-bold text-ink-800">QR code</h2>
          {data.qr_code_url ? (
            <img
              src={data.qr_code_url}
              alt="Current UPI QR code"
              className="mt-3 size-48 rounded-xl border border-hairline bg-white object-contain"
            />
          ) : (
            <p className="mt-2 flex items-center gap-2 rounded-xl bg-ink-50 p-3 text-sm text-ink-500">
              <ShieldCheck className="size-4 shrink-0" aria-hidden />
              No QR uploaded yet. Students see the UPI ID only.
            </p>
          )}

          <label htmlFor="qr-upload" className="mt-4 block text-sm font-bold text-ink-800">
            Replace QR code
          </label>
          <input
            id="qr-upload"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-1.5 w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-brand-700 hover:file:bg-brand-100"
          />
          {errors.qr_code ? (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-700">
              {errors.qr_code.join(' ')}
            </p>
          ) : null}
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-500">
          <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Students read these settings through the public payment endpoint. Nothing here can grant
          access by itself — access is activated only when a payment proof is approved.
        </p>
      </div>
    </>
  )
}