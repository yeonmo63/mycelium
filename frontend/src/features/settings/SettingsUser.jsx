import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
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
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    // --- State Management ---
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Form State (No Modal)
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'user'
    });

    const usernameInputRef = React.useRef(null);

    // --- Admin Guard Check ---
    const checkRunComp = React.useRef(false);
    useEffect(() => {
        if (checkRunComp.current) return;
        checkRunComp.current = true;

        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) {
                navigate('/');
            }
        };
        init();
    }, []);

    // --- Data Loading ---
    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const list = await callBridge('get_all_users');
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
    const handleEdit = (user) => {
        setEditingUser(user);
        setFormData({
            username: user.username,
            password: '', // Leave empty for editing
            role: user.role
        });
        usernameInputRef.current?.focus();
    };

    const handleReset = () => {
        setEditingUser(null);
        setFormData({
            username: '',
            password: '',
            role: 'user'
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.username.trim()) {
            showAlert('필수 입력', '아이디를 입력해주세요.');
            return;
        }

        try {
            if (editingUser) {
                await callBridge('update_user', {
                    id: editingUser.id,
                    username: formData.username,
                    password: formData.password || null,
                    role: formData.role
                });
                showAlert('수정 완료', '사용자 정보가 수정되었습니다.');
            } else {
                if (!formData.password) {
                    showAlert('필수 입력', '비밀번호를 입력해주세요.');
                    return;
                }
                await callBridge('create_user', {
                    username: formData.username,
                    password: formData.password,
                    role: formData.role
                });
                showAlert('등록 완료', '새로운 사용자가 등록되었습니다.');
            }

            handleReset(); // Reset form after save
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
            await callBridge('delete_user', { id: u.id });

            // If we deleted the user currently being edited, reset the form
            if (editingUser && editingUser.id === u.id) {
                handleReset();
            }

            loadUsers();
        } catch (err) {
            showAlert('삭제 실패', '오류가 발생했습니다: ' + err);
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
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700 relative">
            {/* Local Modal Root for scoped modals */}
            <div id="local-modal-root" className="absolute inset-0 z-[9999] pointer-events-none" />

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

            {/* Main Layout: 2 Columns */}
            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">

                    {/* LEFT COLUMN: Form (Sticky) */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 sticky top-0">
                            <div className="px-8 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="font-black text-slate-800 flex items-center gap-2">
                                    <span className="material-symbols-rounded text-indigo-500">manage_accounts</span>
                                    {editingUser ? '계정 정보 수정' : '새 사용자 등록'}
                                </h3>
                                {editingUser && (
                                    <button onClick={handleReset} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all">신규 등록으로 전환</button>
                                )}
                            </div>

                            <form onSubmit={handleSave} className="p-8 space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2 text-left">User ID</label>
                                    <input
                                        ref={usernameInputRef}
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        disabled={editingUser?.username === 'admin'}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200 disabled:opacity-50"
                                        placeholder="사용자 아이디 입력"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-2 text-left">
                                        {editingUser ? 'New Password (Optional)' : 'Password'}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="password"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-200"
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

                                <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
                                    <button
                                        type="submit"
                                        className="h-12 w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle2 size={16} /> {editingUser ? '수정 사항 저장' : '사용자 등록 완료'}
                                    </button>
                                    {editingUser && (
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            className="h-12 w-full bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-all"
                                        >
                                            취소하고 신규 등록
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: List */}
                    <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
                        {/* Toolbar / Header for List */}
                        <div className="bg-white rounded-t-[2rem] border-b border-slate-100 p-6 flex justify-between items-center z-10 sticky top-0 shadow-sm">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                    <Users size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registered Users</p>
                                    <p className="font-black text-slate-700">총 {users.length}명의 사용자</p>
                                </div>
                            </div>
                        </div>

                        {/* Table Container */}
                        <div className="flex-1 bg-white rounded-b-[2rem] shadow-xl shadow-slate-200/50 border border-t-0 border-slate-200 overflow-hidden ring-1 ring-slate-900/5 flex flex-col">
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-md border-b border-slate-100">
                                        <tr>
                                            <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[10%]">No.</th>
                                            <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[30%]">사용자 ID</th>
                                            <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[20%]">역할</th>
                                            <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[25%]">생성일</th>
                                            <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[15%]">관리</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {users.map((u, idx) => (
                                            <tr
                                                key={u.id}
                                                className={`group transition-all ${editingUser?.id === u.id ? 'bg-indigo-50/60' : 'hover:bg-slate-50/50'}`}
                                            >
                                                <td className="px-4 py-4 text-center text-xs font-black text-slate-300 group-hover:text-slate-400">{idx + 1}</td>
                                                <td className="px-4 py-4 font-black text-sm text-slate-700 flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${u.role === 'admin' ? 'bg-amber-50 text-amber-500' : 'bg-slate-50 text-slate-400'}`}>
                                                        {u.role === 'admin' ? <Shield size={16} /> : <Users size={16} />}
                                                    </div>
                                                    <span className="truncate">{u.username}</span>
                                                    {u.username === 'admin' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase whitespace-nowrap">System</span>}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border whitespace-nowrap
                                                        ${u.role === 'admin' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-100'}
                                                    `}>
                                                        {u.role === 'admin' ? '관리자' : '일반 사용자'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center text-xs font-bold text-slate-400 tabular-nums whitespace-nowrap">
                                                    {u.created_at ? u.created_at.substring(0, 10) : '-'}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleEdit(u)}
                                                            className={`w-10 h-10 rounded-xl transition-all shadow-sm flex items-center justify-center
                                                                ${editingUser?.id === u.id
                                                                    ? 'bg-indigo-600 text-white shadow-indigo-300'
                                                                    : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}
                                                            `}
                                                        >
                                                            <span className="material-symbols-rounded text-[20px]">edit</span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(u)}
                                                            disabled={u.username === 'admin'}
                                                            className={`w-10 h-10 rounded-xl transition-all shadow-sm flex items-center justify-center
                                                                ${u.username === 'admin' ? 'bg-slate-50/50 text-slate-200 cursor-not-allowed' : 'bg-slate-100 text-slate-500 hover:bg-rose-50 hover:text-rose-600'}
                                                            `}
                                                        >
                                                            <span className="material-symbols-rounded text-[20px]">delete</span>
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
            </div>
        </div>
    );
};

export default SettingsUser;
