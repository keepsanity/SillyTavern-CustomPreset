import { getRequestHeaders } from '../../../../script.js';
import { getFeatureSettings, saveFeatureSettings } from './settings-store.js';
import { createJsonDataStore, jsonFileTransport } from './json-data-store.js';

let store;
export async function initTranslationStorage() {
    store = createJsonDataStore({
        settings: getFeatureSettings(), key: 'translations', empty: {},
        validate: value => value !== null && typeof value === 'object' && !Array.isArray(value)
            && Object.values(value).every(entry => entry && typeof entry.original === 'string' && typeof entry.translated === 'string'),
        merge: (file, legacy) => ({ ...file, ...legacy }),
        saveSettings: saveFeatureSettings,
        ...jsonFileTransport('SillyTavern-CustomPreset-translations.json', getRequestHeaders),
    });
    await store.init();
}
export function getStoredTranslations() { return store.get(); }
export function updateStoredTranslations(edit) { return store.update(edit); }
