// Checklist progress of a task card: completed items / total items. An empty checklist has NO progress (null),
// never 0% or 100%.
export function checklistProgress(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return null;
    const done = list.filter((item) => item && item.completed).length;
    return { done, total: list.length, percent: Math.round((done / list.length) * 100) };
}
