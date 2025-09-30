import { extension_settings, renderExtensionTemplateAsync } from '../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types } from '../../../script.js';
import { callGenericPopup, POPUP_TYPE } from '../../popup.js';

const MODULE_NAME = 'prompt_manager_final';

// 기본 설정 구조 정의
const getDefaults = () => ({
    prompts: [], 
    global_presets: {},
});

// 전역 프리셋 드롭다운 메뉴를 업데이트하는 함수
function updateGlobalPresetDropdown() {
    const select = $('#pm_global_preset_select');
    const { global_presets } = extension_settings[MODULE_NAME];
    select.empty();
    select.append('<option value="">-- Select a Global Preset --</option>');
    for (const name in global_presets) {
        select.append(`<option value="${name}">${name}</option>`);
    }
}

// 모든 프롬프트 아이템의 템플릿 드롭다운을 업데이트하는 함수
function updateAllTemplateDropdowns() {
    const { prompts } = extension_settings[MODULE_NAME];
    $('.pm_prompt_item').each(function() {
        const item = $(this);
        const promptId = item.data('id');
        const select = item.find('.pm_template_select');
        const prompt = prompts.find(p => p.id == promptId);
        
        const currentValue = select.val();
        select.empty();
        select.append('<option value="">-- Select a template --</option>');

        if (prompt && prompt.templates) {
            for (const name in prompt.templates) {
                select.append(`<option value="${name}">${name}</option>`);
            }
        }
        select.val(currentValue);
    });
}

// 프롬프트 목록 UI를 렌더링하는 함수
function renderPromptList() {
    const container = $('#pm_prompt_list_container');
    const { prompts } = extension_settings[MODULE_NAME];
    
    container.empty();

    if (!prompts || prompts.length === 0) {
        container.append('<p class="pm_no_prompts">No prompts added. Click "Add Prompt" to start.</p>');
        return;
    }

    prompts.forEach(prompt => {
        const template = $('#pm_prompt_template').contents().clone();
        template.attr('data-id', prompt.id);
        template.find('.pm_prompt_enabled').prop('checked', prompt.enabled);
        template.find('.pm_prompt_text').val(prompt.text);
        template.find('.pm_prompt_position').val(prompt.position);
        template.find('.pm_prompt_depth').val(prompt.depth);
        
        const select = template.find('.pm_template_select');
        select.append('<option value="">-- Select a template --</option>');
        if (prompt.templates) {
            for (const name in prompt.templates) {
                select.append(`<option value="${name}">${name}</option>`);
            }
        }
        
        container.append(template);
    });
}

// 개별 프롬프트의 데이터를 설정에 저장하는 함수
function savePromptData(promptId, field, value) {
    const { prompts } = extension_settings[MODULE_NAME];
    const prompt = prompts.find(p => p.id == promptId);
    if (prompt) {
        prompt[field] = value;
        saveSettingsDebounced();
    }
}

jQuery(async function () {
    // 1. 설정 초기화
    extension_settings[MODULE_NAME] = Object.assign(getDefaults(), extension_settings[MODULE_NAME]);

    // 2. UI 불러오기
    const html = await renderExtensionTemplateAsync('prompt_manager_final', 'settings');
    $('#extensions_settings').append(html);

    // 3. 이벤트 리스너 연결
    // 전역 프리셋 이벤트 리스너
    $('#pm_global_save_button').on('click', async function() {
        const name = await callGenericPopup("Enter a name for the Global Preset:", POPUP_TYPE.INPUT);
        if (name === null || String(name).trim() === "") {
            toastr.info("Save cancelled.");
            return;
        }
        const trimmedName = String(name).trim();
        const currentState = {
            prompts: extension_settings[MODULE_NAME].prompts,
        };
        extension_settings[MODULE_NAME].global_presets[trimmedName] = JSON.parse(JSON.stringify(currentState));
        saveSettingsDebounced();
        updateGlobalPresetDropdown();
        toastr.success(`Global Preset "${trimmedName}" saved!`);
    });

    $('#pm_global_load_button').on('click', function() {
        const name = $('#pm_global_preset_select').val();
        if (!name) {
            toastr.warning('Please select a Global Preset to load.');
            return;
        }
        const loadedState = extension_settings[MODULE_NAME].global_presets[name];
        extension_settings[MODULE_NAME].prompts = JSON.parse(JSON.stringify(loadedState.prompts || []));
        saveSettingsDebounced();
        renderPromptList();
        toastr.success(`Global Preset "${name}" loaded!`);
    });

    $('#pm_global_delete_button').on('click', function() {
        const name = $('#pm_global_preset_select').val();
        if (!name) {
            toastr.warning('Please select a Global Preset to delete.');
            return;
        }
        if (confirm(`Are you sure you want to delete the Global Preset "${name}"?`)) {
            delete extension_settings[MODULE_NAME].global_presets[name];
            saveSettingsDebounced();
            updateGlobalPresetDropdown();
            toastr.info(`Global Preset "${name}" deleted.`);
        }
    });

    // 프롬프트 추가 버튼
    $('#pm_add_prompt_button').on('click', () => {
        extension_settings[MODULE_NAME].prompts.push({ 
            id: Date.now(), 
            text: '', 
            position: 'deep_system', 
            depth: 0, 
            enabled: true,
            templates: {},
        });
        renderPromptList();
    });
    
    const container = $('#pm_prompt_list_container');

    // 프롬프트 삭제
    container.on('click', '.pm_remove_prompt_button', function() {
        const promptId = $(this).closest('.pm_prompt_item').data('id');
        let { prompts } = extension_settings[MODULE_NAME];
        prompts = prompts.filter(p => p.id != promptId);
        extension_settings[MODULE_NAME].prompts = prompts;
        saveSettingsDebounced();
        renderPromptList();
    });

    // 프롬프트 내용 변경
    container.on('change input', '.pm_prompt_enabled, .pm_prompt_text, .pm_prompt_position, .pm_prompt_depth', function() {
        const element = $(this);
        const promptId = element.closest('.pm_prompt_item').data('id');
        const fieldMap = {'pm_prompt_enabled': { key: 'enabled', type: 'checkbox' },'pm_prompt_text': { key: 'text', type: 'value' },'pm_prompt_position': { key: 'position', type: 'value' },'pm_prompt_depth': { key: 'depth', type: 'number' }};
        for (const className in fieldMap) {
            if (element.hasClass(className)) {
                const { key, type } = fieldMap[className];
                let value = (type === 'checkbox') ? element.prop('checked') : (type === 'number') ? parseInt(element.val()) : element.val();
                savePromptData(promptId, key, value);
                break;
            }
        }
    });

    // 템플릿 저장
    container.on('click', '.pm_template_save_button', async function() {
        const item = $(this).closest('.pm_prompt_item');
        const promptId = item.data('id');
        const textToSave = item.find('.pm_prompt_text').val();
        if (!textToSave.trim()) {
            toastr.warning('There is no text to save.');
            return;
        }
        const name = await callGenericPopup("Enter template name:", POPUP_TYPE.INPUT);
        if (name === null || String(name).trim() === "") {
            toastr.info("Save cancelled.");
            return;
        }
        
        const trimmedName = String(name).trim();
        const prompt = extension_settings[MODULE_NAME].prompts.find(p => p.id == promptId);
        if (prompt) {
            if (!prompt.templates) prompt.templates = {};
            prompt.templates[trimmedName] = textToSave;
            saveSettingsDebounced();
            updateAllTemplateDropdowns();
            toastr.success(`Template "${trimmedName}" saved!`);
        }
    });
    
    // 템플릿 불러오기
    container.on('change', '.pm_template_select', function() {
        const item = $(this).closest('.pm_prompt_item');
        const promptId = item.data('id');
        const name = $(this).val();
        if (!name) return;
        
        const prompt = extension_settings[MODULE_NAME].prompts.find(p => p.id == promptId);
        if (prompt && prompt.templates) {
            const textToLoad = prompt.templates[name];
            const textArea = item.find('.pm_prompt_text');
            textArea.val(textToLoad);
            textArea.trigger('input');
            toastr.info(`Template "${name}" loaded!`);
        }
    });

    // 템플릿 삭제
    container.on('click', '.pm_template_delete_button', function() {
        const item = $(this).closest('.pm_prompt_item');
        const promptId = item.data('id');
        const name = item.find('.pm_template_select').val();
        if (!name) {
            toastr.warning('Please select a template to delete from the dropdown.');
            return;
        }
        
        const prompt = extension_settings[MODULE_NAME].prompts.find(p => p.id == promptId);
        if (prompt && prompt.templates) {
            if (confirm(`Are you sure you want to delete the template "${name}"?`)) {
                delete prompt.templates[name];
                saveSettingsDebounced();
                updateAllTemplateDropdowns();
                toastr.info(`Template "${name}" deleted.`);
            }
        }
    });
    
    // 4. 초기 상태 렌더링
    renderPromptList();
    updateGlobalPresetDropdown();
});

// AI 프롬프트 주입 로직
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async function (eventData) {
    try {
        const { prompts } = extension_settings[MODULE_NAME];
        // [오류 수정] 잘못 포함된 <strong> 태그 제거
        if (!prompts || prompts.length === 0) return;
        
        prompts.filter(p => p.enabled).forEach(prompt => {
            const getMessageRole = (position) => {
                switch (position) {
                    case 'deep_user': return 'user';
                    case 'deep_assistant': return 'assistant';
                    default: return 'system';
                }
            };
            const role = getMessageRole(prompt.position);
            const depth = prompt.depth || 0;
            // [오류 수정] 잘못 포함된 <strong> 태그 제거
            if (depth === 0) {
                eventData.chat.push({ role, content: prompt.text });
            } else {
                eventData.chat.splice(-depth, 0, { role, content: prompt.text });
            }
        });
    } catch (error) {
        console.error(`[${MODULE_NAME}] Error injecting prompts:`, error);
    }
});