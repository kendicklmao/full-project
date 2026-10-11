import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, SearchX, LogIn } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import ErrorState from "../../../components/common/ErrorState.jsx";
import { failureMessage } from "../../../utils/requestState.js";
import { parseWeeklyExpectancy, summarizeWeeklyExpectancy, getWeeklyExpectancyErrorKind } from "../../../utils/weeklyExpectancy.js";
import { fetchWeeklyExpectancy } from "../../../../api.jsx";
import { ChartTooltip, ChartLegend, ChartCard, ChartStats, LoadingBlock, EmptyBlock } from "../analytics/chartKit.jsx";
import { CHART_COLORS, AXIS_TICK, useNarrowScreen } from "../analytics/chartTheme.js";

const SERIES = [
    { key: "expectancy", name: "Plan", color: CHART_COLORS.plan, dashed: true },
    { key: "realProgress", name: "Real progress", color: CHART_COLORS.actual },
];

/**
 * Tính toán số tuần dự án theo ngày bắt đầu (StartDate)
 */
function calculateCurrentProjectWeek(startDateInput, fallbackWeek) {
    if (!startDateInput) return fallbackWeek;

    let startObj = null;

    if (startDateInput instanceof Date) {
        startObj = startDateInput;
    } else if (typeof startDateInput === "string") {
        const cleanStr = startDateInput.trim();

        if (cleanStr.includes("-")) {
            const parts = cleanStr.split("T")[0].split("-");
            if (parts.length === 3) {
                startObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            }
        } else if (cleanStr.includes("/")) {
            const parts = cleanStr.split("/");
            if (parts.length >= 2) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1;
                const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
                startObj = new Date(year, month, day);
            }
        }

        if (!startObj || isNaN(startObj.getTime())) {
            startObj = new Date(cleanStr);
        }
    }

    if (!startObj || isNaN(startObj.getTime())) return fallbackWeek;

    const now = new Date();

    const startMidnight = new Date(startObj.getFullYear(), startObj.getMonth(), startObj.getDate()).getTime();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Tính chênh lệch ngày (Ví dụ: 04/10 -> 11/10 = 7 ngày = Week 2)
    const diffDays = Math.round((todayMidnight - startMidnight) / (1000 * 3600 * 24));
    if (diffDays < 0) return 1;

    return Math.floor(diffDays / 7) + 1;
}

/**
 * Plan vs. Real Progress (cumulative burn-UP) từ GET /task/project/:projectId/weekly-expectancy.
 */
function WeeklyExpectancy({ projectId, projectName, projectStartDate, refreshToken = 0 }) {
    const [result, setResult] = useState(null);
    const [retryKey, setRetryKey] = useState(0);
    const reloadKey = `${refreshToken}:${retryKey}`;
    const narrow = useNarrowScreen();

    useEffect(() => {
        if (!projectId) return;
        let cancelled = false;
        fetchWeeklyExpectancy(projectId)
            .then((body) => {
                if (cancelled) return;
                const parsed = parseWeeklyExpectancy(body);
                setResult({ projectId, reloadKey, data: parsed, error: null, invalid: !parsed });
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Error loading plan vs. real progress:", err);
                setResult({ projectId, reloadKey, data: null, error: err, invalid: false });
            });
        return () => { cancelled = true; };
    }, [projectId, reloadKey]);

    const retry = () => setRetryKey((k) => k + 1);

    const current = result && result.projectId === projectId ? result : null;
    const loading = !current || current.reloadKey !== reloadKey;
    const data = current?.data || null;
    const error = loading ? null : current.error;
    const invalidResponse = !loading && current.invalid;

    // Lấy ngày bắt đầu dự án
    const startDate = projectStartDate || data?.projectStartDate || data?.startDate;

    // Tính tuần dự án thực tế dựa vào StartDate
    const calculatedWeek = calculateCurrentProjectWeek(startDate, data?.currentProjectWeek);
    const displayWeek = calculatedWeek ?? data?.currentProjectWeek ?? 1;

    // Override lại currentProjectWeek trong data
    const adjustedData = data ? { ...data, currentProjectWeek: displayWeek } : null;
    const summary = summarizeWeeklyExpectancy(adjustedData);

    let body;
    if (error) {
        const kind = getWeeklyExpectancyErrorKind(error);
        if (kind === "auth") {
            body = (
                <EmptyBlock
                    icon={<LogIn className="icon" />}
                    title="Your session has ended"
                    desc="Sign in again to see the progress chart."
                    action={<Link to="/login" className="btn btn-outline btn-sm">Sign in</Link>}
                />
            );
        } else if (kind === "invalid-project") {
            body = (
                <EmptyBlock
                    icon={<SearchX className="icon" />}
                    title="Invalid project"
                    desc="This project ID is not valid. Pick another project."
                />
            );
        } else {
            body = (
                <ErrorState
                    title="Couldn't load plan vs. real progress"
                    message={failureMessage({ error })}
                    onRetry={retry}
                />
            );
        }
    } else if (invalidResponse) {
        body = (
            <ErrorState
                title="Couldn't read plan vs. real progress"
                message="The server sent progress data in an unexpected format."
                onRetry={retry}
            />
        );
    } else if (!data) {
        body = <LoadingBlock text="Loading progress…" className="expectancy-loading" />;
    } else if (data.weeks.length === 0) {
        body = (
            <EmptyBlock
                icon={<TrendingUp className="icon" />}
                title="No progress data yet"
                desc="This project has no tasks yet. Add tasks with points and a week on the board to see the plan."
                action={<Link to={`/projectboard/${projectId}`} className="btn btn-outline btn-sm">Open board</Link>}
                className="expectancy-empty"
            />
        );
    } else {
        // Tìm mốc tuần hiện tại ("Now") để vẽ ReferenceLine
        const nowInChart = summary?.nowEntry || data.weeks.find((w) => {
            if (w.weekNumber !== undefined) return Number(w.weekNumber) === Number(displayWeek);
            const numInWeek = parseInt(String(w.week).replace(/\D/g, ""), 10);
            return numInWeek === Number(displayWeek);
        });

        body = (
            <>
                <ChartStats items={[
                    { label: "Project week", value: `Week ${displayWeek}` },
                    summary?.planEntry && { label: "Planned to date", value: `${summary.planEntry.expectancy} pts` },
                    summary?.latestReal && { label: "Done to date", value: `${summary.latestReal.realProgress} pts` },
                ]} />

                <ChartLegend series={SERIES} />
                <div className={`chart-canvas expectancy-chart${loading ? " is-refreshing" : ""}`} aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.weeks} margin={{ top: 22, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                            <XAxis
                                dataKey="week"
                                interval={0}
                                padding={{ left: 12, right: narrow ? 8 : 24 }}
                                tick={AXIS_TICK}
                                angle={narrow && data.weeks.length > 4 ? -40 : 0}
                                textAnchor={narrow && data.weeks.length > 4 ? "end" : "middle"}
                                height={narrow && data.weeks.length > 4 ? 52 : 30}
                                tickLine={false}
                                axisLine={{ stroke: CHART_COLORS.grid }}
                            />
                            <YAxis allowDecimals={false} width={40} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                            <Tooltip
                                content={<ChartTooltip series={SERIES} />}
                                cursor={{ stroke: CHART_COLORS.now, strokeDasharray: "4 4" }}
                            />
                            {nowInChart && (
                                <ReferenceLine
                                    x={nowInChart.week}
                                    stroke={CHART_COLORS.now}
                                    strokeDasharray="4 4"
                                    label={{ value: "Now", position: "top", fill: CHART_COLORS.axis, fontSize: 11 }}
                                />
                            )}
                            <Line
                                type="linear"
                                dataKey="expectancy"
                                name="Plan"
                                stroke={CHART_COLORS.plan}
                                strokeWidth={2}
                                strokeDasharray="6 4"
                                dot={{ r: 3, fill: CHART_COLORS.plan, strokeWidth: 0 }}
                                isAnimationActive={false}
                            />
                            <Line
                                type="linear"
                                dataKey="realProgress"
                                name="Real progress"
                                stroke={CHART_COLORS.actual}
                                strokeWidth={2.5}
                                connectNulls={false}
                                dot={{ r: 4, fill: CHART_COLORS.actual, stroke: "#fff", strokeWidth: 1.5 }}
                                activeDot={{ r: 5 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <table className="sr-only expectancy-table">
                    <caption>Plan vs. real progress of {projectName || "the selected project"}</caption>
                    <thead>
                    <tr><th scope="col">Week</th><th scope="col">Plan</th><th scope="col">Real progress</th></tr>
                    </thead>
                    <tbody>
                    {data.weeks.map((w) => (
                        <tr key={w.weekNumber} data-real={w.realProgress === null ? "null" : w.realProgress}>
                            <th scope="row">{w.week}</th>
                            <td>{w.expectancy}</td>
                            <td>{w.realProgress === null ? "No data yet" : w.realProgress}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                <p className="chart-note">
                    Cumulative points planned by task week vs. points finished in the Done column.
                    {summary?.pastPlan && ` The project is in week ${displayWeek}, after the last planned week (${data.maxProjectWeek}).`}
                </p>
            </>
        );
    }

    return (
        <ChartCard
            id="expectancy"
            className="expectancy-card"
            title="Plan vs. Real Progress"
            subtitle="Cumulative points: plan vs. done"
            icon={<TrendingUp className="icon" />}
        >
            <div className="expectancy-body" aria-busy={loading}>{body}</div>
        </ChartCard>
    );
}

export default WeeklyExpectancy;