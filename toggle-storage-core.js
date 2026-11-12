// File-backed storage. Only publish edits after a verified write succeeds.
export function createToggleStorage({ read, write, settings, saveSettings }) {
    let data;
    let queue = Promise.resolve();

    function validate(value) {
        const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
        if (!object(value) || !Object.values(value).every(group => object(group)
            && Object.values(group).every(snapshot => object(snapshot)
                && Object.values(snapshot).every(v => typeof v === 'boolean')))) {
            throw new Error('Invalid toggle preset data');
        }
        return value;
    }

    async function persist(value) {
        validate(value);
        await write({ version: 1, presets: value });
        const saved = await read();
        if (!saved || saved.version !== 1 || JSON.stringify(saved.presets) !== JSON.stringify(value)) {
            throw new Error('Toggle preset file verification failed');
        }
    }

    return {
        async init() {
            const saved = await read();
            if (saved && saved.version !== 1) throw new Error('Unsupported toggle preset file version');
            const existing = saved ? validate(saved.presets) : {};
            const legacy = settings.togglePresets;
            if (legacy !== undefined) {
                validate(legacy);
                // Settings are authoritative until migration has finished. Preserve
                // file-only presets when retrying an interrupted migration.
                const merged = structuredClone(existing);
                for (const [name, group] of Object.entries(legacy)) {
                    Object.defineProperty(merged, name, {
                        value: { ...merged[name], ...group }, enumerable: true, writable: true, configurable: true,
                    });
                }
                await persist(merged);
                data = merged;
                settings.togglePresetsFileVersion = 1;
                delete settings.togglePresets;
                saveSettings();
            } else {
                data = existing;
                // A deleted file starts empty; restoring the file later still wins on reload.
                if (!saved && settings.togglePresetsFileVersion) {
                    delete settings.togglePresetsFileVersion;
                    saveSettings();
                    return { missing: true };
                }
            }
            return { missing: false };
        },
        get() {
            if (!data) throw new Error('Toggle preset storage is not ready');
            return data;
        },
        update(edit) {
            const operation = queue.then(async () => {
                if (!data) throw new Error('Toggle preset storage is not ready');
                const next = structuredClone(data);
                edit(next);
                await persist(next);
                data = next;
                if (!settings.togglePresetsFileVersion) {
                    settings.togglePresetsFileVersion = 1;
                    saveSettings();
                }
            });
            queue = operation.catch(() => {});
            return operation;
        },
    };
}
