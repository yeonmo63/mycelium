import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const ModalContext = createContext();

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
    const [modals, setModals] = useState([]);

    const closeModal = useCallback((id) => {
        setModals(prev => prev.filter(m => m.id !== id));
    }, []);

    const showAlert = useCallback((title, message) => {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            setModals(prev => [...prev, {
                id,
                type: 'alert',
                title,
                message,
                onConfirm: () => {
                    resolve(true);
                    closeModal(id);
                }
            }]);
        });
    }, [closeModal]);

    const showConfirm = useCallback((title, message) => {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            setModals(prev => [...prev, {
                id,
                type: 'confirm',
                title,
                message,
                onConfirm: () => {
                    resolve(true);
                    closeModal(id);
                },
                onCancel: () => {
                    resolve(false);
                    closeModal(id);
                }
            }]);
        });
    }, [closeModal]);

    const promptAdminPassword = useCallback(() => {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            setModals(prev => [...prev, {
                id,
                type: 'password',
                title: '관리자 인증',
                message: '관리자 비밀번호를 입력해주세요.',
                onConfirm: (pwd) => {
                    resolve(pwd);
                    closeModal(id);
                },
                onCancel: () => {
                    resolve(null);
                    closeModal(id);
                }
            }]);
        });
    }, [closeModal]);

    const contextValue = React.useMemo(() => ({ showConfirm, showAlert, promptAdminPassword }), [showConfirm, showAlert, promptAdminPassword]);

    return (
        <ModalContext.Provider value={contextValue}>
            {children}
            {createPortal(
                <div id="modal-root">
                    {modals.map((modal, index) => (
                        <ModalItem key={modal.id} modal={modal} index={index} />
                    ))}
                </div>,
                document.body
            )}
        </ModalContext.Provider>
    );
};

const ModalItem = ({ modal, index }) => {
    const [password, setPassword] = useState('');

    const handleConfirm = () => {
        if (modal.type === 'password') {
            modal.onConfirm(password);
        } else {
            modal.onConfirm();
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
                style={{ zIndex: 9999 + index }}
            />

            <div
                className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-200 slide-in-from-bottom-4"
                style={{ zIndex: 10000 + index }}
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[40px] rounded-full pointer-events-none"></div>

                <h3 className="text-xl font-bold text-white mb-2 relative z-10">{modal.title}</h3>
                <p className="text-slate-300 mb-6 leading-relaxed relative z-10 whitespace-pre-line">{modal.message}</p>

                {modal.type === 'password' && (
                    <div className="mb-8 relative z-10">
                        <input
                            type="password"
                            autoFocus
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirm();
                                if (e.key === 'Escape') modal.onCancel();
                            }}
                            className="w-full h-12 bg-slate-950 border border-slate-700 rounded-xl px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono tracking-widest"
                            placeholder="Password"
                        />
                    </div>
                )}

                <div className="flex gap-3 justify-end relative z-10">
                    {(modal.type === 'confirm' || modal.type === 'password') && (
                        <button
                            onClick={modal.onCancel}
                            className="px-5 py-2.5 rounded-xl text-slate-400 font-bold hover:bg-slate-800 hover:text-white transition-colors"
                        >
                            취소
                        </button>
                    )}
                    <button
                        onClick={handleConfirm}
                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-indigo-500/20 hover:brightness-110 active:scale-[0.98] transition-all"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
};
