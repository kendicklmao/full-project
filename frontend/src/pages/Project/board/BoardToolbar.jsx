import React from "react";
import { CircleCheck, ChevronDown, Gauge, ListTodo, Plus, Search, X } from "lucide-react";

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

function BoardToolbar({
                          summary,
                          searchQuery = "",
                          onSearchChange,
                          selectedWeek = "all",
                          onWeekChange,
                          selectedStatusTag = "all",
                          onStatusTagChange,
                          selectedPriority = "all",
                          onPriorityChange,
                          totalWeeks = 1,
                          projectStartDate,
                          projectEndDate,
                          canCreateTask,
                          onCreateTask,
                      }) {
    const trimmedQuery = (searchQuery || "").trim();
    const weekActive = selectedWeek !== "all";
    const statusActive = selectedStatusTag && selectedStatusTag !== "all";
    const priorityActive = selectedPriority && selectedPriority !== "all";
    const hasFilters = Boolean(trimmedQuery) || weekActive || statusActive || priorityActive;

    const activeWeekRange = weekActive ? getWeekDateRange(projectStartDate, projectEndDate, selectedWeek) : '';

    return (
        <div className="board-toolbar">
            <div className="board-toolbar-row">
                <div className="board-toolbar-filters">
                    {/* 1. Search Input */}
                    <div className="input-icon-wrap board-search" role="search">
                        <Search className="icon icon-sm" aria-hidden="true" />
                        <input
                            className="input"
                            type="search"
                            placeholder="Search tasks…"
                            aria-label="Search tasks by name"
                            value={searchQuery || ""}
                            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
                        />
                    </div>

                    {/* 2. Filter Week Dropdown */}
                    <div className="select-wrap board-week">
                        <select
                            className={`select${weekActive ? " is-active" : ""}`}
                            aria-label="Filter by week"
                            value={selectedWeek}
                            onChange={(e) => onWeekChange && onWeekChange(e.target.value)}
                        >
                            <option value="all">All weeks</option>
                            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => {
                                const dateRange = getWeekDateRange(projectStartDate, projectEndDate, w);
                                return (
                                    <option key={w} value={w}>
                                        {dateRange ? `Week ${w} (${dateRange})` : `Week ${w}`}
                                    </option>
                                );
                            })}
                        </select>
                        <ChevronDown className="icon icon-sm" aria-hidden="true" />
                    </div>

                    {/* 3. Filter Status Tag Dropdown */}
                    <div className="select-wrap board-status">
                        <select
                            className={`select${statusActive ? " is-active" : ""}`}
                            aria-label="Filter by status tag"
                            value={selectedStatusTag}
                            onChange={(e) => onStatusTagChange && onStatusTagChange(e.target.value)}
                        >
                            <option value="all">All statuses</option>
                            <option value="On Track">On Track</option>
                            <option value="Expiring">Expiring</option>
                            <option value="Overdue">Overdue</option>
                        </select>
                        <ChevronDown className="icon icon-sm" aria-hidden="true" />
                    </div>

                    {/* 4. Filter Priority Dropdown (ĐỒNG BỘ NẰM BÊN CẠNH) */}
                    <div className="select-wrap board-priority">
                        <select
                            className={`select${priorityActive ? " is-active" : ""}`}
                            aria-label="Filter by priority"
                            value={selectedPriority}
                            onChange={(e) => onPriorityChange && onPriorityChange(e.target.value)}
                        >
                            <option value="all">All priorities</option>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                        </select>
                        <ChevronDown className="icon icon-sm" aria-hidden="true" />
                    </div>
                </div>

                {summary && (
                    <ul className="board-summary" aria-label="Board summary">
                        <li title="Tasks on the board"><ListTodo className="icon icon-xs" aria-hidden="true" />{summary.tasks} {summary.tasks === 1 ? "task" : "tasks"}</li>
                        <li title="Estimate time on the board"><Gauge className="icon icon-xs" aria-hidden="true" />{summary.points} est</li>
                        <li title="Completed tasks"><CircleCheck className="icon icon-xs" aria-hidden="true" />{summary.completed} completed</li>
                    </ul>
                )}

                {canCreateTask && (
                    <button type="button" className="btn btn-primary board-add-btn" onClick={onCreateTask}>
                        <Plus className="icon icon-sm" aria-hidden="true" />
                        Add task
                    </button>
                )}
            </div>

            {hasFilters && (
                <div className="filter-chips" aria-label="Active filters">
                    {trimmedQuery && (
                        <span className="filter-chip">
                            <span className="filter-chip-label">Search: “{trimmedQuery}”</span>
                            <button type="button" onClick={() => onSearchChange && onSearchChange("")} aria-label="Clear search filter">
                                <X className="icon icon-xs" aria-hidden="true" />
                            </button>
                        </span>
                    )}
                    {weekActive && (
                        <span className="filter-chip">
                            <span className="filter-chip-label">
                                Week {selectedWeek} {activeWeekRange ? `(${activeWeekRange})` : ''}
                            </span>
                            <button type="button" onClick={() => onWeekChange && onWeekChange("all")} aria-label="Clear week filter">
                                <X className="icon icon-xs" aria-hidden="true" />
                            </button>
                        </span>
                    )}
                    {statusActive && (
                        <span className="filter-chip">
                            <span className="filter-chip-label">
                                Status: {selectedStatusTag}
                            </span>
                            <button type="button" onClick={() => onStatusTagChange && onStatusTagChange("all")} aria-label="Clear status filter">
                                <X className="icon icon-xs" aria-hidden="true" />
                            </button>
                        </span>
                    )}
                    {priorityActive && (
                        <span className="filter-chip">
                            <span className="filter-chip-label">
                                Priority: {selectedPriority}
                            </span>
                            <button type="button" onClick={() => onPriorityChange && onPriorityChange("all")} aria-label="Clear priority filter">
                                <X className="icon icon-xs" aria-hidden="true" />
                            </button>
                        </span>
                    )}
                    {(trimmedQuery || weekActive || statusActive || priorityActive) && (
                        <button
                            type="button"
                            className="filter-clear-link"
                            onClick={() => {
                                if (onSearchChange) onSearchChange("");
                                if (onWeekChange) onWeekChange("all");
                                if (onStatusTagChange) onStatusTagChange("all");
                                if (onPriorityChange) onPriorityChange("all");
                            }}
                        >
                            Clear all
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default BoardToolbar;