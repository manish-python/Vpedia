/* ========================================================================
   Subject management V2 — /admin-panel/subjects

   Fixes the three things that made this page unusable:

   * **No primary keys.** Class and Stream are dropdowns fed by the public
     catalogue, not text boxes an administrator has to guess a number for.
   * **No raw values on screen.** Every column shows a name.
   * **Stream follows the class.** Classes 7–10 hide it entirely; Classes 11/12
     require it. The rule is enforced server-side as well, because a hidden
     field is not a validation.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { fieldErrors } from '@/services/client'
import {
  createAdminSubject, fetchClassOptions, fetchStreamOptions, updateAdminSubject,
  adminSubjects,
} from '@/admin/service'
import type { AdminQuery, AdminSubject, ClassOption } from '@/admin/types'
import {
  DataTable, ErrorState, PageHeader, Pagination, StatusBadge, TableEmpty, Toolbar, plural,
} from '@/admin/ui'
import { Field, FormModal, Select, SwitchField, TextInput, useDependentOptions } from '@/admin/ui/form'

const PAGE_SIZE = 25

export function AdminSubjectsPage() {
  const { push } = useToast()

  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [streamFilter, setStreamFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<AdminSubject[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [classes, setClasses] = useState<ClassOption[]>([])
  const [editing, setEditing] = useState<AdminSubject | null>(null)
  const [creating, setCreating] = useState(false)

  const debouncedSearch = useDebounce(search, 350)

  /* ---------- Dropdown options, loaded once ---------- */

  useEffect(() => {
    const controller = new AbortController()
    fetchClassOptions(controller.signal)
      .then(setClasses)
      .catch(() => undefined) // Filters degrade to "All classes" rather than blocking.
    return () => controller.abort()
  }, [])

  const selectedFilterClass = classes.find((option) => String(option.id) === classFilter)

  const streamFilterOptions = useDependentOptions<{ id: number; name: string; slug: string }>(
    (slug, signal) => fetchStreamOptions(slug, signal),
    selectedFilterClass?.slug,
  )

  /* ---------- List ---------- */

  const query = useMemo<AdminQuery>(() => {
    const params: AdminQuery = { page, page_size: PAGE_SIZE }
    if (debouncedSearch) params.search = debouncedSearch
    if (classFilter) params.class = classFilter
    if (streamFilter) params.stream = streamFilter
    if (statusFilter) params.status = statusFilter
    return params
  }, [page, debouncedSearch, classFilter, streamFilter, statusFilter])

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      adminSubjects(query, signal)
        .then((response) => {
          setRows(response.results)
          setCount(response.count)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Could not load subjects.')
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
  }, [debouncedSearch, classFilter, streamFilter, statusFilter])

  const clearFilters = () => {
    setSearch('')
    setClassFilter('')
    setStreamFilter('')
    setStatusFilter('')
  }

  /* ---------- Create / edit ---------- */

  const save = async (payload: Partial<AdminSubject>, id: number | null) => {
    if (id === null) {
      await createAdminSubject(payload)
    } else {
      await updateAdminSubject(id, payload)
    }
    load()
  }

  const toggleActive = async (row: AdminSubject) => {
    try {
      await updateAdminSubject(row.id, { is_active: !row.is_active })
      push({
        tone: 'success',
        title: row.is_active ? 'Subject deactivated' : 'Subject activated',
        description: `${row.name} — existing chapters and content were left untouched.`,
      })
      load()
    } catch (cause) {
      push({
        tone: 'error',
        title: 'Could not update the subject',
        description: cause instanceof Error ? cause.message : undefined,
      })
    }
  }

  return (
    <>
      <PageHeader
        title="Subjects"
        subtitle="Manage subjects by class and stream."
        action={
          <Button onClick={() => setCreating(true)} leadingIcon={<Plus className="size-4" />}>
            Add Subject
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search subject…"
        onClear={clearFilters}
        filters={[
          {
            key: 'class',
            label: 'Class',
            value: classFilter,
            onChange: (value) => {
              setClassFilter(value)
              // A stream belongs to a class; keeping the old one would produce
              // a combination that can never match.
              setStreamFilter('')
            },
            options: classes.map((option) => ({ value: String(option.id), label: option.name })),
          },
          ...(selectedFilterClass?.hasStreams
            ? ([
                {
                  key: 'stream',
                  label: 'Stream',
                  value: streamFilter,
                  onChange: (value: string) => setStreamFilter(value),
                  options: streamFilterOptions.options.map((option) => ({
                    value: String(option.id),
                    label: option.name,
                  })),
                },
              ] as const)
            : []),
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'true', label: 'Active' },
              { value: 'false', label: 'Inactive' },
            ],
          },
        ]}
      />

      {error ? (
        <ErrorState message={error} onRetry={() => load()} title="Unable to load subjects" />
      ) : (
        <>
          <DataTable<AdminSubject>
            columns={[
              {
                key: 'name',
                header: 'Subject',
                cell: (row) => (
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{row.name}</p>
                    {row.description ? (
                      <p className="mt-0.5 truncate text-xs text-ink-400">{row.description}</p>
                    ) : null}
                  </div>
                ),
              },
              { key: 'class', header: 'Class', cell: (row) => row.class_name },
              {
                key: 'stream',
                header: 'Stream',
                cell: (row) => row.stream_name ?? <Dash />,
              },
              {
                key: 'chapters',
                header: 'Chapters',
                align: 'right',
                cell: (row) => (
                  <span className="nums font-semibold">{plural(row.chapter_count, 'chapter')}</span>
                ),
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
              { key: 'order', header: 'Order', align: 'right', cell: (row) => <span className="nums">{row.display_order}</span> },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                showOnMobile: false,
                cell: (row) => (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void toggleActive(row)}>
                      {row.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={rows}
            rowKey={(row) => row.id}
            loading={loading}
            onRowClick={setEditing}
            empty={
              <TableEmpty
                title="No subjects match these filters"
                description="Try clearing the filters, or add the first subject for this class."
                action={
                  <Button onClick={() => setCreating(true)} leadingIcon={<Plus className="size-4" />}>
                    Add Subject
                  </Button>
                }
              />
            }
          />

          <Pagination page={page} pageCount={Math.max(1, Math.ceil(count / PAGE_SIZE))} onChange={setPage} total={count} />
        </>
      )}

      <SubjectForm
        open={creating || editing !== null}
        subject={editing}
        classes={classes}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSave={save}
        onNotify={push}
      />
    </>
  )
}

/* ---------------------------------------------------------------------
   Create / edit form
   ------------------------------------------------------------------ */

interface SubjectFormProps {
  open: boolean
  subject: AdminSubject | null
  classes: ClassOption[]
  onClose: () => void
  onSave: (payload: Partial<AdminSubject>, id: number | null) => Promise<void>
  onNotify: (toast: { tone: 'success' | 'error' | 'info'; title: string; description?: string }) => void
}

function SubjectForm({ open, subject, classes, onClose, onSave, onNotify }: SubjectFormProps) {
  const editing = subject !== null

  const [classId, setClassId] = useState('')
  const [streamId, setStreamId] = useState('')
  const [name, setName] = useState('')
  const [displayOrder, setDisplayOrder] = useState('1')
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Prefill straight from the row we already hold. `class_level` is a number
  // here, so no extra request is needed to know which class is selected.
  useEffect(() => {
    if (!open) return
    setClassId(subject ? String(subject.class_level) : '')
    setStreamId(subject?.stream ? String(subject.stream) : '')
    setName(subject?.name ?? '')
    setDisplayOrder(String(subject?.display_order ?? 1))
    setIsActive(subject?.is_active ?? true)
    setErrors({})
    setFormError(null)
  }, [open, subject])

  const selectedClass = classes.find((option) => String(option.id) === classId)
  const needsStream = Boolean(selectedClass?.hasStreams)

  // Streams load for whichever class is selected, and only once one is. With
  // `classId` blank the hook short-circuits, so opening the form does not
  // request every stream in the catalogue.
  const streams = useDependentOptions<{ id: number; name: string; slug: string }>(
    (slug, signal) => fetchStreamOptions(slug, signal),
    selectedClass?.slug,
  )

  // Once streams arrive, make sure a prefilled id is actually among them. If
  // the fetch resolved after the id was set, nothing needs doing; this exists
  // so a value that arrived before the options cannot be silently dropped.
  useEffect(() => {
    if (!streamId || !streams.options.length) return
    if (streams.options.some((option) => String(option.id) === streamId)) return
    setStreamId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams.options])

  const submit = async () => {
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    const payload: Partial<AdminSubject> = {
      class_level: Number(classId),
      name: name.trim(),
      display_order: Number(displayOrder) || 0,
      is_active: isActive,
    }
    // Classes 7–10 never send a stream. Sending `null` is how a subject is
    // explicitly moved off a stream; omitting it leaves an existing value alone.
    if (needsStream) {
      if (!streamId) {
        setErrors({ stream: ['Choose a stream for this class.'] })
        setSubmitting(false)
        return
      }
      payload.stream = Number(streamId)
    } else if (editing && subject?.stream) {
      payload.stream = null
    }

    try {
      await onSave(payload, subject?.id ?? null)
      onNotify({
        tone: 'success',
        title: editing ? 'Subject updated' : 'Subject created',
        description: editing
          ? 'Chapters, content and existing PDFs were left attached to this subject.'
          : undefined,
      })
      onClose()
    } catch (cause) {
      const fields = fieldErrors(cause)
      if (Object.keys(fields).length) {
        setErrors(fields)
        setFormError('Please correct the highlighted fields.')
      } else {
        setFormError(cause instanceof Error ? cause.message : 'Could not save the subject.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Subject' : 'Add Subject'}
      description={
        editing
          ? 'Only the display name and settings change. The subject keeps its id, so every chapter and content file stays attached.'
          : 'Choose the class this subject belongs to.'
      }
      formError={formError}
      onSubmit={submit}
      submitting={submitting}
      submitLabel={editing ? 'Save changes' : 'Create subject'}
    >
      <Field label="Class" required error={errors.class_level ?? errors.class}>
        {(id, describedBy) => (
          <Select
            id={id}
            describedBy={describedBy}
            invalid={Boolean(errors.class_level ?? errors.class)}
            value={classId}
            onChange={(value) => {
              setClassId(value)
              // Switching class invalidates the stream, so clear it. This is the
              // "Class 12 + Science" rule: the stream list reloads for the new
              // class rather than keeping the old class's streams.
              setStreamId('')
            }}
          >
            <option value="">Select class…</option>
            {classes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {needsStream ? (
        <Field
          label="Stream"
          required
          hint="Classes 11 and 12 are grouped by stream."
          error={errors.stream}
        >
          {(id, describedBy) =>
            streams.loading ? (
              <div id={id} className="rounded-xl border border-hairline bg-ink-50 px-3 py-2.5 text-sm text-ink-500">
                Loading streams…
              </div>
            ) : (
              <Select
                id={id}
                describedBy={describedBy}
                invalid={Boolean(errors.stream)}
                value={streamId}
                onChange={setStreamId}
              >
                <option value="">Select stream…</option>
                {streams.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )
          }
        </Field>
      ) : selectedClass ? (
        <p className="rounded-xl border border-hairline bg-ink-50 px-3 py-2.5 text-sm text-ink-500">
          {selectedClass.name} does not use streams, so none is required.
        </p>
      ) : null}

      <Field label="Subject Name" required error={errors.name}>
        {(id, describedBy) => (
          <TextInput
            id={id}
            describedBy={describedBy}
            invalid={Boolean(errors.name)}
            value={name}
            onChange={setName}
            placeholder="e.g. Mathematics"
          />
        )}
      </Field>

      <Field label="Display Order" hint="Lower numbers appear first." error={errors.display_order}>
        {(id, describedBy) => (
          <TextInput
            id={id}
            describedBy={describedBy}
            invalid={Boolean(errors.display_order)}
            type="number"
            min={0}
            inputMode="numeric"
            value={displayOrder}
            onChange={setDisplayOrder}
          />
        )}
      </Field>

      <SwitchField
        id="subject-active"
        checked={isActive}
        onChange={setIsActive}
        label="Active"
        hint={
          editing
            ? 'Deactivating hides the subject from students. Chapters and content are kept.'
            : 'Inactive subjects stay hidden from students until activated.'
        }
      />
    </FormModal>
  )
}

function Dash() {
  return <span className="text-ink-400">—</span>
}