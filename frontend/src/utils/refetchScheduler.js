// Debounce + serialize for realtime refetches (pure, no React).
//  - a burst of triggers becomes ONE run after `delay` ms;
//  - a trigger while a run is in flight queues exactly one more run after it, so the last request
//    always starts after the latest change and an older response can never be the last to land.
export function createRefetchScheduler(getRefetch, delay = 300) {
    let timer = null;
    let running = false;
    let dirty = false;
    let active = true;

    const run = async () => {
        if (!active) return;
        if (running) { dirty = true; return; }
        running = true;
        try {
            do {
                dirty = false;
                await getRefetch()();
            } while (dirty && active);
        } catch (err) {
            console.error("Realtime refetch failed:", err);
        } finally {
            running = false;
        }
    };

    return {
        schedule() {
            if (!active) return;
            clearTimeout(timer);
            timer = setTimeout(run, delay);
        },
        cancel() {
            active = false;
            clearTimeout(timer);
        },
    };
}
