import { useEffect, useRef, useState } from "react";
import { CalendarDays, CircleAlert, CircleCheck, Clock, Gauge, ListChecks, X } from "lucide-react";
import { avatarToneClass } from "../../../utils/avatar.js";
import { checklistProgress } from "../../../utils/checklist.js";

const MAX_AVATARS = 3;

// Đã bổ sung "On Track" vào DEADLINE_SIGNAL
const DEADLINE_SIGNAL = {
    Overdue: { className: "is-overdue", Icon: CircleAlert, tooltip: "The project due date has passed" },
    Expiring: { className: "is-expiring", Icon: Clock, tooltip: "This week ends soon" },
    "On Track": { className: "is-ontrack", Icon: CircleCheck, tooltip: "Task is on schedule" },
};

function TaskCard({ task, dragRef, draggableProps, dragHandleProps, isDragging, canDrag, week, points, deadlineStatus, assignees, onOpen, onNotAccept }) {
    const title = task.title || task.name;
    const priority = task.priority || "Medium";
    const description = (task.description || "").trim();
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    const checklistDone = checklist.filter((item) => item.completed).length;
    const progress = checklistProgress(checklist);
    const completed = task.status === "completed";
    const signal = completed ? undefined : DEADLINE_SIGNAL[deadlineStatus];
    const shownAssignees = assignees.slice(0, MAX_AVATARS);
    const hiddenAssignees = assignees.length - shownAssignees.length;

    const descRef = useRef(null);
    const [descOpen, setDescOpen] = useState(false);
    const [descOverflow, setDescOverflow] = useState(false);

    useEffect(() => {
        const el = descRef.current;
        if (!el || descOpen) return;
        const check = () => setDescOverflow(el.scrollWidth > el.clientWidth + 1);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [description, descOpen]);

    const handleKeyDown = (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || (!canDrag && e.key === " ")) {
            e.preventDefault();
            onOpen();
        }
    };

    const accessibleName = [
        title,
        completed && "Completed",
        `Priority ${priority}`,
        `Week ${week}`,
        `${points} estimate time`,
        checklist.length > 0 && `Checklist ${checklistDone} of ${checklist.length}`,
        signal && deadlineStatus,
    ].filter(Boolean).join(". ");

    const classes = ["task-card", canDrag ? "is-draggable" : "is-locked"];
    if (isDragging) classes.push("is-dragging");
    if (completed) classes.push("is-completed");

    return (
        <div
            className={classes.join(" ")}
            ref={dragRef}
            {...draggableProps}
            {...dragHandleProps}
            role={dragHandleProps ? dragHandleProps.role : "button"}
            tabIndex={dragHandleProps ? dragHandleProps.tabIndex : 0}
            aria-label={accessibleName}
            onClick={onOpen}
            onKeyDown={handleKeyDown}
            style={draggableProps.style}
        >
            <div className="task-card-head">
                <span className={`priority-tag priority-${priority.toLowerCase()}`}>{priority}</span>
                {completed && (
                    <span className="task-card-done" title="Completed">
                        <CircleCheck className="icon icon-xs" aria-hidden="true" />
                        Completed
                    </span>
                )}
            </div>

            <h3 className="task-card-title">{title}</h3>

            {description && (
                <div className="task-card-desc-block">
                    <span className="task-card-desc-label">
                        <span className="task-card-desc-dot" aria-hidden="true" />
                        Description
                    </span>
                    <div className={`task-card-desc-row${descOpen ? " is-open" : ""}`}>
                        <p
                            ref={descRef}
                            className={`task-card-desc${descOpen ? " is-open" : ""}`}
                        >
                            {description}
                        </p>
                        {(descOverflow || descOpen) && (
                            <button
                                type="button"
                                className="task-card-desc-toggle"
                                aria-expanded={descOpen}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDescOpen((v) => !v);
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                            >
                                {descOpen ? "Show less" : "Read more"}
                            </button>
                        )}
                    </div>
                </div>
            )}

            <ul className="task-card-meta" aria-hidden="true">
                <li title="Week">
                    <CalendarDays className="icon icon-xs" />W{week}
                </li>
                <li title="Estimate time">
                    <Gauge className="icon icon-xs" />{points} est
                </li>
                {checklist.length > 0 && (
                    <li
                        title="Checklist"
                        className={checklistDone === checklist.length ? "is-complete" : undefined}
                    >
                        <ListChecks className="icon icon-xs" />{checklistDone}/{checklist.length}
                    </li>
                )}
            </ul>

            {progress && (
                <div className="task-card-checklist">
                    <span
                        className="progress-bar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress.percent}
                        aria-label={`Checklist progress: ${progress.done} of ${progress.total} items`}
                    >
                        <span className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
                    </span>
                    <span className="task-card-checklist-value">{progress.done}/{progress.total} · {progress.percent}%</span>
                </div>
            )}

            {(signal || assignees.length > 0 || onNotAccept) && (
                <div className="task-card-footer">
                    {signal ? (
                        <span className={`task-card-signal ${signal.className}`} title={signal.tooltip} aria-hidden="true">
                            <signal.Icon className="icon icon-xs" />
                            {deadlineStatus}
                        </span>
                    ) : (
                        <span />
                    )}

                    <div className="task-card-end">
                        {assignees.length > 0 && (
                            <div className="avatar-group" aria-label={`Assignees: ${assignees.map((a) => a.name).join(", ")}`}>
                                {shownAssignees.map((a) => (
                                    <span
                                        key={a.id}
                                        className={`avatar avatar-xs ${avatarToneClass(a.id)}`}
                                        title={a.name}
                                    >
                                        {a.initials}
                                    </span>
                                ))}
                                {hiddenAssignees > 0 && (
                                    <span
                                        className="avatar-overflow avatar-xs"
                                        title={assignees.slice(MAX_AVATARS).map((a) => a.name).join(", ")}
                                    >
                                        +{hiddenAssignees}
                                    </span>
                                )}
                            </div>
                        )}

                        {onNotAccept && (
                            <button
                                type="button"
                                className="icon-btn icon-btn-sm task-card-reject"
                                onClick={onNotAccept}
                                aria-label={`Not accept task: ${title}`}
                                data-tooltip="Not accept"
                            >
                                <X className="icon icon-sm" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default TaskCard;