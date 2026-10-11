import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ErrorState from '../../components/common/ErrorState.jsx';
import { withFallback, failureMessage } from '../../utils/requestState.js';

import {
    Plus,
    Loader2,
    ArrowRightCircle,
    Trash2
} from 'lucide-react';

import {
    fetchProjectById,
    fetchTasksByProject,
    fetchColumnsByProject,
    fetchMembersByProject,
    fetchTaskById,
    createTask,
    moveTask,
    deleteTask
} from '../../../api.jsx';
import { taskStatus, deleteBlockReason, sortBacklogTasks } from '../../utils/backlog.js';
import { API_BASE_URL } from "../../config/apiConfig.js";

import ProjectHeader from '../../components/project/ProjectHeader.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useConfirm, deleteConfirm } from '../../components/common/confirmContext.js';
import { notify } from '../../utils/notify.js';
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch.js';

// Helper function to format date as DD/MM/YYYY
const formatDate = (dateString, fallback = 'Not set') => {
    if (!dateString) return fallback;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return fallback;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
};

// Hàm tính khoảng ngày đại diện cho từng tuần (DD/MM - DD/MM)
const getWeekDateRange = (projectStartDate, projectEndDate, weekNum) => {
    if (!projectStartDate) return '';
    const start = new Date(projectStartDate);
    if (isNaN(start.getTime())) return '';

    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + (Number(weekNum) - 1) * 7);

    let weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // Nếu vượt quá ngày kết thúc dự án thì giới hạn lại đúng ngày endDate
    if (projectEndDate) {
        const projEnd = new Date(projectEndDate);
        if (!isNaN(projEnd.getTime()) && weekEnd > projEnd) {
            weekEnd = projEnd;
        }
    }

    const formatShort = (d) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

    return `${formatShort(weekStart)} - ${formatShort(weekEnd)}`;
};

// Hàm tính trạng thái thời hạn của Task: On Track, Expiring, Overdue
const calculateTaskDeadlineStatus = (task, project) => {
    const currentWeek = Number(task?.week) || 1;
    const projStart = project?.startDate || project?.createdDate || project?.createdAt || project?.start_date;
    const projEnd = project?.date || project?.dueDate || project?.endDate;

    if (!projStart) return 'On Track';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(projStart);
    start.setHours(0, 0, 0, 0);
    if (isNaN(start.getTime())) return 'On Track';

    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + (currentWeek - 1) * 7);

    let weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    if (projEnd) {
        const projEndObj = new Date(projEnd);
        projEndObj.setHours(0, 0, 0, 0);
        if (!isNaN(projEndObj.getTime()) && weekEnd > projEndObj) {
            weekEnd = projEndObj;
        }
    }

    const expiringStartDate = new Date(weekEnd);
    expiringStartDate.setDate(weekEnd.getDate() - 1);

    if (today > weekEnd) {
        return 'Overdue';
    } else if (today >= expiringStartDate) {
        return 'Expiring';
    }

    return 'On Track';
};

export default function ProjectList() {
    const { id: projectId } = useParams();

    const [activeModal, setActiveModal] = useState(null);

    const [project, setProject] = useState({});
    const [projectMembers, setProjectMembers] = useState([]);
    const [memberCurrentRole, setMemberRole] = useState("");
    const [columns, setColumns] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    // Requests that failed in the last load (empty = everything loaded)
    const [loadFailures, setLoadFailures] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const confirm = useConfirm();

    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState('Medium');
    const [newTaskPoints, setNewTaskPoints] = useState(0);
    // tasks being pushed right now (no second request for the same task)
    const [pushingIds, setPushingIds] = useState(() => new Set());
    const [newTaskDesc, setNewTaskDesc] = useState('');
    const [newTaskWeek, setNewTaskWeek] = useState(1);

    const getCurrentUser = () => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}');
        } catch {
            return {};
        }
    };

    const currentUser = getCurrentUser();
    const currentUserId = currentUser._id || currentUser.id || null;

    const fetchCurrentMemberRole = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const res = await fetch(`${API_BASE_URL}/user/currentUser`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setMemberRole(data.memberRole || "");
        } catch (err) {
            console.error("Failed to fetch current member role:", err);
        }
    };

    useEffect(() => {
        fetchCurrentMemberRole();
    }, []);

    const currentProjectMember = useMemo(() => {
        if (!currentUserId || !projectMembers.length) return null;

        return projectMembers.find(m => {
            const uId = m.userId?._id || m.userId?.id || m.userId || m._id || m.id;
            return String(uId) === String(currentUserId);
        }) || null;
    }, [currentUserId, projectMembers]);

    const currentUserRole = currentProjectMember?.role || currentUser?.role || memberCurrentRole;

    const isAdmin = String(currentUser?.role).toLowerCase() === 'admin';
    const isLeader = currentUserRole === 'Leader';
    const isManager = currentUserRole === 'Manager' || isAdmin;

    // Check if task week is due relative to project start date
    const isTaskDueForBoard = (taskWeek, projectStartDate) => {
        if (!projectStartDate) return false;

        const start = new Date(projectStartDate);
        if (isNaN(start.getTime())) return false;

        start.setHours(0, 0, 0, 0);

        const weekNum = Number(taskWeek) || 1;
        const weekStartDate = new Date(start);
        weekStartDate.setDate(start.getDate() + (weekNum - 1) * 7);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return today >= weekStartDate;
    };

    const loadData = async (quiet = false) => {
        if (!projectId) return;
        const failures = [];

        try {
            if (!quiet) setLoading(true);
            const [pData, colsData, tskList, membersData] = await Promise.all([
                withFallback(fetchProjectById(projectId), {}, failures, 'project'),
                withFallback(fetchColumnsByProject(projectId), [], failures, 'columns'),
                withFallback(fetchTasksByProject(projectId), [], failures, 'tasks'),
                withFallback(fetchMembersByProject(projectId), [], failures, 'members')
            ]);

            const realProject = pData?.data || pData || {};
            const realColumns = Array.isArray(colsData) ? colsData : (colsData?.data || []);
            const realTasks = Array.isArray(tskList) ? tskList : (tskList?.data || []);
            const realMembers = Array.isArray(membersData)
                ? membersData
                : (membersData?.data || membersData?.members || []);

            realColumns.sort((a, b) => (a.position || 0) - (b.position || 0));

            const projectStart = realProject.startDate || realProject.start_date || realProject.createdAt;
            const todoColumn = realColumns[0];
            const todoColumnId = todoColumn ? (todoColumn._id || todoColumn.id) : null;

            // Automatically push tasks that are due and not on the board yet
            const duePush = todoColumnId
                ? realTasks.filter((t) => !taskStatus(t, realColumns).onBoard && isTaskDueForBoard(t.week, projectStart))
                : [];
            const pushedIds = new Set();
            await Promise.allSettled(duePush.map((t) =>
                moveTask(t._id || t.id, { sourceColumnId: null, destColumnId: todoColumnId, destinationIndex: 0 })
                    .then(() => pushedIds.add(String(t._id || t.id)))
                    .catch((err) => console.error('Auto push task error:', err))
            ));

            const allTasks = realTasks.map((t) => (pushedIds.has(String(t._id || t.id)) ? { ...t, columnId: todoColumnId } : t));

            setProject(realProject);
            setColumns(realColumns);
            setTasks(allTasks);
            setProjectMembers(realMembers);
        } catch (err) {
            console.error('Error loading backlog tasks:', err);
            failures.push({ label: 'backlog', error: err });
        } finally {
            setLoadFailures(failures);
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [projectId]);

    useRealtimeRefetch(() => loadData(true), ['tasks', 'projects', 'members', 'notes', 'columns', 'users'], projectId);

    const totalProjectWeeks = useMemo(() => {
        if (!project) return 1;

        const start = project.startDate || project.createdDate || project.createdAt;
        const end = project.date || project.dueDate || project.endDate;

        if (!start || !end) return 1;

        const startDateObj = new Date(start);
        const endDateObj = new Date(end);

        const diffTime = endDateObj.getTime() - startDateObj.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (diffDays <= 0) return 1;

        return Math.ceil(diffDays / 7);
    }, [project]);

    const handleOpenCreateModal = () => {
        if (!isManager) return;
        setNewTaskTitle('');
        setNewTaskDesc('');
        setNewTaskPriority('Medium');
        setNewTaskPoints(0);
        setNewTaskWeek(1);
        setActiveModal('quickCreateTaskModal');
    };

    const closeModal = () => {
        setActiveModal(null);
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!isManager || !newTaskTitle.trim()) return;

        try {
            setIsSubmitting(true);
            if (!projectId) return;

            const pointValue = Number(newTaskPoints) || 0;
            const weekValue = Number(newTaskWeek) || 1;

            const payload = {
                title: newTaskTitle,
                description: newTaskDesc,
                projectId: projectId,
                priority: newTaskPriority,
                point: pointValue,
                points: pointValue,
                week: weekValue,
                assignees: []
            };

            const response = await createTask(payload);
            const createdTask = response?.data || response;

            if (createdTask && (createdTask._id || createdTask.id)) {
                const projectStart = project?.startDate || project?.start_date || project?.createdAt;
                const todoColumn = columns[0];
                const todoColumnId = todoColumn ? (todoColumn._id || todoColumn.id) : null;

                if (todoColumnId && isTaskDueForBoard(weekValue, projectStart)) {
                    await moveTask(createdTask._id || createdTask.id, {
                        sourceColumnId: null,
                        destColumnId: todoColumnId,
                        destinationIndex: 0
                    });
                }
                await loadData(true);

                closeModal();
            }
        } catch (error) {
            console.error("Error creating task:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePushToBoard = async (task) => {
        if (!isLeader) return;
        const todoColumn = columns[0];
        if (!todoColumn) return;

        const taskId = String(task._id || task.id);
        if (pushingIds.has(taskId)) return;
        const todoColumnId = todoColumn._id || todoColumn.id;

        setPushingIds((ids) => new Set(ids).add(taskId));
        try {
            await moveTask(taskId, {
                sourceColumnId: task.columnId || null,
                destColumnId: todoColumnId,
                destinationIndex: 0
            });
            notify({ type: 'success', title: 'Success', message: 'Task pushed to To-do column on Board' });
            await loadData(true);
        } catch (err) {
            console.error('Error pushing task to board:', err);
            notify({ type: 'error', title: 'Error', message: 'Failed to push task to Board' });
            await loadData(true);
        } finally {
            setPushingIds((ids) => {
                const next = new Set(ids);
                next.delete(taskId);
                return next;
            });
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!isManager) return;
        const task = tasks.find(t => String(t._id || t.id) === String(taskId));
        try {
            const [fresh, freshColumns] = await Promise.all([fetchTaskById(taskId), fetchColumnsByProject(projectId)]);
            const reason = deleteBlockReason(taskStatus(fresh?.data || fresh, Array.isArray(freshColumns) ? freshColumns : (freshColumns?.data || columns)));
            if (reason) {
                notify({ type: 'error', title: "This task can't be deleted", message: reason });
                await loadData(true);
                return;
            }
        } catch (err) {
            notify({ type: 'error', title: "Couldn't check the task status", message: err?.message });
            return;
        }
        await confirm(deleteConfirm({
            item: 'task',
            name: task?.title,
            onConfirm: async () => {
                await deleteTask(taskId);
                setTasks(prev => prev.filter(t => String(t._id || t.id) !== String(taskId)));
            },
        }));
    };

    const formattedStartDate = formatDate(project?.startDate || project?.start_date || project?.createdAt);
    const formattedDueDate = formatDate(project?.date || project?.dueDate || project?.endDate);

    const projStart = project?.startDate || project?.start_date || project?.createdAt;
    const projEnd = project?.date || project?.dueDate || project?.endDate;

    const coreFailure = loadFailures.find((f) => f.label !== 'members');
    const membersFailed = loadFailures.some((f) => f.label === 'members');

    return (
        <>
            {loading ? (
                <div className="page-loading" role="status">
                    <Loader2 className="icon animate-spin" aria-hidden="true" />
                    <span>Loading...</span>
                </div>
            ) : coreFailure ? (
                <main className="page-content">
                    <ErrorState
                        title="Couldn't load the backlog"
                        message={failureMessage(coreFailure)}
                        onRetry={loadData}
                    />
                </main>
            ) : (
                <>
                    <ProjectHeader
                        projectId={projectId}
                        project={project}
                        memberCount={projectMembers.length}
                        taskCount={tasks.length}
                        startDate={formattedStartDate}
                        endDate={formattedDueDate}
                    />

                    <main className="page-content" style={{ padding: '20px' }}>
                        {membersFailed && (
                            <ErrorState
                                variant="inline"
                                title="Project members could not be loaded."
                                message="Assignee names may be missing."
                                onRetry={loadData}
                            />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>Backlog</h2>
                            </div>
                            {isManager && (
                                <button onClick={handleOpenCreateModal} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Plus className="w-4 h-4" /> Add Task
                                </button>
                            )}
                        </div>

                        <div className="backlog-table-wrap">
                            <table className="backlog-table">
                                <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                                <tr>
                                    <th style={{ padding: '12px 16px' }}>Title</th>
                                    <th style={{ padding: '12px 16px' }}>Priority</th>
                                    <th style={{ padding: '12px 16px' }}>Column</th>
                                    <th style={{ padding: '12px 16px' }}>Status</th>
                                    <th style={{ padding: '12px 16px' }}>Week</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                                </thead>
                                <tbody>
                                {tasks.length > 0 ? (
                                    sortBacklogTasks(tasks).map((task, index) => {
                                        const taskId = task._id || task.id || `task-fallback-${index}`;
                                        const displayTitle = task.title || task.name || 'Untitled Task';
                                        const status = taskStatus(task, columns);
                                        const blockReason = deleteBlockReason(status);
                                        const taskWeek = task.week || 1;
                                        const weekDateRange = getWeekDateRange(projStart, projEnd, taskWeek);
                                        const deadlineStatus = calculateTaskDeadlineStatus(task, project);

                                        return (
                                            <tr key={taskId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '12px 16px', fontWeight: 500, color: '#1e293b' }}>
                                                    <div>{displayTitle}</div>
                                                    {task.description && (
                                                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>
                                                            {task.description}
                                                        </div>
                                                    )}
                                                </td>

                                                <td style={{ padding: '12px 16px' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#fffbeb', color: '#d97706' }}>
                                                            {task.priority || 'Medium'}
                                                        </span>
                                                </td>

                                                {/* Đổi tên từ Status thành Column */}
                                                <td style={{ padding: '12px 16px' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>
                                                            {status.onBoard ? status.title : 'Backlog'}
                                                        </span>
                                                </td>

                                                {/* Cột Status mới hiển thị On Track, Expiring, Overdue */}
                                                <td style={{ padding: '12px 16px' }}>
                                                    {deadlineStatus === 'Overdue' && (
                                                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                                                            Overdue
                                                        </span>
                                                    )}
                                                    {deadlineStatus === 'Expiring' && (
                                                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#fef3c7', color: '#d97706', border: '1px solid #fde68a' }}>
                                                            Expiring
                                                        </span>
                                                    )}
                                                    {deadlineStatus === 'On Track' && (
                                                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#16a34a', border: '1px solid #86efac' }}>
                                                            On Track
                                                        </span>
                                                    )}
                                                </td>

                                                <td style={{ padding: '12px 16px' }}>
                                                        <span style={{
                                                            background: '#e0e7ff',
                                                            color: '#3730a3',
                                                            border: '1px solid #c7d2fe',
                                                            borderRadius: '12px',
                                                            padding: '2px 8px',
                                                            fontSize: '12px',
                                                            fontWeight: 600,
                                                            display: 'inline-block'
                                                        }}>
                                                            Week {taskWeek} {weekDateRange ? `(${weekDateRange})` : ''}
                                                        </span>
                                                </td>

                                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                                        {(isLeader && !status.onBoard) && (
                                                            <button
                                                                onClick={() => handlePushToBoard(task)}
                                                                disabled={pushingIds.has(String(taskId))}
                                                                className="btn btn-primary btn-sm"
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                                                            >
                                                                {pushingIds.has(String(taskId)) ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <ArrowRightCircle className="w-3.5 h-3.5" />
                                                                )}
                                                                Push to Board
                                                            </button>
                                                        )}

                                                        {isManager && (
                                                            <button
                                                                type="button"
                                                                aria-label={`Delete task ${task.title || ''}`.trim()}
                                                                onClick={() => handleDeleteTask(taskId)}
                                                                disabled={Boolean(blockReason)}
                                                                className="btn btn-danger btn-sm"
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    fontSize: '12px',
                                                                    backgroundColor: '#ef4444',
                                                                    color: '#fff',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '4px',
                                                                    border: 'none',
                                                                    cursor: blockReason ? 'not-allowed' : 'pointer',
                                                                    opacity: blockReason ? 0.5 : 1
                                                                }}
                                                                title={blockReason || 'Delete task'}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                                            No tasks yet.
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    </main>
                </>
            )}

            {/* CREATE TASK MODAL */}
            {isManager && activeModal === 'quickCreateTaskModal' && (
                <Modal title="Add Task to Backlog" onClose={closeModal}>
                    <form className="modal-form" onSubmit={handleCreateTask}>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label" htmlFor="backlog-task-title">Title *</label>
                                <input id="backlog-task-title"
                                       className="input"
                                       placeholder="e.g: My task"
                                       value={newTaskTitle}
                                       onChange={(e) => setNewTaskTitle(e.target.value)}
                                       required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="backlog-task-points">Estimate time</label>
                                <input id="backlog-task-points"
                                       type="number"
                                       min="0"
                                       className="input"
                                       placeholder="0"
                                       value={newTaskPoints}
                                       onChange={(e) => setNewTaskPoints(e.target.value === '' ? '' : Number(e.target.value))}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="backlog-task-week">Week</label>
                                <select id="backlog-task-week"
                                        className="select"
                                        value={newTaskWeek}
                                        onChange={(e) => setNewTaskWeek(Number(e.target.value))}
                                >
                                    {Array.from({ length: totalProjectWeeks }, (_, i) => i + 1).map(w => {
                                        const dateRange = getWeekDateRange(projStart, projEnd, w);
                                        return (
                                            <option key={w} value={w}>
                                                {dateRange ? `Week ${w} (${dateRange})` : `Week ${w}`}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="backlog-task-priority">Priority</label>
                                <select id="backlog-task-priority"
                                        className="select"
                                        value={newTaskPriority}
                                        onChange={(e) => setNewTaskPriority(e.target.value)}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">Urgent</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="backlog-task-description">Description</label>
                                <textarea id="backlog-task-description"
                                          className="textarea"
                                          placeholder="Add task description..."
                                          value={newTaskDesc}
                                          onChange={(e) => setNewTaskDesc(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                {isSubmitting ? 'Adding...' : 'Add'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </>
    );
}