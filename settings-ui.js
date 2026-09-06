// 확장 설정 서랍 UI와 기능별 표시/숨김.
// 최상위 레이어라 각 기능 모듈을 부르지만, 기능 쪽은 이 모듈을 import하지 않는다.
import { applyCaptureFeatureState } from './capture.js';
import { EXTENSION_NAME, KEYWORD_TRIGGER_DEFAULT_DEPTH, KEYWORD_TRIGGER_MAX_DEPTH } from './constants.js';
import { closeCustomizerPanel } from './customizer-panel.js';
import { ensureKeywordTriggerControls, getGlobalKeywordScanDepth, loadKeywordTriggerFormForPrompt, updateKeywordTriggerSummary } from './keyword-trigger.js';
import { ensurePromptManagerPreviewButton, interceptEnabled, setInterceptEnabled } from './preview-intercept.js';
import { loadQuickToggleFormForPrompt } from './prompt-popup.js';
import { ensurePromptSearchControls } from './prompt-search.js';
import { isQuickToggleGroupFeatureEnabled, renderQuickToggleButtons } from './quick-toggle.js';
import { getFeatureSettings, saveFeatureSettings } from './settings-store.js';
import { L } from './translations.js';

export function createExtensionSettingsMenu() {
    if (document.getElementById('custom_preset_settings_container')) return;

    const settingsRoot = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!settingsRoot) return;

    const settings = getFeatureSettings();
    const container = document.createElement('div');
    container.id = 'custom_preset_settings_container';
    container.className = 'extension_container custom_preset_settings';

    const drawer = document.createElement('div');
    drawer.className = 'inline-drawer';

    const drawerHeader = document.createElement('div');
    drawerHeader.className = 'inline-drawer-toggle inline-drawer-header';

    const headerTitle = document.createElement('b');
    headerTitle.textContent = L.customPresetManager;

    const headerIcon = document.createElement('div');
    headerIcon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down interactable';
    headerIcon.tabIndex = 0;
    headerIcon.setAttribute('role', 'button');

    drawerHeader.appendChild(headerTitle);
    drawerHeader.appendChild(headerIcon);

    const drawerContent = document.createElement('div');
    drawerContent.className = 'inline-drawer-content';

    const row1 = document.createElement('label');
    row1.className = 'checkbox_label';
    row1.setAttribute('for', 'custom_preset_show_customizer_btn');
    const toggleCustomizer = document.createElement('input');
    toggleCustomizer.id = 'custom_preset_show_customizer_btn';
    toggleCustomizer.type = 'checkbox';
    toggleCustomizer.className = 'extension_enabled';
    toggleCustomizer.checked = settings.showPresetCustomizerButton !== false;
    const text1 = document.createElement('span');
    text1.innerHTML = `<strong>${L.showPresetCustomizeBtn}</strong>`;
    row1.appendChild(toggleCustomizer);
    row1.appendChild(text1);

    const note1 = document.createElement('small');
    note1.className = 'notes';
    note1.textContent = L.showPresetCustomizeBtnNote;

    const separator = document.createElement('hr');
    separator.className = 'm-t-1 m-b-1';

    const row2 = document.createElement('label');
    row2.className = 'checkbox_label';
    row2.setAttribute('for', 'custom_preset_show_quick_toggle_feature');
    const toggleQuickFeature = document.createElement('input');
    toggleQuickFeature.id = 'custom_preset_show_quick_toggle_feature';
    toggleQuickFeature.type = 'checkbox';
    toggleQuickFeature.className = 'extension_enabled';
    toggleQuickFeature.checked = settings.showQuickPromptToggleFeature !== false;
    const text2 = document.createElement('span');
    text2.innerHTML = `<strong>${L.showQuickToggle}</strong>`;
    row2.appendChild(toggleQuickFeature);
    row2.appendChild(text2);

    const note2 = document.createElement('small');
    note2.className = 'notes';
    note2.textContent = L.showQuickToggleNote;

    const row3 = document.createElement('label');
    row3.className = 'checkbox_label';
    row3.setAttribute('for', 'custom_preset_show_quick_toggle_collapse_feature');
    const toggleQuickCollapseFeature = document.createElement('input');
    toggleQuickCollapseFeature.id = 'custom_preset_show_quick_toggle_collapse_feature';
    toggleQuickCollapseFeature.type = 'checkbox';
    toggleQuickCollapseFeature.className = 'extension_enabled';
    toggleQuickCollapseFeature.checked = settings.showQuickPromptToggleCollapseFeature !== false;
    const text3 = document.createElement('span');
    text3.innerHTML = `<strong>${L.enableCollapseToggle}</strong>`;
    row3.appendChild(toggleQuickCollapseFeature);
    row3.appendChild(text3);

    const note3 = document.createElement('small');
    note3.className = 'notes';
    note3.textContent = L.enableCollapseToggleNote;

    toggleCustomizer.addEventListener('change', () => {
        settings.showPresetCustomizerButton = !!toggleCustomizer.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    toggleQuickFeature.addEventListener('change', () => {
        settings.showQuickPromptToggleFeature = !!toggleQuickFeature.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    toggleQuickCollapseFeature.addEventListener('change', () => {
        settings.showQuickPromptToggleCollapseFeature = !!toggleQuickCollapseFeature.checked;
        if (!settings.showQuickPromptToggleCollapseFeature) {
            settings.quickPromptToggleBarCollapsed = false;
        }
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const rowGroup = document.createElement('label');
    rowGroup.className = 'checkbox_label';
    rowGroup.setAttribute('for', 'custom_preset_show_quick_toggle_group_feature');
    const toggleGroupFeature = document.createElement('input');
    toggleGroupFeature.id = 'custom_preset_show_quick_toggle_group_feature';
    toggleGroupFeature.type = 'checkbox';
    toggleGroupFeature.className = 'extension_enabled';
    toggleGroupFeature.checked = settings.showQuickToggleGroupFeature === true;
    const textGroup = document.createElement('span');
    textGroup.innerHTML = `<strong>${L.enableToggleGroup}</strong>`;
    rowGroup.appendChild(toggleGroupFeature);
    rowGroup.appendChild(textGroup);

    const noteGroup = document.createElement('small');
    noteGroup.className = 'notes';
    noteGroup.textContent = L.enableToggleGroupNote;

    toggleGroupFeature.addEventListener('change', () => {
        settings.showQuickToggleGroupFeature = !!toggleGroupFeature.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
        // 프롬프트 편집창이 열려 있으면 고급 안내 문구를 즉시 반영한다.
        loadQuickToggleFormForPrompt(document.getElementById('completion_prompt_manager_popup_entry_form_save')?.dataset.pmPrompt);
    });

    const row4 = document.createElement('label');
    row4.className = 'checkbox_label';
    row4.setAttribute('for', 'custom_preset_show_position_feature');
    const togglePosition = document.createElement('input');
    togglePosition.id = 'custom_preset_show_position_feature';
    togglePosition.type = 'checkbox';
    togglePosition.className = 'extension_enabled';
    togglePosition.checked = settings.showPromptPositionFeature !== false;
    const text4 = document.createElement('span');
    text4.innerHTML = `<strong>${L.enablePositionSelect}</strong>`;
    row4.appendChild(togglePosition);
    row4.appendChild(text4);

    const note4 = document.createElement('small');
    note4.className = 'notes';
    note4.textContent = L.enablePositionSelectNote;

    togglePosition.addEventListener('change', () => {
        settings.showPromptPositionFeature = !!togglePosition.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const rowSearch = document.createElement('label');
    rowSearch.className = 'checkbox_label';
    rowSearch.setAttribute('for', 'custom_preset_show_prompt_search_feature');
    const togglePromptSearch = document.createElement('input');
    togglePromptSearch.id = 'custom_preset_show_prompt_search_feature';
    togglePromptSearch.type = 'checkbox';
    togglePromptSearch.className = 'extension_enabled';
    togglePromptSearch.checked = settings.showPromptSearchFeature !== false;
    const textSearch = document.createElement('span');
    textSearch.innerHTML = `<strong>${L.enablePromptSearch}</strong>`;
    rowSearch.appendChild(togglePromptSearch);
    rowSearch.appendChild(textSearch);

    const noteSearch = document.createElement('small');
    noteSearch.className = 'notes';
    noteSearch.textContent = L.enablePromptSearchNote;

    togglePromptSearch.addEventListener('change', () => {
        settings.showPromptSearchFeature = !!togglePromptSearch.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const row5 = document.createElement('label');
    row5.className = 'checkbox_label';
    row5.setAttribute('for', 'custom_preset_show_toggle_preset_feature');
    const toggleTogglePreset = document.createElement('input');
    toggleTogglePreset.id = 'custom_preset_show_toggle_preset_feature';
    toggleTogglePreset.type = 'checkbox';
    toggleTogglePreset.className = 'extension_enabled';
    toggleTogglePreset.checked = settings.showTogglePresetFeature !== false;
    const text5 = document.createElement('span');
    text5.innerHTML = `<strong>${L.enableTogglePreset}</strong>`;
    row5.appendChild(toggleTogglePreset);
    row5.appendChild(text5);

    const note5 = document.createElement('small');
    note5.className = 'notes';
    note5.textContent = L.enableTogglePresetNote;

    toggleTogglePreset.addEventListener('change', () => {
        settings.showTogglePresetFeature = !!toggleTogglePreset.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const row6 = document.createElement('label');
    row6.className = 'checkbox_label';
    row6.setAttribute('for', 'custom_preset_show_linked_preset_feature');
    const toggleLinkedPreset = document.createElement('input');
    toggleLinkedPreset.id = 'custom_preset_show_linked_preset_feature';
    toggleLinkedPreset.type = 'checkbox';
    toggleLinkedPreset.className = 'extension_enabled';
    toggleLinkedPreset.checked = settings.showLinkedPresetFeature !== false;
    const text6 = document.createElement('span');
    text6.innerHTML = `<strong>${L.enableLinkedPreset}</strong>`;
    row6.appendChild(toggleLinkedPreset);
    row6.appendChild(text6);

    const note6 = document.createElement('small');
    note6.className = 'notes';
    note6.textContent = L.enableLinkedPresetNote;

    toggleLinkedPreset.addEventListener('change', () => {
        settings.showLinkedPresetFeature = !!toggleLinkedPreset.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const row7 = document.createElement('label');
    row7.className = 'checkbox_label';
    row7.setAttribute('for', 'custom_preset_auto_save');
    const toggleAutoSave = document.createElement('input');
    toggleAutoSave.id = 'custom_preset_auto_save';
    toggleAutoSave.type = 'checkbox';
    toggleAutoSave.className = 'extension_enabled';
    toggleAutoSave.checked = !!settings.autoSavePreset;
    const text7 = document.createElement('span');
    text7.innerHTML = `<strong>${L.enableAutoSave}</strong>`;
    row7.appendChild(toggleAutoSave);
    row7.appendChild(text7);

    const note7 = document.createElement('small');
    note7.className = 'notes';
    note7.textContent = L.enableAutoSaveNote;

    toggleAutoSave.addEventListener('change', () => {
        settings.autoSavePreset = !!toggleAutoSave.checked;
        saveFeatureSettings();
    });

    const row8 = document.createElement('label');
    row8.className = 'checkbox_label';
    row8.setAttribute('for', 'custom_preset_auto_connect');
    const toggleAutoConnect = document.createElement('input');
    toggleAutoConnect.id = 'custom_preset_auto_connect';
    toggleAutoConnect.type = 'checkbox';
    toggleAutoConnect.className = 'extension_enabled';
    toggleAutoConnect.checked = settings.autoConnectPrompt !== false;
    const text8 = document.createElement('span');
    text8.innerHTML = `<strong>${L.enableAutoConnect}</strong>`;
    row8.appendChild(toggleAutoConnect);
    row8.appendChild(text8);

    const note8 = document.createElement('small');
    note8.className = 'notes';
    note8.textContent = L.enableAutoConnectNote;

    toggleAutoConnect.addEventListener('change', () => {
        settings.autoConnectPrompt = !!toggleAutoConnect.checked;
        saveFeatureSettings();
    });

    const rowPreview = document.createElement('label');
    rowPreview.className = 'checkbox_label';
    rowPreview.setAttribute('for', 'custom_preset_show_prompt_preview');
    const togglePromptPreview = document.createElement('input');
    togglePromptPreview.id = 'custom_preset_show_prompt_preview';
    togglePromptPreview.type = 'checkbox';
    togglePromptPreview.className = 'extension_enabled';
    togglePromptPreview.checked = settings.showPromptPreviewFeature !== false;
    const textPreview = document.createElement('span');
    textPreview.innerHTML = `<strong>${L.enablePromptPreview}</strong>`;
    rowPreview.appendChild(togglePromptPreview);
    rowPreview.appendChild(textPreview);

    const notePreview = document.createElement('small');
    notePreview.className = 'notes';
    notePreview.textContent = L.enablePromptPreviewNote;

    togglePromptPreview.addEventListener('change', () => {
        settings.showPromptPreviewFeature = !!togglePromptPreview.checked;
        if (!settings.showPromptPreviewFeature && interceptEnabled) {
            setInterceptEnabled(false);
        }
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    // Keyword trigger section
    const keywordSeparator = document.createElement('hr');
    keywordSeparator.className = 'm-t-1 m-b-1';

    const rowKeyword = document.createElement('label');
    rowKeyword.className = 'checkbox_label';
    rowKeyword.setAttribute('for', 'custom_preset_show_keyword_trigger');
    const toggleKeyword = document.createElement('input');
    toggleKeyword.id = 'custom_preset_show_keyword_trigger';
    toggleKeyword.type = 'checkbox';
    toggleKeyword.className = 'extension_enabled';
    toggleKeyword.checked = settings.showKeywordTriggerFeature === true;
    const textKeyword = document.createElement('span');
    textKeyword.innerHTML = `<strong>${L.enableKeywordTrigger}</strong>`;
    rowKeyword.appendChild(toggleKeyword);
    rowKeyword.appendChild(textKeyword);

    const noteKeyword = document.createElement('small');
    noteKeyword.className = 'notes';
    noteKeyword.textContent = L.enableKeywordTriggerNote;

    const keywordSubBlock = document.createElement('div');
    keywordSubBlock.style.marginLeft = '18px';

    const keywordDepthLabel = document.createElement('label');
    keywordDepthLabel.setAttribute('for', 'custom_preset_keyword_scan_depth');
    keywordDepthLabel.textContent = L.keywordTriggerGlobalDepth;
    keywordDepthLabel.style.display = 'block';
    keywordDepthLabel.style.marginTop = '5px';

    const keywordDepthInput = document.createElement('input');
    keywordDepthInput.id = 'custom_preset_keyword_scan_depth';
    keywordDepthInput.type = 'number';
    keywordDepthInput.className = 'text_pole';
    keywordDepthInput.min = '1';
    keywordDepthInput.max = String(KEYWORD_TRIGGER_MAX_DEPTH);
    keywordDepthInput.style.width = '80px';
    keywordDepthInput.value = String(getGlobalKeywordScanDepth());

    const keywordDepthNote = document.createElement('small');
    keywordDepthNote.className = 'notes';
    keywordDepthNote.textContent = L.keywordTriggerGlobalDepthNote;

    keywordDepthInput.addEventListener('change', () => {
        const parsed = Number(keywordDepthInput.value);
        settings.keywordTriggerScanDepth = Number.isFinite(parsed) && parsed >= 1
            ? Math.min(Math.floor(parsed), KEYWORD_TRIGGER_MAX_DEPTH)
            : KEYWORD_TRIGGER_DEFAULT_DEPTH;
        keywordDepthInput.value = String(settings.keywordTriggerScanDepth);
        saveFeatureSettings();
        updateKeywordTriggerSummary();
    });

    keywordSubBlock.appendChild(keywordDepthLabel);
    keywordSubBlock.appendChild(keywordDepthNote);
    keywordSubBlock.appendChild(keywordDepthInput);
    keywordSubBlock.style.display = settings.showKeywordTriggerFeature === true ? '' : 'none';

    toggleKeyword.addEventListener('change', () => {
        settings.showKeywordTriggerFeature = !!toggleKeyword.checked;
        saveFeatureSettings();
        keywordSubBlock.style.display = settings.showKeywordTriggerFeature ? '' : 'none';
        applyFeatureVisibility();
        // 프롬프트 편집창이 열려 있으면 "키워드" 옵션 선택 상태를 즉시 되돌려준다.
        loadKeywordTriggerFormForPrompt(document.getElementById('completion_prompt_manager_popup_entry_form_save')?.dataset.pmPrompt);
    });

    // Prompt capture section
    const captureSeparator = document.createElement('hr');
    captureSeparator.className = 'm-t-1 m-b-1';

    const rowCapture = document.createElement('label');
    rowCapture.className = 'checkbox_label';
    rowCapture.setAttribute('for', 'custom_preset_show_prompt_capture');
    const togglePromptCapture = document.createElement('input');
    togglePromptCapture.id = 'custom_preset_show_prompt_capture';
    togglePromptCapture.type = 'checkbox';
    togglePromptCapture.className = 'extension_enabled';
    togglePromptCapture.checked = settings.showPromptCaptureFeature === true;
    const textCapture = document.createElement('span');
    textCapture.innerHTML = `<strong>${L.enablePromptCapture}</strong>`;
    rowCapture.appendChild(togglePromptCapture);
    rowCapture.appendChild(textCapture);

    const noteCapture = document.createElement('small');
    noteCapture.className = 'notes';
    noteCapture.textContent = L.enablePromptCaptureNote;

    const captureSubBlock = document.createElement('div');
    captureSubBlock.style.marginLeft = '18px';

    const makeCaptureSubOption = (id, labelText, noteText, key, defaultOn) => {
        const row = document.createElement('label');
        row.className = 'checkbox_label';
        row.setAttribute('for', id);
        const input = document.createElement('input');
        input.id = id;
        input.type = 'checkbox';
        input.className = 'extension_enabled';
        input.checked = defaultOn ? settings[key] !== false : settings[key] === true;
        const label = document.createElement('span');
        label.textContent = labelText;
        row.appendChild(input);
        row.appendChild(label);

        const note = document.createElement('small');
        note.className = 'notes';
        note.textContent = noteText;

        input.addEventListener('change', () => {
            settings[key] = !!input.checked;
            saveFeatureSettings();
            applyCaptureFeatureState();
        });

        captureSubBlock.appendChild(row);
        captureSubBlock.appendChild(note);
    };

    makeCaptureSubOption('custom_preset_capture_codeblock', L.captureFromCodeBlock, L.captureFromCodeBlockNote, 'promptCaptureFromCodeBlock', true);
    makeCaptureSubOption('custom_preset_capture_selection', L.captureFromSelection, L.captureFromSelectionNote, 'promptCaptureFromSelection', true);
    makeCaptureSubOption('custom_preset_capture_macro', L.captureMacroDefault, L.captureMacroDefaultNote, 'promptCaptureMacroDefault', true);

    captureSubBlock.style.display = settings.showPromptCaptureFeature === true ? '' : 'none';

    togglePromptCapture.addEventListener('change', () => {
        settings.showPromptCaptureFeature = !!togglePromptCapture.checked;
        saveFeatureSettings();
        captureSubBlock.style.display = settings.showPromptCaptureFeature ? '' : 'none';
        applyCaptureFeatureState();
    });

    // Translation feature section
    const translationSeparator = document.createElement('hr');
    translationSeparator.className = 'm-t-1 m-b-1';

    const row9 = document.createElement('label');
    row9.className = 'checkbox_label';
    row9.setAttribute('for', 'custom_preset_show_translate_feature');
    const toggleTranslate = document.createElement('input');
    toggleTranslate.id = 'custom_preset_show_translate_feature';
    toggleTranslate.type = 'checkbox';
    toggleTranslate.className = 'extension_enabled';
    toggleTranslate.checked = !!settings.showTranslateFeature;
    const text9 = document.createElement('span');
    text9.innerHTML = `<strong>${L.enableTranslate}</strong>`;
    row9.appendChild(toggleTranslate);
    row9.appendChild(text9);

    const note9 = document.createElement('small');
    note9.className = 'notes';
    note9.textContent = L.enableTranslateNote;

    toggleTranslate.addEventListener('change', () => {
        settings.showTranslateFeature = !!toggleTranslate.checked;
        saveFeatureSettings();
        // Toggle visibility of translation sub-options
        const subVisible = settings.showTranslateFeature ? '' : 'none';
        translationProfileLabel.style.display = subVisible || 'block';
        translationProfileSelect.style.display = subVisible;
        translationProfileNote.style.display = subVisible;
        translationTemplateLabel.style.display = subVisible || 'block';
        translationTemplateArea.style.display = subVisible;
        translationTemplateNote.style.display = subVisible;
    });

    const translationProfileLabel = document.createElement('label');
    translationProfileLabel.setAttribute('for', 'custom_preset_translation_profile');
    translationProfileLabel.innerHTML = `<strong>${L.translationProfile}</strong>`;
    translationProfileLabel.style.display = 'block';
    translationProfileLabel.style.marginBottom = '4px';

    const translationProfileSelect = document.createElement('select');
    translationProfileSelect.id = 'custom_preset_translation_profile';
    translationProfileSelect.className = 'text_pole';

    const translationProfileNote = document.createElement('small');
    translationProfileNote.className = 'notes';
    translationProfileNote.textContent = L.translationProfileNote;

    const translationTemplateLabel = document.createElement('label');
    translationTemplateLabel.setAttribute('for', 'custom_preset_translation_template');
    translationTemplateLabel.innerHTML = `<strong>${L.translationPromptTemplate}</strong>`;
    translationTemplateLabel.style.display = 'block';
    translationTemplateLabel.style.marginTop = '10px';
    translationTemplateLabel.style.marginBottom = '4px';

    const translationTemplateArea = document.createElement('textarea');
    translationTemplateArea.id = 'custom_preset_translation_template';
    translationTemplateArea.className = 'text_pole';
    translationTemplateArea.rows = 4;
    if (typeof settings.translationPromptTemplate !== 'string' || settings.translationPromptTemplate === '') {
        settings.translationPromptTemplate = L.translationDefault;
        saveFeatureSettings();
    }
    translationTemplateArea.value = settings.translationPromptTemplate;
    translationTemplateArea.addEventListener('input', () => {
        settings.translationPromptTemplate = translationTemplateArea.value;
        saveFeatureSettings();
    });

    const translationTemplateNote = document.createElement('small');
    translationTemplateNote.className = 'notes';
    translationTemplateNote.textContent = L.translationPromptTemplateNote;

    drawerContent.appendChild(row1);
    drawerContent.appendChild(note1);
    // drawerContent.appendChild(separator);
    drawerContent.appendChild(row2);
    drawerContent.appendChild(note2);
    drawerContent.appendChild(row3);
    drawerContent.appendChild(note3);
    drawerContent.appendChild(rowGroup);
    drawerContent.appendChild(noteGroup);
    drawerContent.appendChild(row4);
    drawerContent.appendChild(note4);
    drawerContent.appendChild(rowSearch);
    drawerContent.appendChild(noteSearch);
    drawerContent.appendChild(row5);
    drawerContent.appendChild(note5);
    drawerContent.appendChild(row6);
    drawerContent.appendChild(note6);
    drawerContent.appendChild(row7);
    drawerContent.appendChild(note7);
    drawerContent.appendChild(row8);
    drawerContent.appendChild(note8);
    drawerContent.appendChild(rowPreview);
    drawerContent.appendChild(notePreview);
    drawerContent.appendChild(keywordSeparator);
    drawerContent.appendChild(rowKeyword);
    drawerContent.appendChild(noteKeyword);
    drawerContent.appendChild(keywordSubBlock);
    drawerContent.appendChild(captureSeparator);
    drawerContent.appendChild(rowCapture);
    drawerContent.appendChild(noteCapture);
    drawerContent.appendChild(captureSubBlock);
    drawerContent.appendChild(translationSeparator);
    drawerContent.appendChild(row9);
    drawerContent.appendChild(note9);
    drawerContent.appendChild(translationProfileLabel);
    drawerContent.appendChild(translationProfileSelect);
    drawerContent.appendChild(translationProfileNote);
    drawerContent.appendChild(translationTemplateLabel);
    drawerContent.appendChild(translationTemplateArea);
    drawerContent.appendChild(translationTemplateNote);
    drawer.appendChild(drawerHeader);
    drawer.appendChild(drawerContent);
    container.appendChild(drawer);
    settingsRoot.appendChild(container);

    // Initialize Connection Profile dropdown
    try {
        const context = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        if (context?.ConnectionManagerRequestService) {
            context.ConnectionManagerRequestService.handleDropdown(
                '#custom_preset_translation_profile',
                settings.translationProfileId || '',
                (profile) => {
                    settings.translationProfileId = profile?.id ?? '';
                    saveFeatureSettings();
                },
            );
        }
    } catch (e) {
        console.warn('[CustomPreset] Connection Manager not available:', e);
    }

    // Initial visibility for translation sub-options
    const subVisible = settings.showTranslateFeature ? '' : 'none';
    translationProfileLabel.style.display = subVisible || 'block';
    translationProfileSelect.style.display = subVisible;
    translationProfileNote.style.display = subVisible;
    translationTemplateLabel.style.display = subVisible || 'block';
    translationTemplateArea.style.display = subVisible;
    translationTemplateNote.style.display = subVisible;
}

export function applyFeatureVisibility() {
    const settings = getFeatureSettings();
    const customizerBtn = document.getElementById('custom_preset_toggle_btn');
    const panel = document.getElementById('custom_preset_panel');

    if (customizerBtn) {
        customizerBtn.style.display = settings.showPresetCustomizerButton !== false ? '' : 'none';
    }

    if (settings.showPresetCustomizerButton === false && panel) {
        closeCustomizerPanel();
    }

    const quickBlock = document.getElementById('custom_preset_quick_toggle_block');
    if (quickBlock) {
        quickBlock.style.display = settings.showQuickPromptToggleFeature !== false ? '' : 'none';
    }

    const positionBlock = document.getElementById('custom_preset_position_block');
    if (positionBlock) {
        positionBlock.style.display = settings.showPromptPositionFeature !== false ? '' : 'none';
    }

    ensurePromptSearchControls();

    // 이 함수는 마지막에 renderQuickToggleButtons()를 부른다.
    // 키워드 쪽에서 예외가 나면 그 뒤가 전부 안 돌아 엉뚱한 기능이 사라지므로 격리한다.
    try {
        ensureKeywordTriggerControls();
        updateKeywordTriggerSummary();
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] keyword trigger UI failed`, e);
    }

    const togglePresetSection = document.getElementById('custom_preset_toggle_preset_section');
    if (togglePresetSection) {
        togglePresetSection.style.display = settings.showTogglePresetFeature !== false ? '' : 'none';
    }

    const toggleGroupSection = document.getElementById('custom_preset_toggle_group_section');
    if (toggleGroupSection) {
        toggleGroupSection.style.display = isQuickToggleGroupFeatureEnabled() ? '' : 'none';
    }

    const linkedPresetMenuItem = document.getElementById('custom_preset_linked_preset_menu_item');
    if (linkedPresetMenuItem) {
        linkedPresetMenuItem.style.display = settings.showLinkedPresetFeature !== false ? '' : 'none';
    }

    const promptPreviewMenuItem = document.getElementById('custom_preset_prompt_preview_menu_item');
    if (promptPreviewMenuItem) {
        promptPreviewMenuItem.style.display = settings.showPromptPreviewFeature !== false ? '' : 'none';
    }

    const promptInterceptMenuItem = document.getElementById('custom_preset_prompt_intercept_menu_item');
    if (promptInterceptMenuItem) {
        promptInterceptMenuItem.style.display = settings.showPromptPreviewFeature !== false ? '' : 'none';
    }

    ensurePromptManagerPreviewButton();
    applyCaptureFeatureState();

    if (settings.showQuickPromptToggleCollapseFeature === false && settings.quickPromptToggleBarCollapsed) {
        settings.quickPromptToggleBarCollapsed = false;
        saveFeatureSettings();
    }

    renderQuickToggleButtons();
}
