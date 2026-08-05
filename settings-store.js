// 확장 설정 저장소. 최하위 레이어라 다른 모듈을 import하지 않는다.
//
// 설정 "UI"(설정 서랍, applyFeatureVisibility)는 상위 레이어인 settings-ui 쪽에 있다.
// 둘을 갈라놓아야 각 기능 모듈이 설정을 읽으면서도 UI와 순환 참조가 생기지 않는다.
import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { EXTENSION_NAME, FEATURE_DEFAULTS } from './constants.js';

/**
 * 확장 설정 객체를 가져온다. 빠진 키는 기본값으로 채워 넣는다.
 * @returns {object} 설정 객체 (직접 수정한 뒤 saveFeatureSettings 호출)
 */
export function getFeatureSettings() {
    if (!extension_settings[EXTENSION_NAME] || typeof extension_settings[EXTENSION_NAME] !== 'object') {
        extension_settings[EXTENSION_NAME] = {};
    }
    const settings = extension_settings[EXTENSION_NAME];
    for (const key of Object.keys(FEATURE_DEFAULTS)) {
        if (!(key in settings)) {
            settings[key] = FEATURE_DEFAULTS[key];
        }
    }
    return settings;
}

export function saveFeatureSettings() {
    extension_settings[EXTENSION_NAME] = getFeatureSettings();
    saveSettingsDebounced();
}
