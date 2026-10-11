import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Modal from "../../../common/Modal.jsx";
import { changePassword } from "../../../../../api.jsx";
import { notify } from "../../../../utils/notify.js";
import { validateChangePassword } from "../../../../utils/passwordForm.js";

const FIELDS = [
    { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
    { name: "newPassword", label: "New password", autoComplete: "new-password" },
    { name: "confirm", label: "Confirm new password", autoComplete: "new-password" },
];

/** Change password from the account menu: POST /user/change-password (the backend checks the current password). */
function ChangePasswordModal({ onClose }) {
    const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
    const [shown, setShown] = useState(false);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (saving) return;
        setFormError("");
        const found = validateChangePassword(values);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        try {
            setSaving(true);
            await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
            // success only after the backend confirmed it
            notify({ type: "success", title: "Password changed", message: "Use your new password the next time you sign in." });
            onClose();
        } catch (error) {
            setFormError(error?.message || "Couldn't change the password. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal title="Change password" description="Enter your current password, then choose a new one." size="sm" onClose={saving ? () => {} : onClose}>
            <form className="modal-form" onSubmit={submit} noValidate>
                <div className="modal-body">
                    {FIELDS.map((f) => (
                        <div className="field" key={f.name}>
                            <label className="field-label" htmlFor={`cp-${f.name}`}>{f.label}</label>
                            <input
                                id={`cp-${f.name}`}
                                className="input"
                                type={shown ? "text" : "password"}
                                autoComplete={f.autoComplete}
                                value={values[f.name]}
                                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                                aria-invalid={errors[f.name] ? true : undefined}
                            />
                            {errors[f.name] && <p className="field-error-text">{errors[f.name]}</p>}
                        </div>
                    ))}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
                        {shown ? <EyeOff className="icon icon-sm" aria-hidden="true" /> : <Eye className="icon icon-sm" aria-hidden="true" />}
                        {shown ? " Hide passwords" : " Show passwords"}
                    </button>
                    {formError && <p className="field-error-text" role="alert">{formError}</p>}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Change password"}</button>
                </div>
            </form>
        </Modal>
    );
}

export default ChangePasswordModal;
