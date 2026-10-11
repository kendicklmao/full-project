import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { socket, isForProject } from './../../utils/socket.js';
import {
    fetchProjectById,
    fetchTasksByProject,
    fetchColumnsByProject,
    fetchMembersByProject,
    createTask,
    updateTask,
    fetchTaskById,
    deleteTask,
    addChecklistItem,
    toggleChecklistItem,
    deleteChecklist,
    fetchTaskComments,
    addComment,
    fetchTaskActivities,
    moveTask
} from './../../../api.jsx';
import { API_BASE_URL } from "../../config/apiConfig.js";
import "./project.css";
import ErrorState from '../../components/common/ErrorState.jsx';
import { useConfirm, deleteConfirm } from '../../components/common/confirmContext.js';
import Modal from '../../components/common/Modal.jsx';
import { withFallback, failureMessage } from '../../utils/requestState.js';
import { useRealtimeRefetch } from '../../hooks/useRealtimeRefetch.js';
import { Plus, Loader2, CalendarClock } from "lucide-react";

import ProjectHeader from '../../components/project/ProjectHeader.jsx';
import { applyMoveToColumns, buildMovePayload, getDestinationIndex, mergeMovedTask, idOf } from '../../utils/taskMove.js';
import BoardToolbar from './board/BoardToolbar.jsx';
import BoardColumnHeader from './board/BoardColumnHeader.jsx';
import TaskCard from './board/TaskCard.jsx';
import { getColumnStatus } from './board/columnStatus.js';
import { getProjectStart, isMoveLockedForRole, formatDayDMY } from '../../utils/projectSchedule.js';
import TaskDrawerFrame from '../../components/task/TaskDrawerFrame.jsx';
import { DrawerSection, ChecklistSection, CommentsSection, ActivitySection, AssigneePicker, UserAvatar } from '../../components/task/TaskDrawerSections.jsx';
import { deleteBlockReason } from '../../utils/backlog.js';

// Helper function định dạng ngày theo chuẩn DD/MM/YYYY
const formatDateDMY = (dateValue) => {
    if (!dateValue) return 'Not set';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return 'Not set';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

// Helper chuẩn hóa giá trị estimate time
const extractEstimateTime = (task, fallback = 0) => {
    if (!task) return fallback;
    const val = task.estimateTime ?? task.estimate_time ?? task.point ?? task.points;
    if (val === undefined || val === null || val === '') return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
};

// Hàm tính ngày bắt đầu và kết thúc của Week `weekNum` (7 ngày/tuần)
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

    const formatShort = (d) =>
        `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

    return `${formatShort(weekStart)} - ${formatShort(weekEnd)}`;
};

const getInitials = (name) => {
    if (!name) return '??';
    const words = String(name).trim().split(/\s+/);
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

const extractUserId = (member) => {
    if (!member) return '';
    if (typeof member.userId === 'object') {
        return String(member.userId?._id || member.userId?.id || '');
    }
    if (member.userId) return String(member.userId);
    return String(member._id || member.id || '');
};

const getMemberUserId = (member) => extractUserId(member);

const getMemberDisplayName = (member) => {
    if (!member) return 'User';
    if (typeof member === 'object') {
        if (member.userId && typeof member.userId === 'object') {
            return member.userId.username || member.userId.name || member.userId.email || 'User';
        }
        return member.username || member.name || member.email || 'User';
    }
    return 'User';
};

const getMemberEmail = (member) => {
    if (!member) return '';
    if (typeof member === 'object') {
        if (member.userId && typeof member.userId === 'object') {
            return member.userId.email || '';
        }
        return member.email || '';
    }
    return '';
};

const getUserInfo = (userOrId, projectMembers = []) => {
    if (!userOrId) return null;

    if (typeof userOrId === 'object' && (userOrId.username || userOrId.name || userOrId.userId)) {
        return userOrId;
    }

    const targetId = typeof userOrId === 'object' ? String(userOrId._id || userOrId.id) : String(userOrId);

    const found = projectMembers.find(m => {
        const mUserId = getMemberUserId(m);
        const mId = String(m._id || m.id);
        return mUserId === targetId || mId === targetId;
    });

    return found || userOrId;
};

const extractColumnId = (columnId) => {
    if (!columnId) return '';
    if (typeof columnId === 'object') {
        return String(columnId._id || columnId.id || '');
    }
    return String(columnId);
};

const calculateCurrentProjectWeek = (project, totalWeeks) => {
    const start = project?.startDate || project?.createdDate || project?.createdAt;
    if (!start) return 1;

    let startYear, startMonth, startDateNum;
    if (typeof start === "string") {
        const parts = start.split("T")[0].split("-");
        if (parts.length === 3) {
            startYear = parseInt(parts[0], 10);
            startMonth = parseInt(parts[1], 10) - 1;
            startDateNum = parseInt(parts[2], 10);
        }
    }

    let startDateObj;
    if (startYear !== undefined && !isNaN(startYear)) {
        startDateObj = new Date(startYear, startMonth, startDateNum);
    } else {
        startDateObj = new Date(start);
    }

    if (isNaN(startDateObj.getTime())) return 1;

    const today = new Date();
    const startMidnight = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const diffDays = Math.round((todayMidnight - startMidnight) / (1000 * 3600 * 24));
    if (diffDays < 0) return 1;

    const calculatedWeek = Math.floor(diffDays / 7) + 1;
    return Math.min(Math.max(calculatedWeek, 1), totalWeeks || 1);
};

// Tính trạng thái task: Expiring, Overdue, On Track
const calculateTaskWeekAndStatus = (task, project, isDoneColumn = false) => {
    const currentWeek = Number(task?.week) || 1;

    const projStart = project?.startDate || project?.createdDate || project?.createdAt;
    const projEnd = project?.date || project?.dueDate || project?.endDate;

    if (!projStart) {
        return { displayWeek: currentWeek, status: 'On Track' };
    }

    // Nếu task nằm trong cột Done
    if (isDoneColumn) {
        return { displayWeek: currentWeek, status: 'On Track' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(projStart);
    start.setHours(0, 0, 0, 0);
    if (isNaN(start.getTime())) {
        return { displayWeek: currentWeek, status: 'On Track' };
    }

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
        return { displayWeek: currentWeek, status: 'Overdue' };
    } else if (today >= expiringStartDate) {
        return { displayWeek: currentWeek, status: 'Expiring' };
    }

    return { displayWeek: currentWeek, status: 'On Track' };
};

// ==========================================
// COMPONENT TASK DRAWER (Board)
// ==========================================
function TaskDrawer({
                        taskId,
                        isDrawerOpen,
                        handleCloseDrawer,
                        columns = [],
                        projectMembers = [],
                        maxWeeks = 1,
                        project = null,
                        onTaskUpdated,
                        onTaskDeleted,
                        onMoveTask,
                        isManager = false,
                        isLeader = false,
                        syncEvent = null
                    }) {
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const confirm = useConfirm();

    const [comments, setComments] = useState([]);
    const [commentsError, setCommentsError] = useState('');
    const [activities, setActivities] = useState([]);
    const [activitiesError, setActivitiesError] = useState('');
    const dirtyFieldsRef = useRef(new Set());

    const canEditAll = isManager;
    const canEditManagement = isManager || isLeader;
    const taskColumnTitle = columns?.find((c) => String(c._id) === extractColumnId(task?.columnId))?.title;
    const deleteBlocked = deleteBlockReason({ onBoard: Boolean(taskColumnTitle), title: taskColumnTitle || null });
    const canDeleteTask = isManager && !deleteBlocked;
    const canAddChecklist = isManager || isLeader;
    const canDeleteChecklist = isManager || isLeader;

    const normalizeTask = (realTask) => {
        const est = extractEstimateTime(realTask, 0);
        return {
            ...realTask,
            name: realTask.name || realTask.title || '',
            columnId: extractColumnId(realTask.columnId),
            assignees: Array.isArray(realTask.assignees)
                ? realTask.assignees.map(a => typeof a === 'object' ? String(a._id || a.id) : String(a))
                : [],
            estimateTime: est,
            estimate_time: est,
            point: est,
            points: est,
            week: realTask.week ?? 1
        };
    };

    const safeNotifyParent = (updatedTask) => {
        if (!onTaskUpdated) return;
        Promise.resolve().then(() => {
            onTaskUpdated(updatedTask);
        });
    };

    const loadActivities = () => {
        if (!taskId || taskId === 'null' || taskId === 'undefined') return;
        fetchTaskActivities(taskId)
            .then((data) => { setActivities(Array.isArray(data) ? data : (data?.data || [])); setActivitiesError(''); })
            .catch((err) => setActivitiesError(failureMessage({ error: err })));
    };

    const loadComments = () => {
        if (!taskId || taskId === 'null' || taskId === 'undefined') return;
        fetchTaskComments(taskId)
            .then((data) => { setComments(Array.isArray(data) ? data : (data?.data || [])); setCommentsError(''); })
            .catch((err) => setCommentsError(failureMessage({ error: err })));
    };

    useEffect(() => {
        if (!isDrawerOpen || !taskId || taskId === 'null' || taskId === 'undefined') return;
        let cancelled = false;
        setLoading(true);
        setLoadError('');
        setSaveError('');
        dirtyFieldsRef.current.clear();
        Promise.all([
            fetchTaskById(taskId),
            fetchTaskComments(taskId).then((d) => ({ ok: d }), (e) => ({ err: failureMessage({ error: e }) })),
            fetchTaskActivities(taskId).then((d) => ({ ok: d }), (e) => ({ err: failureMessage({ error: e }) }))
        ])
            .then(([taskData, c, a]) => {
                if (cancelled) return;
                setTask(normalizeTask(taskData?.data || taskData));
                setComments(c.ok ? (Array.isArray(c.ok) ? c.ok : (c.ok?.data || [])) : []);
                setCommentsError(c.err || '');
                setActivities(a.ok ? (Array.isArray(a.ok) ? a.ok : (a.ok?.data || [])) : []);
                setActivitiesError(a.err || '');
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Lỗi khi tải chi tiết task:", err);
                setTask(null);
                setLoadError(failureMessage({ error: err }));
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [taskId, isDrawerOpen, reloadKey]);

    useEffect(() => {
        if (!syncEvent || !task) return;
        if (syncEvent.type === 'task') {
            const incoming = normalizeTask(syncEvent.data);
            setTask(prev => {
                if (!prev) return prev;
                const next = { ...prev, ...incoming };
                dirtyFieldsRef.current.forEach((field) => { next[field] = prev[field]; });
                return next;
            });
        } else if (syncEvent.type === 'comment') {
            loadComments();
        }
        loadActivities();
    }, [syncEvent]);

    const handleUpdateTaskField = async (updatedFields) => {
        if (!task || isSaving) return;

        if (updatedFields.columnId) {
            updatedFields.columnId = extractColumnId(updatedFields.columnId);
        }

        if (updatedFields.estimateTime !== undefined || updatedFields.estimate_time !== undefined || updatedFields.point !== undefined || updatedFields.points !== undefined) {
            const val = extractEstimateTime(updatedFields, extractEstimateTime(task, 0));
            updatedFields.estimateTime = val;
            updatedFields.estimate_time = val;
            updatedFields.point = val;
            updatedFields.points = val;
        }

        if (updatedFields.week !== undefined) {
            updatedFields.week = Number(updatedFields.week) || 1;
        }

        const previousTask = { ...task };
        const updatedTaskLocal = { ...task, ...updatedFields };

        setTask(updatedTaskLocal);
        setSaveError('');

        try {
            setIsSaving(true);
            const updatedData = await updateTask(taskId, updatedFields);
            const returnedTask = updatedData?.data || updatedData;
            Object.keys(updatedFields).forEach((f) => dirtyFieldsRef.current.delete(f));

            const finalEst = extractEstimateTime(returnedTask, extractEstimateTime(updatedTaskLocal, 0));
            const finalTask = {
                ...updatedTaskLocal,
                ...(returnedTask ? normalizeTask(returnedTask) : {}),
                estimateTime: finalEst,
                estimate_time: finalEst,
                point: finalEst,
                points: finalEst,
                columnId: extractColumnId(returnedTask?.columnId) || updatedTaskLocal.columnId,
                week: returnedTask?.week ?? updatedTaskLocal.week
            };

            setTask(finalTask);
            safeNotifyParent(finalTask);
            loadActivities();
        } catch (error) {
            console.error("Lỗi khi cập nhật task, đang hoàn tác:", error);
            setTask(previousTask);
            setSaveError(`Couldn't save changes — ${error.message}`);
            safeNotifyParent(previousTask);
        } finally {
            setIsSaving(false);
        }
    };

    const handleColumnChange = async (destColumnId) => {
        if (!task || isSaving || !onMoveTask) return;
        const sourceColumnId = extractColumnId(task.columnId);
        if (!destColumnId || destColumnId === sourceColumnId) return;
        setSaveError('');
        setIsSaving(true);
        try {
            const moved = await onMoveTask(taskId, sourceColumnId, destColumnId);
            Promise.resolve().then(() => {
                setTask(prev => prev ? normalizeTask({ ...prev, ...moved, assignees: prev.assignees }) : prev);
            });
            loadActivities();
        } catch (error) {
            setSaveError(`Couldn't move the task — ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (field, value) => {
        const updatedFields = { [field]: value };
        if (field === 'estimateTime' || field === 'estimate_time') {
            const val = value === '' ? '' : Number(value);
            updatedFields.estimateTime = val;
            updatedFields.estimate_time = val;
            updatedFields.point = val;
            updatedFields.points = val;
        }
        Object.keys(updatedFields).forEach((f) => dirtyFieldsRef.current.add(f));
        setTask(prev => ({ ...prev, ...updatedFields }));
    };

    const handleToggleAssignee = (member) => {
        if (!canEditManagement) return;

        const targetUserId = extractUserId(member);
        if (!targetUserId) return;

        const currentAssignees = task.assignees || [];

        const exists = currentAssignees.some(a => {
            const aId = typeof a === 'object' ? (a._id || a.id) : String(a);
            return String(aId) === String(targetUserId);
        });

        let newAssignees;
        if (exists) {
            newAssignees = currentAssignees.filter(a => {
                const aId = typeof a === 'object' ? (a._id || a.id) : String(a);
                return String(aId) !== String(targetUserId);
            });
        } else {
            newAssignees = [...currentAssignees, targetUserId];
        }

        handleUpdateTaskField({ assignees: newAssignees, members: newAssignees });
    };

    const handleDeleteTask = async () => {
        if (!canDeleteTask) return;

        await confirm(deleteConfirm({
            item: "task",
            onConfirm: async () => {
                try {
                    await deleteTask(taskId);
                    if (onTaskDeleted) onTaskDeleted(taskId);
                    handleCloseDrawer();
                } catch (error) {
                    console.error("Lỗi khi xóa task:", error);
                    setSaveError(`Couldn't delete the task — ${error.message}`);
                    throw error;
                }
            },
        }));
    };

    const handleAddChecklist = async (text) => {
        if (!canAddChecklist || !text.trim()) return;
        const response = await addChecklistItem(taskId, text.trim());
        const realTask = response?.data || response;
        if (realTask && realTask.checklist) {
            const nextTask = { ...task, checklist: realTask.checklist };
            setTask(nextTask);
            safeNotifyParent(nextTask);
        }
        loadActivities();
    };

    const handleToggleChecklist = async (item) => {
        const previousChecklist = task.checklist;
        const updatedChecklist = (task.checklist || []).map(i => String(i._id) === String(item._id) ? { ...i, completed: !item.completed } : i);
        setTask(prev => ({ ...prev, checklist: updatedChecklist }));

        try {
            const response = await toggleChecklistItem(taskId, item._id, item.completed);
            const realTask = response?.data || response;
            if (realTask && realTask.checklist) {
                const nextTask = { ...task, checklist: realTask.checklist };
                setTask(nextTask);
                safeNotifyParent(nextTask);
            }
            loadActivities();
        } catch (error) {
            console.error("Lỗi khi cập nhật checklist:", error);
            setTask(prev => ({ ...prev, checklist: previousChecklist }));
            throw error;
        }
    };

    const handleDeleteChecklist = async (item) => {
        if (!canDeleteChecklist) return;

        await confirm(deleteConfirm({
            item: "checklist",
            name: item.text,
            onConfirm: async () => {
                const previousChecklist = task.checklist;
                const nextTask = { ...task, checklist: (task.checklist || []).filter(i => String(i._id) !== String(item._id)) };
                setTask(nextTask);
                safeNotifyParent(nextTask);

                try {
                    await deleteChecklist(item._id);
                } catch (error) {
                    console.error("Deleting the checklist item failed:", error);
                    setTask(prev => ({ ...prev, checklist: previousChecklist }));
                    throw error;
                }
            },
        }));
    };

    const handleAddComment = async (text) => {
        const newComment = await addComment(taskId, text);
        const created = newComment?.data || newComment;
        setComments(prev => prev.some(c => String(c._id) === String(created._id)) ? prev : [...prev, created]);
        loadActivities();
    };

    const column = columns.find(c => String(c._id) === String(task?.columnId));
    const assigneeMembers = projectMembers.filter(m => (task?.assignees || []).includes(extractUserId(m)));

    return (
        <TaskDrawerFrame
            open={isDrawerOpen}
            onClose={handleCloseDrawer}
            labelledBy="task-drawer-title"
            returnFocusSelector={taskId ? `[data-rfd-draggable-id="${taskId}"]` : undefined}
            headerContent={
                <>
                    {task && <span className={`priority-tag priority-${(task.priority || 'Medium').toLowerCase()}`}>{task.priority || 'Medium'}</span>}
                    <span className="drawer-save-state" role="status">
                        {isSaving ? (
                            <><Loader2 className="icon icon-sm animate-spin" aria-hidden="true" /> Saving…</>
                        ) : task?.updatedAt ? `Updated ${formatDateDMY(task.updatedAt)}` : ''}
                    </span>
                </>
            }
        >
            {loading ? (
                <div className="drawer-body drawer-state" role="status">
                    <Loader2 className="icon animate-spin" aria-hidden="true" />
                    <span>Loading task…</span>
                </div>
            ) : loadError || !task ? (
                <div className="drawer-body">
                    <ErrorState
                        title="Couldn't load this task"
                        message={loadError || 'The task could not be loaded.'}
                        onRetry={() => setReloadKey(k => k + 1)}
                    />
                </div>
            ) : (
                <div className="drawer-body">
                    <div className="drawer-title-block">
                        <textarea
                            id="task-drawer-title"
                            className="drawer-title-input"
                            rows="2"
                            aria-label="Task title"
                            value={task.title || ''}
                            readOnly={!canEditManagement}
                            onChange={(e) => handleInputChange('title', e.target.value)}
                            onBlur={(e) => canEditManagement && handleUpdateTaskField({ title: e.target.value })}
                            placeholder="Task title"
                        />
                        <div className="drawer-subline">
                            {column && <span className="drawer-chip">{column.title || column.name}</span>}
                            {assigneeMembers.length > 0 && (
                                <span className="avatar-group">
                                    {assigneeMembers.map(m => (
                                        <UserAvatar key={extractUserId(m)} userId={extractUserId(m)} name={getMemberDisplayName(m)} size="xs" />
                                    ))}
                                </span>
                            )}
                        </div>
                    </div>

                    {saveError && <div className="drawer-inline-error" role="alert">{saveError}</div>}

                    <DrawerSection title="Properties">
                        <div className="drawer-field-grid">
                            <label className="drawer-field">
                                <span className="drawer-field-label">Column</span>
                                <select
                                    className="select"
                                    value={extractColumnId(task.columnId)}
                                    disabled={!canEditAll || isSaving}
                                    onChange={(e) => handleColumnChange(e.target.value)}
                                >
                                    {columns.map((col) => (
                                        <option key={col._id} value={String(col._id)}>{col.name || col.title}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="drawer-field">
                                <span className="drawer-field-label">Priority</span>
                                <select
                                    className="select"
                                    value={task.priority || 'Medium'}
                                    disabled={!canEditAll}
                                    onChange={(e) => handleUpdateTaskField({ priority: e.target.value })}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">Urgent</option>
                                </select>
                            </label>
                            <label className="drawer-field">
                                <span className="drawer-field-label">Estimate Time</span>
                                <input
                                    className="input"
                                    type="number"
                                    min="0"
                                    value={task.estimateTime ?? task.estimate_time ?? ''}
                                    disabled={!canEditAll}
                                    onChange={(e) => handleInputChange('estimateTime', e.target.value)}
                                    onBlur={(e) => canEditAll && handleUpdateTaskField({ estimateTime: Number(e.target.value) || 0 })}
                                />
                            </label>
                            <label className="drawer-field">
                                <span className="drawer-field-label">Week</span>
                                <select
                                    className="select"
                                    value={task.week || 1}
                                    disabled={!canEditAll}
                                    onChange={(e) => handleUpdateTaskField({ week: Number(e.target.value) })}
                                >
                                    {Array.from({ length: maxWeeks }, (_, i) => i + 1).map(w => {
                                        const projStart = project?.startDate || project?.createdDate || project?.createdAt;
                                        const projEnd = project?.date || project?.dueDate || project?.endDate;
                                        const dateRange = getWeekDateRange(projStart, projEnd, w);
                                        return (
                                            <option key={w} value={w}>
                                                {dateRange ? `Week ${w} (${dateRange})` : `Week ${w}`}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>
                            <div className="drawer-field drawer-field--wide">
                                <span className="drawer-field-label">
                                    Assignees{task.assignees?.length > 0 ? ` · ${task.assignees.length}` : ''}
                                </span>
                                <AssigneePicker
                                    members={projectMembers}
                                    selectedIds={task.assignees || []}
                                    canEdit={canEditManagement}
                                    onToggle={handleToggleAssignee}
                                    getUserId={extractUserId}
                                    getName={getMemberDisplayName}
                                    getEmail={getMemberEmail}
                                />
                            </div>
                        </div>
                    </DrawerSection>

                    <DrawerSection title="Description">
                        <textarea
                            className="textarea"
                            rows="4"
                            aria-label="Description"
                            placeholder={canEditAll ? 'Add a more detailed description…' : 'No description.'}
                            value={task.description || ''}
                            readOnly={!canEditAll}
                            onChange={(e) => handleInputChange('description', e.target.value)}
                            onBlur={(e) => canEditAll && handleUpdateTaskField({ description: e.target.value })}
                        />
                    </DrawerSection>

                    <ChecklistSection
                        items={task.checklist || []}
                        canToggle
                        canAdd={canAddChecklist}
                        canDelete={canDeleteChecklist}
                        onToggle={handleToggleChecklist}
                        onAdd={handleAddChecklist}
                        onDelete={handleDeleteChecklist}
                    />

                    <CommentsSection
                        comments={comments}
                        loadError={commentsError}
                        onRetry={loadComments}
                        onSubmit={handleAddComment}
                    />

                    <ActivitySection activities={activities} loadError={activitiesError} onRetry={loadActivities} />

                    {isManager && deleteBlocked && (
                        <p className="drawer-empty" role="note">{deleteBlocked}</p>
                    )}
                    {canDeleteTask && (
                        <div className="drawer-danger">
                            <button type="button" className="btn btn-outline btn-sm drawer-delete-task" onClick={handleDeleteTask}>
                                Delete task
                            </button>
                        </div>
                    )}
                </div>
            )}
        </TaskDrawerFrame>
    );
}

// ==========================================
// MAIN COMPONENT: PROJECT BOARD
// ==========================================
export default function ProjectBoard({ projectId: propProjectId }) {
    const { id: urlProjectId } = useParams();
    const activeProjectId = urlProjectId || propProjectId;

    const [project, setProject] = useState(null);
    const [projectMembers, setProjectMembers] = useState([]);
    const [memberCurrentRole, setMemberRole] = useState("");
    const [columns, setColumns] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadFailures, setLoadFailures] = useState([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedWeek, setSelectedWeek] = useState('1');

    // State lọc theo Status Tag ('all', 'On Track', 'Expiring', 'Overdue')
    const [selectedStatusTag, setSelectedStatusTag] = useState('all');

    // State lọc theo Priority ('all', 'Low', 'Medium', 'High', 'Urgent')
    const [selectedPriority, setSelectedPriority] = useState('all');

    const [activeModal, setActiveModal] = useState(null);
    const [isColumnFixed, setIsColumnFixed] = useState(false);

    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [drawerSync, setDrawerSync] = useState(null);
    const selectedTaskIdRef = useRef(null);
    useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskName, setNewTaskName] = useState('');
    const [newTaskColumnId, setNewTaskColumnId] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState('Medium');
    const [newTaskEstimateTime, setNewTaskEstimateTime] = useState('');
    const [newTaskWeek, setNewTaskWeek] = useState(1);
    const [newTaskDesc, setNewTaskDesc] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [moveError, setMoveError] = useState('');

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
            console.error("Không thể lấy thông tin role hiện tại:", err);
        }
    };

    useEffect(() => {
        fetchCurrentMemberRole();
    }, []);

    const currentProjectMember = useMemo(() => {
        if (!currentUserId || !projectMembers.length) return null;

        return projectMembers.find(m => {
            const uId = extractUserId(m);
            return uId === String(currentUserId);
        }) || null;
    }, [currentUserId, projectMembers]);

    const currentUserRole = currentProjectMember?.role || currentUser?.role || memberCurrentRole;

    const isAdmin = String(currentUser?.role).toLowerCase() === 'admin';
    const isLeader = currentUserRole === 'Leader';
    const isManager = currentUserRole === 'Manager' || isAdmin;

    const canCreateTask = isManager || isLeader;

    const moveLocked = isMoveLockedForRole({ isManager, isLeader }, project);
    const projectStartLabel = formatDayDMY(getProjectStart(project));

    const fetchBoardData = async (quiet = false) => {
        if (!activeProjectId) return;
        const failures = [];

        try {
            if (!quiet) setLoading(true);

            const [projectData, columnsData, tasksData, membersData] = await Promise.all([
                withFallback(fetchProjectById(activeProjectId), null, failures, 'project'),
                withFallback(fetchColumnsByProject(activeProjectId), [], failures, 'columns'),
                withFallback(fetchTasksByProject(activeProjectId), [], failures, 'tasks'),
                withFallback(fetchMembersByProject(activeProjectId), [], failures, 'members')
            ]);

            const realProject = projectData?.data || projectData || {};
            const realColumns = Array.isArray(columnsData) ? columnsData : (columnsData?.data || []);
            const rawTasks = Array.isArray(tasksData) ? tasksData : (tasksData?.data || []);
            const realMembers = Array.isArray(membersData)
                ? membersData
                : (membersData?.data || membersData?.members || []);

            realColumns.sort((a, b) => (a.position || 0) - (b.position || 0));

            const realTasks = rawTasks.map(t => {
                const est = extractEstimateTime(t, 0);
                return {
                    ...t,
                    estimateTime: est,
                    estimate_time: est,
                    point: est,
                    points: est
                };
            });

            setProject(realProject);
            setColumns(realColumns);
            setTasks(realTasks);
            setProjectMembers(realMembers);
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu từ API:", error);
            failures.push({ label: 'board', error });
        } finally {
            setLoadFailures(failures);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBoardData();
    }, [activeProjectId]);

    useRealtimeRefetch(() => fetchBoardData(true), ['projects', 'members', 'columns', 'users'], activeProjectId);

    useEffect(() => {
        if (!activeProjectId) return;

        const handleTaskCreated = (newTask) => {
            if (!newTask || !isForProject(newTask, activeProjectId)) return;
            const taskData = newTask.data || newTask;
            const taskId = String(taskData._id || taskData.id);

            setTasks(prevTasks => {
                const exists = prevTasks.some(t => String(t._id || t.id) === taskId);
                if (exists) return prevTasks;

                const est = extractEstimateTime(taskData, 0);

                const formattedTask = {
                    ...taskData,
                    _id: taskId,
                    columnId: extractColumnId(taskData.columnId),
                    estimateTime: est,
                    estimate_time: est,
                    point: est,
                    points: est,
                    week: taskData.week ?? 1
                };
                return [...prevTasks, formattedTask];
            });
            if (taskData.columnId) {
                setColumns(prev => applyMoveToColumns(prev, taskId, null, taskData.columnId, Number.MAX_SAFE_INTEGER, true));
            }
        };

        const handleTaskUpdated = (updatedTask) => {
            if (!updatedTask || !isForProject(updatedTask, activeProjectId)) return;
            const taskData = updatedTask.data || updatedTask;
            const taskId = String(taskData._id || taskData.id);

            setTasks(prevTasks =>
                prevTasks.map(t => {
                    if (String(t._id || t.id) === taskId) {
                        const est = extractEstimateTime(taskData, extractEstimateTime(t, 0));
                        return {
                            ...t,
                            ...taskData,
                            _id: taskId,
                            columnId: extractColumnId(taskData.columnId || t.columnId),
                            estimateTime: est,
                            estimate_time: est,
                            point: est,
                            points: est,
                            week: taskData.week ?? t.week
                        };
                    }
                    return t;
                })
            );
            if (String(selectedTaskIdRef.current) === taskId) setDrawerSync({ type: 'task', data: taskData, at: Date.now() });
        };

        const handleTaskMoved = (data) => {
            if (!data || !isForProject(data, activeProjectId)) return;
            const taskId = String(data.taskId || data._id || data.id);
            const targetColumnId = extractColumnId(data.destColumnId || data.columnId);

            if (!taskId || !targetColumnId) return;

            setTasks(prevTasks =>
                prevTasks.map(t => String(t._id || t.id) === taskId ? mergeMovedTask(t, data.task, targetColumnId) : t)
            );
            setColumns(prev => applyMoveToColumns(prev, taskId, data.sourceColumnId, targetColumnId, data.destinationIndex));
            if (String(selectedTaskIdRef.current) === taskId) {
                setDrawerSync({ type: 'task', data: mergeMovedTask({ _id: taskId }, data.task, targetColumnId), at: Date.now() });
            }
        };

        const handleCommentAdded = (comment) => {
            if (!comment || String(comment.taskId) !== String(selectedTaskIdRef.current)) return;
            setDrawerSync({ type: 'comment', data: comment, at: Date.now() });
        };

        const handleTaskDeleted = (deletedData) => {
            if (!deletedData || !isForProject(deletedData, activeProjectId)) return;
            const deletedId = String(deletedData.taskId || deletedData._id || deletedData.id || deletedData);

            setTasks(prevTasks => prevTasks.filter(t => String(t._id || t.id) !== deletedId));
        };

        socket.on('task_created', handleTaskCreated);
        socket.on('task_updated', handleTaskUpdated);
        socket.on('task_moved', handleTaskMoved);
        socket.on('task_deleted', handleTaskDeleted);
        socket.on('comment_added', handleCommentAdded);

        return () => {
            socket.off('task_created', handleTaskCreated);
            socket.off('task_updated', handleTaskUpdated);
            socket.off('task_moved', handleTaskMoved);
            socket.off('task_deleted', handleTaskDeleted);
            socket.off('comment_added', handleCommentAdded);
        };
    }, [activeProjectId]);

    const totalProjectWeeks = useMemo(() => {
        if (!project) return 1;

        const start = project.startDate || project.createdDate || project.createdAt;
        const end = project.date || project.dueDate || project.endDate;

        if (!start || !end) return 1;

        const startDateObj = new Date(start);
        const endDateObj = new Date(end);

        const diffTime = endDateObj.getTime() - startDateObj.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24)) + 1;

        if (diffDays <= 0) return 1;

        return Math.ceil(diffDays / 7);
    }, [project]);

    useEffect(() => {
        if (project) {
            const currentWeek = calculateCurrentProjectWeek(project, totalProjectWeeks);
            setSelectedWeek(String(currentWeek));
        }
    }, [project, totalProjectWeeks]);

    // Hàm lọc Task đa điều kiện (Search + Week + Status + Priority)
    const filteredTasks = useMemo(() => {
        return tasks.filter((task) => {
            // 1. Search Query
            const query = searchQuery.toLowerCase().trim();
            const title = (task.title || task.name || '').toLowerCase();
            const matchesQuery = !query || title.includes(query);

            // 2. Week Filter
            const taskWeek = Number(task.week) || 1;
            const matchesWeek = selectedWeek === 'all' || taskWeek === Number(selectedWeek);

            // 3. Status Tag Filter
            let matchesStatus = true;
            if (selectedStatusTag !== 'all') {
                const isDoneColumn = columns.some(c =>
                    String(c._id) === extractColumnId(task.columnId) &&
                    (c.name || c.title || '').toLowerCase().includes('done')
                );
                const { status: taskStatus } = calculateTaskWeekAndStatus(task, project, isDoneColumn);
                matchesStatus = taskStatus === selectedStatusTag;
            }

            // 4. Priority Filter
            const taskPriority = task.priority || 'Medium';
            const matchesPriority = selectedPriority === 'all' || taskPriority.toLowerCase() === selectedPriority.toLowerCase();

            return matchesQuery && matchesWeek && matchesStatus && matchesPriority;
        });
    }, [tasks, searchQuery, selectedWeek, selectedStatusTag, selectedPriority, columns, project]);

    const getSortedTasksForColumn = (column) => {
        const columnTaskMap = new Map();

        filteredTasks.forEach(task => {
            if (!task || !task.columnId) return;
            const taskColId = extractColumnId(task.columnId);
            if (String(taskColId) === String(column._id)) {
                columnTaskMap.set(String(task._id || task.id), task);
            }
        });

        if (Array.isArray(column.taskOrderIds) && column.taskOrderIds.length > 0) {
            const sorted = [];
            column.taskOrderIds.forEach(id => {
                const idStr = typeof id === 'object' ? id._id || id.toString() : String(id);
                if (columnTaskMap.has(idStr)) {
                    sorted.push(columnTaskMap.get(idStr));
                    columnTaskMap.delete(idStr);
                }
            });
            return [...sorted, ...Array.from(columnTaskMap.values())];
        }

        return Array.from(columnTaskMap.values());
    };

    const resetTaskForm = () => {
        setNewTaskTitle('');
        setNewTaskName('');
        setNewTaskDesc('');
        setNewTaskPriority('Medium');
        setNewTaskEstimateTime('');
        setNewTaskWeek(1);
    };

    const closeModal = () => {
        setActiveModal(null);
        resetTaskForm();
    };

    const handleOpenTaskDrawer = (taskId) => {
        setSelectedTaskId(taskId);
        setIsDrawerOpen(true);
    };

    const handleCloseTaskDrawer = () => {
        setIsDrawerOpen(false);
        setSelectedTaskId(null);
    };

    const handleTaskUpdatedFromDrawer = (updatedTask) => {
        setTasks(prevTasks =>
            prevTasks.map(t => {
                if (String(t._id || t.id) === String(updatedTask._id || updatedTask.id)) {
                    const est = extractEstimateTime(updatedTask, extractEstimateTime(t, 0));
                    return {
                        ...t,
                        ...updatedTask,
                        columnId: extractColumnId(updatedTask.columnId),
                        estimateTime: est,
                        estimate_time: est,
                        point: est,
                        points: est
                    };
                }
                return t;
            })
        );
    };

    const handleTaskDeletedFromDrawer = (deletedTaskId) => {
        setTasks(prevTasks => prevTasks.filter(t => String(t._id || t.id) !== String(deletedTaskId)));
    };

    const performMove = async (taskId, sourceColumnId, destColumnId, destinationIndex) => {
        if (moveLocked) {
            throw new Error(`members can move tasks once the project starts on ${projectStartLabel}`);
        }
        const id = String(taskId);
        const payload = buildMovePayload(sourceColumnId, destColumnId, destinationIndex);
        const previousTasks = tasks;
        const previousColumns = columns;

        setTasks(prev => prev.map(t => String(t._id || t.id) === id ? { ...t, columnId: payload.destColumnId } : t));
        setColumns(prev => applyMoveToColumns(prev, id, payload.sourceColumnId, payload.destColumnId, payload.destinationIndex));

        try {
            const response = await moveTask(id, payload);
            const current = previousTasks.find(t => String(t._id || t.id) === id) || { _id: id };
            setTasks(prev => prev.map(t => String(t._id || t.id) === id ? mergeMovedTask(t, response?.task, payload.destColumnId) : t));
            return mergeMovedTask(current, response?.task, payload.destColumnId);
        } catch (error) {
            console.error("Moving the task failed, reverting:", error);
            setTasks(previousTasks);
            setColumns(previousColumns);
            throw error;
        }
    };

    const handleOnDragEnd = async (result) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        const destColumn = columns.find(c => String(c._id) === String(destination.droppableId));
        const shown = getSortedTasksForColumn(destColumn || {}).filter(t => String(t._id || t.id) !== String(draggableId));
        const before = shown[destination.index];
        let destinationIndex = getDestinationIndex(destColumn, draggableId, before ? (before._id || before.id) : undefined);
        if (!before && shown.length > 0) {
            const order = (destColumn?.taskOrderIds || []).map(idOf).filter(x => x !== String(draggableId));
            const lastShown = order.indexOf(String(shown[shown.length - 1]._id || shown[shown.length - 1].id));
            if (lastShown !== -1) destinationIndex = lastShown + 1;
        }

        setMoveError('');
        try {
            await performMove(draggableId, source.droppableId === 'backlog' ? null : source.droppableId, destination.droppableId, destinationIndex);
        } catch (error) {
            setMoveError(`Couldn't move the task — ${error.message}`);
        }
    };

    const handleMoveFromDrawer = (taskId, sourceColumnId, destColumnId) => {
        const destColumn = columns.find(c => String(c._id) === String(destColumnId));
        return performMove(taskId, sourceColumnId, destColumnId, getDestinationIndex(destColumn, taskId));
    };

    const handleLeaderDecisionOnTask = async (e, task, currentColumnId) => {
        e.stopPropagation();

        const targetColumn = columns.find(c => {
            const name = (c.name || c.title || '').toLowerCase();
            return name.includes('review') || name.includes('in review');
        }) || columns[0];
        if (!targetColumn || String(targetColumn._id) === String(currentColumnId)) return;

        setMoveError('');
        try {
            await performMove(task._id || task.id, currentColumnId, targetColumn._id, 0);
        } catch (error) {
            setMoveError(`Couldn't move the task — ${error.message}`);
        }
    };

    const handleOpenCreateModal = (columnId = '', isFixed = false) => {
        if (!canCreateTask) return;
        setNewTaskColumnId(columnId || (columns[0]?._id || ''));
        setIsColumnFixed(isFixed);
        resetTaskForm();
        setActiveModal('quickCreateTaskModal');
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!canCreateTask || !newTaskTitle.trim() || !newTaskColumnId) {
            return;
        }

        try {
            setIsSubmitting(true);
            const estimateTimeValue = newTaskEstimateTime === '' ? 0 : Number(newTaskEstimateTime) || 0;
            const weekValue = Number(newTaskWeek) || 1;

            const payload = {
                title: newTaskTitle,
                name: newTaskName || newTaskTitle,
                description: newTaskDesc,
                columnId: newTaskColumnId,
                projectId: activeProjectId,
                priority: newTaskPriority,
                estimateTime: estimateTimeValue,
                estimate_time: estimateTimeValue,
                point: estimateTimeValue,
                points: estimateTimeValue,
                week: weekValue,
                assignees: [],
                members: []
            };

            const response = await createTask(payload);
            const createdTask = response?.data || response;

            const finalEst = extractEstimateTime(createdTask, estimateTimeValue);

            const formattedNewTask = {
                ...createdTask,
                _id: String(createdTask._id || createdTask.id),
                title: createdTask.title || newTaskTitle,
                columnId: extractColumnId(createdTask.columnId || newTaskColumnId),
                priority: createdTask.priority || newTaskPriority,
                estimateTime: finalEst,
                estimate_time: finalEst,
                point: finalEst,
                points: finalEst,
                week: createdTask.week ?? weekValue,
                assignees: createdTask.assignees || [],
                startDate: createdTask.startDate || new Date().toISOString()
            };

            setTasks(prevTasks => {
                const exists = prevTasks.some(t => String(t._id || t.id) === String(formattedNewTask._id));
                if (exists) return prevTasks;
                return [...prevTasks, formattedNewTask];
            });
            setColumns(prev => applyMoveToColumns(prev, formattedNewTask._id, null, formattedNewTask.columnId, Number.MAX_SAFE_INTEGER, true));

            closeModal();
        } catch (error) {
            console.error("Lỗi khi tạo task mới:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="page-loading" role="status">
                <Loader2 className="icon animate-spin" aria-hidden="true" />
                <span>Loading...</span>
            </div>
        );
    }

    const coreFailure = loadFailures.find((f) => f.label !== 'members');
    const membersFailed = loadFailures.some((f) => f.label === 'members');
    if (coreFailure) {
        return (
            <main className="page-content">
                <ErrorState
                    title="Couldn't load this project board"
                    message={failureMessage(coreFailure)}
                    onRetry={fetchBoardData}
                />
            </main>
        );
    }

    const boardSummary = {
        tasks: tasks.length,
        points: tasks.reduce((sum, t) => sum + extractEstimateTime(t, 0), 0),
        completed: tasks.filter(t => t.status === 'completed').length,
    };

    const formattedStartDate = formatDateDMY(project?.startDate || project?.createdDate || project?.createdAt);
    const formattedDueDate = formatDateDMY(project?.date || project?.dueDate || project?.endDate);

    const projStart = project?.startDate || project?.createdDate || project?.createdAt;
    const projEnd = project?.date || project?.dueDate || project?.endDate;

    return (
        <>
            <ProjectHeader
                projectId={activeProjectId}
                project={project}
                memberCount={projectMembers.length}
                taskCount={tasks.length}
                startDate={formattedStartDate}
                endDate={formattedDueDate}
            />

            <main className="page-content page-content--board">
                {membersFailed && (
                    <ErrorState
                        variant="inline"
                        title="Project members could not be loaded."
                        message="Assignee names may be missing."
                        onRetry={fetchBoardData}
                    />
                )}
                {moveError && (
                    <ErrorState
                        variant="inline"
                        title={moveError}
                        message="The board was restored to its previous state."
                        onRetry={fetchBoardData}
                    />
                )}

                {/* Toolbar hiển thị bộ lọc đồng bộ: Search, Week, Status Tag, và Priority */}
                <BoardToolbar
                    summary={boardSummary}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    selectedWeek={selectedWeek}
                    onWeekChange={setSelectedWeek}
                    selectedStatusTag={selectedStatusTag}
                    onStatusTagChange={setSelectedStatusTag}
                    selectedPriority={selectedPriority}
                    onPriorityChange={setSelectedPriority}
                    totalWeeks={totalProjectWeeks}
                    projectStartDate={projStart}
                    projectEndDate={projEnd}
                    canCreateTask={canCreateTask}
                    onCreateTask={() => handleOpenCreateModal('', false)}
                />

                {moveLocked && (
                    <p className="board-notice" role="status">
                        <CalendarClock className="icon icon-sm" aria-hidden="true" />
                        This project starts on {projectStartLabel}. Members can move their tasks from that day.
                    </p>
                )}

                <DragDropContext onDragEnd={handleOnDragEnd}>
                    <div className="board scroll-x" id="kanbanBoard">
                        {columns.map((column) => {
                            const columnTasks = getSortedTasksForColumn(column);
                            const isDoneColumn = (column.name || column.title || '').toLowerCase().includes('done');
                            const columnPoints = columnTasks.reduce((sum, t) => sum + extractEstimateTime(t, 0), 0);

                            return (
                                <div className={`board-column kind-${getColumnStatus(column.name || column.title).kind}`} key={column._id}>
                                    <BoardColumnHeader
                                        title={column.name || column.title}
                                        count={columnTasks.length}
                                        points={columnPoints}
                                        canCreateTask={canCreateTask}
                                        onAddTask={() => handleOpenCreateModal(column._id, true)}
                                    />

                                    <Droppable droppableId={String(column._id)}>
                                        {(provided, snapshot) => (
                                            <div
                                                className={`board-column-body${snapshot.isDraggingOver ? ' is-drop-target' : ''}`}
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                            >
                                                {columnTasks.length === 0 ? (
                                                    !snapshot.isDraggingOver && (
                                                        <p className="board-column-empty">
                                                            {searchQuery.trim() || selectedWeek !== 'all' || selectedStatusTag !== 'all' || selectedPriority !== 'all' ? 'No tasks match the filters' : 'No tasks yet'}
                                                        </p>
                                                    )
                                                ) : (
                                                    columnTasks.map((task, index) => {
                                                        const assignees = Array.isArray(task.assignees) ? task.assignees : [];
                                                        const taskPoints = extractEstimateTime(task, 0);
                                                        const showNotAcceptBtn = (isDoneColumn && isLeader) || (isDoneColumn && isManager);

                                                        const isTaskAssignee = assignees.some(a => {
                                                            const assigneeId = typeof a === 'object' ? String(a._id || a.id) : String(a);
                                                            return currentUserId && assigneeId === String(currentUserId);
                                                        });
                                                        const canDragThisTask = isManager || isLeader || (isTaskAssignee && !moveLocked);

                                                        const { displayWeek, status } = calculateTaskWeekAndStatus(task, project, isDoneColumn);
                                                        const assigneeList = assignees.map((assignee, aIdx) => {
                                                            const name = getMemberDisplayName(getUserInfo(assignee, projectMembers));
                                                            const id = typeof assignee === 'object' ? (assignee._id || assignee.id || aIdx) : assignee;
                                                            return { id: String(id), name, initials: getInitials(name) };
                                                        });

                                                        return (
                                                            <Draggable
                                                                key={String(task._id || task.id)}
                                                                draggableId={String(task._id || task.id)}
                                                                index={index}
                                                                isDragDisabled={!canDragThisTask}
                                                            >
                                                                {(provided, snapshot) => (
                                                                    <TaskCard
                                                                        task={task}
                                                                        dragRef={provided.innerRef}
                                                                        draggableProps={provided.draggableProps}
                                                                        dragHandleProps={provided.dragHandleProps}
                                                                        isDragging={snapshot.isDragging}
                                                                        canDrag={canDragThisTask}
                                                                        week={displayWeek}
                                                                        points={taskPoints}
                                                                        deadlineStatus={status}
                                                                        assignees={assigneeList}
                                                                        onOpen={() => handleOpenTaskDrawer(task._id || task.id)}
                                                                        onNotAccept={showNotAcceptBtn ? (e) => handleLeaderDecisionOnTask(e, task, column._id) : undefined}
                                                                    />
                                                                )}
                                                            </Draggable>
                                                        );
                                                    })
                                                )}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>

                                    {canCreateTask && (
                                        <button
                                            type="button"
                                            className="add-task-btn"
                                            onClick={() => handleOpenCreateModal(column._id, true)}
                                        >
                                            <Plus className="icon icon-sm" aria-hidden="true" />
                                            Add task
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </DragDropContext>
            </main>

            <TaskDrawer
                taskId={selectedTaskId}
                isDrawerOpen={isDrawerOpen}
                handleCloseDrawer={handleCloseTaskDrawer}
                columns={columns}
                projectMembers={projectMembers}
                maxWeeks={totalProjectWeeks}
                project={project}
                onTaskUpdated={handleTaskUpdatedFromDrawer}
                onTaskDeleted={handleTaskDeletedFromDrawer}
                onMoveTask={handleMoveFromDrawer}
                isManager={isManager}
                isLeader={isLeader}
                syncEvent={drawerSync}
            />

            {canCreateTask && activeModal === 'quickCreateTaskModal' && (
                <Modal title="Add Task" onClose={closeModal}>
                    <form className="modal-form" onSubmit={handleCreateTask}>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label" htmlFor="board-task-title">Title *</label>
                                <input id="board-task-title"
                                       className="input"
                                       placeholder="e.g: My task title"
                                       value={newTaskTitle}
                                       onChange={(e) => setNewTaskTitle(e.target.value)}
                                       required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label" htmlFor="board-task-column">Column *</label>
                                <select id="board-task-column"
                                        className="select"
                                        value={newTaskColumnId}
                                        onChange={(e) => setNewTaskColumnId(e.target.value)}
                                        disabled={isColumnFixed}
                                        required
                                >
                                    {columns.map((col) => (
                                        <option key={col._id} value={col._id}>{col.name || col.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="board-task-estimate-time">Estimate Time</label>
                                <input id="board-task-estimate-time"
                                       type="number"
                                       min="0"
                                       className="input"
                                       placeholder="0"
                                       value={newTaskEstimateTime}
                                       onChange={(e) => setNewTaskEstimateTime(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label" htmlFor="board-task-week">Week</label>
                                <select id="board-task-week"
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
                                <label className="form-label" htmlFor="board-task-priority">Priority</label>
                                <select id="board-task-priority"
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
                                <label className="form-label" htmlFor="board-task-description">Description</label>
                                <textarea id="board-task-description"
                                          className="textarea"
                                          value={newTaskDesc}
                                          onChange={(e) => setNewTaskDesc(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                                        <span>Adding...</span>
                                    </>
                                ) : (
                                    'Add'
                                )}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </>
    );
}