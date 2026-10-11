// Pure helpers for socket payloads (no socket import, so they are unit-testable).

const idOf = (value) => String((value && (value._id || value.id)) || value || "");

// Every client is in the same room, so screens must keep only the events of the project they show.
// Events without a project id are kept (the screen's own task/comment checks still apply).
export function isForProject(payload, projectId) {
    const pid = payload?.projectId ?? payload?.task?.projectId ?? payload?.data?.projectId;
    return !pid || idOf(pid) === idOf(projectId);
}

// Which data each realtime event invalidates. Screens subscribe to topics (useRealtimeRefetch) and
// re-fetch through the REST API, which stays the source of truth (and enforces authorization).
export const EVENT_TOPICS = {
    task_created: ["tasks"],
    task_updated: ["tasks"],
    task_moved: ["tasks"],
    task_deleted: ["tasks"],
    task_reviewed: ["tasks"],
    comment_added: ["comments"],
    project_created: ["projects"],
    project_updated: ["projects"],
    project_deleted: ["projects", "tasks"],
    member_added: ["members", "projects"],
    member_updated: ["members"],
    member_removed: ["members", "tasks", "projects"],
    note_created: ["notes"],
    note_deleted: ["notes"],
    column_created: ["columns"],
    user_created: ["users"],
    user_updated: ["users", "members"],
    user_deleted: ["users", "members", "tasks", "projects"],
    user_banned: ["users", "members"],
};

export const topicsForEvent = (event) => EVENT_TOPICS[event] || [];

// Topics whose change can alter the header / sidebar "task expiring soon" notifications (computed from My Tasks + projects).
const NOTIFICATION_TOPICS = ["tasks", "projects", "members", "users"];
export const affectsNotifications = (topics) => topics.some((t) => NOTIFICATION_TOPICS.includes(t));

/**
 * Should a screen subscribed to `topics` (optionally scoped to `projectId`) refetch for this change?
 * detail = { topics, projectId }. A change without a project id may concern any project, so it is kept.
 */
export function shouldRefetch(detail, topics, projectId) {
    if (!detail || !Array.isArray(detail.topics)) return false;
    if (!topics.some((t) => detail.topics.includes(t))) return false;
    if (projectId && detail.projectId && String(detail.projectId) !== String(projectId)) return false;
    return true;
}
