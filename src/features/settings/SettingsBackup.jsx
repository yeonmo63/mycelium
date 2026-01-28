import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Database,
    Download,
    Upload,
    Trash2,
    RefreshCcw,
    FolderOpen,
    AlertCircle,
    CheckCircle2,
    Lock,
    Clock,
    FileCode
} from 'lucide-react';

const SettingsBackup = () => {
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin } = useAdminGuard();

    // --- State Management ---
    const [backups, setBackups] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [extPath, setExtPath] = useState('');

    // --- Admin Guard Check ---
    useEffect(() => {
        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) window.history.back();
        };
        init();
    }, []);

    // --- Data Loading ---
    const loadBackups = useCallback(async () => {
        setIsLoading(true);
        try {
            const list = await invoke('get_auto_backups');
            setBackups(list || []);

            const path = await invoke('get_external_backup_path');
            setExtPath(path || '');
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

    // --- Handlers ---
    const handleManualBackup = async () => {
        setIsLoading(true);
        try {
            // Need a way to trigger manual backup. 
            // trigger_auto_backup only runs if DB_MODIFIED is true.
            // Let's assume we want to force it.
            // I'll call trigger_auto_backup but it might return "No changes".
            const res = await invoke('trigger_auto_backup');
            if (res === 'No changes') {
                await showAlert('알림', '변경된 내용이 없어 새로운 백업을 생성하지 않았습니다.');
            } else {
                await showAlert('백업 완료', '데이터베이스 백업이 성공적으로 완료되었습니다.');
                loadBackups();
            }
        } catch (err) {
            showAlert('백업 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestore = async (backup) => {
        if (!await showConfirm('데이터 복구', `[${backup.name}] 시점으로 데이터를 복구하시겠습니까?\n현재 데이터는 모두 삭제됩니다.`)) return;

        setIsLoading(true);
        try {
            const res = await invoke('restore_database_sql', { path: backup.path });
            await showAlert('복구 완료', res);
            // Application usually needs to restart or reload
            window.location.reload();
        } catch (err) {
            showAlert('복구 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (backup) => {
        if (!await showConfirm('백업 삭제', `[${backup.name}] 파일을 삭제하시겠습니까?`)) return;
        try {
            await invoke('delete_backup', { path: backup.path });
            loadBackups();
        } catch (err) {
            showAlert('삭제 실패', err);
        }
    };

    const handleSelectPath = async () => {
        const newPath = prompt('외부 백업 경로를 입력하세요 (예: C:\\Dropbox\\Backups):', extPath);
        if (newPath !== null && newPath.trim() !== '') {
            try {
                await invoke('save_external_backup_path', { path: newPath.trim() });
                setExtPath(newPath.trim());
                showAlert('설정 완료', '외부 백업 경로가 저장되었습니다.');
            } catch (err) {
                showAlert('오류', err);
            }
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    <Lock size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-400 font-bold">인증 대기 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-4">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Data Security</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            백업 및 복구 <span className="text-slate-300 font-light ml-1 text-xl">Backup & Restore</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">

                    {/* Sidebar: Controls */}
                    <div className="lg:col-span-1 space-y-6 overflow-auto custom-scrollbar pr-2">
                        {/* Manual Backup Card */}
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 p-8 ring-1 ring-slate-900/5 text-left">
                            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                                <Database size={24} />
                            </div>
                            <h2 className="text-xl font-black text-slate-700 mb-2">수동 백업 실행</h2>
                            <p className="text-xs font-bold text-slate-400 mb-8 leading-relaxed">
                                현재 시점의 데이터베이스 상태를 파일로 저장합니다. 중요한 작업 전후에 백업을 권장드립니다.
                            </p>
                            <button
                                onClick={handleManualBackup}
                                disabled={isLoading}
                                className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                                <Download size={20} /> 지금 즉시 백업하기
                            </button>
                        </div>

                        {/* External Path Card */}
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 p-8 ring-1 ring-slate-900/5 text-left">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                                <FolderOpen size={24} />
                            </div>
                            <h2 className="text-xl font-black text-slate-700 mb-2">외부 클라우드 백업</h2>
                            <p className="text-xs font-bold text-slate-400 mb-6 leading-relaxed">
                                Dropbox, Google Drive 등 클라우드 연동 폴더를 선택하면 자동 백업 시 해당 폴더에도 복사본이 저장됩니다.
                            </p>

                            <div className="space-y-4">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-[11px] font-bold text-slate-500 break-all min-h-[50px] flex items-center">
                                    {extPath || '지정된 경로가 없습니다'}
                                </div>
                                <button
                                    onClick={handleSelectPath}
                                    className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all"
                                >
                                    <FolderOpen size={16} /> 경로 변경하기
                                </button>
                            </div>
                        </div>

                        {/* Warning Info */}
                        <div className="p-6 bg-amber-50 rounded-[1.5rem] border border-amber-100 text-left">
                            <div className="flex items-center gap-2 mb-3 text-amber-600">
                                <AlertCircle size={18} />
                                <span className="text-xs font-black uppercase tracking-widest">Restore Warning</span>
                            </div>
                            <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                                데이터 복구(Restore) 기능을 사용하면 현재 등록된 모든 세부 데이터가 백업 파일의 내용으로 완전히 교체됩니다. 복구 전 반드시 현재 상태를 백업하시기 바랍니다.
                            </p>
                        </div>
                    </div>

                    {/* Main List: Backups */}
                    <div className="lg:col-span-2 bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 flex flex-col">
                        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                            <div className="flex items-center gap-3">
                                <Clock size={18} className="text-slate-400" />
                                <h3 className="text-base font-black text-slate-700 tracking-tight">백업 히스토리 (최근 30개 자동 보관)</h3>
                            </div>
                            <button
                                onClick={loadBackups}
                                className="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-all flex items-center justify-center"
                            >
                                <RefreshCcw size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar p-6">
                            <div className="grid grid-cols-1 gap-4">
                                {backups.length === 0 ? (
                                    <div className="py-32 text-center">
                                        <Database size={48} className="mx-auto text-slate-100 mb-4" />
                                        <p className="text-slate-300 font-bold">비어있는 백업 내역</p>
                                    </div>
                                ) : (
                                    backups.map((b) => (
                                        <div key={b.path} className="group p-5 bg-slate-50/50 hover:bg-white border border-transparent hover:border-slate-100 hover:shadow-lg hover:shadow-slate-100 rounded-2xl transition-all flex items-center justify-between text-left">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center
                                                    ${b.backup_type === '자동' ? 'bg-indigo-50 text-indigo-500' : 'bg-orange-50 text-orange-500'}
                                                `}>
                                                    <FileCode size={20} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-sm font-black text-slate-700 tracking-tight">{b.name}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase
                                                            ${b.backup_type === '자동' ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'}
                                                        `}>{b.backup_type}</span>
                                                    </div>
                                                    <p className="text-[11px] font-bold text-slate-400">{b.created_at}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleRestore(b)}
                                                    className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 font-black text-xs transition-all shadow-sm flex items-center gap-1.5"
                                                >
                                                    <Upload size={14} /> 복구하기
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(b)}
                                                    className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-rose-500 hover:bg-rose-50 transition-all shadow-sm flex items-center justify-center"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsBackup;
