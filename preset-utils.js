// 프리셋/프롬프트 조회 유틸. 최하위 레이어라 다른 모듈을 import하지 않는다.
// ST 쪽 상태를 읽기만 하고 쓰지 않는다.
import { openai_settings, openai_setting_names, oai_settings, promptManager } from '../../../openai.js';
import { GLOBAL_PROMPT_CHARACTER_ID } from './constants.js';

/**
 * 지금 켜져 있는 프리셋 이름. ST 설정이 우선이고, 없으면 패널의 선택값을 쓴다.
 * @returns {string}
 */
function getCurrentPresetName() {
    if (oai_settings?.preset_settings_openai) {
        return oai_settings.preset_settings_openai;
    }
    const select = document.getElementById('custom_preset_select');
    return select?.value || '';
}

function getCurrentPreset() {
    const presetName = getCurrentPresetName();
    if (!presetName) return null;
    return getPresetByName(presetName);
}

/**
 * 프롬프트 매니저가 실제로 편집 중인 프리셋.
 * 매니저의 serviceSettings가 곧 활성 프리셋이라 저장 전 수정분까지 반영된다.
 * @returns {object|null}
 */
export function getActivePromptManagerPreset() {
    const serviceSettings = promptManager?.serviceSettings;
    if (serviceSettings?.prompts && serviceSettings?.prompt_order) {
        return serviceSettings;
    }
    return getCurrentPreset();
}

/**
 * ST 설정에 저장된 프리셋 이름. 패널 선택값으로 대체하지 않는다.
 * @returns {string}
 */
export function getActivePresetName() {
    return oai_settings?.preset_settings_openai || '';
}

/**
 * Get all preset names
 * @returns {string[]} Array of preset names
 */
export function getPresetNames() {
    return Object.keys(openai_setting_names);
}

/**
 * Get preset by name
 * @param {string} name - Preset name
 * @returns {object|null} Preset object or null
 */
export function getPresetByName(name) {
    const index = openai_setting_names[name];
    if (index === undefined) return null;
    return openai_settings[index];
}

/**
 * Get prompts with linkage status based on prompt_order
 * @param {object} preset - Preset object
 * @returns {{prompt: object, isLinked: boolean, isEnabled: boolean}[]} Prompt list with linkage status
 */
export function getOrderedPrompts(preset) {
    if (!preset || !preset.prompts) return [];

    // Find prompt_order for the global/dummy character (100001)
    const promptOrderEntry = preset.prompt_order?.find(entry => entry.character_id === GLOBAL_PROMPT_CHARACTER_ID);
    const validPrompts = preset.prompts.filter(p => p && p.name);
    const promptMap = new Map(validPrompts.map(prompt => [prompt.identifier, prompt]));
    const linkedIdentifiers = new Set();

    if (promptOrderEntry && promptOrderEntry.order && promptOrderEntry.order.length > 0) {
        // Return linked prompts in the order specified by prompt_order
        const orderedPrompts = [];
        for (const orderItem of promptOrderEntry.order) {
            const prompt = promptMap.get(orderItem.identifier);
            if (prompt) {
                orderedPrompts.push({ prompt, isLinked: true, isEnabled: !!orderItem.enabled });
                linkedIdentifiers.add(prompt.identifier);
            }
        }

        // Append prompts that exist in presets but are not connected to prompt_order
        for (const prompt of validPrompts) {
            if (!linkedIdentifiers.has(prompt.identifier)) {
                orderedPrompts.push({ prompt, isLinked: false, isEnabled: false });
            }
        }

        return orderedPrompts;
    }

    // Fallback: no prompt_order means every prompt is effectively unlinked
    return validPrompts.map(prompt => ({ prompt, isLinked: false, isEnabled: false }));
}
