import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Users,
    UserPlus,
    Edit2,
    Trash2,
    Shield,
    X,
    CheckCircle2,
    Lock,
    Key
} from 'lucide-react';

const SettingsUser = () => {
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin } = useAdminGuard();

    // --- State Management ---
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'user'
    });

    // --- Admin Guard Check ---
    useEffect(() => {
        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) {
                window.history.back();
            }
        };
        init();
    }, []);

    // --- Data Loading ---
    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const list = await invoke('get_all_users');
            setUsers(list || []);
        } catch (err) {
            console.error("Failed to load users:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthorized) {
            loadUsers();
        }
    }, [isAuthorized, loadUsers]);

    // --- Handlers ---
    const openModal = (user = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                username: user.username,
                password: '', // Leave empty for editing
                role: user.role
            });
        } else {
            setEditingUser(null);
            setFormData({
                username: '',
                password: '',
                role: 'user'
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.username.trim()) {
            showAlert('필수 입력', '아이디를 입력해주세요.');
            return;
        }

        try {
            if (editingUser) {
                await invoke('update_user', {
                    id: editingUser.id,
                    username: formData.username,
                    password: formData.password || null,
                    role: formData.role
                });
            } else {
                if (!formData.password) {
                    showAlert('필수 입력', '비밀번호를 입력해주세요.');
                    return;
                }
                await invoke('create_user', {
                    username: formData.username,
                    password: formData.password,
                    role: formData.role
                });
            }

            closeModal();
            loadUsers();
        } catch (err) {
            showAlert('저장 실패', '오류가 발생했습니다: ' + err);
        }
    };

    const handleDelete = async (u) => {
        if (u.username === 'admin') {
            showAlert('삭제 불가', '관리자 계정은 삭제할 수 없습니다.');
            return;
        }
        if (!await showConfirm('삭제 확인', `[${u.username}] 계정을 정말 삭제하시겠습니까?`)) return;
        try {
            await invoke('delete_user', { id: u.id });
            loadUsers();
        } catch (err) {
            showAlert('삭제 실패', '오류가 발생했습니다: ' + err);
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
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Access Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            사용자 관리 <span className="text-slate-300 font-light ml-1 text-xl">User & Permissions</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-hidden">
                <div className="flex flex-col gap-6 h-full">

                    {/* Toolbar Card */}
                    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 p-6 ring-1 ring-slate-900/5 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Accounts</p>
                                <p className="text-xl font-black text-slate-700 tabular-nums">{users.length}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => openModal()}
                            className="h-12 px-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all active:scale-[0.98]"
                        >
                            <UserPlus size={20} /> 새 사용자 등록
                        </button>
                    </div>

                    {/* Table Card */}
                    <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 flex flex-col">
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md border-b border-slate-100">
                                    <tr>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-20">No.</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">사용자 ID</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">역할</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-48">생성일</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-32">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {users.map((u, idx) => (
                                        <tr key={u.id} className="group hover:bg-slate-50/50 transition-all">
                                            <td className="px-8 py-4 text-center text-xs font-black text-slate-300 group-hover:text-slate-400">{idx + 1}</td>
                                            <td className="px-6 py-4 font-black text-sm text-slate-700 flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${u.role === 'admin' ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-400'}`}>
                                                    {u.role === 'admin' ? <Shield size={16} /> : <Users size={16} />}
                                                </div>
                                                {u.username}
                                                {u.username === 'admin' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase">System</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border
                                                    ${u.role === 'admin' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-100'}
                                                `}>
                                                    {u.role === 'admin' ? '관리자' : '일반 사용자'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center text-xs font-bold text-slate-400 tabular-nums">
                                                {u.created_at ? u.created_at.substring(0, 10) : '-'}
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => openModal(u)}
                                                        className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm"
                                                    >
                                                        <Edit2 size={16} className="mx-auto" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(u)}
                                                        disabled={u.username === 'admin'}
                                                        className={`w-10 h-10 rounded-xl transition-all shadow-sm flex items-center justify-center
                                                            ${u.username === 'admin' ? 'bg-slate-50/50 text-slate-200 cursor-not-allowed' : 'bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600'}
                                                        `}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeModal}></div>
                    <div className="relative bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-slate-900/10">
                        {/* Modal Header */}
                        <div className="px-10 py-8 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-4 h-1 rounded-full bg-indigo-600"></span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                                        {editingUser ? 'Update User' : 'Create User'}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                                    {editingUser ? '계정 정보 수정' : '새 사용자 등록'}
                                </h3>
                            </div>
                            <button onClick={closeModal} className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-slate-600 transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSave} className="p-10 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2 text-left">User ID</label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    disabled={editingUser?.username === 'admin'}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 disabled:opacity-50"
                                    required
                                    autoFocus={!editingUser}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2 text-left">
                                    {editingUser ? 'New Password (Optional)' : 'Password'}
                                </label>
                                <div className="relative">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full h-12 pl-12 pr-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
                                        placeholder={editingUser ? "변경 시에만 입력" : "비밀번호 입력"}
                                        required={!editingUser}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2 text-left">Role</label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    disabled={editingUser?.username === 'admin'}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 disabled:opacity-50"
                                >
                                    <option value="user">일반 사용자 (User)</option>
                                    <option value="admin">관리자 (Admin)</option>
                                </select>
                            </div>

                            {/* Footer Buttons */}
                            <div className="pt-6 border-t border-slate-100 flex flex-col gap-3">
                                <button
                                    type="submit"
                                    className="h-12 w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={16} /> {editingUser ? '수정 사항 저장' : '등록 완료'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="h-12 w-full bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-all underline decoration-slate-200 underline-offset-4"
                                >
                                    취소하기
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsUser;
