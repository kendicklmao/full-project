import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch.js';
import { Link, useParams } from 'react-router-dom';
import {
    fetchProjectById,
    fetchTasksByProject,
    fetchMembersByProject,
    fetchColumnsByProject,
    updateProjectDetail,
    uploadProjectDocument,
    deleteProjectDocument
} from '../../../api.jsx';

import ErrorState from '../../components/common/ErrorState.jsx';
import { useConfirm, deleteConfirm } from '../../components/common/confirmContext.js';
import { notify } from '../../utils/notify.js';
import { withFallback, failureMessage } from '../../utils/requestState.js';
import { API_ORIGIN } from "../../config/apiConfig.js";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, AXIS_TICK } from '../Dashboard/analytics/chartTheme.js';
import { ChartCard, LoadingBlock, EmptyBlock } from '../Dashboard/analytics/chartKit.jsx';

import { buildTimeline, filterTimelineRows } from "../../utils/timeline.js";
import { formatDayDMY } from "../../utils/projectSchedule.js";
import { avatarToneClass, getInitials } from "../../utils/avatar.js";

import ProjectHeader from '../../components/project/ProjectHeader.jsx';
import MilestoneTimeline from '../../components/project/MilestoneTimeline.jsx';

import {
    Loader2,
    FileText,
    Upload,
    Trash2,
    Edit3,
    Check,
    AlertCircle,
    BarChart3,
    CalendarRange,
    Hourglass,
    ChevronDown,
    ChartGantt
} from "lucide-react";

import "./project.css";

const API_BASE_URL = API_ORIGIN;

// --- Helper Functions ---
const formatDateDMY = (dateValue) => {
    if (!dateValue) return 'Not set';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return 'Not set';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const shortDay = (date) => (date ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}` : "");

const GROUP_LABEL = { todo: "To do", progress: "In progress", review: "Review", completed: "Completed", other: "Other" };

const memberUser = (m) => (m?.userId && typeof m.userId === "object" ? m.userId : m);
const memberUserId = (m) => String(memberUser(m)?._id || memberUser(m)?.id || m?.userId || "");
const personName = (p) => (p && typeof p === "object" ? p.username || p.name || p.email : "") || "Unknown user";

const getWeekDateRange = (projectStartDate, projectEndDate, weekNum) => {
    if (!projectStartDate) return '';
    const start = new Date(projectStartDate);
    if (isNaN(start.getTime())) return '';

    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + (Number(weekNum) - 1) * 7);

    let weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    if (projectEndDate) {
        const projEnd = new Date(projectEndDate);
        if (!isNaN(projEnd.getTime()) && weekEnd > projEnd) {
            weekEnd = projEnd;
        }
    }

    const formatShort = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${formatShort(weekStart)} - ${formatShort(weekEnd)}`;
};

const calculateDaysStuck = (dateValue) => {
    if (!dateValue) return 0;
    const lastDate = new Date(dateValue);
    if (isNaN(lastDate.getTime())) return 0;

    const today = new Date();
    const t1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const t2 = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());

    const diffTime = Math.abs(t1 - t2);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

function CountTooltip({ active, payload, label, unit }) {
    if (!active || !payload || payload.length === 0) return null;
    const data = payload[0].payload;
    const value = payload[0].value;
    return (
        <div className="chart-tooltip">
            <p className="chart-tooltip-label">{label}</p>
            {data.dateRange && (
                <p className="chart-tooltip-sublabel" style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Date: {data.dateRange}
                </p>
            )}
            <p className="chart-tooltip-row">
                <span className="chart-tooltip-name">Tasks</span>
                <span className="chart-tooltip-value">{value} {value === 1 ? unit : `${unit}s`}</span>
            </p>
        </div>
    );
}

export default function ProjectOverviewPage() {
    const { id: projectId } = useParams();
    const confirm = useConfirm();

    // Core Data States
    const [project, setProject] = useState(null);
    const [projectMembers, setProjectMembers] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [columns, setColumns] = useState([]);

    // Page States
    const [loading, setLoading] = useState(true);
    const loadedForRef = useRef(null);
    const [loadFailures, setLoadFailures] = useState([]);
    const [reloadKey, setReloadKey] = useState(0);
    const [memberCurrentRole, setMemberRole] = useState("");

    // Overview Specific States
    const [projectDetail, setProjectDetail] = useState("");
    const [isEditingDetail, setIsEditingDetail] = useState(false);
    const [isSavingDetail, setIsSavingDetail] = useState(false);
    const [documents, setDocuments] = useState([]);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);

    // Chart Specific States
    const [statusChartData, setStatusChartData] = useState([]);
    const [weekChartData, setWeekChartData] = useState([]);
    const [stagnantTables, setStagnantTables] = useState({ todo: [], inProgress: [], review: [] });

    // Timeline Filter States
    const [timelineUserId, setTimelineUserId] = useState("");
    const [hideCompleted, setHideCompleted] = useState(false);

    // Get current user
    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch {
            return {};
        }
    }, []);

    const currentUserId = currentUser._id || currentUser.id || null;

    useEffect(() => {
        const fetchCurrentMemberRole = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;
                const res = await fetch(`${API_BASE_URL}/api/user/currentUser`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setMemberRole(data.memberRole || "");
            } catch (err) {
                console.error("Failed to fetch user role:", err);
            }
        };
        fetchCurrentMemberRole();
    }, []);

    const currentProjectMember = useMemo(() => {
        if (!currentUserId || !projectMembers.length) return null;
        return projectMembers.find(m => {
            const uId = typeof m.userId === 'object' ? (m.userId?._id || m.userId?.id) : (m.userId || m._id || m.id);
            return String(uId) === String(currentUserId);
        }) || null;
    }, [currentUserId, projectMembers]);

    const currentUserRole = currentProjectMember?.role || currentUser?.role || memberCurrentRole;
    const isAdmin = String(currentUser?.role).toLowerCase() === 'admin';
    const isManager = currentUserRole === 'Manager' || isAdmin;

    // Load All Required Data In Parallel
    useEffect(() => {
        if (!projectId) return;

        // realtime reloads keep the page on screen; only the first load of a project shows the spinner
        if (loadedForRef.current !== projectId) setLoading(true);
        let cancelled = false;
        const failures = [];

        Promise.all([
            withFallback(fetchProjectById(projectId), null, failures, 'project'),
            withFallback(fetchTasksByProject(projectId), [], failures, 'tasks'),
            withFallback(fetchMembersByProject(projectId), [], failures, 'members'),
            withFallback(fetchColumnsByProject(projectId), [], failures, 'columns')
        ]).then(([pData, tData, mData, cData]) => {
            if (cancelled) return;
            const realProject = pData?.data || pData || {};
            const tasksList = Array.isArray(tData) ? tData : (tData?.data || []);
            const membersList = Array.isArray(mData) ? mData : (mData?.data || []);
            const columnsList = Array.isArray(cData) ? cData : (cData?.data || []);

            setProject(realProject);
            setProjectDetail(realProject.projectDetail || "");
            setDocuments(realProject.documents || []);
            setTasks(tasksList);
            setProjectMembers(membersList);
            setColumns(columnsList);

            // --- Process Chart & Stagnation Data ---
            const colPositionMap = new Map();
            columnsList.forEach(col => colPositionMap.set(String(col._id || col.id), col.position));

            const counts = { backlog: 0, todo: 0, inProgress: 0, review: 0, done: 0 };
            const todoList = [];
            const inProgressList = [];
            const reviewList = [];

            tasksList.forEach(task => {
                let colId = task.columnId ? (typeof task.columnId === 'object' ? String(task.columnId._id || task.columnId.id || '') : String(task.columnId)) : null;
                const pos = colPositionMap.get(colId);
                const days = calculateDaysStuck(task.updatedAt || task.createdAt);
                const taskItem = { id: task._id || task.id, title: task.title || 'Untitled Task', days };

                if (!colId) {
                    counts.backlog++;
                } else if (pos === 0) {
                    counts.todo++;
                    todoList.push(taskItem);
                } else if (pos === 1) {
                    counts.inProgress++;
                    inProgressList.push(taskItem);
                } else if (pos === 2) {
                    counts.review++;
                    reviewList.push(taskItem);
                } else if (pos === 3) {
                    counts.done++;
                } else {
                    counts.backlog++;
                }
            });

            setStatusChartData([
                { name: 'Backlog', tasks: counts.backlog, color: '#94a3b8' },
                { name: 'To Do', tasks: counts.todo, color: '#64748b' },
                { name: 'In Progress', tasks: counts.inProgress, color: '#f59e0b' },
                { name: 'Review', tasks: counts.review, color: '#6366f1' },
                { name: 'Done', tasks: counts.done, color: '#16a34a' }
            ]);

            const weekMap = {};
            tasksList.forEach(task => {
                const w = task.week || 1;
                weekMap[w] = (weekMap[w] || 0) + 1;
            });

            const pStart = realProject?.startDate || realProject?.createdAt;
            const pEnd = realProject?.date || realProject?.endDate;

            const formattedWeekData = Object.keys(weekMap)
                .sort((a, b) => Number(a) - Number(b))
                .map(w => ({
                    weekLabel: getWeekDateRange(pStart, pEnd, w) ? `Week ${w} (${getWeekDateRange(pStart, pEnd, w)})` : `Week ${w}`,
                    weekNum: w,
                    dateRange: getWeekDateRange(pStart, pEnd, w),
                    tasks: weekMap[w]
                }));

            setWeekChartData(formattedWeekData);
            setStagnantTables({ todo: todoList, inProgress: inProgressList, review: reviewList });

        }).finally(() => {
            if (cancelled) return;
            loadedForRef.current = projectId;
            setLoadFailures(failures);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [projectId, reloadKey]);

    // tasks / project / members / notes changed by someone else
    useRealtimeRefetch(() => setReloadKey((k) => k + 1), ['tasks', 'projects', 'members', 'notes', 'columns', 'users'], projectId);

    // Timeline calculation
    const timeline = useMemo(() => buildTimeline(project, tasks), [project, tasks]);
    const timelineRows = useMemo(() => filterTimelineRows(timeline.rows, { userId: timelineUserId, hideCompleted }), [timeline.rows, timelineUserId, hideCompleted]);
    const slippedCount = timeline.rows.filter((r) => r.slipped).length;

    // Actions
    const handleSaveDetail = async () => {
        if (!isManager) return;
        try {
            setIsSavingDetail(true);
            const res = await updateProjectDetail(projectId, projectDetail);
            if (res?.project) setProject(res.project);
            setIsEditingDetail(false);
        } catch (error) {
            notify({ type: "error", title: "Failed to update project details.", message: error.message });
        } finally {
            setIsSavingDetail(false);
        }
    };

    const handleFileUpload = async (e) => {
        e.preventDefault();
        if (!isManager) {
            notify({ type: "error", title: "Only a Manager or an Admin can do this." });
            return;
        }
        if (!selectedFiles || selectedFiles.length === 0) {
            notify({ type: "info", title: "Please select at least one file to upload!" });
            return;
        }

        try {
            setIsUploading(true);
            const normalizedFiles = Array.from(selectedFiles).map(file => new File([file], file.name.normalize('NFC'), { type: file.type }));
            const res = await uploadProjectDocument(projectId, normalizedFiles);

            if (res?.documents) {
                setDocuments(res.documents);
                setSelectedFiles([]);
                e.target.reset();
            }
        } catch (error) {
            notify({ type: "error", title: "An error occurred while uploading files!", message: error.message });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteDocument = async (docId) => {
        const doc = documents.find(d => String(d._id) === String(docId));
        await confirm(deleteConfirm({
            item: "document",
            name: doc?.name,
            onConfirm: async () => {
                try {
                    const res = await deleteProjectDocument(projectId, docId);
                    if (res?.documents) {
                        setDocuments(res.documents);
                    } else {
                        setDocuments(prev => prev.filter(d => String(d._id) !== String(docId)));
                    }
                } catch (error) {
                    throw new Error(error.message || "An error occurred while deleting the document.");
                }
            },
        }));
    };

    const renderStagnantTable = (title, dataList, kind) => (
        <section className={`card stagnation-card kind-${kind}`} aria-label={`${title}: days in status`}>
            <header className="stagnation-card-header">
                <h3 className="stagnation-card-title">{title}</h3>
                <span className="board-column-count">{dataList.length}</span>
            </header>
            <div className="stagnation-card-body">
                <table className="stagnation-table">
                    <thead>
                    <tr>
                        <th scope="col">Task</th>
                        <th scope="col" className="is-numeric">Days</th>
                    </tr>
                    </thead>
                    <tbody>
                    {dataList.length === 0 ? (
                        <tr>
                            <td colSpan={2} className="stagnation-empty">No tasks in this status</td>
                        </tr>
                    ) : (
                        dataList.map((item, idx) => (
                            <tr key={item.id || idx}>
                                <td className="stagnation-task" title={item.title}>{item.title}</td>
                                <td className={`is-numeric stagnation-days${item.days > 7 ? ' is-stale' : ''}`}>
                                    {item.days} d
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>
        </section>
    );

    if (loading) {
        return (
            <div className="page-loading" role="status">
                <Loader2 className="icon animate-spin" aria-hidden="true" />
                <span>Loading project information...</span>
            </div>
        );
    }

    const coreFailure = loadFailures.find((f) => f.label === 'project');
    const membersFailed = loadFailures.some((f) => f.label === "members");

    if (coreFailure) {
        return (
            <main className="page-content">
                <ErrorState
                    title="Couldn't load this project"
                    message={failureMessage(coreFailure)}
                    onRetry={() => setReloadKey((k) => k + 1)}
                />
            </main>
        );
    }

    const totalTasks = statusChartData.reduce((sum, d) => sum + d.tasks, 0);

    return (
        <>
            {/* Common Header */}
            <ProjectHeader
                projectId={projectId}
                project={project}
                memberCount={projectMembers.length}
                taskCount={tasks.length}
                startDate={formatDateDMY(project?.startDate || project?.createdAt)}
                endDate={formatDateDMY(project?.date || project?.dueDate || project?.endDate)}
            />

            <main className="page-content project-charts-page" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* --- 1. OVERVIEW & DOCUMENTS SECTION --- */}
                <MilestoneTimeline
                    projectId={projectId}
                    startDate={project?.startDate || project?.createdAt}
                    endDate={project?.date || project?.dueDate || project?.endDate}
                    canManage={isManager || currentUserRole === 'Leader'}
                />

                <div className="card" style={{ padding: '20px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                            <FileText size={20} color="#4f46e5" /> Project Overview & Details
                        </h3>
                        {isManager && !isEditingDetail && (
                            <button className="btn btn-outline btn-sm" onClick={() => setIsEditingDetail(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <Edit3 size={14} /> Edit
                            </button>
                        )}
                    </div>

                    {isEditingDetail ? (
                        <div>
                            <textarea
                                className="textarea"
                                rows="6"
                                value={projectDetail}
                                onChange={(e) => setProjectDetail(e.target.value)}
                                placeholder="Enter detailed description, project goals, scope, and requirements..."
                                style={{ width: '100%', marginBottom: '12px', padding: '10px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setIsEditingDetail(false)} style={{ cursor: 'pointer' }}>
                                    Cancel
                                </button>
                                <button className="btn btn-primary btn-sm" onClick={handleSaveDetail} disabled={isSavingDetail} style={{ cursor: isSavingDetail ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {isSavingDetail ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                                    <span>Save Changes</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ color: '#374151', lineHeight: '1.6', whiteSpace: 'pre-line', fontSize: '14px' }}>
                            {projectDetail ? projectDetail : <i style={{ color: '#9ca3af' }}>No detailed description provided for this project yet.</i>}
                        </div>
                    )}
                </div>

                <div className="card" style={{ padding: '20px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        <Upload size={20} color="#4f46e5" /> Documents & Attachments
                    </h3>

                    {isManager && (
                        <form onSubmit={handleFileUpload} style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
                            <input
                                type="file"
                                multiple
                                aria-label="Choose files to upload"
                                className="input"
                                style={{ flex: '1', padding: '8px' }}
                                onChange={(e) => setSelectedFiles(e.target.files)}
                                required
                            />
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isUploading || selectedFiles.length === 0}
                                style={{ cursor: (isUploading || selectedFiles.length === 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                            >
                                {isUploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                                <span>Upload ({selectedFiles.length || 0} files)</span>
                            </button>
                        </form>
                    )}

                    <div className="document-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {documents.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>No documents have been uploaded yet.</p>
                        ) : (
                            documents.map((doc) => {
                                const isOwnerOrManager = isManager || String(doc.uploadedBy?._id || doc.uploadedBy) === String(currentUserId);
                                const fileUrl = doc.url?.startsWith('http') ? doc.url : `${API_BASE_URL}${doc.url}`;

                                return (
                                    <div key={doc._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <FileText size={24} color="#4f46e5" />
                                            <div>
                                                <a href={fileUrl} target="_blank" rel="noopener noreferrer" download style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
                                                    {doc.name}
                                                </a>
                                            </div>
                                        </div>

                                        {isOwnerOrManager && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteDocument(doc._id)}
                                                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px' }}
                                                title="Delete file"
                                                aria-label={`Delete document ${doc.name || ''}`.trim()}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* --- 2. TIMELINE (GANTT) SECTION --- */}
                {tasks.length === 0 ? (
                    <div className="card">
                        <EmptyBlock
                            icon={<ChartGantt className="icon" />}
                            title="No tasks to plan yet"
                            desc="Tasks appear on the timeline in the week they are planned for."
                            action={<Link className="btn btn-primary btn-sm" to={`/projectboard/${projectId}`}>Open the board</Link>}
                        />
                    </div>
                ) : (
                    <section className="card timeline-card" aria-labelledby="timeline-title">
                        <header className="timeline-toolbar">
                            <div className="timeline-heading">
                                <h2 id="timeline-title" className="chart-card-title">Project Timeline</h2>
                                <p className="chart-card-subtitle">
                                    {timeline.currentWeek ? `Now: week ${timeline.currentWeek} of ${timeline.weeks.length}` : `Project not started — ${timeline.weeks.length} week(s) planned`}
                                    {slippedCount > 0 && ` · ${slippedCount} unfinished task${slippedCount === 1 ? "" : "s"} past the planned week`}
                                </p>
                            </div>
                            <div className="timeline-filters">
                                {!membersFailed && (
                                    <div className="select-wrap">
                                        <select className={`select${timelineUserId ? " is-active" : ""}`} aria-label="Filter by person" value={timelineUserId} onChange={(e) => setTimelineUserId(e.target.value)}>
                                            <option value="">Everyone</option>
                                            {projectMembers.map((m) => (
                                                <option key={memberUserId(m)} value={memberUserId(m)}>{personName(memberUser(m))}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="icon icon-sm" aria-hidden="true" />
                                    </div>
                                )}
                                <label className="timeline-check">
                                    <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
                                    Hide completed
                                </label>
                            </div>
                        </header>

                        <ul className="timeline-legend" aria-label="Legend">
                            {["todo", "progress", "review", "completed"].map((g) => (
                                <li key={g} className={`timeline-legend-item kind-${g}`}><span className="timeline-swatch" aria-hidden="true" />{GROUP_LABEL[g]}</li>
                            ))}
                            <li className="timeline-legend-item is-slipped"><span className="timeline-swatch" aria-hidden="true" />Past planned week</li>
                        </ul>

                        {timelineRows.length === 0 ? (
                            <p className="chart-note">No task matches the filters.</p>
                        ) : (
                            <div className="timeline-scroll">
                                <div className="timeline-grid" style={{ "--weeks": timeline.weeks.length }} role="table" aria-label="Tasks by planned week">
                                    <div className="timeline-row timeline-head" role="row">
                                        <span className="timeline-task-cell" role="columnheader">Task</span>
                                        {timeline.weeks.map((w) => (
                                            <span key={w.number} role="columnheader" className={`timeline-week${w.number === timeline.currentWeek ? " is-now" : ""}`}>
                                                <strong>W{w.number}</strong>
                                                {w.start && <span className="timeline-week-date">{shortDay(w.start)}</span>}
                                            </span>
                                        ))}
                                    </div>
                                    {timelineRows.map((row) => {
                                        const names = row.assignees.map(personName);
                                        const label = `${row.title}: ${GROUP_LABEL[row.group]}, planned week ${row.week}${row.slipped ? `, not finished — now week ${timeline.currentWeek}` : ""}, ${row.points} pts`;
                                        return (
                                            <div className="timeline-row" role="row" key={row.id}>
                                                <span className="timeline-task-cell" role="rowheader">
                                                    <span className="timeline-task-title" title={row.title}>{row.title}</span>
                                                    <span className="timeline-task-people">
                                                        {row.assignees.slice(0, 3).map((a, i) => (
                                                            <span key={i} className={`avatar avatar-xs ${avatarToneClass(typeof a === "object" ? a?._id : a)}`} title={personName(a)} aria-hidden="true">{getInitials(personName(a))}</span>
                                                        ))}
                                                        {names.length === 0 && <span className="timeline-unassigned">Unassigned</span>}
                                                    </span>
                                                </span>
                                                {timeline.currentWeek && (
                                                    <span className="timeline-now-col" style={{ gridColumn: timeline.currentWeek + 1 }} aria-hidden="true" />
                                                )}
                                                <span
                                                    role="cell"
                                                    className={`timeline-bar kind-${row.group}${row.slipped ? " is-slipped" : ""}`}
                                                    style={{ gridColumn: `${row.from + 1} / ${row.to + 2}` }}
                                                    title={label}
                                                    aria-label={label}
                                                >
                                                    <span className="timeline-bar-text">{row.points} est</span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {/* --- 3. PROJECT CHARTS & STAGNATION SECTION --- */}
                <div className="analytics-grid">
                    <ChartCard
                        id="status-chart"
                        title="Tasks by Status"
                        subtitle={`${totalTasks} ${totalTasks === 1 ? 'task' : 'tasks'} by board column`}
                        icon={<BarChart3 className="icon" />}
                    >
                        <div className="chart-canvas" aria-hidden="true">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={statusChartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                                    <XAxis dataKey="name" interval={0} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                                    <YAxis allowDecimals={false} width={36} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CountTooltip unit="task" />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
                                    <Bar dataKey="tasks" name="Tasks" maxBarSize={44} radius={[6, 6, 0, 0]} isAnimationActive={false}>
                                        {statusChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>

                    <ChartCard
                        id="week-chart"
                        title="Tasks by Week"
                        subtitle="Number of tasks planned for each week"
                        icon={<CalendarRange className="icon" />}
                    >
                        <div className="chart-canvas" aria-hidden="true">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weekChartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                                    <XAxis dataKey="weekLabel" interval={0} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_COLORS.grid }} />
                                    <YAxis allowDecimals={false} width={36} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CountTooltip unit="task" />} cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }} />
                                    <Bar dataKey="tasks" name="Tasks" fill={CHART_COLORS.actual} maxBarSize={44} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartCard>
                </div>

                <section className="stagnation" aria-labelledby="stagnation-title">
                    <div className="analytics-header">
                        <div>
                            <h2 id="stagnation-title" className="section-title">
                                <Hourglass className="icon icon-sm" aria-hidden="true" /> Time in Status
                            </h2>
                            <p className="section-subtitle">Days since each open task was last updated. More than 7 days is highlighted.</p>
                        </div>
                    </div>
                    <div className="stagnation-grid">
                        {renderStagnantTable('To Do', stagnantTables.todo, 'todo')}
                        {renderStagnantTable('In Progress', stagnantTables.inProgress, 'progress')}
                        {renderStagnantTable('Review', stagnantTables.review, 'review')}
                    </div>
                </section>

            </main>
        </>
    );
}