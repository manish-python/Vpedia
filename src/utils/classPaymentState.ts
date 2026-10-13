import type { ClassId, PaymentProof, Purchase } from '@/types'

/* ========================================================================
   Class payment state — the single answer to "what is happening with this
   class?" for every screen.

   ---------------------------------------------------------------------
   Why this exists
   ---------------------------------------------------------------------
   Three concepts were being collapsed into one, and each collapse produced a
   different wrong screen:

   1. the UPI app's own payment state (the student paid, cancelled, or never
      opened it) — which this application never observes, because there is no
      gateway;
   2. whether a payment *proof* was submitted — the only evidence of a
      payment, and it lives on `PaymentProof`;
   3. whether the class is unlocked — decided by an ACTIVE `ClassPurchase`.

   The bug this module fixes: the dashboard and the purchase page each picked
   the *newest* purchase for a class and looked up proofs *only for that one
   purchase*. But `create_purchase_request` only refuses to open a new purchase
   while one is PENDING or ACTIVE, so after a rejection a second purchase row
   exists for the same class. From then on the newest purchase had no proof, so
   a student who had genuinely submitted evidence — and been told why it was
   rejected — saw:

       Payment not completed          Continue Payment

   with the rejection reason gone. An old checkout row was overriding a newer,
   real submitted proof.

   So the answer is computed per *class* from every purchase and every proof
   the student holds, with an explicit priority. The proof decides whether a
   payment is being verified; the purchase decides whether the class is open.

   ---------------------------------------------------------------------
   Priority
   ---------------------------------------------------------------------
     1. an ACTIVE purchase            -> active      (the only thing that unlocks)
     2. a PENDING proof               -> pending     (verification under way)
     3. a REJECTED proof / purchase   -> rejected    (evidence was refused)
     4. a PENDING purchase, no proof  -> incomplete  (checkout abandoned)
     5. nothing                       -> locked

   Order matters in one direction only: real evidence (2, 3) outranks an
   abandoned checkout (4). An ACTIVE purchase still wins over everything,
   because it is the one authoritative grant of access.

   A cancelled or failed UPI payment in the student's own app changes nothing
   here. This application has no gateway and never receives that event, so a
   PENDING proof stays PENDING no matter how the student got back to the
   browser.
   =================================================================== */

export type ClassPaymentState =
  | 'locked'
  | 'incomplete'
  | 'pending'
  | 'active'
  | 'rejected'

export interface ClassPaymentView {
  state: ClassPaymentState
  /** The purchase that decides this state, and the one any link should target. */
  purchase: Purchase | null
  /** The proof that decides this state, when there is one. */
  proof: PaymentProof | null
  /** The administrator's reason. Only ever non-null when the server said so. */
  rejectionReason: string | null
}

const LOCKED: ClassPaymentView = {
  state: 'locked',
  purchase: null,
  proof: null,
  rejectionReason: null,
}

function view(over: Partial<ClassPaymentView> & { state: ClassPaymentState }): ClassPaymentView {
  return {
    purchase: null,
    proof: null,
    rejectionReason: null,
    ...over,
  }
}

/**
 * Newest first.
 *
 * Purchases carry `createdAt` and proofs `submittedAt`, both straight from the
 * server, so "most recent" is decided by a timestamp rather than by whatever
 * order an endpoint happened to serialise in. A rejected-then-retried class has
 * several rows and only the newest decision is interesting.
 */
function newestFirst<T extends { createdAt?: string | null; submittedAt?: string | null }>(
  rows: readonly T[],
  key: 'createdAt' | 'submittedAt',
): T[] {
  return [...rows].sort((a, b) => {
    const left = Date.parse(a[key] ?? '') || 0
    const right = Date.parse(b[key] ?? '') || 0
    return right - left
  })
}

/**
 * Resolve one class from every purchase and proof the student holds.
 *
 * Proofs are attributed to a class through the purchase they settle. A proof
 * whose purchase is unknown is ignored rather than guessed at, for the same
 * reason `fetchPurchases` drops an unresolvable class: attributing it to the
 * wrong class would tell a student their payment is under review for a class
 * they never bought.
 */
export function resolveClassPayment(
  classId: ClassId,
  purchases: readonly Purchase[],
  proofs: readonly PaymentProof[],
): ClassPaymentView {
  const mine = newestFirst(
    purchases.filter((purchase) => purchase.classId === classId),
    'createdAt',
  )
  if (mine.length === 0 && proofs.length === 0) return LOCKED

  const purchaseById = new Map(mine.map((purchase) => [purchase.id, purchase]))
  const myProofs = newestFirst(
    proofs.filter((proof) => purchaseById.has(proof.purchaseId)),
    'submittedAt',
  )

  // 1. An ACTIVE purchase is the server's grant of access. Nothing outranks it.
  const active = mine.find((purchase) => purchase.status === 'success')
  if (active) {
    const proof = myProofs.find((row) => row.purchaseId === active.id && row.status === 'approved')
    return view({ state: 'active', purchase: active, proof: proof ?? null })
  }

  // 2. A proof awaiting review. This is the "payment verification" state, and it
  //    holds regardless of what the student's UPI app did afterwards.
  const pending = myProofs.find((proof) => proof.status === 'pending')
  if (pending) {
    return view({ state: 'pending', purchase: purchaseById.get(pending.purchaseId) ?? null, proof: pending })
  }

  // 3. Evidence the administrator refused. The reason travels with it.
  const rejected = myProofs.find((proof) => proof.status === 'rejected')
  if (rejected) {
    return view({
      state: 'rejected',
      purchase: purchaseById.get(rejected.purchaseId) ?? null,
      proof: rejected,
      rejectionReason: rejected.rejectionReason || null,
    })
  }

  // A purchase closed without a decision is treated as a refusal, so the class
  // does not fall through to "you never bought this".
  const closed = mine.find(
    (purchase) => purchase.status === 'failed' || purchase.status === 'cancelled',
  )
  if (closed) return view({ state: 'rejected', purchase: closed })

  // 4. Checkout opened and abandoned: a PENDING purchase with no proof at all.
  const open = mine.find((purchase) => purchase.status === 'pending')
  if (open) return view({ state: 'incomplete', purchase: open })

  return LOCKED
}

/** {@link resolveClassPayment} for every class at once, keyed by class. */
export function resolveClassPayments(
  purchases: readonly Purchase[],
  proofs: readonly PaymentProof[],
): Map<ClassId, ClassPaymentView> {
  const byClass = new Map<ClassId, Purchase[]>()
  for (const purchase of purchases) {
    const bucket = byClass.get(purchase.classId)
    if (bucket) bucket.push(purchase)
    else byClass.set(purchase.classId, [purchase])
  }

  const classIds = new Set<ClassId>(byClass.keys())
  for (const proof of proofs) {
    const purchase = purchases.find((row) => row.id === proof.purchaseId)
    if (purchase) classIds.add(purchase.classId)
  }

  const resolved = new Map<ClassId, ClassPaymentView>()
  for (const classId of classIds) {
    resolved.set(classId, resolveClassPayment(classId, purchases, proofs))
  }
  return resolved
}

/**
 * True when a proof for this purchase is already awaiting review.
 *
 * Used to stop a second proof being submitted against a purchase that already
 * has one. This is deliberately a *frontend* guard: the backend still accepts a
 * resubmission, because a student who uploaded an unreadable screenshot needs to
 * be able to send a better one without an administrator intervening.
 */
export function hasPendingProofFor(
  purchaseId: string | null | undefined,
  proofs: readonly PaymentProof[],
): boolean {
  if (!purchaseId) return false
  return proofs.some((proof) => proof.purchaseId === purchaseId && proof.status === 'pending')
}
