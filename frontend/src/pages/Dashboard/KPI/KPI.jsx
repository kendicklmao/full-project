import { useState, useEffect } from 'react';
import { CheckCircle2, FolderKanban, ListChecks, Loader2 } from 'lucide-react';
import ErrorState from '../../../components/common/ErrorState.jsx';
import { failureMessage } from '../../../utils/requestState.js';
import { portfolioKpis } from '../../../utils/portfolioStats.js';
import { useRealtimeRefetch } from '../../../hooks/useRealtimeRefetch.js';
import { fetchPortfolio } from '../../../../api.jsx';

/**
 * Dashboard KPI row, in this order: Total Projects, On-Time Rate, Tasks Completed (Budget was removed from the frontend).
 *  - Total Projects: GET /project/portfolio (never GET /task/project/portfolio: that route is shadowed).
 *  - On-Time Rate: the SAME value as the former "Plan adherence (this week)": completed points / planned points of the
 *    current week (weekly-expectancy), averaged over the projects that have a plan (utils/portfolioStats.js portfolioKpis).
 *    The backend onTimeRate field is not used. No measurable plan -> "—", never 0% or 100%.
 *  - Tasks Completed: completed / all tasks over the projects whose tasks loaded (same source as the project progress list).
 * `shared` = usePortfolioData() of the Dashboard ({ state, reload }).
 */
function KPI({ shared }) {
    const [portfolio, setPortfolio] = useState(null);
    const [loading, setLoading] = useState(true);
    // request failed: show the error, never 0
    const [loadError, setLoadError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        fetchPortfolio()
            .then((data) => {
                if (cancelled) return;
                setPortfolio(data || null);
                setLoadError(null);
                setLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Lỗi khi đồng bộ dữ liệu KPI:", err);
                setLoadError(err);
                setLoading(false);
            });
        return () => { cancelled = true; };
    }, [reloadKey]);

    // projects / tasks changed elsewhere: reload quietly (no spinner, the numbers stay on screen)
    useRealtimeRefetch(() => setReloadKey((k) => k + 1), ['tasks', 'projects']);

    const retryLoad = () => {
        setLoadError(null);
        setLoading(true);
        setReloadKey((k) => k + 1);
    };

    if (loading) {
        return (
            <div className="page-loading kpi-loading" role="status">
                <Loader2 className="icon animate-spin" aria-hidden="true" />
                <span>Loading workspace statistics…</span>
            </div>
        );
    }

    if (loadError) {
        return (
            <ErrorState
                title="Couldn't load workspace statistics"
                message={failureMessage({ error: loadError })}
                onRetry={retryLoad}
            />
        );
    }

    const totalProjects = Number(portfolio?.totalProjects);
    // null/missing stays "unknown": Number(null) would turn it into 0
    const sharedState = shared?.state;
    const kpis = sharedState && !sharedState.loading && !sharedState.error ? portfolioKpis(sharedState.rows) : null;
    const onTimeRate = kpis ? kpis.adherence.average : null;
    // while the per-project data loads / if it failed there is no figure: never a default
    const pending = !sharedState || sharedState.loading;
    const failedLoad = !pending && !kpis;
    // a response without the number is not a 0: show nothing rather than a made-up value
    if (!Number.isFinite(totalProjects)) return null;

    return (
        <section className="grid-stats" aria-label="Workspace statistics">
            <div className="card stat-card">
                <span className="stat-card-icon tone-primary" aria-hidden="true">
                    <FolderKanban className="icon" />
                </span>
                <div>
                    <p className="stat-card-label">Total Projects</p>
                    <p className="stat-card-value">{totalProjects}</p>
                </div>
            </div>
            <div className="card stat-card">
                <span className="stat-card-icon tone-success" aria-hidden="true">
                    <CheckCircle2 className="icon" />
                </span>
                <div>
                    <p className="stat-card-label">On-Time Rate</p>
                    <p className="stat-card-value">{pending ? "…" : onTimeRate === null ? "—" : `${onTimeRate}%`}</p>
                    {failedLoad && <p className="stat-card-note">Couldn't load</p>}
                    {kpis && onTimeRate === null && <p className="stat-card-note">No plan to measure yet</p>}
                </div>
            </div>
            <div className="card stat-card">
                <span className="stat-card-icon tone-primary" aria-hidden="true">
                    <ListChecks className="icon" />
                </span>
                <div>
                    <p className="stat-card-label">Tasks Completed</p>
                    <p className="stat-card-value">{pending ? "…" : kpis && kpis.completion !== null ? `${kpis.completedTasks}/${kpis.totalTasks} · ${kpis.completion}%` : "—"}</p>
                    {failedLoad && <p className="stat-card-note">Couldn't load</p>}
                    {kpis && kpis.failed > 0 && <p className="stat-card-note">{kpis.failed} project(s) not loaded</p>}
                </div>
            </div>
        </section>
    );
}

export default KPI;
