/* ========================================================================
   Service barrel
   Components import from here. Nothing in the UI layer imports fixtures
   directly, which is what keeps the Django swap to a service-only change.
   =================================================================== */

export * from './client'
export * from './authService'
export * from './classService'
export * from './subjectService'
export * from './contentService'
export * from './purchaseService'
export * from './paymentService'
export * from './libraryService'
export * from './profileService'
