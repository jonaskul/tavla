import { t } from '../i18n/no'

/**
 * Turn a failed request into something worth showing a user.
 *
 * The bug this exists to fix was not only that `detail` went unread. It was
 * that every failure collapsed into one sentence, so "the server crashed"
 * looked exactly like "you cannot delete this while it has files". The user
 * could not tell whether to change something or to report something.
 *
 * Order:
 *   1. A message the caller supplies for that status. Known, expected cases
 *      get a Norwegian sentence that says what to do about it.
 *   2. The server's own detail, when it sent one. Some of those are already
 *      Norwegian; the English ones are still better than a shrug, because
 *      they describe an unexpected case the user can report.
 *   3. A message for the class of failure, which is what separates a crash
 *      from a refusal.
 *
 * @param err        the rejected axios error
 * @param byStatus   {409: "..."} messages for statuses this caller expects
 * @param fallback   what to say when nothing more specific applies
 */
export function errorMessage(err, byStatus = {}, fallback = t.common.unknownError) {
  const status = err?.response?.status

  if (status && byStatus[status]) return byStatus[status]

  // No response at all: the request never arrived or never came back.
  if (!err?.response) return t.common.networkError

  if (status === 401) return t.common.notSignedIn
  if (status >= 500) return t.common.serverError

  const detail = err.response.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  // FastAPI reports validation failures as a list of objects.
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg

  return fallback
}
