import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NOTIFY_EVENT, takeQueuedNotice } from "../../utils/notify.js";

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const DURATION_MS = { success: 4000, info: 5000, error: 7000 };

let nextId = 1;

function Notifier() {
    const [items, setItems] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        const timers = [];
        const dismiss = (id) => setItems((prev) => prev.filter((t) => t.id !== id));

        const push = (notice) => {
            if (!notice?.title) return;
            const type = ICONS[notice.type] ? notice.type : "info";
            const id = nextId++;

            // DEBUG: log ra console để kiểm tra payload thực tế gửi tới Notifier
            console.log("--> Notifier nhận payload:", notice);

            // Bóc tách ID linh hoạt từ mọi khả năng payload
            const extractedTaskId =
                notice.taskId ||
                notice.id ||
                notice._id ||
                notice.data?.taskId ||
                notice.data?._id ||
                notice.task?._id ||
                notice.task?.id ||
                null;

            setItems((prev) => [
                ...prev.slice(-3),
                {
                    id,
                    type,
                    title: notice.title,
                    message: notice.message || "",
                    taskId: extractedTaskId ? String(extractedTaskId) : null
                }
            ]);
            timers.push(setTimeout(() => dismiss(id), DURATION_MS[type]));
        };

        const onNotify = (e) => push(e.detail);

        window.addEventListener(NOTIFY_EVENT, onNotify);
        timers.push(setTimeout(() => {
            const queued = takeQueuedNotice();
            if (queued) push(queued);
        }, 0));

        return () => {
            window.removeEventListener(NOTIFY_EVENT, onNotify);
            timers.forEach(clearTimeout);
        };
    }, []);

    const handleToastClick = (taskId) => {
        console.log("--> Toast clicked với taskId:", taskId);
        if (!taskId) return;

        // Điều hướng sang MyTasks kèm param taskId
        navigate(`/mytasks?taskId=${encodeURIComponent(taskId)}`);
    };

    if (items.length === 0) return null;

    return (
        <div className="toast-viewport app-toasts">
            {items.map((t) => {
                const Icon = ICONS[t.type];
                return (
                    <div
                        key={t.id}
                        className={`toast variant-${t.type} ${t.taskId ? "toast-clickable" : ""}`}
                        role={t.type === "error" ? "alert" : "status"}
                        onClick={() => handleToastClick(t.taskId)}
                        style={{ cursor: t.taskId ? "pointer" : "default" }}
                    >
                        <Icon className="toast-icon icon" aria-hidden="true" />
                        <div className="toast-body">
                            <p className="toast-title">{t.title}</p>
                            {t.message && <p className="toast-desc">{t.message}</p>}
                        </div>
                        <button
                            type="button"
                            className="toast-close icon-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setItems((prev) => prev.filter((x) => x.id !== t.id));
                            }}
                            aria-label="Dismiss notification"
                        >
                            <X className="icon icon-sm" aria-hidden="true" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

export default Notifier;