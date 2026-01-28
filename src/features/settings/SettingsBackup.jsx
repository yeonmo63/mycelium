import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { Lock } from 'lucide-react';

const SettingsBackup = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // --- State Management ---
    const [backups, setBackups] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [extPath, setExtPath] = useState('');

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

    // 1. Database Backup
    const handleDbBackup = async () => {
        try {
            const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const defaultName = `backup-${today}.json`;

            const savePath = await save({
                filters: [{ name: 'Backup File', extensions: ['json'] }],
                defaultPath: defaultName
            });

            if (!savePath) return;

            setIsLoading(true);
            const msg = await invoke('backup_database', { path: savePath });
            await showAlert('백업 완료', msg);
            loadBackups();
        } catch (err) {
            showAlert('백업 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 2. Database Restore
    const handleDbRestore = async () => {
        const ok = await showConfirm(
            '데이터베이스 복구',
            '데이터베이스를 복구하시겠습니까?\n\n[주의] 현재 데이터가 모두 덮어씌워질 수 있습니다.\n진행하시겠습니까?'
        );
        if (!ok) return;

        try {
            const selected = await open({
                filters: [{ name: 'Backup File', extensions: ['json'] }],
                multiple: false
            });

            if (!selected) return;

            setIsLoading(true);
            const msg = await invoke('restore_database', { path: selected });
            await showAlert('복구 완료', msg);
            window.location.reload();
        } catch (err) {
            showAlert('복구 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 3. Database Maintenance (Optimization)
    const handleDbMaintenance = async () => {
        try {
            setIsLoading(true);
            const msg = await invoke('run_db_maintenance');
            await showAlert('최적화 완료', msg);
        } catch (err) {
            showAlert('최적화 실패', err);
        } finally {
            setIsLoading(false);
        }
    };

    // 4. External Cloud Backup Path Selection
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

        setIsLoading(true);
        try {
            const msg = await invoke('restore_database', { path: item.path });
            await showAlert('복구 완료', msg);
            window.location.reload();
        } catch (err) {
            showAlert('복구 실패', err);
        } finally {
            setIsLoading(false);
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

            {/* Main Content */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-y-auto custom-scrollbar">
                <div className="w-full space-y-8">

                    {/* Top Tier: Ported mushroomfarm cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-2">
                        {/* Backup Card */}
                        <div className="premium-card bg-gradient-to-br from-white to-[#f8fafc] border-l-[5px] border-[#3b82f6] p-8 rounded-2xl shadow-lg hover:-translate-y-1 transition-all flex flex-col">
                            <div className="card-header-icon w-[60px] h-[60px] bg-[#eff6ff] text-[#3b82f6] rounded-xl flex items-center justify-center mb-5">
                                <span className="material-symbols-rounded text-[32px]">save</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">데이터베이스 백업</h3>
                            <p className="text-[13px] text-slate-500 leading-relaxed mb-8 flex-1">
                                현재 운영 중인 모든 데이터(고객, 판매, 상품 등)를 안전하게 <strong>백업 파일</strong>로 내보냅니다.
                            </p>
                            <button onClick={handleDbBackup} className="w-full h-[52px] rounded-xl text-white font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-[#3b82f6] to-[#2563eb] shadow-[0_4px_6px_-1px_rgba(59,130,246,0.5)] active:scale-95 transition-transform">
                                <span className="material-symbols-rounded text-lg">download</span>
                                백업 파일 다운로드
                            </button>
                        </div>

                        {/* Restore Card */}
                        <div className="premium-card bg-gradient-to-br from-white to-[#f8fafc] border-l-[5px] border-[#8b5cf6] p-8 rounded-2xl shadow-lg hover:-translate-y-1 transition-all flex flex-col">
                            <div className="card-header-icon w-[60px] h-[60px] bg-[#f5f3ff] text-[#8b5cf6] rounded-xl flex items-center justify-center mb-5">
                                <span className="material-symbols-rounded text-[32px]">restore</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">데이터베이스 복구</h3>
                            <p className="text-[13px] text-slate-500 leading-relaxed mb-8 flex-1">
                                이전에 저장된 <strong>백업 파일</strong>을 불러와 시스템 상태를 해당 시점으로 되돌립니다.
                            </p>
                            <button onClick={handleDbRestore} className="w-full h-[52px] rounded-xl text-white font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] shadow-[0_4px_6px_-1px_rgba(139,92,246,0.5)] active:scale-95 transition-transform">
                                <span className="material-symbols-rounded text-lg">upload</span>
                                백업 파일 불러오기
                            </button>
                        </div>

                        {/* Maintenance Card */}
                        <div className="premium-card bg-gradient-to-br from-white to-[#f8fafc] border-l-[5px] border-[#10b981] p-8 rounded-2xl shadow-lg hover:-translate-y-1 transition-all flex flex-col">
                            <div className="card-header-icon w-[60px] h-[60px] bg-[#ecfdf5] text-[#10b981] rounded-xl flex items-center justify-center mb-5">
                                <span className="material-symbols-rounded text-[32px]">cleaning_services</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">DB 건강검진 (최적화)</h3>
                            <p className="text-[13px] text-slate-500 leading-relaxed mb-8 flex-1">
                                데이터베이스의 불필요한 공간을 정리하고 통계 정보를 갱신하여 검색 속도를 향상시킵니다.
                            </p>
                            <button onClick={handleDbMaintenance} className="w-full h-[52px] rounded-xl text-white font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-[#10b981] to-[#059669] shadow-[0_4px_6px_-1px_rgba(16,185,129,0.5)] active:scale-95 transition-transform">
                                <span className="material-symbols-rounded text-lg">medical_services</span>
                                건강검진 실행
                            </button>
                        </div>
                    </div>

                    {/* Second Tier: Settings & History with Aligned Heights */}
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-stretch">

                        {/* Left Column: Cloud Config & Tips */}
                        <div className="xl:col-span-2 flex flex-col gap-6">
                            <div className="premium-card bg-white border-l-[5px] border-[#0ea5e9] p-8 rounded-2xl shadow-lg flex-1">
                                <div className="flex items-center gap-4 mb-5">
                                    <div className="w-12 h-12 bg-[#f0f9ff] text-[#0ea5e9] rounded-xl flex items-center justify-center">
                                        <span className="material-symbols-rounded text-[28px]">cloud_sync</span>
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-lg font-bold text-slate-800">클라우드 자동 백업 설정</h3>
                                        <p className="text-[13px] text-slate-500">OneDrive, Google Drive 등을 이용한 자동 복사</p>
                                    </div>
                                </div>

                                <div className="bg-[#f8fafc] p-6 rounded-xl border border-[#e2e8f0]">
                                    <label className="block mb-2 font-bold text-[#334155] text-sm tracking-tight text-left">추가 백업 저장소 경로 (클라우드 동기화 폴더)</label>
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            readOnly
                                            className="flex-1 h-12 px-4 rounded-lg bg-white border border-[#cbd5e1] text-sm text-slate-600 font-medium"
                                            placeholder="경로를 선택해주세요"
                                            value={extPath}
                                        />
                                        <button onClick={handleSelectExternalPath} className="px-6 h-12 bg-white border border-[#cbd5e1] hover:border-[#3b82f6] hover:text-[#3b82f6] font-bold rounded-lg text-sm flex items-center gap-1.5 transition-all text-slate-600 whitespace-nowrap">
                                            <span className="material-symbols-rounded text-xl">folder_open</span> 폴더 선택
                                        </button>
                                    </div>
                                    <p className="mt-3 text-xs text-slate-400 font-medium text-left">※ 설정 시 앱 종료 시점의 자동 백업 파일이 이 폴더에도 복사됩니다.</p>
                                </div>
                            </div>

                            {/* Help Box */}
                            <div className="bg-slate-800 rounded-2xl p-7 text-white text-left relative overflow-hidden shadow-lg border-l-[5px] border-indigo-400">
                                <div className="flex gap-4">
                                    <span className="material-symbols-rounded text-indigo-400 text-[24px]">info</span>
                                    <div>
                                        <h4 className="font-bold text-slate-100 mb-2">백업 도움말</h4>
                                        <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4 font-medium">
                                            <li>백업 파일은 .json 형식으로 저장됩니다.</li>
                                            <li>복구 시 현재 데이터가 모두 사라지니 주의하세요.</li>
                                            <li>최근 30개의 목록이 내부에 자동 유지됩니다.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: History Table Card */}
                        <div className="xl:col-span-3 bg-white border-l-[5px] border-[#f59e0b] rounded-2xl shadow-lg flex flex-col overflow-hidden">
                            <div className="p-8 pb-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-[#fffbeb] text-[#f59e0b] rounded-xl flex items-center justify-center">
                                        <span className="material-symbols-rounded text-[28px]">history</span>
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-lg font-bold text-slate-800">최근 자동 백업 목록 (재해 복구용)</h3>
                                        <p className="text-[13px] text-slate-500">
                                            사고 발생 시 가장 최근 시점으로 복구하세요.
                                            <button onClick={loadBackups} className="ml-1.5 align-middle" title="목록 새로고침">
                                                <span className={`material-symbols-rounded text-[18px] text-[#3b82f6] ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
                                            </button>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar mx-8 mb-8 border border-[#e2e8f0] rounded-xl">
                                <table className="w-full border-collapse">
                                    <thead className="sticky top-0 bg-[#f8fafc] z-[1]">
                                        <tr className="border-b border-[#e2e8f0]">
                                            <th className="p-4 text-left font-bold text-[#64748b] text-sm">백업 시간</th>
                                            <th className="p-4 text-left font-bold text-[#64748b] text-sm">파일명</th>
                                            <th className="p-4 text-right font-bold text-[#64748b] text-sm">작업</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#e2e8f0]">
                                        {backups.length === 0 ? (
                                            <tr>
                                                <td colSpan="3" className="p-10 text-center text-slate-400 font-bold italic">
                                                    {isLoading ? '불러오는 중...' : '생성된 자동 백업이 없습니다.'}
                                                </td>
                                            </tr>
                                        ) : (
                                            backups.map((item) => (
                                                <tr key={item.path} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-4 text-left text-[#334155] font-semibold text-sm">
                                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${item.backup_type === '일일' ? 'bg-[#ccfbf1] text-[#0f766e]' : 'bg-[#fef3c7] text-[#d97706]'
                                                            }`}>
                                                            {item.backup_type || '자동'}
                                                        </span>
                                                        <span className="ml-2 whitespace-nowrap">{item.created_at}</span>
                                                    </td>
                                                    <td className="p-4 text-left text-[#64748b] text-[13px] break-all">{item.name}</td>
                                                    <td className="p-4 text-right">
                                                        <button onClick={() => restoreAutoBackup(item)} className="px-4 py-1.5 bg-[#f59e0b] hover:bg-[#d97706] text-white rounded-lg text-[13px] font-bold flex items-center gap-1 ml-auto shadow-sm whitespace-nowrap transition-colors">
                                                            <span className="material-symbols-rounded text-base">restore</span>복구
                                                        </button>
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
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            `}</style>
        </div>
    );
};

export default SettingsBackup;
