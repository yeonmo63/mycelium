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
 * Check if an error is an AI quota error
 * @param {Error|string} error 
 * @returns {boolean}
 */
export function isAIQuotaError(error) {
    const errorMsg = typeof error === 'string' ? error : error.message || String(error);
    return errorMsg.includes('AI_QUOTA_EXCEEDED');
}
