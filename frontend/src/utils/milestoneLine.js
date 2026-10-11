// Project timeline (ProjectOverview): one horizontal line from the project's start date to its end date.
// Milestones are the project's calendar notes (GET /note/project/:id, note.date = "YYYY-MM-DD") — the same data the
// Calendar page uses, so both pages always show the same milestones. Nothing is invented: no dates, no markers.

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" (or any date value) -> UTC midnight timestamp of that calendar day, or null */
export function dayStamp(value) {
    if (!value) return null;
    const text = String(value);
    const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** day stamp -> "YYYY-MM-DD" */
export const dayKey = (stamp) => new Date(stamp).toISOString().slice(0, 10);

/**
 * @returns {{ ok: false, reason: string } | { ok: true, startKey, endKey, totalDays, markers, outside }}
 * markers: milestones inside [start, end], oldest first (same day: creation order), each with position `percent` (0-100)
 * outside: how many notes fall before the start or after the end (they stay on the Calendar only)
 */
export function buildMilestoneLine(startDate, endDate, notes) {
    const start = dayStamp(startDate);
    const end = dayStamp(endDate);
    if (start === null) return { ok: false, reason: "The project has no start date." };
    if (end === null) return { ok: false, reason: "The project has no end date." };
    if (end < start) return { ok: false, reason: "The end date is before the start date." };

    const span = end - start;
    const markers = [];
    let outside = 0;
    (Array.isArray(notes) ? notes : []).forEach((note, index) => {
        const at = dayStamp(note?.date);
        if (at === null) return;
        if (at < start || at > end) { outside += 1; return; }
        markers.push({
            id: String(note._id || note.id || `note-${index}`),
            date: dayKey(at),
            content: String(note.content || "").trim(),
            percent: span === 0 ? 50 : ((at - start) / span) * 100,
            order: index,
        });
    });
    markers.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
    markers.forEach((m, i) => { m.number = i + 1; });
    return { ok: true, startKey: dayKey(start), endKey: dayKey(end), totalDays: Math.round(span / DAY_MS), markers, outside };
}

/** Why a new milestone date is refused ("" when fine) */
export function milestoneDateError(date, startDate, endDate) {
    const at = dayStamp(date);
    const start = dayStamp(startDate);
    const end = dayStamp(endDate);
    if (at === null) return "Choose a date.";
    if (start !== null && at < start) return "The date is before the project start.";
    if (end !== null && at > end) return "The date is after the project end.";
    return "";
}
