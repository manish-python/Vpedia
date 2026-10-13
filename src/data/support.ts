import type { AppNotification } from '@/types'

/* ========================================================================
   FAQ — single source used by the accordion and by the FAQ page.
   =================================================================== */
export interface FaqItem {
  id: string
  question: string
  answer: string
}

export const FAQS: FaqItem[] = [
  {
    id: 'faq-included',
    question: 'What is included in a class purchase?',
    answer:
      'A single purchase unlocks the complete study material for that one class — every subject, every chapter, plus notes, previous year questions, solved PYQs, important questions, practice papers and model papers.',
  },
  {
    id: 'faq-one-time',
    question: 'Is this a one-time payment?',
    answer:
      'Yes. You pay once for a class and keep access to all of its material. There are no monthly plans, no renewals and no subscriptions.',
  },
  {
    id: 'faq-download',
    question: 'Can I download the notes?',
    answer:
      'Study material is read inside VPEDIA LEARNING so it stays up to date. You can read it on any device you are signed in to, including your phone.',
  },
  {
    id: 'faq-solved-pyq',
    question: 'Do you provide solved PYQs?',
    answer:
      'Yes. Solved PYQs come with step-by-step solutions and the marking scheme, so you can see exactly how the answers are credited.',
  },
  {
    id: 'faq-cbse',
    question: 'Is this suitable for CBSE students?',
    answer:
      'Yes. The material follows the CBSE syllabus and board paper pattern for Classes 7 to 12.',
  },
  {
    id: 'faq-mobile',
    question: 'Will I get access on mobile too?',
    answer:
      'Yes. Your purchase is tied to your Google account, so you can sign in on a phone, tablet or laptop and continue where you left off.',
  },
  {
    id: 'faq-refund',
    question: 'Can I get a refund?',
    answer:
      'Because this is digital material, purchases are generally final. If you paid but never received access because of a technical issue, contact support and we will resolve it.',
  },
  {
    id: 'faq-support',
    question: 'How can I contact support?',
    answer:
      'Use the Help & Support option in your dashboard, or write to us from the contact address listed on the site. We usually reply within one working day.',
  },
]

/* ========================================================================
   Notifications — dashboard bell dropdown.
   =================================================================== */
export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'ntf-1',
    kind: 'new_content',
    title: 'New model papers added',
    body: 'Class 10 · Mathematics now has two more sample papers.',
    createdAt: '2026-10-04T09:20:00.000Z',
    read: false,
    href: '/classes/10/subjects/c10-math/chapters',
  },
  {
    id: 'ntf-2',
    kind: 'new_content',
    title: 'Solved PYQs are live',
    body: 'Solved solutions for Class 10 · Science are now available.',
    createdAt: '2026-10-03T14:05:00.000Z',
    read: false,
    href: '/pyqs/c10-sci',
  },
  {
    id: 'ntf-3',
    kind: 'purchase',
    title: 'Purchase confirmed',
    body: 'Your complete access to Class 10 is active.',
    createdAt: '2026-10-03T11:40:00.000Z',
    read: true,
    href: '/library',
  },
  {
    id: 'ntf-4',
    kind: 'system',
    title: 'Sign in on any device',
    body: 'Your library follows your Google account across devices.',
    createdAt: '2026-10-01T08:00:00.000Z',
    read: true,
    href: '/library',
  },
]
