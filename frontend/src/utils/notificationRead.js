// Header notifications are DERIVED from the user's tasks (due within 2 days): the backend has no notification
// entity, so there is no server-side "read" flag. The read state is kept per user in this browser (localStorage).
// A key is task id + due day: when the due date moves, the task notifies again.

const storageKey = (userId) => `notif:read:${userId || "anonymous"}`;

const defaultStorage = () => {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
};

export const notificationKey = (taskId, dueDate) => {
    const d = new Date(dueDate);
    const day = Number.isNaN(d.getTime()) ? "no-date" : d.toISOString().slice(0, 10);
    return `${taskId}:${day}`;
};

export function loadReadKeys(userId, storage = defaultStorage()) {
    try {
        const parsed = JSON.parse(storage?.getItem(storageKey(userId)) || "[]");
        return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : []);
    } catch {
        return new Set();
    }
}

/** Marks keys as read (a Set is returned even when the storage is blocked: the session still behaves) */
export function markRead(userId, keys, storage = defaultStorage()) {
    const next = loadReadKeys(userId, storage);
    for (const key of keys) next.add(key);
    try {
        storage?.setItem(storageKey(userId), JSON.stringify([...next]));
    } catch {
        // storage blocked or full: the read state only lasts for this page load
    }
    return next;
}

/** Drops read keys that no longer match a current notification, so the stored list cannot grow forever */
export function pruneReadKeys(userId, currentKeys, storage = defaultStorage()) {
    const current = new Set(currentKeys);
    const kept = [...loadReadKeys(userId, storage)].filter((k) => current.has(k));
    try {
        storage?.setItem(storageKey(userId), JSON.stringify(kept));
    } catch {
        // ignore
    }
    return new Set(kept);
}

export const unreadOf = (items, readKeys) => items.filter((item) => !readKeys.has(item.notifKey));
