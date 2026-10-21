// Kept local to each extension so either extension can be installed independently.
export function createJsonDataStore({ settings, key, empty, validate, merge, read, write, saveSettings }) {
    let data;
    let queue = Promise.resolve();
    const marker = `${key}FileVersion`;
    const check = value => {
        if (!validate(value)) throw new Error(`Invalid ${key} data`);
        return value;
    };
    async function persist(value) {
        check(value);
        await write({ version: 1, data: value });
        const saved = await read();
        if (!saved || saved.version !== 1 || JSON.stringify(saved.data) !== JSON.stringify(value)) {
            throw new Error(`${key} file verification failed`);
        }
    }
    return {
        async init() {
            const saved = await read();
            if (saved !== null && (!saved || saved.version !== 1)) throw new Error(`Unsupported ${key} file`);
            const existing = saved ? check(saved.data) : structuredClone(empty);
            if (Object.hasOwn(settings, key)) {
                const next = check(merge(existing, check(settings[key])));
                await persist(next);
                data = next;
                delete settings[key];
                settings[marker] = 1;
                saveSettings();
            } else {
                if (!saved && settings[marker]) throw new Error(`${key} file is missing; restore from backup`);
                data = existing;
                if (saved && !settings[marker]) {
                    settings[marker] = 1;
                    saveSettings();
                }
            }
        },
        get() {
            if (data === undefined) throw new Error(`${key} storage is not ready`);
            return data;
        },
        update(edit) {
            const task = queue.then(async () => {
                if (data === undefined) throw new Error(`${key} storage is not ready`);
                const next = structuredClone(data);
                edit(next);
                await persist(next);
                data = next;
                if (!settings[marker]) {
                    settings[marker] = 1;
                    saveSettings();
                }
            });
            queue = task.catch(() => {});
            return task;
        },
    };
}

export function jsonFileTransport(fileName, getRequestHeaders) {
    return {
        async read() {
            const response = await fetch(`/user/files/${fileName}`, { cache: 'no-store' });
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`Read failed: ${response.status}`);
            return response.json();
        },
        async write(value) {
            const bytes = new TextEncoder().encode(JSON.stringify(value));
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            const response = await fetch('/api/files/upload', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ name: fileName, data: btoa(binary) }),
            });
            if (!response.ok) throw new Error(`Write failed: ${response.status}`);
        },
    };
}
