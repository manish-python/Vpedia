import { useEffect } from 'react'

/* ========================================================================
   Lightweight SEO for a single-page app
   ---------------------------------------------------------------------
   Sets document title and the meta tags that matter for the public pages
   (Home, Classes, FAQ). Full per-route SSR or a head manager is out of
   scope for this stack, so this stays intentionally small.
   =================================================================== */

interface SeoOptions {
  title: string
  description: string
  /** Path used for the canonical and og:url. Defaults to the current path. */
  path?: string
  /** Suppress indexing on app-only surfaces such as the dashboard. */
  noIndex?: boolean
}

const SITE = 'VPEDIA LEARNING'

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function upsertLink(rel: string, href: string): void {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

export function useSeo({ title, description, path, noIndex = false }: SeoOptions): void {
  useEffect(() => {
    const url = path ?? window.location.pathname
    const fullTitle = title === SITE ? title : `${title} | ${SITE}`

    document.title = fullTitle
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow')
    upsertMeta('property', 'og:title', fullTitle)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', `${window.location.origin}${url}`)
    upsertLink('canonical', `${window.location.origin}${url}`)
  }, [title, description, path, noIndex])
}
