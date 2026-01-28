import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../contexts/ModalContext';

export const useAdminGuard = () => {
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const { promptAdminPassword, showAlert } = useModal();

    const checkAdmin = async () => {
        const password = await promptAdminPassword();
        if (password === null) {
            // Cancelled
            return false;
        }

        setIsVerifying(true);
        try {
            const isValid = await invoke('verify_admin_password', { password });
            if (isValid) {
                setIsAuthorized(true);
                return true;
            } else {
                await showAlert('인증 실패', '비밀번호가 올바르지 않습니다.');
                return false;
            }
        } catch (err) {
            await showAlert('오류', '인증 중 오류가 발생했습니다: ' + err);
            return false;
        } finally {
            setIsVerifying(false);
        }
    };

    const verifyPassword = async (password) => {
        setIsVerifying(true);
        try {
            const isValid = await invoke('verify_admin_password', { password });
            if (isValid) {
                setIsAuthorized(true);
                return true;
            }
            return false;
        } catch (err) {
            console.error(err);
            return false;
        } finally {
            setIsVerifying(false);
        }
    };

    return { isAuthorized, isVerifying, checkAdmin, verifyPassword };
};
