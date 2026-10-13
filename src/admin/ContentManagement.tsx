  import { useCallback, useEffect, useMemo, useState } from 'react'
  import { useSearchParams } from 'react-router-dom'
  import {
    BookOpen,
    Eye,
    FileText,
    FolderTree,
    Pencil,
    Plus,
    Send,
    Upload,
  } from 'lucide-react'

  import { Button } from '@/components/common/Button'
  import { Modal } from '@/components/common/Modal'
  import { Loader } from '@/components/common/Spinner'
  import { DocumentPreview } from './DocumentPreview'
  import { CONTENT_TYPES, CONTENT_TYPE_ORDER } from '@/data/contentTypes'
  import { postForm } from '@/services/client'
  import {
    adminChapters,
    adminContent,
    adminContentDocumentUrl,
    adminOtherResourceDocumentUrl,
    adminOtherResources,
    adminResourceCategories,
    createOtherResource,
    createResourceCategory,
    fetchChapterOptions,
    fetchClassOptions,
    fetchStreamOptions,
    fetchSubjectOptions,
    publishOtherResource,
    updateAdminContent,
    updateOtherResource,
    updateResourceCategory,
    unpublishOtherResource,
  } from './service'
  import type {
    AcademicOption, AdminChapter, AdminContent, AdminOtherResource,
    AdminOtherResourceCategory, ClassOption,
  } from './types'

  /* ========================================================================
     Content Management
     ---------------------------------------------------------------------
     Two logically separate systems, behind one page and two tabs. They are
     never mixed in a single list, because they have different relationships and
     different access rules:

       [Class Content]   Class → Stream → Subject → Chapter → Content
                         Requires a PDF. Gated by `has_class_access`, so a
                         student needs an ACTIVE purchase of the owning class.

       [Other Resources] Category → Other Resource
                         Requires a PDF. No class, no chapter, no purchase. The
                         backend never consults `has_class_access` here.

     Uploads default to Draft. Publishing is an explicit action, so an
     accidental upload cannot reach a student.
     =================================================================== */

  type Toast = { tone: 'success' | 'error' | 'info'; title: string; description?: string }

  export function AdminContentPage({ onToast }: { onToast: (t: Toast) => void }) {
    const [tab, setTab] = useState<'class' | 'resources'>('class')

    return (
      <>
        <PageHeading
          title="Content Management"
          subtitle="Class study material and independent Other Resources, kept separate."
        />

        <div role="tablist" aria-label="Content system" className="mb-6 flex gap-2">
          <TabButton active={tab === 'class'} onClick={() => setTab('class')} icon={FolderTree}>
            Class Content
          </TabButton>
          <TabButton
            active={tab === 'resources'}
            onClick={() => setTab('resources')}
            icon={BookOpen}
          >
            Other Resources
          </TabButton>
        </div>

        {tab === 'class' ? <ClassContentTab onToast={onToast} /> : <OtherResourcesTab onToast={onToast} />}
      </>
    )
  }

  function TabButton({
    active,
    onClick,
    icon: Icon,
    children,
  }: {
    active: boolean
    onClick: () => void
    icon: typeof FolderTree
    children: React.ReactNode
  }) {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
          active ? 'bg-brand-600 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'
        }`}
      >
        <Icon className="size-4" aria-hidden />
        {children}
      </button>
    )
  }

  /* ======================================================================
     Shared bits
     =================================================================== */

  function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
      <div className="mb-6">
        <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-500">{subtitle}</p> : null}
      </div>
    )
  }

  function StatusPill({ published }: { published: boolean }) {
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
          published ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {published ? 'Published' : 'Draft'}
      </span>
    )
  }

  function Field({
    label,
    required,
    error,
    children,
  }: {
    label: string
    required?: boolean
    error?: string | null
    children: React.ReactNode
  }) {
    return (
      <label className="block text-sm font-semibold">
        <span className="text-ink-700">
          {label}
          {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
        </span>
        <div className="mt-1">{children}</div>
        {error ? (
          <span role="alert" className="mt-1 block text-xs font-medium text-rose-600">
            {error}
          </span>
        ) : null}
      </label>
    )
  }

  const inputClass =
    'w-full rounded-xl border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400'

  /** Client-side PDF check. The backend repeats this and remains authoritative. */
  function isPdf(file: File | null): boolean {
    if (!file) return false
    const looksPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    // A renamed .zip/.exe usually has an executable or archive MIME type.
    const mimeBlocked =
      file.type !== '' &&
      !file.type.includes('pdf') &&
      (file.type.includes('zip') ||
        file.type.includes('octet-stream') ||
        file.type.includes('javascript') ||
        file.type.includes('html') ||
        file.type.includes('msdownload'))
    return looksPdf && !mimeBlocked
  }

  function formatBytes(bytes: number | null): string {
    if (bytes === null) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /** Reusable pager: the backend serves 25 per page. */
  function Pagination({
    page,
    count,
    onChange,
  }: {
    page: number
    count: number
    onChange: (page: number) => void
  }) {
    const pages = Math.max(1, Math.ceil(count / 25))
    if (pages <= 1) return null
    return (
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-ink-500 nums">
          Page {page} of {pages} · {count} total
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    )
  }

  /* ======================================================================
     Class Content tab
     =================================================================== */

  /**
   * Drop a consumed deep-link parameter so a refresh does not re-apply it.
   *
   * `replace` keeps the back button meaningful: arriving at the filtered view
   * from Chapters, then pressing Back, returns to Chapters rather than to an
   * identical Content page.
   */
  function clearDeepLink(
    current: URLSearchParams,
    setSearchParams: (next: URLSearchParams, options?: { replace?: boolean }) => void,
    key: string,
  ): void {
    const next = new URLSearchParams(current)
    next.delete(key)
    setSearchParams(next, { replace: true })
  }

  function ClassContentTab({ onToast }: { onToast: (t: Toast) => void }) {
    const [searchParams, setSearchParams] = useSearchParams()
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [classFilter, setClassFilter] = useState('')
    const [subjectFilter, setSubjectFilter] = useState('')
    const [chapterFilter, setChapterFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('')
    const [publishedFilter, setPublishedFilter] = useState('')
    const [rows, setRows] = useState<AdminContent[]>([])
    const [count, setCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<AdminContent | null>(null)
    // The row being previewed, or null. Holding the whole row rather than just an
    // id is what lets the modal show the title and filename it is previewing.
    const [previewing, setPreviewing] = useState<AdminContent | null>(null)

    const [classes, setClasses] = useState<ClassOption[]>([])
    const [subjects, setSubjects] = useState<AcademicOption[]>([])
    const [chapters, setChapters] = useState<AcademicOption[]>([])

    useEffect(() => {
      fetchClassOptions().then(setClasses).catch(() => setClasses([]))
    }, [])

  /**
   * Deep link: `?chapter=<id>` from the Chapters table's content count.
   *
   * The chapter dropdown is the third link in a Class -> Subject -> Chapter
   * chain, so selecting it means populating the two above it first. The admin
   * chapter row carries `class_level_id` and `subject`, which is exactly what is
   * needed to resolve those ancestors without guessing.
   *
   * Once the chapter options have loaded and contain the id, the final filter is
   * applied and the parameter consumed. This reuses the existing page rather than
   * opening a second content screen.
   */
  useEffect(() => {
    const chapterParam = searchParams.get('chapter')
    if (!chapterParam) return

    // The options have arrived, so the selection can finally be made.
    if (chapters.length) {
      if (chapters.some((option) => String(option.id) === chapterParam)) {
        setChapterFilter(chapterParam)
        setPage(1)
        clearDeepLink(searchParams, setSearchParams, 'chapter')
      }
      return
    }

    // Otherwise resolve the ancestors first. Guarded so this runs only once.
    if (classFilter || subjectFilter) return
    let cancelled = false

    void findChapterRow(chapterParam)
      .then((match) => {
        if (!match || cancelled) return
        setClassFilter(String(match.class_level_id))
        setSubjectFilter(String(match.subject))
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [searchParams, chapters, classFilter, subjectFilter, setSearchParams])

  /**
   * Look one chapter up by primary key.
   *
   * Pages through the admin chapters endpoint until the id appears, so a deep
   * link works for a chapter on any page without pulling the whole catalogue.
   */
async function findChapterRow(id: string): Promise<AdminChapter | null> {
  const PAGE = 100
  for (let page = 1; page <= 10; page += 1) {
    const response = await adminChapters({ page, page_size: PAGE })
    const match = response.results.find((row) => String(row.id) === id)
    if (match) return match
    if (!response.next) break
  }
  return null
}

  useEffect(() => {
    const contentParam = searchParams.get('class_content')
    if (!contentParam) return
    // The row itself is fetched so the edit form opens on the right item.
    adminContent({ search: contentParam, page_size: 100 })
      .then((response) => {
        const row = response.results[0]
        if (!row) return
        setEditing(row)
        clearDeepLink(searchParams, setSearchParams, 'class_content')
      })
      .catch(() => undefined)
  }, [searchParams, setSearchParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await adminContent({
        page,
        search: search.trim() || undefined,
        class: classFilter || undefined,
        subject: subjectFilter || undefined,
        chapter: chapterFilter || undefined,
        type: typeFilter || undefined,
        published: publishedFilter || undefined,
      })
      setRows(body.results)
      setCount(body.count)
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Unable to load content',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [page, search, classFilter, subjectFilter, chapterFilter, typeFilter, publishedFilter, onToast])

  useEffect(() => {
    void load()
  }, [load])

  // Filter dropdowns: subjects follow the chosen class, chapters follow subject.
  useEffect(() => {
    const selected = classes.find((c) => String(c.id) === classFilter)
    if (!selected) {
      setSubjects([])
      return
    }
    fetchSubjectOptions(selected.slug)
      .then(setSubjects)
      .catch(() => setSubjects([]))
  }, [classFilter, classes])

  useEffect(() => {
    const selected = subjects.find((s) => String(s.id) === subjectFilter)
    if (!selected) {
      setChapters([])
      return
    }
    fetchChapterOptions(selected.slug)
      .then(setChapters)
      .catch(() => setChapters([]))
  }, [subjectFilter, subjects])

  const toggle = async (row: AdminContent, publish: boolean) => {
    try {
      await updateAdminContent(row.id, { is_published: publish })
      onToast({ tone: 'success', title: publish ? 'Content published' : 'Content unpublished' })
      void load()
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Update failed',
        description: cause instanceof Error ? cause.message : undefined,
      })
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search by title"
          aria-label="Search class content"
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
        />
        <FilterSelect
          value={classFilter}
          onChange={(v) => {
            setClassFilter(v)
            setSubjectFilter('')
            setChapterFilter('')
            setPage(1)
          }}
          label="All classes"
          options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
        />
        <FilterSelect
          value={subjectFilter}
          onChange={(v) => {
            setSubjectFilter(v)
            setChapterFilter('')
            setPage(1)
          }}
          label="All subjects"
          options={subjects.map((s) => ({ value: String(s.id), label: s.name }))}
        />
        <FilterSelect
          value={chapterFilter}
          onChange={(v) => {
            setChapterFilter(v)
            setPage(1)
          }}
          label="All chapters"
          options={chapters.map((c) => ({ value: String(c.id), label: `${c.id} · ${c.name}` }))}
        />
        <FilterSelect
          value={typeFilter}
          onChange={(v) => {
            setTypeFilter(v)
            setPage(1)
          }}
          label="All types"
          options={CONTENT_TYPE_ORDER.map((t) => ({ value: t, label: CONTENT_TYPES[t].label }))}
        />
        <FilterSelect
          value={publishedFilter}
          onChange={(v) => {
            setPublishedFilter(v)
            setPage(1)
          }}
          label="All statuses"
          options={[
            { value: 'true', label: 'Published' },
            { value: 'false', label: 'Draft' },
          ]}
        />
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="mr-1.5 size-4" aria-hidden />
          Add Content
        </Button>
      </div>

      {loading ? (
        <div className="py-10">
          <Loader label="Loading content…" />
        </div>
      ) : rows.length === 0 ? (
        <AdminEmpty
          title="No content uploaded yet."
          description="Add your first class content item to get started."
          action={{ label: 'Add Content', onClick: () => { setEditing(null); setFormOpen(true) } }}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs uppercase text-ink-500">
                  <th className="p-4">Title</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Chapter</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-ink-100">
                    <td className="p-4 font-semibold">{row.title}</td>
                    <td>{row.class_name}</td>
                    <td>{row.subject_name}</td>
                    <td>{row.chapter_name}</td>
                    <td>{row.content_type}</td>
                    <td>
                      <StatusPill published={row.is_published} />
                    </td>
                    <td className="nums">{row.display_order}</td>
                    <td className="p-4">
                      <RowActions
                        onView={() => setPreviewing(row)}
                        onEdit={() => { setEditing(row); setFormOpen(true) }}
                        onToggle={() => void toggle(row, !row.is_published)}
                        toggleLabel={row.is_published ? 'Unpublish' : 'Publish'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={count} onChange={setPage} />
        </>
      )}

      <ClassContentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        classes={classes}
        onSaved={() => { setFormOpen(false); void load() }}
        onToast={onToast}
      />

      <DocumentPreview
        open={previewing !== null}
        title={previewing?.title ?? ''}
        subtitle={
          previewing
            ? `${previewing.class_name} · ${previewing.subject_name} · ${previewing.chapter_name}`
            : ''
        }
        fileName={previewing?.file_name ?? null}
        src={previewing ? adminContentDocumentUrl(previewing.id) : null}
        onClose={() => setPreviewing(null)}
      />
    </>
  )
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function RowActions({
  onView,
  onEdit,
  onToggle,
  toggleLabel,
}: {
  onView: () => void
  onEdit: () => void
  onToggle: () => void
  toggleLabel: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onView} className="inline-flex items-center gap-1 font-bold text-ink-600">
        <Eye className="size-3.5" aria-hidden />
        View
      </button>
      <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 font-bold text-brand-700">
        <Pencil className="size-3.5" aria-hidden />
        Edit
      </button>
      <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 font-bold text-grape-700">
        <Send className="size-3.5" aria-hidden />
        {toggleLabel}
      </button>
    </div>
  )
}

function AdminEmpty({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-14 text-center">
      <FileText className="mx-auto mb-4 size-8 text-ink-300" aria-hidden />
      <p className="font-bold text-ink-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>
      {action ? (
        <Button className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}

/* ======================================================================
   Class Content form
   =================================================================== */

function ClassContentForm({
  open,
  onClose,
  editing,
  classes,
  onSaved,
  onToast,
}: {
  open: boolean
  onClose: () => void
  editing: AdminContent | null
  classes: ClassOption[]
  onSaved: () => void
  onToast: (t: Toast) => void
}) {
  const [classId, setClassId] = useState('')
  const [streamId, setStreamId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [chapterId, setChapterId] = useState('')
  const [type, setType] = useState<string>('NOTES')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [order, setOrder] = useState('0')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [streams, setStreams] = useState<AcademicOption[]>([])
  const [subjects, setSubjects] = useState<AcademicOption[]>([])
  const [chapters, setChapters] = useState<AcademicOption[]>([])

  const selectedClass = useMemo(
    () => classes.find((c) => String(c.id) === classId),
    [classes, classId],
  )
  const selectedStream = useMemo(
    () => streams.find((s) => String(s.id) === streamId),
    [streams, streamId],
  )
  const selectedSubject = useMemo(
    () => subjects.find((s) => String(s.id) === subjectId),
    [subjects, subjectId],
  )

  // Reset the whole form whenever it opens.
  useEffect(() => {
    if (!open) return
    setErrors({})
    setFile(null)
    setBusy(false)
    if (editing) {
      setTitle(editing.title)
      setDescription(editing.description)
      setType(editing.content_type)
      setOrder(String(editing.display_order))
      // Editing keeps the existing chapter; its ancestors are not re-selectable
      // because the write payload only carries the chapter.
      setChapterId(String(editing.chapter))
    } else {
      setClassId('')
      setStreamId('')
      setSubjectId('')
      setChapterId('')
      setType('NOTES')
      setTitle('')
      setDescription('')
      setOrder('0')
    }
  }, [open, editing])

  // Class → streams. Stream is only offered where the class needs one.
  useEffect(() => {
    if (!open || !selectedClass) {
      setStreams([])
      return
    }
    fetchStreamOptions(selectedClass.slug)
      .then(setStreams)
      .catch(() => setStreams([]))
  }, [open, selectedClass])

  // Class (+ stream) → subjects.
  useEffect(() => {
    if (!open || !selectedClass) {
      setSubjects([])
      return
    }
    fetchSubjectOptions(selectedClass.slug, selectedStream?.slug ?? null)
      .then(setSubjects)
      .catch(() => setSubjects([]))
  }, [open, selectedClass, selectedStream])

  // Subject → chapters.
  useEffect(() => {
    if (!open || !selectedSubject) {
      setChapters([])
      return
    }
    fetchChapterOptions(selectedSubject.slug)
      .then(setChapters)
      .catch(() => setChapters([]))
  }, [open, selectedSubject])

  const streamRequired = Boolean(selectedClass?.hasStreams)

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!editing) {
      if (!classId) next.classId = 'Choose a class.'
      if (streamRequired && !streamId) next.streamId = 'This class requires a stream.'
      if (!subjectId) next.subjectId = 'Choose a subject.'
    }
    if (!chapterId) next.chapterId = 'Choose a chapter.'
    if (!title.trim()) next.title = 'A title is required.'
    if (!file && !editing) next.file = 'Choose a PDF to upload.'
    if (file && !isPdf(file)) next.file = 'Only PDF files are accepted.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (publish: boolean) => {
    if (!validate()) return
    setBusy(true)
    try {
      if (editing) {
        const patch: Partial<AdminContent> = {
          title: title.trim(),
          description: description.trim(),
          content_type: type,
          display_order: Number(order) || 0,
          is_published: publish,
        }
        if (file) patch.file = file
        await updateAdminContent(editing.id, patch)
      } else {
        const form = new FormData()
        form.append('chapter', chapterId)
        form.append('title', title.trim())
        form.append('description', description.trim())
        form.append('content_type', type)
        form.append('display_order', order || '0')
        form.append('is_published', String(publish))
        if (file) form.append('file', file)
        await createClassContent(form)
      }
      onToast({
        tone: 'success',
        title: publish ? 'Content published' : 'Draft saved',
        description: publish
          ? 'Students with access to this class can now read it.'
          : 'Students cannot see this until you publish it.',
      })
      onSaved()
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Could not save content',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit class content' : 'Add class content'}
      description="Class content belongs to a chapter and is protected by the class purchase."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" loading={busy} onClick={() => void save(false)}>
            Save Draft
          </Button>
          <Button loading={busy} onClick={() => void save(true)}>
            Publish
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Class" required error={errors.classId}>
          <select
            value={classId}
            disabled={Boolean(editing)}
            onChange={(e) => {
              // Class change resets everything below it.
              setClassId(e.target.value)
              setStreamId('')
              setSubjectId('')
              setChapterId('')
            }}
            className={inputClass}
          >
            <option value="">Select class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Stream is hidden entirely for Classes 7-10, which do not use one. */}
        {streamRequired ? (
          <Field label="Stream" required error={errors.streamId}>
            <select
              value={streamId}
              onChange={(e) => {
                // Stream change resets subject and chapter.
                setStreamId(e.target.value)
                setSubjectId('')
                setChapterId('')
              }}
              className={inputClass}
            >
              <option value="">Select stream…</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="flex items-end">
            <p className="pb-2.5 text-xs text-ink-500">
              {selectedClass ? `${selectedClass.name} does not use streams.` : 'Select a class first.'}
            </p>
          </div>
        )}

        <Field label="Subject" required error={errors.subjectId}>
          <select
            value={subjectId}
            disabled={Boolean(editing)}
            onChange={(e) => {
              // Subject change resets chapter.
              setSubjectId(e.target.value)
              setChapterId('')
            }}
            className={inputClass}
          >
            <option value="">Select subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Chapter" required error={errors.chapterId}>
          <select
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select chapter…</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Content type" required>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            {CONTENT_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {CONTENT_TYPES[t].label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Display order">
          <input
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Title" required error={errors.title}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Real Numbers Complete Notes"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="PDF" required={!editing} error={errors.file}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                setFile(picked)
                if (picked && !isPdf(picked)) {
                  setErrors((prev) => ({ ...prev, file: 'Only PDF files are accepted.' }))
                } else {
                  setErrors((prev) => ({ ...prev, file: '' }))
                }
              }}
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-xs file:font-semibold"
            />
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
              <Upload className="size-3.5" aria-hidden />
              {file
                ? `${file.name} · ${formatBytes(file.size)}`
                : editing?.file_name
                  ? `Current: ${editing.file_name} · ${formatBytes(editing.file_size)}`
                  : 'PDF only, up to the configured size limit.'}
            </p>
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function createClassContent(form: FormData) {
  return postForm<AdminContent>('/admin/content/', form)
}

/* ======================================================================
   Other Resources tab
   =================================================================== */

function OtherResourcesTab({ onToast }: { onToast: (t: Toast) => void }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [publishedFilter, setPublishedFilter] = useState('')
  const [rows, setRows] = useState<AdminOtherResource[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<AdminOtherResourceCategory[]>([])

  const [formOpen, setFormOpen] = useState(false)
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminOtherResource | null>(null)
  const [previewing, setPreviewing] = useState<AdminOtherResource | null>(null)

  const loadCategories = useCallback(async () => {
    try {
      const body = await adminResourceCategories({ page_size: 100 })
      setCategories(body.results)
    } catch {
      setCategories([])
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const body = await adminOtherResources({
        page,
        search: search.trim() || undefined,
        category: categoryFilter || undefined,
        published: publishedFilter || undefined,
      })
      setRows(body.results)
      setCount(body.count)
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Unable to load resources',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [page, search, categoryFilter, publishedFilter, onToast])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (row: AdminOtherResource, publish: boolean) => {
    try {
      if (publish) await publishOtherResource(row.id)
      else await unpublishOtherResource(row.id)
      onToast({
        tone: 'success',
        title: publish ? 'Resource published' : 'Resource unpublished',
      })
      void load()
      void loadCategories()
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Update failed',
        description: cause instanceof Error ? cause.message : undefined,
      })
    }
  }

  return (
    <>
      <p className="mb-4 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
        Other Resources are independent of the class syllabus: no class, stream, subject or chapter,
        and never connected to a purchase. Publishing one grants no class access.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search by title"
          aria-label="Search other resources"
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
        />
        <FilterSelect
          value={categoryFilter}
          onChange={(v) => {
            setCategoryFilter(v)
            setPage(1)
          }}
          label="All categories"
          options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
        />
        <FilterSelect
          value={publishedFilter}
          onChange={(v) => {
            setPublishedFilter(v)
            setPage(1)
          }}
          label="All statuses"
          options={[
            { value: 'true', label: 'Published' },
            { value: 'false', label: 'Draft' },
          ]}
        />
        <Button size="sm" variant="outline" onClick={() => setCategoryFormOpen(true)}>
          <FolderTree className="mr-1.5 size-4" aria-hidden />
          Manage Categories
        </Button>
        <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>
          <Plus className="mr-1.5 size-4" aria-hidden />
          Add Resource
        </Button>
      </div>

      {loading ? (
        <div className="py-10">
          <Loader label="Loading resources…" />
        </div>
      ) : rows.length === 0 ? (
        <AdminEmpty
          title="No matching resources found."
          description="Add an Other Resource, or clear your filters."
          action={{ label: 'Add Resource', onClick: () => { setEditing(null); setFormOpen(true) } }}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-xs uppercase text-ink-500">
                  <th className="p-4">Title</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>File</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-ink-100">
                    <td className="p-4 font-semibold">{row.title}</td>
                    <td>{row.category_name}</td>
                    <td>
                      <StatusPill published={row.is_published} />
                    </td>
                    <td className="nums">{row.display_order}</td>
                    <td className="nums">{formatBytes(row.file_size)}</td>
                    <td className="p-4">
                      <RowActions
                        onView={() => setPreviewing(row)}
                        onEdit={() => { setEditing(row); setFormOpen(true) }}
                        onToggle={() => void toggle(row, !row.is_published)}
                        toggleLabel={row.is_published ? 'Unpublish' : 'Publish'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} count={count} onChange={setPage} />
        </>
      )}

      <OtherResourceForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        categories={categories}
        onSaved={() => { setFormOpen(false); void load(); void loadCategories() }}
        onToast={onToast}
      />

      <DocumentPreview
        open={previewing !== null}
        title={previewing?.title ?? ''}
        subtitle={previewing?.category_name ?? ''}
        fileName={previewing?.file_name ?? null}
        src={previewing ? adminOtherResourceDocumentUrl(previewing.id) : null}
        onClose={() => setPreviewing(null)}
      />

      <CategoryManager
        open={categoryFormOpen}
        onClose={() => setCategoryFormOpen(false)}
        categories={categories}
        onChanged={loadCategories}
        onToast={onToast}
      />
    </>
  )
}

function OtherResourceForm({
  open,
  onClose,
  editing,
  categories,
  onSaved,
  onToast,
}: {
  open: boolean
  onClose: () => void
  editing: AdminOtherResource | null
  categories: AdminOtherResourceCategory[]
  onSaved: () => void
  onToast: (t: Toast) => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [order, setOrder] = useState('0')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setFile(null)
    setBusy(false)
    if (editing) {
      setCategoryId(String(editing.category))
      setTitle(editing.title)
      setDescription(editing.description)
      setOrder(String(editing.display_order))
    } else {
      setCategoryId('')
      setTitle('')
      setDescription('')
      setOrder('0')
    }
  }, [open, editing])

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!categoryId) next.categoryId = 'Choose a category.'
    if (!title.trim()) next.title = 'A title is required.'
    if (!file && !editing) next.file = 'Choose a PDF to upload.'
    if (file && !isPdf(file)) next.file = 'Only PDF files are accepted.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (publish: boolean) => {
    if (!validate()) return
    setBusy(true)
    try {
      if (editing) {
        const payload: Partial<AdminOtherResource> = {
          category: Number(categoryId),
          title: title.trim(),
          description: description.trim(),
          display_order: Number(order) || 0,
          is_published: publish,
        }
        // Only when a replacement was actually chosen. Omitting the key is what
        // preserves the stored PDF; the old JSON body had nowhere to put it, so
        // selecting a new file here silently did nothing at all.
        if (file) payload.file = file
        await updateOtherResource(editing.id, payload)
      } else {
        const form = new FormData()
        form.append('category', categoryId)
        form.append('title', title.trim())
        form.append('description', description.trim())
        form.append('display_order', order || '0')
        form.append('is_published', String(publish))
        if (file) form.append('file', file)
        await createOtherResource(form)
      }
      onToast({
        tone: 'success',
        title: publish ? 'Resource published' : 'Draft saved',
        description: publish
          ? 'Students can now find it under Other Resources.'
          : 'Students cannot see this until you publish it.',
      })
      onSaved()
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Could not save resource',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit resource' : 'Add resource'}
      description="Independent of any class. No stream, subject or chapter applies."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" loading={busy} onClick={() => void save(false)}>
            Save Draft
          </Button>
          <Button loading={busy} onClick={() => void save(true)}>
            Publish
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" required error={errors.categoryId}>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Display order">
          <input
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Title" required error={errors.title}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Python Beginner Notes"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Learn the fundamentals of Python programming."
              className={inputClass}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="PDF" required={!editing} error={errors.file}>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-xs file:font-semibold"
            />
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
              <Upload className="size-3.5" aria-hidden />
              {file
                ? `${file.name} · ${formatBytes(file.size)}`
                : editing?.file_name
                  ? `Current: ${editing.file_name} · ${formatBytes(editing.file_size)}`
                  : 'PDF only.'}
            </p>
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function CategoryManager({
  open,
  onClose,
  categories,
  onChanged,
  onToast,
}: {
  open: boolean
  onClose: () => void
  categories: AdminOtherResourceCategory[]
  onChanged: () => Promise<void>
  onToast: (t: Toast) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [order, setOrder] = useState('0')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setOrder('0')
      setEditingId(null)
    }
  }, [open])

  const create = async () => {
    if (!name.trim()) {
      onToast({ tone: 'error', title: 'A category name is required.' })
      return
    }
    setBusy(true)
    try {
      await createResourceCategory({
        name: name.trim(),
        description: description.trim(),
        display_order: Number(order) || 0,
      })
      onToast({ tone: 'success', title: 'Category created' })
      setName('')
      setDescription('')
      setOrder('0')
      await onChanged()
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Could not create category',
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (category: AdminOtherResourceCategory) => {
    try {
      await updateResourceCategory(category.id, { is_active: !category.is_active })
      onToast({ tone: 'success', title: 'Category updated' })
      await onChanged()
    } catch (cause) {
      onToast({
        tone: 'error',
        title: 'Could not update category',
        description: cause instanceof Error ? cause.message : undefined,
      })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resource categories"
      description="Categories are administrator-managed; nothing is hardcoded in the app."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button loading={busy} onClick={() => void create()}>
            <Plus className="mr-1.5 size-4" aria-hidden />
            Add Category
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Coding & Programming"
            className={inputClass}
          />
        </Field>
        <Field label="Display order">
          <input
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-ink-100 rounded-xl border border-ink-200">
        {categories.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-ink-500">
            No categories yet. Add one above, or run{' '}
            <code className="text-xs">seed_resource_categories</code>.
          </li>
        ) : (
          categories.map((category) => (
            <li key={category.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{category.name}</p>
                <p className="truncate text-xs text-ink-500">
                  {category.description || '—'} · order {category.display_order} ·{' '}
                  {category.resource_count} resource(s)
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  category.is_active
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-ink-100 text-ink-500'
                }`}
              >
                {category.is_active ? 'Active' : 'Inactive'}
              </span>
              <button
                type="button"
                onClick={() => void toggleActive(category)}
                className="shrink-0 text-xs font-bold text-brand-700"
              >
                {category.is_active ? 'Deactivate' : 'Activate'}
              </button>
              {editingId === category.id ? <Pencil className="size-3.5 text-ink-300" aria-hidden /> : null}
            </li>
          ))
        )}
      </ul>
    </Modal>
  )
  }
