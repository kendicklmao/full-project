// Multi-invite selection (Project Settings): who is picked, and the outcome of one invite request per person.
// The backend has no bulk endpoint (POST /member/invite takes one email), so each person is a separate request.
import { looksLikeEmail } from "./userSuggest.js";

const lower = (value) => String(value || "").trim().toLowerCase();
const memberEmail = (member) => lower(member?.userId?.email || member?.email);

/**
 * Adds a candidate ({ email, username?, _id? }) to the selection.
 * Returns { selected, error } — error is "" when added. Refused: not an email, already picked, already a member.
 */
export function addInvitee(selected, candidate, members) {
    const email = lower(candidate?.email);
    if (!looksLikeEmail(email)) return { selected, error: "Choose an account from the list or type a full email address." };
    if (selected.some((s) => lower(s.email) === email)) return { selected, error: `${email} is already selected.` };
    if ((members || []).some((m) => memberEmail(m) === email)) return { selected, error: `${email} is already a member of this project.` };
    return {
        selected: [...selected, { email, name: candidate.username || candidate.name || "", id: candidate._id || "" }],
        error: "",
    };
}

export const removeInvitee = (selected, email) => selected.filter((s) => lower(s.email) !== lower(email));

/**
 * Sends one invite per selected person, one after the other (no parallel burst, no request twice for a person).
 * `invite(email)` must reject on failure. Returns { succeeded: [email], failed: [{ email, message }] }.
 */
export async function inviteAll(selected, invite) {
    const succeeded = [];
    const failed = [];
    for (const person of selected) {
        try {
            await invite(person.email);
            succeeded.push(person.email);
        } catch (error) {
            failed.push({ email: person.email, message: error?.message || "Couldn't add this member." });
        }
    }
    return { succeeded, failed };
}
