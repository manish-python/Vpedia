import { LogOut, Mail, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeading } from '@/layouts/AppLayout'
import { Avatar } from '@/components/user/Avatar'
import { ProfileCard, ProfileRow } from '@/components/user/ProfileCard'
import { Button, ButtonLink } from '@/components/common/Button'
import { Badge } from '@/components/common/Badge'
import { SkeletonPanel } from '@/components/common/Skeleton'
import { useAsync, useSeo } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { usePurchase } from '@/context/PurchaseContext'
import { resolveClass } from '@/services/resolveService'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { VClass } from '@/types'

/* ========================================================================
   Profile
   ---------------------------------------------------------------------
   Read-only identity, because the only authentication method is Google
   OAuth. There is intentionally no password row and no password change
   control — a student cannot have a password they never set.
   =================================================================== */

export function ProfilePage() {
  const { user, logout } = useAuth()
  const { unlockedClasses } = usePurchase()
  const navigate = useNavigate()

  const currentClass = user?.currentClassId ?? null

  // The class name comes from the catalogue the API serves, so a rename or a
  // withdrawn class is reflected here rather than being hardcoded.
  const { data: selectedClass, isLoading } = useAsync<VClass | null>(
    (signal) => (currentClass ? resolveClass(currentClass, signal) : Promise.resolve(null)),
    [currentClass],
    { enabled: currentClass !== null },
  )

  const className = selectedClass?.name ?? 'No class selected'
  const classUnlocked = currentClass !== null && unlockedClasses.includes(currentClass)

  useSeo({
    title: 'My Profile',
    description: 'Your VPEDIA LEARNING profile.',
    path: '/profile',
    noIndex: true,
  })

  return (
    <div className="space-y-6">
      <PageHeading title="My Profile" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* Identity card */}
        <section
          aria-label="Account summary"
          className="flex flex-col items-center rounded-2xl border border-hairline bg-white p-6 text-center shadow-card"
        >
          <Avatar name={user?.name} avatarUrl={user?.avatarUrl} size="xl" />

          <h2 className="mt-4 text-xl font-bold text-ink-900">{user?.name ?? 'Student'}</h2>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-ink-500">
            <Mail className="size-3.5" aria-hidden />
            <span className="truncate">{user?.email ?? '—'}</span>
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge tone={classUnlocked ? 'leaf' : 'neutral'}>
              {classUnlocked ? '✓ Access active' : 'No active access'}
            </Badge>
          </div>

          <div className="mt-5 w-full space-y-2.5 border-t border-hairline pt-5">
            <ButtonLink to="/library" variant="outline" size="md" fullWidth>
              My Library
            </ButtonLink>
            <ButtonLink to="/classes" variant="ghost" size="md" fullWidth>
              Browse classes
            </ButtonLink>
          </div>
        </section>

        {/* Details */}
        <div className="space-y-4">
          <ProfileCard>
            {isLoading ? (
              <div className="space-y-3 p-5">
                <SkeletonPanel className="h-12" />
              </div>
            ) : (
              <dl className="contents">
                <ProfileRow label="Name" value={user?.name ?? '—'} />
                <ProfileRow label="Email" value={user?.email ?? '—'} />
                <ProfileRow
                  label="Class (Current)"
                  value={
                    <span className="inline-flex items-center gap-2">
                      {className}
                      {classUnlocked ? (
                        <Badge tone="leaf" size="xs">
                          Unlocked
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="xs">
                          Not purchased
                        </Badge>
                      )}
                    </span>
                  }
                />
                <ProfileRow label="Member Since" value={formatDate(user?.joinedAt)} />
              </dl>
            )}
          </ProfileCard>

          {/* Sign-in method — explains why there is no password control */}
          <div className="flex items-start gap-3 rounded-2xl border border-hairline bg-white p-5 shadow-card">
            <span
              aria-hidden
              className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-leaf-50 text-leaf-600')}
            >
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[0.9375rem] font-bold text-ink-900">Signed in with Google</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                VPEDIA LEARNING uses Google sign-in only, so there is no password to change or
                reset. Your purchases stay linked to this Google account.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="lg"
            fullWidth
            leadingIcon={<LogOut className="size-5" aria-hidden />}
            onClick={() => {
              void logout().then(() => navigate('/'))
            }}
          >
            Logout
          </Button>
        </div>
      </div>
    </div>
  )
}
