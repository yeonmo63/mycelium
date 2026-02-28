// AI Error Handler Utility
// Detects AI quota exceeded errors and shows user-friendly modal

import { callBridge as invoke } from './apiBridge';

/**
 * Wrapper for AI-related invoke calls with quota error handling
 * @param {Function} modalShowAlert - showAlert function from ModalContext
 * @param {string} command - Tauri command name
 * @param {object} params - Command parameters
 * @returns {Promise} - Result from the command
 */
export async function invokeAI(modalShowAlert, command, params) {
    try {
        return await invoke(command, params);
    } catch (error) {
        const errorMsg = typeof error === 'string' ? error : error.message || String(error);

        // Check if this is a quota exceeded error
        if (errorMsg.includes('AI_QUOTA_EXCEEDED')) {
            // Extract the user-friendly message (after the prefix)
            const userMessage = errorMsg.replace('AI_QUOTA_EXCEEDED: ', '');

            await modalShowAlert(
                '🚫 AI 사용 한도 초과',
                userMessage
            );

            throw new Error('AI_QUOTA_EXCEEDED'); // Re-throw for caller to handle
        }

        // For other errors, just re-throw
        throw error;
    }
}

/**
 * Analyze CSV headers and mall types to provide AI-based format guidance
 * @param {string} selectedMallType - The mall type selected by the user
 * @param {string} csvText - First few lines of the uploaded CSV
 * @returns {Promise<string>} - AI guidance message
 */
export async function analyzeCSVError(selectedMallType, csvText) {
    const firstLine = csvText.split(/\r?\n/)[0];
    const prompt = `
당신은 커머스 데이터 통합 전문가입니다. 
사용자가 쇼핑몰 주문 데이터를 업로드했으나, 선택한 쇼핑몰 형식과 파일의 형식이 일치하지 않는 것 같습니다.

- 사용자가 선택한 쇼핑몰: ${selectedMallType}
- 업로드된 파일의 헤더(첫 줄): "${firstLine}"

파일의 헤더를 분석하여 다음 중 하나를 수행하세요:
1. 실제 어떤 쇼핑몰 양식인지 추측하세요 (네이버, 쿠팡, 사방넷, 플레이오토 등).
2. 선택한 쇼핑몰("${selectedMallType}")에 필요한 필수 헤더가 누락되었는지 확인하세요.
3. 사용자에게 어떻게 수정해야 하는지 구체적이고 친절하게 가이드하세요.

[응답 지침]
- 300자 이내의 짧고 명확한 답변만 제공하세요.
- 첫 문장은 "AI 분석 결과: ..."로 시작하세요.
- 마크다운(bold 등)을 적절히 섞어 가독성을 높이세요.
- 한국어로 작성하세요.
    `;

    try {
        const response = await invoke('call_gemini_ai', { prompt });
        return response || "죄송합니다. 파일 형식을 분석하는 중 오류가 발생했습니다. 수동으로 파일 양식을 확인해 주세요.";
    } catch (error) {
        console.error("AI Analysis failed:", error);
        return "파일 형식이 선택하신 '" + selectedMallType + "'과(와) 일치하지 않는 것으로 보입니다. 다른 쇼핑몰 양식을 선택해 보시겠습니까?";
    }
}

/**
 * Check if an error is an AI quota error
 * @param {Error|string} error 
 * @returns {boolean}
 */
export function isAIQuotaError(error) {
    const errorMsg = typeof error === 'string' ? error : error.message || String(error);
    return errorMsg.includes('AI_QUOTA_EXCEEDED');
}
