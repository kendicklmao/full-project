import { io } from "socket.io-client";
import { API_ORIGIN } from "../config/apiConfig.js";

// Socket.IO runs on the backend origin. VITE_SOCKET_URL overrides; otherwise it is the origin of VITE_API_URL.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_ORIGIN;

// Dispatched on window after the socket reconnects: the events missed while offline are lost,
// so screens re-fetch their data through the REST API.
export const SOCKET_RESYNC_EVENT = "socketResync";

// ONE shared connection for the whole app. The backend puts every authenticated client into a single room;
// the JWT (same one the REST API uses) is read at each connection attempt, never stored here.
export const socket = io(SOCKET_URL, {
    autoConnect: false, // connected by syncSocketConnection() once a token exists
    transports: ["websocket", "polling"],
    auth: (cb) => cb({ token: localStorage.getItem("token") || "" }),
});

socket.io.on("reconnect", () => {
    window.dispatchEvent(new Event(SOCKET_RESYNC_EVENT));
});

let connectedToken = null;

// Call when the signed-in state may have changed (app start, route change): connects with the current token,
// reconnects when another user signed in, disconnects after sign-out. Never creates a second socket.
export function syncSocketConnection() {
    const token = localStorage.getItem("token") || "";
    if (!token) {
        connectedToken = null;
        socket.disconnect();
        return;
    }
    if (token !== connectedToken) {
        connectedToken = token;
        socket.disconnect();
        socket.connect();
        return;
    }
    if (!socket.active) socket.connect(); // e.g. an earlier attempt was refused and not retried
}

import { EVENT_TOPICS, affectsNotifications } from "./socketEvents.js";
export { isForProject } from "./socketEvents.js";

// Window event fired for every realtime change: detail = { event, topics, projectId }.
export const DATA_EVENT = "dataChanged";

// ONE dispatcher for the whole app (registered once, at module load): socket event -> DATA_EVENT.
// Screens never listen to the socket for this; they use useRealtimeRefetch(). Header / sidebar notifications
// listen to "myTasksUpdated", which is fired here (debounced) when the data behind them changes.
let notifyTimer = null;
Object.keys(EVENT_TOPICS).forEach((event) => {
    socket.on(event, (payload) => {
        const topics = EVENT_TOPICS[event];
        const projectId = payload?.projectId ?? payload?.task?.projectId;
        window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail: { event, topics, projectId: projectId ? String(projectId?._id || projectId) : undefined } }));
        if (affectsNotifications(topics)) {
            clearTimeout(notifyTimer);
            notifyTimer = setTimeout(() => window.dispatchEvent(new Event("myTasksUpdated")), 300);
        }
    });
});

