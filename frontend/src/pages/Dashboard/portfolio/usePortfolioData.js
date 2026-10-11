import { useCallback, useEffect, useState } from "react";
import { useRealtimeRefetch } from "../../../hooks/useRealtimeRefetch.js";
import { parseWeeklyExpectancy } from "../../../utils/weeklyExpectancy.js";
import { fetchProjects, fetchTasksByProject, fetchWeeklyExpectancy, fetchMembersByProject } from "../../../../api.jsx";

/**
 * One load shared by the Dashboard KPI row and the portfolio sections:
 * GET /project, then per project GET /task/project/:id, GET /task/project/:id/weekly-expectancy and GET /member/project/:id.
 * rows[i] = { project, tasks | null, weekly | null, members | null }; null = that request failed (never counted as 0).
 */
export function usePortfolioData() {
    const [state, setState] = useState({ loading: true, error: null, rows: [] });
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const data = await fetchProjects();
                const projects = Array.isArray(data) ? data : (data?.data || []);
                const rows = await Promise.all(projects.map(async (project) => {
                    const id = project._id || project.id;
                    const [tasks, weekly, members] = await Promise.allSettled([fetchTasksByProject(id), fetchWeeklyExpectancy(id), fetchMembersByProject(id)]);
                    return {
                        project,
                        tasks: tasks.status === "fulfilled" && Array.isArray(tasks.value) ? tasks.value : null,
                        weekly: weekly.status === "fulfilled" ? parseWeeklyExpectancy(weekly.value) : null,
                        members: members.status === "fulfilled" && Array.isArray(members.value) ? members.value : null,
                    };
                }));
                if (!cancelled) setState({ loading: false, error: null, rows });
            } catch (err) {
                console.error("Loading the portfolio data failed:", err);
                if (!cancelled) setState({ loading: false, error: err, rows: [] });
            }
        };
        load();
        return () => { cancelled = true; };
    }, [reloadKey]);

    // data changed elsewhere (tasks, assignees, members, projects): reload quietly, the numbers stay on screen
    useRealtimeRefetch(() => setReloadKey((k) => k + 1), ["tasks", "projects", "members", "users"]);

    const reload = useCallback(() => {
        setState((s) => ({ ...s, loading: true }));
        setReloadKey((k) => k + 1);
    }, []);

    return { state, reload };
}
