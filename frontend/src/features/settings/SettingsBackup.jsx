import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { Lock } from 'lucide-react';

// --- Utilities ---
const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const calculateETA = (startTime, progress) => {
    if (!startTime || progress <= 0 || progress >= 100) return '계산 중...';
    const now = Date.now();
    const elapsed = now - startTime;
    const remaining = (elapsed / progress) * (100 - progress);

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    if (minutes > 0) return `${minutes}분 ${seconds}초`;
    return `${seconds}초`;
};

const SettingsBackup = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // --- State Management ---
    const [backups, setBackups] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [extPath, setExtPath] = useState('');
    const [internalPath, setInternalPath] = useState('');
    const [backupProgress, setBackupProgress] = useState({ progress: 0, message: '' });
    const [showProgress, setShowProgress] = useState(false);
    const [operationType, setOperationType] = useState('backup'); // 'backup' or 'restore'
    const [isIncremental, setIsIncremental] = useState(true);
    const [useCompression, setUseCompression] = useState(true);
    const [backupStatus, setBackupStatus] = useState(null);

    // --- Admin Guard Check ---
    const checkRunComp = React.useRef(false);
    useEffect(() => {
        if (checkRunComp.current) return;
        checkRunComp.current = true;

        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) navigate('/');
        };
        init();
    }, []);

    // --- Data Loading ---
    const loadBackups = useCallback(async () => {
        setIsLoading(true);
        try {
            const [list, path, internal, status] = await Promise.all([
                invoke('get_auto_backups'),
                invoke('get_external_backup_path'),
                invoke('get_internal_backup_path'),
                invoke('get_backup_status')
            ]);
            setBackups(list || []);
            setExtPath(path || '');
            setInternalPath(internal || '');
            setBackupStatus(status);

            // Default to Full if Friday, else Incremental
            if (status?.is_friday) {
                setIsIncremental(false);
            } else {
                setIsIncremental(true);
            }
        } catch (err) {
            console.error("Failed to load backups:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthorized) {
            loadBackups();
        }
    }, [isAuthorized, loadBackups]);

    const handleCancel = async () => {
        try {
            await invoke('cancel_backup_restore');
            setBackupProgress(prev => ({ ...prev, message: '중단 요청 중...' }));
        } catch (err) {
            console.error("Cancel failed:", err);
        }
    };

    // --- Navigation Guard ---
    // Prevent internal navigation (clicking menu, etc)
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            showProgress && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state === "blocked") {
            // No message, just reset to prevent navigation during active backup/restore
            blocker.reset();
        }
    }, [blocker]);

    // Prevent window close/refresh
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (showProgress) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [showProgress]);

    // --- Handlers ---

    // 1. Unified Managed Backup (Manual + Closing)
    const runManagedBackup = async () => {
        const typeStr = isIncremental ? '증분(변동분)' : '전체(스냅샷)';
        const ok = await showConfirm(
            '즉시 백업 및 마감',
            `현재 데이터를 즉시 백업하시겠습니까? (방식: ${typeStr})\n\n※ 로컬 비상 금고와 지정된 외부 저장소에 동시 저장됩니다.`
        );
        if (!ok) return;

        try {
            setIsLoading(true);
            setShowProgress(true);
            setOperationType('backup');
            setBackupProgress({ progress: 0, message: '백업 엔진 가동 중...', startTime: Date.now() });

            const unlisten = await listen('backup-progress', (event) => {
                setBackupProgress(prev => ({ ...event.payload, startTime: prev.startTime }));
            });

            try {
                const msg = await invoke('run_daily_custom_backup', {
                    isIncremental: isIncremental,
                    useCompression: useCompression
                });
                // Close progress before alert to avoid ghosting
                setShowProgress(false);
                setBackupProgress({ progress: 0, message: '' });

                await showAlert('백업 완료', msg);
                loadBackups();
            } finally {
                unlisten();
            }
        } catch (err) {
            showAlert('백업 실패', typeof err === 'string' ? err : err.message);
        } finally {
            setIsLoading(false);
            setShowProgress(false);
            setBackupProgress({ progress: 0, message: '' });
        }
    };

    // 2. Database Restore
    const handleDbRestore = async () => {
        const ok = await showConfirm(
            '데이터베이스 복구',
            '데이터베이스를 복구하시겠습니까?\n\n[주의] 전체 복구 시 현재 데이터가 모두 덮어씌워지며, 증분 복구 시 기존 데이터와 병합됩니다.\n진행하시겠습니까?'
        );
        if (!ok) return;

        try {
            const selected = await open({
                filters: [{ name: 'Backup File', extensions: ['json', 'gz'] }],
                multiple: false
            });

            if (!selected) return;

            setIsLoading(true);
            setShowProgress(true);
            setOperationType('restore');
            setBackupProgress({ progress: 0, message: '복구 준비 중...' });

            const unlisten = await listen('restore-progress', (event) => {
                setBackupProgress(event.payload);
            });

            try {
                const msg = await invoke('restore_database', { path: selected });

                // Wait a bit for the 100% progress to be visible
                await new Promise(resolve => setTimeout(resolve, 500));

                setShowProgress(false);
                setBackupProgress({ progress: 0, message: '' });

                // Show completion alert
                await showAlert('복구 완료', `${msg}\n\n확인을 누르면 애플리케이션이 재시작됩니다.`);

                // Reload after user confirms
                window.location.href = '/';
            } finally {
                unlisten();
            }
        } catch (err) {
            showAlert('복구 실패', typeof err === 'string' ? err : err.message);
            setIsLoading(false);
            setShowProgress(false);
            setBackupProgress({ progress: 0, message: '' });
        }
    };

    // 3. Database Maintenance (Optimization)
    const handleDbMaintenance = async () => {
        try {
            setIsLoading(true);
            setShowProgress(true);
            setOperationType('maintenance');
            setBackupProgress({ progress: 50, message: '데이터베이스 최적화 작업 중...' });

            const msg = await invoke('run_db_maintenance');
            await showAlert('최적화 완료', msg);
        } catch (err) {
            showAlert('최적화 실패', err);
        } finally {
            setIsLoading(false);
            setShowProgress(false);
            setBackupProgress({ progress: 0, message: '' });
        }
    };

    // 4. Log Cleanup
    const handleCleanupLogs = async (months) => {
        const monthsStr = months >= 12 ? `${Math.floor(months / 12)}년` : `${months}개월`;
        const ok = await showConfirm(
            '로그 데이터 정리',
            `${monthsStr} 이상 경과된 오래된 이력 데이터를 삭제하여 DB 용량을 최적화하시겠습니까?\n\n※ 삭제된 로그(변경 이력)는 복구할 수 없습니다.`
        );
        if (!ok) return;

        try {
            setIsLoading(true);
            const count = await invoke('cleanup_old_logs', { months });
            await showAlert('정리 완료', `${count}건의 오래된 로그가 성공적으로 정리되었습니다.`);
        } catch (err) {
            showAlert('정리 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 5. External Cloud Backup Path Selection
    const handleSelectExternalPath = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: '클라우드 동기화 폴더 선택'
            });

            if (selected) {
                await invoke('save_external_backup_path', { path: selected });
                setExtPath(selected);
                await showAlert('설정 완료', '클라우드 자동 백업 경로가 설정되었습니다.');
            }
        } catch (err) {
            showAlert('경로 선택 실패', err);
        }
    };

    // 5. Restore from Auto-Backup history
    const restoreAutoBackup = async (item) => {
        const ok = await showConfirm(
            '[긴급 복구]',
            `선택한 시점(${item.created_at})으로 시스템을 되돌리시겠습니까?\n\n※ 해당 시점 이후에 입력된 데이터는 모두 사라집니다.`
        );
        if (!ok) return;

        try {
            setIsLoading(true);
            setShowProgress(true);
            setOperationType('restore');
            setBackupProgress({ progress: 0, message: '복구 준비 중...' });

            const unlisten = await listen('restore-progress', (event) => {
                setBackupProgress(event.payload);
            });

            try {
                const msg = await invoke('restore_database', { path: item.path });
                await showAlert('복구 완료', msg);
                window.location.href = '/';
            } finally {
                unlisten();
            }
        } catch (err) {
            showAlert('복구 실패', typeof err === 'string' ? err : err.message);
        } finally {
            setIsLoading(false);
            setShowProgress(false);
            setBackupProgress({ progress: 0, message: '' });
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex h-full items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    {isVerifying ? (
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    ) : (
                        <Lock size={48} className="mx-auto text-slate-300 mb-4" />
                    )}
                    <p className="text-slate-400 font-bold">
                        {isVerifying ? '인증 확인 중...' : '인증 대기 중...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative text-left">
            {/* Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-10 pb-4">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Data Security & Recovery</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            데이터 백업 및 복구 <span className="text-slate-300 font-light ml-1 text-xl">Backup & Restore</span>
                        </h1>
                        <p className="text-sm text-slate-400 font-medium mt-1">시스템의 모든 운영 데이터를 안전하게 저장하고 복원합니다.</p>
                    </div>
                </div>
            </div>

            {/* Progress Overlay */}
            {showProgress && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[99999] flex items-center justify-center animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-[0_30px_70px_-15px_rgba(0,0,0,0.4)] p-10 w-[520px] max-w-[95%] border border-white/20 relative group overflow-hidden">
                        {/* Decorative background for progress modal */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl transition-all"></div>

                        {/* Progress State */}
                        <>
                            <div className="text-center mb-8">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${operationType === 'backup' ? 'bg-indigo-100' :
                                    operationType === 'restore' ? 'bg-purple-100' : 'bg-emerald-100'
                                    }`}>
                                    <span className={`material-symbols-rounded text-4xl animate-pulse ${operationType === 'backup' ? 'text-indigo-600' :
                                        operationType === 'restore' ? 'text-purple-600' : 'text-emerald-600'
                                        }`}>
                                        {operationType === 'backup' ? 'backup' :
                                            operationType === 'restore' ? 'restore' : 'architecture'}
                                    </span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">
                                    {operationType === 'backup' ? '데이터 백업 진행 중' :
                                        operationType === 'restore' ? '데이터 복구 진행 중' : '시스템 최적화 진행 중'}
                                </h3>
                                <p className="text-sm text-slate-500">{backupProgress.message}</p>
                            </div>

                            {/* Progress Bar */}
                            <div className="relative w-full h-3 bg-slate-200 rounded-full overflow-hidden mb-3">
                                <div
                                    className={`absolute top-0 left-0 h-full transition-all duration-300 ease-out ${operationType === 'backup' ? 'bg-gradient-to-r from-indigo-500 to-indigo-600' :
                                        operationType === 'restore' ? 'bg-gradient-to-r from-purple-500 to-purple-600' :
                                            'bg-gradient-to-r from-emerald-500 to-emerald-600'
                                        }`}
                                    style={{ width: `${backupProgress.progress}%` }}
                                />
                            </div>

                            {/* Percentage & ETA */}
                            <div className="text-center mb-8">
                                <span className={`text-4xl font-black ${operationType === 'backup' ? 'text-indigo-600' :
                                    operationType === 'restore' ? 'text-purple-600' : 'text-emerald-600'
                                    }`} style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {backupProgress.progress}%
                                </span>
                                <div className="flex flex-col gap-1 mt-3">
                                    {backupProgress.total > 0 && (
                                        <p className="text-[13px] text-slate-500 font-bold bg-slate-50 py-1.5 px-4 rounded-full inline-block mx-auto border border-slate-100">
                                            {operationType === 'restore'
                                                ? `${formatBytes(backupProgress.processed)} / ${formatBytes(backupProgress.total)}`
                                                : `${backupProgress.processed?.toLocaleString() || 0} / ${backupProgress.total?.toLocaleString() || 0} 레코드`
                                            }
                                        </p>
                                    )}
                                    {backupProgress.startTime && backupProgress.progress > 0 && backupProgress.progress < 100 && (
                                        <div className="flex items-center justify-center gap-1.5 text-indigo-500 mt-1">
                                            <span className="material-symbols-rounded text-sm">schedule</span>
                                            <span className="text-[12px] font-black uppercase tracking-wider">
                                                남은 시간: {calculateETA(backupProgress.startTime, backupProgress.progress)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Cancel Button */}
                            <div className="flex justify-center">
                                <button
                                    onClick={handleCancel}
                                    className="px-8 py-2.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl text-[13px] font-black transition-all border border-slate-200 hover:border-red-100 flex items-center gap-2 group"
                                >
                                    <span className="material-symbols-rounded text-lg group-hover:rotate-90 transition-transform">stop_circle</span>
                                    {operationType === 'backup' ? '백업 중단' : '복구 중단'}
                                </button>
                            </div>
                        </>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-y-auto custom-scrollbar">
                <div className="w-full space-y-8 pt-4">
                    {/* 1. Integrated Backup & Closing Section */}
                    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-3xl p-1 shadow-2xl overflow-hidden mb-8">
                        <div className="bg-white/5 backdrop-blur-sm rounded-[22px] p-8 flex flex-col lg:flex-row items-center justify-between gap-10">
                            <div className="flex-1 text-left">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                                        <span className="material-symbols-rounded text-white">bolt</span>
                                    </div>
                                    <h3 className="text-2xl font-black text-white tracking-tight">DB 백업 및 마감</h3>
                                </div>
                                <p className="text-indigo-200 text-sm font-medium leading-relaxed max-w-lg mb-8 opacity-80">
                                    수기로 저장 위치를 선택할 필요가 없습니다. <br />
                                    <strong>고객 변경 이력</strong> 및 <strong>최신 상품 스키마</strong>를 포함하여, <br />
                                    로컬 고속 저장소와 지정된 외부 저장소에 데이터를 즉시 동기화합니다.
                                </p>

                                <div className="flex flex-col gap-6">
                                    {/* Badges */}
                                    <div className="flex gap-3">
                                        <div className="px-3 py-1.5 bg-white/10 rounded-full flex items-center gap-2 border border-white/10">
                                            <span className="material-symbols-rounded text-emerald-400 text-[16px]">verified</span>
                                            <span className="text-white text-[10px] font-black uppercase tracking-wider">Safety Vault</span>
                                        </div>
                                        <div className="px-3 py-1.5 bg-white/10 rounded-full flex items-center gap-2 border border-white/10">
                                            <span className="material-symbols-rounded text-emerald-400 text-[16px]">verified</span>
                                            <span className="text-white text-[10px] font-black uppercase tracking-wider">Cloud Sync</span>
                                        </div>
                                    </div>

                                    {/* Path Info Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="material-symbols-rounded text-indigo-300 text-sm">database</span>
                                                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest leading-none">로컬 비상 금고</span>
                                            </div>
                                            <div className="text-indigo-100/70 text-[12px] font-mono break-all line-clamp-1">
                                                {internalPath || '경로 로딩 중...'}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="material-symbols-rounded text-emerald-300 text-sm">cloud_sync</span>
                                                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest leading-none">외부 동기화 클라우드</span>
                                            </div>
                                            <div className="text-emerald-50/70 text-[12px] font-mono break-all line-clamp-1">
                                                {extPath || '외부 경로 미설정'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-6 w-full lg:w-[380px]">
                                <div className="bg-white/10 p-5 rounded-2xl border border-white/10 shadow-inner">
                                    <div className="flex justify-between items-center mb-4 px-1">
                                        <span className="text-white font-bold text-sm tracking-tight opacity-90">백업 방식 선택</span>
                                        <span className="text-indigo-300 text-[10px] font-black uppercase tracking-widest">Strategy</span>
                                    </div>
                                    <div className="flex gap-4">
                                        <label className="flex-1 cursor-pointer group">
                                            <input type="radio" name="backupTypeManual" className="hidden peer" checked={!isIncremental} onChange={() => setIsIncremental(false)} />
                                            <div className="text-center p-3 rounded-xl border border-white/10 bg-white/5 peer-checked:bg-white peer-checked:text-indigo-950 peer-checked:border-white transition-all shadow-sm">
                                                <div className="text-[10px] font-black uppercase mb-1 opacity-50 tracking-tighter leading-tight">Full Snapshot</div>
                                                <div className="text-sm font-black text-inherit">전체 백업</div>
                                            </div>
                                        </label>
                                        <label className="flex-1 cursor-pointer group">
                                            <input type="radio" name="backupTypeManual" className="hidden peer" checked={isIncremental} onChange={() => setIsIncremental(true)} />
                                            <div className="text-center p-3 rounded-xl border border-white/10 bg-white/5 peer-checked:bg-white peer-checked:text-indigo-950 peer-checked:border-white transition-all shadow-sm">
                                                <div className="text-[10px] font-black uppercase mb-1 opacity-50 tracking-tighter leading-tight">Incremental Change</div>
                                                <div className="text-sm font-black text-inherit">증분 백업</div>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Compression Toggle */}
                                <div className="bg-white/10 p-5 rounded-2xl border border-white/10 shadow-inner -mt-2">
                                    <label className="flex items-center justify-between cursor-pointer group">
                                        <div className="flex flex-col text-left">
                                            <span className="text-white font-bold text-sm tracking-tight opacity-90">백업 압축 (Gzip)</span>
                                            <span className="text-indigo-300 text-[10px] font-black uppercase tracking-widest mt-1">파일 용량 대폭 절감</span>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={useCompression}
                                                onChange={() => setUseCompression(!useCompression)}
                                            />
                                            <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 shadow-inner"></div>
                                        </div>
                                    </label>
                                </div>

                                <button
                                    onClick={runManagedBackup}
                                    disabled={isLoading}
                                    className="h-20 bg-white text-indigo-950 font-black text-xl rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:shadow-indigo-500/20 hover:-translate-y-1 active:scale-[0.98] transition-all flex items-center justify-center gap-4 group disabled:opacity-50 disabled:translate-y-0"
                                >
                                    <span className="material-symbols-rounded text-3xl group-hover:rotate-12 transition-transform">cloud_upload</span>
                                    DB 백업 및 마감
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 2. Utility Grid: Restore & Maintenance */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="premium-card bg-white p-7 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-colors">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                    <span className="material-symbols-rounded text-[32px]">settings_backup_restore</span>
                                </div>
                                <div className="text-left">
                                    <h4 className="text-lg font-bold text-slate-800 tracking-tight">다른 데이터 복구</h4>
                                    <p className="text-[13px] text-slate-500 leading-tight">파일 선택을 통해 외부 백업을 불러옵니다.</p>
                                </div>
                            </div>
                            <button onClick={handleDbRestore} className="px-7 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-black transition-all">파일 선택</button>
                        </div>

                        <div className="premium-card bg-white p-7 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-colors">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                    <span className="material-symbols-rounded text-[32px]">architecture</span>
                                </div>
                                <div className="text-left">
                                    <h4 className="text-lg font-bold text-slate-800 tracking-tight">데이터베이스 최적화</h4>
                                    <p className="text-[13px] text-slate-500 leading-tight">시스템 속도 향상 및 불필요 공간 제거</p>
                                </div>
                            </div>
                            <button onClick={handleDbMaintenance} className="px-7 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-black transition-all">실행하기</button>
                        </div>

                        <div className="premium-card bg-white p-7 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-rose-200 transition-colors col-span-1 lg:col-span-2 xl:col-span-1">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
                                    <span className="material-symbols-rounded text-[32px]">history_toggle_off</span>
                                </div>
                                <div className="text-left">
                                    <h4 className="text-lg font-bold text-slate-800 tracking-tight">오래된 로그 정리</h4>
                                    <p className="text-[13px] text-slate-500 leading-tight">변경 이력 데이터(6개월 이상) 삭제</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleCleanupLogs(6)} className="px-4 py-3 bg-slate-50 hover:bg-rose-50 text-slate-600 rounded-xl text-[12px] font-black transition-all border border-slate-100">6개월</button>
                                <button onClick={() => handleCleanupLogs(12)} className="px-4 py-3 bg-slate-50 hover:bg-rose-600 text-slate-600 hover:text-white rounded-xl text-[12px] font-black transition-all border border-slate-100">1년</button>
                            </div>
                        </div>
                    </div>

                    {/* 3. Settings & History Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 items-stretch pt-4">
                        <div className="xl:col-span-2 flex flex-col gap-8">
                            {/* Path Config */}
                            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                                        <span className="material-symbols-rounded text-[28px]">folder_managed</span>
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-lg font-bold text-slate-800">외부 저장 경로 설정</h3>
                                        <p className="text-[13px] text-slate-500 italic">OneDrive, USB 등을 지정하세요.</p>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-4 mt-auto">
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 font-mono text-xs text-slate-500 break-all text-left min-h-[50px] flex items-center">
                                        {extPath || '설정된 외부 경로가 없습니다.'}
                                    </div>
                                    <button onClick={handleSelectExternalPath} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-100">
                                        <span className="material-symbols-rounded text-lg">drive_file_move</span>
                                        저장 위치 변경
                                    </button>
                                </div>
                            </div>

                            {/* Info Box */}
                            <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
                                <div className="relative flex gap-5">
                                    <span className="material-symbols-rounded text-indigo-400 text-3xl">verified_user</span>
                                    <div className="text-left">
                                        <h4 className="font-black text-indigo-100 text-lg mb-2 tracking-tight">최고 단계 보안 백업</h4>
                                        <p className="text-[12px] text-slate-400 font-medium leading-relaxed mb-4">
                                            저희 시스템은 단순 복사가 아닌, 전체 데이터 정합성을 검사한 후 <b>고객 로그 및 상품 전 정보를 포함</b>한 고압축 .gz 스냅샷을 생성합니다.
                                        </p>
                                        <div className="flex gap-4">
                                            <div className="text-[10px] text-indigo-300 font-black uppercase opacity-60">Gzip-JSON</div>
                                            <div className="text-[10px] text-indigo-300 font-black uppercase opacity-60">AES-Compatible</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* History Table */}
                        <div className="xl:col-span-3 bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                                        <span className="material-symbols-rounded text-[28px]">order_approve</span>
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-lg font-bold text-slate-800">최근 백업 이력</h3>
                                        <p className="text-[13px] text-slate-500">최근 90일간의 마감 기록이 보관됩니다.</p>
                                    </div>
                                </div>
                                <button onClick={loadBackups} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors">
                                    <span className={`material-symbols-rounded text-2xl ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
                                <table className="w-full border-collapse">
                                    <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-md z-[1]">
                                        <tr className="border-b border-slate-100">
                                            <th className="p-4 text-left font-black text-slate-500 text-[11px] uppercase tracking-widest">Type</th>
                                            <th className="p-4 text-left font-black text-slate-500 text-[11px] uppercase tracking-widest">Time</th>
                                            <th className="p-4 text-right font-black text-slate-500 text-[11px] uppercase tracking-widest">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {backups.length === 0 ? (
                                            <tr>
                                                <td colSpan="3" className="p-20 text-center text-slate-300 font-bold italic">백업 기록이 아직 없습니다.</td>
                                            </tr>
                                        ) : (
                                            backups.map((item) => (
                                                <tr key={item.path} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="p-4 text-left">
                                                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-tight ${item.backup_type === '일일' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                                            }`}>
                                                            {item.backup_type || '자동'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-left font-bold text-slate-600 text-sm">{item.created_at}</td>
                                                    <td className="p-4 text-right">
                                                        <button onClick={() => restoreAutoBackup(item)} className="px-5 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-lg text-xs font-black transition-all">복구</button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <style dangerouslySetInnerHTML={{
                    __html: `
                    .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
                `}} />
            </div>
        </div>
    );
};

export default SettingsBackup;
