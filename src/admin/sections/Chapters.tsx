/* ========================================================================
   Chapter management V2 — /admin-panel/chapters

   The old form asked for a raw Subject primary key. This one walks the same
   hierarchy the content form does — Class, then Stream when the class needs
   one, then Subject — and never asks for an id.

   The subtle part is **edit preselection**. Opening "Real Numbers" must show
   Class 10 and Mathematics already chosen, without the administrator
   re-selecting them and without the form flashing "Select class…" while the
   option lists load. Three things make that reliable:

   1. The admin chapter row already carries `class_level_id`, `stream_id` and
      `subject`, so the form can preselect from data it is handed. No request
      is needed to discover the current class.
   2. Options load as a dependent chain, so `subjects` is only fetched once a
      class (and stream, where relevant) is known — the preselected values are
      simply already correct when the list arrives.
   3. A selection is only cleared if it turns out not to exist in the loaded
      options. Values that arrive before their options are left alone, which is
      what stops a fast edit from wiping itself on a slow connection.
   ===================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { useDebounce } from '@/hooks/useDebounce'
import { useToast } from '@/context/ToastContext'
import { fieldErrors } from '@/services/client'
import {
  adminChapters, createAdminChapter, fetchClassOptions, fetchStreamOptions,
  fetchSubjectOptions, updateAdminChapter,
} from '@/admin/service'
import type {
  AcademicOption, AdminChapter, AdminQuery, ClassOption, SubjectOption,
} from '@/admin/types'
import { subjectOptionLabel } from '@/admin/types'
import {
  DataTable, ErrorState, PageHeader, Pagination, StatusBadge, TableEmpty, Toolbar, plural,
} from '@/admin/ui'
import { Field, FormModal, Select, SwitchField, TextInput, useDependentOptions } from '@/admin/ui/form'

const PAGE_SIZE = 25

export function AdminChaptersPage() {
  const { push } = useToast()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [streamFilter, setStreamFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<AdminChapter[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [classes, setClasses] = useState<ClassOption[]>([])
  const [editing, setEditing] = useState<AdminChapter | null>(null)
  const [creating, setCreating] = useState(false)

  const debouncedSearch = useDebounce(search, 350)

  useEffect(() => {
    const controller = new AbortController()
    fetchClassOptions(controller.signal)
      .then(setClasses)
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const filterClass = classes.find((option) => String(option.id) === classFilter)

  const filterStreams = useDependentOptions<AcademicOption>(
    (slug, signal) => fetchStreamOptions(slug, signal),
    filterClass?.slug,
  )

  /**
 * The Subject filter follows the Stream filter.
 *
 * Two details make this correct:
 *
 * 1. The stream slug is passed to the request, so Class 12 + Science returns
 *    only the five Science subjects. Without it the list is every Class 12
 *    subject, and "Mathematics" appears once per stream.
 * 2. The stream slug is part of the *key* as well as the request, because
 *    `useDependentOptions` reloads when its key changes and not otherwise.
 *    Keying only on the class would leave the previous stream's subjects on
 *    screen after the stream filter changed.
 */
const filterStreamSlug =
    streamFilter === ''
      ? ''
      : filterStreams.options.find((option) => String(option.id) === streamFilter)?.slug ?? ''

  const filterSubjects = useDependentOptions<SubjectOption>(
    (key, signal) => {
      const [classSlug = '', streamSlug = ''] = key.split('::')
      return fetchSubjectOptions(classSlug, streamSlug || null, signal)
    },
    filterClass ? `${filterClass.slug}::${filterStreamSlug}` : undefined,
  )

  /* ---------- List ---------- */

  const query = useMemo<AdminQuery>(() => {
    const params: AdminQuery = { page, page_size: PAGE_SIZE }
    if (debouncedSearch) params.search = debouncedSearch
    if (classFilter) params.class = classFilter
    if (streamFilter) params.stream = streamFilter
    if (subjectFilter) params.subject = subjectFilter
    if (statusFilter) params.status = statusFilter
    return params
  }, [page, debouncedSearch, classFilter, streamFilter, subjectFilter, statusFilter])

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      adminChapters(query, signal)
        .then((response) => {
          setRows(response.results)
          setCount(response.count)
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          setError(cause instanceof Error ? cause.message : 'Could not load chapters.')
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
  }, [debouncedSearch, classFilter, streamFilter, subjectFilter, statusFilter])

  const clearFilters = () => {
    setSearch('')
    setClassFilter('')
    setStreamFilter('')
    setSubjectFilter('')
    setStatusFilter('')
  }

  const save = async (payload: Partial<AdminChapter>, id: number | null) => {
    if (id === null) {
      await createAdminChapter(payload)
    } else {
      await updateAdminChapter(id, payload)
    }
    load()
  }

  const toggleActive = async (row: AdminChapter) => {
    try {
      await updateAdminChapter(row.id, { is_active: !row.is_active })
      push({
        tone: 'success',
        title: row.is_active ? 'Chapter deactivated' : 'Chapter activated',
        description: 'Existing content and PDFs were left untouched.',
      })
      load()
    } catch (cause) {
      push({
        tone: 'error',
        title: 'Could not update the chapter',
        description: cause instanceof Error ? cause.message : undefined,
      })
    }
  }

  /**
   * Open Content Management filtered to one chapter.
   *
   * This navigates to the existing page rather than opening a second one — the
   * brief forbids duplicating content management.
   */
  const openContentFor = (row: AdminChapter) => {
    navigate(`/admin-panel/content?chapter=${row.id}`)
  }

  return (
    <>
      <PageHeader
        title="Chapters"
        subtitle="Chapters belong to a subject. Choose the class first and the subject list narrows itself."
        action={
          <Button onClick={() => setCreating(true)} leadingIcon={<Plus className="size-4" />}>
            Add Chapter
          </Button>
        }
      />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search chapter…"
        onClear={clearFilters}
        filters={[
          {
            key: 'class',
            label: 'Class',
            value: classFilter,
            onChange: (value) => {
              setClassFilter(value)
              setStreamFilter('')
              setSubjectFilter('')
            },
            options: classes.map((option) => ({ value: String(option.id), label: option.name })),
          },
          ...(filterClass?.hasStreams
            ? ([
                {
                  key: 'stream',
                  label: 'Stream',
                  value: streamFilter,
                  onChange: (value: string) => {
                    setStreamFilter(value)
                    setSubjectFilter('')
                  },
                  options: filterStreams.options.map((option) => ({
                    value: String(option.id),
                    label: option.name,
                  })),
                },
              ] as const)
            : []),
          ...(filterClass
            ? ([
                {
                  key: 'subject',
                  label: 'Subject',
                  value: subjectFilter,
                  onChange: (value: string) => setSubjectFilter(value),
                  options: filterSubjects.options.map((option) => ({
                    value: String(option.id),
                    // Disambiguate by stream while the stream filter is unset.
                    label: streamFilter ? option.name : subjectOptionLabel(option),
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
        <ErrorState message={error} onRetry={() => load()} title="Unable to load chapters" />
      ) : (
        <>
          <DataTable<AdminChapter>
            columns={[
              {
                key: 'chapter',
                header: 'Chapter',
                cell: (row) => (
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {row.number}. {row.name}
                    </p>
                    {row.description ? (
                      <p className="mt-0.5 truncate text-xs text-ink-400">{row.description}</p>
                    ) : null}
                  </div>
                ),
              },
              { key: 'subject', header: 'Subject', cell: (row) => row.subject_name },
              { key: 'class', header: 'Class', cell: (row) => row.class_name },
              { key: 'stream', header: 'Stream', cell: (row) => row.stream_name ?? <Dash /> },
              {
                key: 'content',
                header: 'Content',
                align: 'right',
                cell: (row) =>
                  row.content_count > 0 ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        // Row click opens Edit; this is the explicit drill-down.
                        event.stopPropagation()
                        openContentFor(row)
                      }}
                      className="nums inline-flex min-h-9 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      title="Open this chapter in Content Management"
                    >
                      <FileText className="size-3.5" aria-hidden />
                      {plural(row.content_count, 'item')}
                    </button>
                  ) : (
                    <span className="nums text-ink-400">0</span>
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
              {
                key: 'order',
                header: 'Order',
                align: 'right',
                cell: (row) => <span className="nums">{row.display_order}</span>,
              },
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
                title="No chapters match these filters"
                description="Try clearing the filters, or add the first chapter for this subject."
                action={
                  <Button onClick={() => setCreating(true)} leadingIcon={<Plus className="size-4" />}>
                    Add Chapter
                  </Button>
                }
              />
            }
          />

          <Pagination page={page} pageCount={Math.max(1, Math.ceil(count / PAGE_SIZE))} onChange={setPage} total={count} />
        </>
      )}

      <ChapterForm
        open={creating || editing !== null}
        chapter={editing}
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

interface ChapterFormProps {
  open: boolean
  chapter: AdminChapter | null
  classes: ClassOption[]
  onClose: () => void
  onSave: (payload: Partial<AdminChapter>, id: number | null) => Promise<void>
  onNotify: (toast: { tone: 'success' | 'error' | 'info'; title: string; description?: string }) => void
}

function ChapterForm({ open, chapter, classes, onClose, onSave, onNotify }: ChapterFormProps) {
  const editing = chapter !== null

  const [classId, setClassId] = useState('')
  const [streamId, setStreamId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('1')
  const [displayOrder, setDisplayOrder] = useState('1')
  const [isActive, setIsActive] = useState(true)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /**
   * Prefill.
   *
   * Every id comes off the row we were handed. `class_level_id` and `stream_id`
   * are resolved server-side by `AdminChapterSerializer` precisely so this does
   * not need a request — and because the class determines which stream and
   * subject lists load, having them up front means the dependent fetches run
   * with the final keys instead of being triggered by a user action.
   */
  useEffect(() => {
    if (!open) return
    setClassId(chapter?.class_level_id ? String(chapter.class_level_id) : '')
    setStreamId(chapter?.stream_id ? String(chapter.stream_id) : '')
    setSubjectId(chapter?.subject ? String(chapter.subject) : '')
    setName(chapter?.name ?? '')
    setNumber(String(chapter?.number ?? 1))
    setDisplayOrder(String(chapter?.display_order ?? 1))
    setIsActive(chapter?.is_active ?? true)
    setErrors({})
    setFormError(null)
  }, [open, chapter])

  const selectedClass = classes.find((option) => String(option.id) === classId)
  const needsStream = Boolean(selectedClass?.hasStreams)

  // Resolve the selected class slug before any dependent fetch. Until the class
  // list has loaded, `classSlug` is undefined and both hooks short-circuit —
  // which is correct, not a flash: there is nothing to load for a class we do
  // not know the slug of yet.
  const classSlug = selectedClass?.slug

  const streams = useDependentOptions<AcademicOption>(
    (slug, signal) => fetchStreamOptions(slug, signal),
    classSlug,
  )

  const streamSlug = useMemo(
    () => (streamId ? streams.options.find((option) => String(option.id) === streamId)?.slug : undefined),
    [streamId, streams.options],
  )

  /**
   * Subjects for the current class and stream.
   *
   * The key carries the stream as well as the class, for the same reason as the
   * filter above: the option list has to reload when the stream changes, not only
   * when the class does. Waiting for the stream slug before fetching also avoids
   * a flash of Class 12 subjects that do not belong to the chosen stream.
   *
   * Classes 7-10 send an empty stream, which asks for every subject in the class.
   */
  const subjects = useDependentOptions<SubjectOption>(
    (key, signal) => {
      const [slug = '', stream = ''] = key.split('::')
      return fetchSubjectOptions(slug, stream || null, signal)
    },
    classSlug && (!needsStream || streamSlug) ? `${classSlug}::${streamSlug ?? ''}` : undefined,
  )

  /**
   * Drop a selection only once its option list is known to exclude it.
   *
   * `options.length === 0` means either "still loading" or "nothing matched";
   * treating that as a reason to clear would wipe a valid preselection during
   * the in-flight request.
   */
  useEffect(() => {
    if (!subjectId || !subjects.options.length) return
    if (subjects.options.some((option) => String(option.id) === subjectId)) return
    setSubjectId('')
  }, [subjects.options, subjectId])

  useEffect(() => {
    if (!streamId || !streams.options.length) return
    if (streams.options.some((option) => String(option.id) === streamId)) return
    setStreamId('')
  }, [streams.options, streamId])

  const changeClass = (value: string) => {
    setClassId(value)
    // Everything below the class is invalid for the new class. Clearing here
    // is what prevents a Class 10 Mathematics chapter being saved onto a
    // Class 12 Physics subject if the class is changed mid-edit.
    setStreamId('')
    setSubjectId('')
  }

  const submit = async () => {
    setSubmitting(true)
    setErrors({})
    setFormError(null)

    if (!subjectId) {
      setErrors({ subject: ['Choose a subject.'] })
      setFormError('Please correct the highlighted fields.')
      setSubmitting(false)
      return
    }

    try {
      await onSave(
        {
          subject: Number(subjectId),
          name: name.trim(),
          number: Number(number) || 1,
          display_order: Number(displayOrder) || 0,
          is_active: isActive,
        },
        chapter?.id ?? null,
      )
      onNotify({
        tone: 'success',
        title: editing ? 'Chapter updated' : 'Chapter created',
        description: editing
          ? 'The chapter keeps its id, so every content file and PDF stayed attached.'
          : undefined,
      })
      onClose()
    } catch (cause) {
      const fields = fieldErrors(cause)
      if (Object.keys(fields).length) {
        setErrors(fields)
        setFormError('Please correct the highlighted fields.')
      } else {
        setFormError(cause instanceof Error ? cause.message : 'Could not save the chapter.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const subjectPlaceholder = !classId
    ? 'Select a class first'
    : needsStream && !streamId
      ? 'Select a stream first'
      : subjects.loading
        ? 'Loading subjects…'
        : 'Select subject…'

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Chapter' : 'Add Chapter'}
      description={
        editing
          ? 'Only the name and settings change. The chapter keeps its id, and its content stays attached.'
          : 'Pick the class, then the subject this chapter belongs to.'
      }
      formError={formError}
      onSubmit={submit}
      submitting={submitting}
      submitLabel={editing ? 'Save changes' : 'Create chapter'}
    >
      <Field label="Class" required error={errors.class}>
        {(id, describedBy) => (
          <Select
            id={id}
            describedBy={describedBy}
            invalid={Boolean(errors.class)}
            value={classId}
            onChange={changeClass}
            disabled={submitting}
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
        <Field label="Stream" required hint="Classes 11 and 12 are grouped by stream." error={errors.stream}>
          {(id, describedBy) => (
            <Select
              id={id}
              describedBy={describedBy}
              invalid={Boolean(errors.stream)}
              value={streamId}
              onChange={(value) => {
                setStreamId(value)
                setSubjectId('')
              }}
              disabled={submitting}
            >
              <option value="">Select stream…</option>
              {streams.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : selectedClass ? (
        <p className="rounded-xl border border-hairline bg-ink-50 px-3 py-2.5 text-sm text-ink-500">
          {selectedClass.name} does not use streams — shown as not applicable.
        </p>
      ) : null}

      <Field
        label="Subject"
        required
        hint={
          selectedClass
            ? needsStream
              ? `Only ${selectedClass.name} subjects for the selected stream are listed.`
              : `Only ${selectedClass.name} subjects are listed.`
            : undefined
        }
        error={errors.subject}
      >
        {(id, describedBy) => (
          <Select
            id={id}
            describedBy={describedBy}
            invalid={Boolean(errors.subject)}
            value={subjectId}
            onChange={setSubjectId}
            disabled={!classId || (needsStream && !streamId) || submitting}
          >
            <option value="">{subjectPlaceholder}</option>
            {subjects.options.map((option) => (
              <option key={option.id} value={option.id}>
                {/* Never list a bare "Mathematics" twice: name its stream. */}
                {subjectOptionLabel(option)}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Chapter Name" required error={errors.name}>
        {(id, describedBy) => (
          <TextInput
            id={id}
            describedBy={describedBy}
            invalid={Boolean(errors.name)}
            value={name}
            onChange={setName}
            placeholder="e.g. Real Numbers"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Chapter Number" hint="Shown before the name." error={errors.number}>
          {(id, describedBy) => (
            <TextInput
              id={id}
              describedBy={describedBy}
              invalid={Boolean(errors.number)}
              type="number"
              min={1}
              inputMode="numeric"
              value={number}
              onChange={setNumber}
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
      </div>

      <SwitchField
        id="chapter-active"
        checked={isActive}
        onChange={setIsActive}
        label="Active"
        hint="Deactivating hides the chapter from students. Its content is kept."
      />
    </FormModal>
  )
}

function Dash() {
  return <span className="text-ink-400">—</span>
}