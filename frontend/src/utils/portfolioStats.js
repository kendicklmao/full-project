// Dashboard "Portfolio health": numbers derived from data the backend returns, nothing estimated.
//  - completion = task.status === "completed" (contract §7), never the column position
//  - plan adherence = real / planned points of the current week (weekly-expectancy), only where a plan exists
import { isTaskCompleted } from "./taskMove.js";
import { summarizeWeeklyExpectancy } from "./weeklyExpectancy.js";

const pointsOf = (task) => Number(task?.point ?? task?.points) || 0;
export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : null);

/** Progress of one project from its tasks */
export function projectProgress(project, tasks) {
    const list = Array.isArray(tasks) ? tasks : [];
    let completed = 0;
    let points = 0;
    let completedPoints = 0;
    for (const task of list) {
        const p = pointsOf(task);
        points += p;
        if (isTaskCompleted(task)) {
            completed += 1;
            completedPoints += p;
        }
    }
    return {
        id: String(project?._id || project?.id || ""),
        name: project?.name || "Untitled project",
        color: project?.color || "",
        total: list.length,
        completed,
        percent: pct(completed, list.length),
        points,
        completedPoints,
    };
}

const userIdOf = (user) => (user && typeof user === "object" ? String(user._id || user.id || "") : String(user || ""));

/**
 * Workload per person. Roster = every Active member of the loaded projects (GET /member/project/:id, which carries the
 * real per-project role) plus every task assignee, so people without tasks show up with zeros.
 * Role = the distinct membership roles the person holds across projects (empty when they have no membership: shown as "—").
 * Only populated users have a name (plain ids are counted under "Unknown user"). Nothing here invents a person or a role.
 */
export function teamWorkload(taskLists, memberLists = []) {
    const people = new Map();
    const entryFor = (id, user) => {
        let entry = people.get(id);
        if (!entry) {
            const named = user && typeof user === "object";
            entry = { id, name: (named && (user.username || user.name)) || "Unknown user", email: (named && user.email) || "", roles: [], active: 0, completed: 0, activePoints: 0 };
            people.set(id, entry);
        }
        return entry;
    };
    for (const members of memberLists || []) {
        for (const member of members || []) {
            if (member?.status === "Inactive") continue;
            const id = userIdOf(member?.userId);
            if (!id) continue;
            const entry = entryFor(id, member.userId);
            if (member.role && !entry.roles.includes(member.role)) entry.roles.push(member.role);
        }
    }
    for (const tasks of taskLists || []) {
        for (const task of tasks || []) {
            const done = isTaskCompleted(task);
            const p = pointsOf(task);
            for (const assignee of task?.assignees || []) {
                const id = userIdOf(assignee);
                if (!id) continue;
                const entry = entryFor(id, assignee);
                if (done) entry.completed += 1;
                else {
                    entry.active += 1;
                    entry.activePoints += p;
                }
            }
        }
    }
    return [...people.values()]
        .map((e) => ({ ...e, total: e.active + e.completed }))
        .sort((a, b) => b.activePoints - a.activePoints || b.active - a.active || a.name.localeCompare(b.name));
}

/**
 * Plan adherence of one project from its parsed weekly-expectancy (parseWeeklyExpectancy):
 * latest real progress / planned points of the current week (or of the last week once past the plan), max 100.
 * null when it cannot be measured (no weeks, no plan yet).
 */
export function planAdherence(parsed) {
    const summary = summarizeWeeklyExpectancy(parsed);
    if (!summary || !summary.planEntry) return null;
    const plan = summary.planEntry.expectancy;
    if (!(plan > 0)) return null;
    const real = summary.latestReal ? summary.latestReal.realProgress : 0;
    return Math.min(100, Math.round((real / plan) * 100));
}

/** Average adherence over the projects where it could be measured */
export function averageAdherence(values) {
    const measured = (values || []).filter((v) => typeof v === "number");
    if (measured.length === 0) return { average: null, measured: 0 };
    return { average: Math.round(measured.reduce((s, v) => s + v, 0) / measured.length), measured: measured.length };
}

/**
 * Dashboard KPI figures from the loaded rows (usePortfolioData). Projects whose tasks failed to load are left out
 * and counted in `failed`. On-Time Rate and "Plan adherence (this week)" are the SAME value: adherence.average.
 */
export function portfolioKpis(rows) {
    const list = rows || [];
    const loaded = list.filter((r) => r.tasks);
    const progress = loaded.map((r) => projectProgress(r.project, r.tasks));
    const adherence = averageAdherence(loaded.map((r) => planAdherence(r.weekly)));
    const totalTasks = progress.reduce((sum, p) => sum + p.total, 0);
    const completedTasks = progress.reduce((sum, p) => sum + p.completed, 0);
    return { loaded, progress, failed: list.length - loaded.length, adherence, totalTasks, completedTasks, completion: pct(completedTasks, totalTasks) };
}
