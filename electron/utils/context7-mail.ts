export type Context7InboxResult =
  | { kind: 'otp'; code: string }
  | { kind: 'existing_account' }

export function detectContext7ExistingAccountMail(subjectRaw: string, body: string): boolean {
  const s = subjectRaw.trim().toLowerCase()
  const b = body.toLowerCase()
  const subjectHit = s.includes('sign up attempt') && (s.includes('context7') || s.includes('detected'))
  const bodyHit =
    (b.includes('already signed up') || b.includes('matching email address')) &&
    (b.includes('sign in instead') || b.includes('context7'))
  const bodyLoose =
    b.includes('sign up attempt matching email') ||
    (b.includes('already signed up') && b.includes('context7'))
  return subjectHit || bodyHit || bodyLoose
}
