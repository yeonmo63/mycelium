import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { callBridge as invoke } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import { Lock } from 'lucide-react';

const ExperienceProgram = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();
    const [programs, setPrograms] = useState([]);
    const [loading, setLoading] = useState(false);

    const [formData, setFormData] = useState({
        program_id: null,
        program_name: '',
        description: '',
        duration_minutes: 60,
        price_per_person: 0,
        max_participants: 10,
        is_active: true
    });

    const nameInputRef = useRef(null);

    const loadPrograms = useCallback(async () => {
        try {
            const data = await invoke('get_experience_programs');
            setPrograms(data);
        } catch (err) {
            console.error('Failed to load programs:', err);
        }
    }, []);

    const checkRunComp = useRef(false);
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

    useEffect(() => {
        if (isAuthorized) {
            loadPrograms();
        }
    }, [isAuthorized, loadPrograms]);

    const handleInputChange = (e) => {
        const { id, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [id]: type === 'checkbox' ? checked : value
        }));
    };

    const handlePriceChange = (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        setFormData(prev => ({ ...prev, price_per_person: parseInt(val || 0) }));
    };

    const handleEdit = (p) => {
        setFormData({
            program_id: p.program_id,
            program_name: p.program_name,
            description: p.description || '',
            duration_minutes: p.duration_minutes || 60,
            price_per_person: p.price_per_person || 0,
            max_participants: p.max_capacity || p.max_participants || 10,
            is_active: p.is_active
        });
        nameInputRef.current?.focus();
    };

    const handleReset = () => {
        setFormData({
            program_id: null,
            program_name: '',
            description: '',
            duration_minutes: 60,
            price_per_person: 0,
            max_participants: 10,
            is_active: true
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.program_name) {
            showAlert('프로그램 이름을 입력해주세요.');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                program_name: formData.program_name,
                description: formData.description || null,
                duration_min: parseInt(formData.duration_minutes || 0),
                price_per_person: parseInt(formData.price_per_person || 0),
                max_capacity: parseInt(formData.max_participants || 0),
                is_active: formData.is_active
            };

            if (formData.program_id) {
                await invoke('update_experience_program', {
                    program_id: formData.program_id, // include ID for update
                    ...payload
                });
                showAlert('수정되었습니다.');
            } else {
                await invoke('create_experience_program', payload);
                showAlert('등록되었습니다.');
            }
            handleReset();
            loadPrograms();
        } catch (err) {
            showAlert('저장 실패: ' + err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (await showConfirm('프로그램 삭제', '이 프로그램을 삭제하시겠습니까? 관련 예약 데이터가 있는 경우 삭제되지 않을 수 있습니다.')) {
            try {
                await invoke('delete_experience_program', { program_id: id });
                showAlert('삭제되었습니다.');
                loadPrograms();
            } catch (err) {
                showAlert('삭제 실패: ' + err);
            }
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
            {/* Local Modal Root */}
            <div id="local-modal-root" className="absolute inset-0 z-[9999] pointer-events-none" />

            {/* Top Navigation & Action Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-sky-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-sky-600 uppercase">Experience Configuration System</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            체험 프로그램 설정 <span className="text-slate-300 font-light ml-1 text-xl">Management</span>
                        </h1>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden bg-slate-50 px-6 lg:px-8 py-4 flex flex-col">
                <div className="flex-1 overflow-y-auto custom-gray-scrollbar p-1">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Program Form Section */}
                        <div className="lg:col-span-5 space-y-6 sticky top-0">
                            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200/50 overflow-hidden">
                                <div className="px-8 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                                    <h3 className="font-black text-slate-800 flex items-center gap-2">
                                        <span className="material-symbols-rounded text-sky-500">edit_note</span>
                                        {formData.program_id ? '프로그램 정보 수정' : '신규 프로그램 등록'}
                                    </h3>
                                    {formData.program_id && (
                                        <button onClick={handleReset} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all">신규 등록으로 전환</button>
                                    )}
                                </div>
                                <form onSubmit={handleSubmit} className="p-8 space-y-5">
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-500 uppercase ml-1 block">프로그램 명칭 <span className="text-rose-500">*</span></label>
                                            <input
                                                ref={nameInputRef}
                                                id="program_name"
                                                value={formData.program_name}
                                                onChange={handleInputChange}
                                                placeholder="예: 버섯 피자 만들기 체험"
                                                required
                                                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/30 font-bold text-slate-800 focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all text-sm"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-black text-slate-500 uppercase ml-1 block">소요 시간 (분)</label>
                                                <input
                                                    type="number"
                                                    id="duration_minutes"
                                                    value={formData.duration_minutes}
                                                    onChange={handleInputChange}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white font-black text-right text-slate-800 focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[11px] font-black text-slate-500 uppercase ml-1 block">최대 정원 (명)</label>
                                                <input
                                                    type="number"
                                                    id="max_participants"
                                                    value={formData.max_participants}
                                                    onChange={handleInputChange}
                                                    className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-white font-black text-right text-slate-800 focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all text-sm"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-500 uppercase ml-1 block">1인 체험 참가비</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">₩</span>
                                                <input
                                                    type="text"
                                                    id="price_per_person"
                                                    value={new Intl.NumberFormat('ko-KR').format(formData.price_per_person)}
                                                    onChange={handlePriceChange}
                                                    className="w-full h-12 pl-10 pr-4 rounded-xl border border-slate-200 bg-white font-black text-right text-indigo-600 focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all text-base shadow-inner"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black text-slate-500 uppercase ml-1 block">프로그램 설명</label>
                                            <textarea
                                                id="description"
                                                value={formData.description}
                                                onChange={handleInputChange}
                                                rows="3"
                                                placeholder="체험 내용 및 참고 사항"
                                                className="w-full p-4 rounded-2xl border border-slate-200 bg-white font-bold text-slate-700 focus:ring-4 focus:ring-sky-500/10 focus:border-sky-500 outline-none transition-all resize-none text-sm"
                                            />
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <label className={`flex-1 flex items-center justify-center gap-3 h-12 rounded-xl border transition-all cursor-pointer ${formData.is_active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                                <input
                                                    type="checkbox"
                                                    id="is_active"
                                                    checked={formData.is_active}
                                                    onChange={handleInputChange}
                                                    className="w-5 h-5 rounded-md text-emerald-600 border-slate-300 focus:ring-0"
                                                />
                                                <span className="text-xs font-black uppercase tracking-widest">현재 체험 운영 중</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-4 flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleReset}
                                            className="h-12 flex-1 bg-white text-slate-500 font-black rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-xs"
                                        >
                                            초기화
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="h-12 flex-[2] bg-sky-600 text-white font-black rounded-xl hover:bg-sky-500 shadow-xl shadow-sky-100 transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <span className="material-symbols-rounded">save</span>}
                                            {formData.program_id ? '수정 내용 저장' : '프로그램 등록하기'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Program List Section */}
                        <div className="lg:col-span-7 space-y-6 h-full">
                            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200/50 overflow-hidden h-full flex flex-col">
                                <div className="px-8 py-6 border-b border-slate-100">
                                    <h3 className="font-black text-slate-800 flex items-center gap-2">
                                        <span className="material-symbols-rounded text-sky-500">list</span>
                                        등록된 프로그램 목록
                                    </h3>
                                </div>
                                <div className="flex-1 overflow-auto custom-gray-scrollbar">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-slate-100">
                                            <tr className="bg-slate-50/50">
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">번호</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">프로그램</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">금액 / 시간</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">상태</th>
                                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {programs.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="px-6 py-24 text-center">
                                                        <p className="text-slate-300 font-black italic text-sm">등록된 프로그램이 없습니다.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                programs.map((p, idx) => (
                                                    <tr key={p.program_id} className="group hover:bg-slate-50/80 transition-all cursor-default">
                                                        <td className="px-6 py-5">
                                                            <span className="text-[10px] font-black text-slate-400">#{(idx + 1).toString().padStart(2, '0')}</span>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="font-black text-slate-800 text-sm mb-0.5">{p.program_name}</div>
                                                            <div className="text-[10px] font-bold text-slate-400 max-w-xs truncate">{p.description || '-'}</div>
                                                        </td>
                                                        <td className="px-6 py-5 text-right">
                                                            <div className="font-black text-indigo-700 text-sm">\{new Intl.NumberFormat('ko-KR').format(p.price_per_person)}</div>
                                                            <div className="text-[10px] font-bold text-slate-400">{p.duration_minutes}분 / {p.max_participants}인</div>
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${p.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                                {p.is_active ? '운영중' : '중단'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                <button
                                                                    onClick={() => handleEdit(p)}
                                                                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-all"
                                                                >
                                                                    <span className="material-symbols-rounded text-lg">edit_square</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDelete(p.program_id)}
                                                                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                                >
                                                                    <span className="material-symbols-rounded text-lg">delete</span>
                                                                </button>
                                                            </div>
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
            </div>
        </div>
    );
};

export default ExperienceProgram;
