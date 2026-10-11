import { useEffect, useRef } from "react";
import { DATA_EVENT, SOCKET_RESYNC_EVENT } from "../utils/socket.js";
import { shouldRefetch } from "../utils/socketEvents.js";
import { createRefetchScheduler } from "../utils/refetchScheduler.js";

/**
 * Re-run `refetch` (the screen's own REST loader) when realtime data it depends on changes, and after a reconnect.
 *  - topics: e.g. ["tasks", "members"] (see EVENT_TOPICS); projectId: ignore other projects' changes.
 *  - A burst of events becomes one refetch (300 ms). If events arrive while a refetch is running, one more
 *    refetch runs after it, so the last request always reflects the latest data (an older response never wins).
 *  - Pass a loader that does NOT show the full-page spinner again (the data is already on screen).
 */
export function useRealtimeRefetch(refetch, topics, projectId) {
    const refetchRef = useRef(refetch);
    useEffect(() => { refetchRef.current = refetch; });
    const topicsKey = topics.join(",");

    useEffect(() => {
        const watched = topicsKey.split(",");
        const scheduler = createRefetchScheduler(() => refetchRef.current);
        const onData = (e) => { if (shouldRefetch(e.detail, watched, projectId)) scheduler.schedule(); };

        window.addEventListener(DATA_EVENT, onData);
        window.addEventListener(SOCKET_RESYNC_EVENT, scheduler.schedule);
        return () => {
            scheduler.cancel();
            window.removeEventListener(DATA_EVENT, onData);
            window.removeEventListener(SOCKET_RESYNC_EVENT, scheduler.schedule);
        };
    }, [topicsKey, projectId]);
}
