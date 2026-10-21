import { getRequestHeaders } from '../../../../script.js';
import { getFeatureSettings, saveFeatureSettings } from './settings-store.js';
import { createToggleStorage } from './toggle-storage-core.js';

const FILE_NAME = 'SillyTavern-CustomPreset-toggle-presets.json';
let store;

export function reportToggleStorageError(error) {
    console.error('[CustomPreset] Toggle preset storage:', error);
    toastr.error('토글 프리셋 파일을 읽거나 저장하지 못했습니다. 연결 및 파일 상태를 확인한 뒤 다시 시도해 주세요.', 'Custom Preset');
}

export async function initToggleStorage() {
    store = createToggleStorage({
        settings: getFeatureSettings(),
        saveSettings: saveFeatureSettings,
        async read() {
            const response = await fetch(`/user/files/${FILE_NAME}`, { cache: 'no-store' });
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`Read failed: ${response.status}`);
            return response.json();
        },
        async write(value) {
            const bytes = new TextEncoder().encode(JSON.stringify(value));
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            const response = await fetch('/api/files/upload', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name: FILE_NAME, data: btoa(binary) }),
            });
            if (!response.ok) throw new Error(`Write failed: ${response.status}`);
        },
    });
    await store.init();
}

export function getTogglePresetsStorage() {
    return store.get();
}

export function updateTogglePresets(edit) {
    return store.update(edit);
}
