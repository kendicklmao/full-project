import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, Loader2, Plus, Trash2 } from "lucide-react";
import ErrorState from "../common/ErrorState.jsx";
import Modal from "../common/Modal.jsx";
import { useConfirm, deleteConfirm } from "../common/confirmContext.js";
import { notify } from "../../utils/notify.js";
import { buildMilestoneLine, milestoneDateError } from "../../utils/milestoneLine.js";
import { fetchNotesByProject, createNote, deleteNote } from "../../../api.jsx";
import { useRealtimeRefetch } from "../../hooks/useRealtimeRefetch.js";

const formatDay = (key) => {
    const [y, m, d] = key.split("-");
    return `${d}/${m}/${y}`;
};

/**
 * Project timeline: ONE horizontal line, project start on the left, project end on the right, milestones in between.
 * Milestones are the project's calendar notes (GET/POST/DELETE /note), the same records the Calendar page shows,
 * so adding or deleting here (or there) is the same data. The notes API has no update, so a milestone is added or deleted.
 *
 * @param {string}  projectId
 * @param {*}       startDate  project.startDate
 * @param {*}       endDate    project.date (the project's end date)
 * @param {boolean} canManage  Manager / Leader / Admin: the roles the backend lets create or delete notes
 */
function MilestoneTimeline({ projectId, startDate, endDate, canManage }) {
    const confirm = useConfirm();
    const [state, setState] = useState({ loading: true, error: null, notes: [] });
    const [reloadKey, setReloadKey] = useState(0);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ date: "", content: "" });
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await fetchNotesByProject(projectId);
            setState({ loading: false, error: null, notes: Array.isArray(data) ? data : (data?.data || []) });
        } catch (error) {
            console.error("Loading the milestones failed:", error);
            setState({ loading: false, error, notes: [] });
        }
    }, [projectId]);

    useEffect(() => {
        let cancelled = false;
        fetchNotesByProject(projectId)
            .then((data) => { if (!cancelled) setState({ loading: false, error: null, notes: Array.isArray(data) ? data : (data?.data || []) }); })
            .catch((error) => { if (!cancelled) { console.error("Loading the milestones failed:", error); setState({ loading: false, error, notes: [] }); } });
        return () => { cancelled = true; };
    }, [projectId, reloadKey]);

    // milestones (notes) created / deleted by someone else
    useRealtimeRefetch(() => setReloadKey((k) => k + 1), ["notes"], projectId);

    const line = useMemo(() => buildMilestoneLine(startDate, endDate, state.notes), [startDate, endDate, state.notes]);

    const retry = () => { setState((s) => ({ ...s, loading: true, error: null })); setReloadKey((k) => k + 1); };

    const openAdd = () => { setForm({ date: "", content: "" }); setFormError(""); setAdding(true); };

    const submit = async (e) => {
        e.preventDefault();
        if (saving) return;
        const dateError = milestoneDateError(form.date, startDate, endDate);
        if (dateError) { setFormError(dateError); return; }
        if (!form.content.trim()) { setFormError("Enter a name for the milestone."); return; }
        try {
            setSaving(true);
            setFormError("");
            await createNote({ projectId, content: form.content.trim(), date: form.date });
            setAdding(false);
            await load();
            notify({ type: "success", title: "Milestone added" });
        } catch (error) {
            setFormError(error?.message || "Couldn't add the milestone. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const remove = (marker) => confirm(deleteConfirm({
        item: "milestone",
        name: marker.content,
        onConfirm: async () => {
            await deleteNote(marker.id);
            await load();
        },
    }));

    return (
        <section className="card timeline-line-card" aria-label="Project timeline">
            <div className="timeline-line-header">
                <h3 className="timeline-line-title"><Flag size={20} aria-hidden="true" /> Timeline</h3>
                {canManage && line.ok && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={openAdd}>
                        <Plus size={14} aria-hidden="true" /> Add milestone
                    </button>
                )}
            </div>

            {state.loading ? (
                <div className="page-loading" role="status"><Loader2 className="icon animate-spin" aria-hidden="true" /><span>Loading milestones…</span></div>
            ) : state.error ? (
                <ErrorState variant="inline" title="Couldn't load the milestones." message={state.error?.message} onRetry={retry} />
            ) : !line.ok ? (
                <p className="chart-note">{line.reason} Set the project dates in Settings to see the timeline.</p>
            ) : (
                <>
                    <div className="timeline-line" role="img" aria-label={`Timeline from ${formatDay(line.startKey)} to ${formatDay(line.endKey)} with ${line.markers.length} milestone${line.markers.length === 1 ? "" : "s"}`}>
                        <span className="timeline-line-track" />
                        <span className="timeline-line-end is-start" />
                        <span className="timeline-line-end is-finish" />
                        {line.markers.map((m) => (
                            <span key={m.id} className="timeline-line-marker" style={{ left: `${m.percent}%` }} title={`${formatDay(m.date)}: ${m.content}`}>
                                {m.number}
                            </span>
                        ))}
                    </div>
                    <div className="timeline-line-dates">
                        <span><strong>Start</strong> {formatDay(line.startKey)}</span>
                        <span><strong>End</strong> {formatDay(line.endKey)}</span>
                    </div>

                    {line.markers.length === 0 ? (
                        <p className="chart-note">No milestones yet.{canManage ? " Use “Add milestone” to place one on the timeline." : ""}</p>
                    ) : (
                        <ol className="timeline-line-list">
                            {line.markers.map((m) => (
                                <li key={m.id} className="timeline-line-item">
                                    <span className="timeline-line-badge" aria-hidden="true">{m.number}</span>
                                    <span className="timeline-line-item-text">
                                        <span className="timeline-line-item-name">{m.content}</span>
                                        <span className="timeline-line-item-date">{formatDay(m.date)}</span>
                                    </span>
                                    {canManage && (
                                        <button type="button" className="icon-btn" aria-label={`Delete milestone ${m.content}`} onClick={() => remove(m)}>
                                            <Trash2 className="icon icon-sm" aria-hidden="true" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                    {line.outside > 0 && (
                        <p className="chart-note">{line.outside} calendar note{line.outside === 1 ? " is" : "s are"} outside the project dates and only shown on the Calendar.</p>
                    )}
                </>
            )}

            {adding && (
                <Modal title="Add milestone" description="It is saved as a note on the project calendar." size="sm" onClose={saving ? () => {} : () => setAdding(false)}>
                    <form className="modal-form" onSubmit={submit} noValidate>
                        <div className="modal-body">
                            <div className="field">
                                <label className="field-label" htmlFor="milestone-name">Name</label>
                                <input id="milestone-name" className="input" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} maxLength={200} />
                            </div>
                            <div className="field">
                                <label className="field-label" htmlFor="milestone-date">Date</label>
                                <input id="milestone-date" className="input" type="date" min={line.ok ? line.startKey : undefined} max={line.ok ? line.endKey : undefined} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                            </div>
                            {formError && <p className="field-error-text" role="alert">{formError}</p>}
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)} disabled={saving}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Add milestone"}</button>
                        </div>
                    </form>
                </Modal>
            )}
        </section>
    );
}

export default MilestoneTimeline;
