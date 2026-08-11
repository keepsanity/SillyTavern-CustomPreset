// 여러 기능이 함께 쓰는 잡 유틸. 최하위 레이어라 다른 기능 모듈을 import하지 않는다.
import { L } from './translations.js';

export function matchesSearch(prompt, keyword) {
    if (!keyword) return true;
    const name = (prompt.name || '').toLowerCase();
    const role = (prompt.role || '').toLowerCase();
    const content = (prompt.content || '').toLowerCase();
    return name.includes(keyword) || role.includes(keyword) || content.includes(keyword);
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            toastr.success(L.copiedToClipboard);
            return;
        }
    } catch (err) {
        console.warn('Clipboard API failed, falling back:', err);
    }

    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (success) {
            toastr.success(L.copiedToClipboard);
        } else {
            toastr.error(L.copyFailed);
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        toastr.error(L.copyFailed);
    }
}

/**
 * 그룹 구성은 프롬프트에 실려 프리셋 파일에 저장되므로, 프리셋을 저장해야 남는다.
 */
export function saveActivePreset() {
    document.getElementById('update_oai_preset')?.click();
}

export function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
