import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const ModalContext = createContext();

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
    const [modals, setModals] = useState([]);

    const closeModal = useCallback((id) => {
        setModals(prev => prev.filter(m => m.id !== id));
    }, []);

    const [target, setTarget] = useState(null);

    // Helper to find the best modal root
    const findModalRoot = useCallback(() => {
        // Try to find the most specific root (perhaps the one deepest in the DOM or just the last one found)
        const roots = document.querySelectorAll('#local-modal-root');
        if (roots.length > 0) {
            // Pick the last one found, which is likely the one inside the current active component
            return roots[roots.length - 1];
        }
        return document.body;
    }, []);

    const showAlert = useCallback((title, message) => {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            setTarget(findModalRoot());
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
    }, [closeModal, findModalRoot]);

    const showConfirm = useCallback((title, message) => {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            setTarget(findModalRoot());
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
    }, [closeModal, findModalRoot]);

    const showChoice = useCallback((title, message, options = []) => {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            setTarget(findModalRoot());
            setModals(prev => [...prev, {
                id,
                type: 'choice',
                title,
                message,
                options, // e.g. [{ label: 'Yes', value: 'yes', primary: true }, { label: 'No', value: 'no' }]
                onSelect: (value) => {
                    resolve(value);
                    closeModal(id);
                }
            }]);
        });
    }, [closeModal, findModalRoot]);

    const promptAdminPassword = useCallback(() => {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            setTarget(findModalRoot());
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
    }, [closeModal, findModalRoot]);

    useEffect(() => {
        // Initial setup
        setTarget(findModalRoot());
    }, [findModalRoot]);

    const contextValue = React.useMemo(() => ({ showConfirm, showChoice, showAlert, promptAdminPassword }), [showConfirm, showChoice, showAlert, promptAdminPassword]);

    return (
        <ModalContext.Provider value={contextValue}>
            {children}
            {target && createPortal(
                <div id="modal-root">
                    {modals.map((modal, index) => (
                        <ModalItem key={modal.id} modal={modal} index={index} />
                    ))}
                </div>,
                target
            )}
        </ModalContext.Provider>
    );
};

const ModalItem = ({ modal, index }) => {
    const [password, setPassword] = useState('');
    const modalRef = React.useRef(null);

    // Focus Trap Logic
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key !== 'Tab') return;

            const focusableElements = modalRef.current.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleConfirm = () => {
        if (modal.type === 'password') {
            modal.onConfirm(password);
        } else {
            modal.onConfirm();
        }
    };

    return (
        <div className="absolute inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-auto">
            <div
                className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
                style={{ zIndex: 9999 + index }}
            />

            <div
                ref={modalRef}
                className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-in zoom-in-95 duration-200 slide-in-from-bottom-4"
                style={{ zIndex: 10000 + index }}
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[40px] rounded-full pointer-events-none"></div>

                <h3 className="text-xl font-bold text-white mb-2 relative z-10">{modal.title}</h3>
                <p className="text-slate-300 mb-6 leading-relaxed relative z-10 whitespace-pre-line break-all">{modal.message}</p>

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
                    {modal.type === 'choice' ? (
                        <div className="flex flex-wrap gap-2 justify-end w-full">
                            {modal.options.map((opt, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => modal.onSelect(opt.value)}
                                    className={`px-5 py-2.5 rounded-xl font-bold transition-all active:scale-[0.98] ${opt.primary
                                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:brightness-110'
                                        : opt.danger
                                            ? 'bg-rose-600/20 text-rose-500 border border-rose-500/50 hover:bg-rose-600 hover:text-white'
                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
