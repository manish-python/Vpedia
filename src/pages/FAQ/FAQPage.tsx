import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Section, SectionHeading } from '@/components/common/Card'
import { ButtonLink } from '@/components/common/Button'
import { useSeo } from '@/hooks'
import { FAQS } from '@/data/support'
import { cn } from '@/utils/cn'

/* ========================================================================
   FAQ
   Accessible accordion: each header is a button with aria-expanded and
   aria-controls, and the panel is a labelled region.
   =================================================================== */

export function FAQPage() {
  const [openId, setOpenId] = useState<string | null>(FAQS[0]?.id ?? null)

  useSeo({
    title: 'Frequently Asked Questions',
    description:
      'Answers about what a class purchase includes, one-time payment, solved PYQs, CBSE suitability, mobile access, refunds and support.',
    path: '/faq',
  })

  return (
    <Section tone="canvas" padding="md">
      <div className="container-reading">
        <SectionHeading
          as="h1"
          eyebrow="Need help?"
          title="Frequently Asked Questions"
          subtitle="Everything students ask before buying."
        />

        <div className="mt-9 space-y-2.5">
          {FAQS.map((faq) => {
            const isOpen = openId === faq.id
            const panelId = `${faq.id}-panel`
            const buttonId = `${faq.id}-button`

            return (
              <div
                key={faq.id}
                className={cn(
                  'overflow-hidden rounded-2xl border bg-white shadow-card transition-colors',
                  isOpen ? 'border-brand-300' : 'border-hairline',
                )}
              >
                <h2>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span
                      className={cn(
                        'text-[0.9375rem] font-semibold transition-colors sm:text-base',
                        isOpen ? 'text-brand-700' : 'text-ink-900',
                      )}
                    >
                      {faq.question}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isOpen ? 'bg-brand-50 text-brand-600' : 'bg-ink-100 text-ink-500',
                      )}
                    >
                      <ChevronDown
                        className={cn('size-4 transition-transform duration-200', isOpen && 'rotate-180')}
                      />
                    </span>
                  </button>
                </h2>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="animate-fade-in px-5 pb-5"
                >
                  <p className="text-sm leading-relaxed text-ink-600 sm:text-[0.9375rem]">
                    {faq.answer}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legal + contact anchors referenced from the footer */}
        <div className="mt-12 space-y-6">
          <PolicyBlock
            id="privacy"
            title="Privacy Policy"
            body="Your name, email and Google account details are used only to run your account, keep your purchases attached to you, and provide support. We do not sell your personal data. You can ask us to delete your account and associated data at any time."
          />
          <PolicyBlock
            id="terms"
            title="Terms & Conditions"
            body="By using VPEDIA LEARNING you agree to study the material for your own learning. Content is provided for personal use and may not be redistributed, resold or shared. Access is tied to the Google account used at sign-in."
          />
          <PolicyBlock
            id="refund"
            title="Refund Policy"
            body="Study material is digital, so purchases are generally final. If you paid and did not receive access because of a technical issue, contact support with your payment reference and we will resolve it."
          />
          <PolicyBlock
            id="support"
            title="Contact Us"
            body="Use Help & Support from your dashboard, or write to us from the address on this site. We aim to reply within one working day."
          />
        </div>

        <div className="mt-10 rounded-2xl border border-brand-200 bg-brand-50/60 p-6 text-center">
          <h2 className="text-lg font-bold text-ink-900">Still have a question?</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-600">
            Pick your class and see exactly what a purchase includes.
          </p>
          <div className="mt-5 flex justify-center">
            <ButtonLink to="/classes" size="lg">
              Explore Classes
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  )
}

function PolicyBlock({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="text-lg font-bold text-ink-900">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
    </section>
  )
}
