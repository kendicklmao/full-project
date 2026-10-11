// Client-side checks for the password forms. The backend stays the authority (same 6-character rule as the User schema).
export const MIN_PASSWORD_LENGTH = 6;
export const OTP_PATTERN = /^\d{6}$/;

/** New password + confirmation -> { newPassword?, confirm? } messages (empty object = valid) */
export function validateNewPassword(newPassword, confirm) {
    const errors = {};
    if (!newPassword) errors.newPassword = "New password is required.";
    else if (newPassword.length < MIN_PASSWORD_LENGTH) errors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (!confirm) errors.confirm = "Please confirm your password.";
    else if (newPassword !== confirm) errors.confirm = "Passwords do not match.";
    return errors;
}

/** Change-password form (logged in) */
export function validateChangePassword({ currentPassword, newPassword, confirm }) {
    const errors = validateNewPassword(newPassword, confirm);
    if (!currentPassword) errors.currentPassword = "Current password is required.";
    else if (newPassword && currentPassword === newPassword) errors.newPassword = "The new password must be different from the current one.";
    return errors;
}

/** Reset form (OTP flow) */
export function validateReset({ otp, newPassword, confirm }) {
    const errors = validateNewPassword(newPassword, confirm);
    if (!OTP_PATTERN.test(String(otp || "").trim())) errors.otp = "Enter the 6-digit code from the email.";
    return errors;
}

/** Seconds left of a resend cooldown that ends at `until` (ms epoch) */
export const secondsLeft = (until, now = Date.now()) => Math.max(0, Math.ceil((until - now) / 1000));
