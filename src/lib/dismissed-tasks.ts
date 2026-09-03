/**
 * Per-user dismissal of pending actions.
 *
 * Dismissal is a personal "hide this from my list" preference — it never
 * deletes the underlying record, so an admin dismissing an item does not
 * remove it from anyone else's dashboard. The dismissed status is stored with
 * the item, so if the underlying task changes state (e.g. an order moves on),
 * it resurfaces automatically.
 */
const KEY = (userId: string) => `kredix:dismissed-tasks:${userId}`;

export type DismissMap = Record<string, string>;

export function readDismissed(userId: string | undefined): DismissMap {
  if (!userId || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY(userId));
    return raw ? (JSON.parse(raw) as DismissMap) : {};
  } catch {
    return {};
  }
}

export function writeDismissed(userId: string | undefined, map: DismissMap) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(userId), JSON.stringify(map));
  } catch {
    /* storage unavailable — dismissal is best-effort */
  }
}
