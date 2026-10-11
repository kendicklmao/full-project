// Backlog list rules (ProjectList): the backlog keeps EVERY task of the project; a task "on the board" simply has a column.
//  - Status = title of the column the task is in (real data); a task without a column is "Backlog" (not on the board yet).
//  - Push to Board is only for tasks without a column.
//  - Delete is only allowed while the task is in the Todo column (the backend enforces the same rule).

const idOf = (value) => (value && typeof value === "object" ? String(value._id || value.id || "") : String(value || ""));

// same pattern as the backend helper/taskRules.js
export const isTodoColumnTitle = (title) => /^\s*to\s*-?\s*do\s*$/i.test(String(title || ""));

/** { onBoard, title } — title is null when the task has no valid column */
export function taskStatus(task, columns) {
    const columnId = idOf(task?.columnId);
    if (!columnId) return { onBoard: false, title: null };
    const populatedTitle = task?.columnId && typeof task.columnId === "object" ? task.columnId.title || task.columnId.name : "";
    const column = (columns || []).find((c) => idOf(c) === columnId);
    const title = column ? column.title || column.name : populatedTitle;
    // a columnId that matches no column of the project is not a board status
    return title ? { onBoard: true, title } : { onBoard: false, title: null };
}

/** "" when the task may be deleted, otherwise the reason shown to the manager */
export function deleteBlockReason(status) {
    if (!status.onBoard) return "Only tasks in the Todo column can be deleted.";
    if (!isTodoColumnTitle(status.title)) return `Only tasks in Todo can be deleted (this one is in "${status.title}").`;
    return "";
}

/** Week first (planned week), then creation time, then title: a stable, readable order */
export function sortBacklogTasks(tasks) {
    const weekOf = (t) => Number(t?.week) || 1;
    const timeOf = (t) => { const v = new Date(t?.createdAt).getTime(); return Number.isFinite(v) ? v : 0; };
    return [...(tasks || [])].sort((a, b) =>
        weekOf(a) - weekOf(b) || timeOf(a) - timeOf(b) || String(a?.title || "").localeCompare(String(b?.title || "")));
}
