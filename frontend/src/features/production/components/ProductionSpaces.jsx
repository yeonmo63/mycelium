import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../../contexts/ModalContext';
import { Plus, Edit2, Trash2, Warehouse, MapPin, Maximize2, FileText, CheckCircle, XCircle } from 'lucide-react';

const ProductionSpaces = () => {
    const [spaces, setSpaces] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showConfirm, showAlert } = useModal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSpace, setEditingSpace] = useState(null);

    const [formData, setFormData] = useState({
        space_name: '',
        space_type: 'cultivation', // cultivation, processing, storage, lab
        location_info: '',
        area_size: 0,
        area_unit: 'm2',
        is_active: true,
        memo: ''
    });

    const loadSpaces = async () => {
        setIsLoading(true);
        try {
            const data = await invoke('get_production_spaces');
            setSpaces(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSpaces();
    }, []);

    const handleOpenModal = (space = null) => {
        if (space) {
            setEditingSpace(space);
            setFormData({
                space_id: space.space_id,
                space_name: space.space_name,
                space_type: space.space_type || 'cultivation',
                location_info: space.location_info || '',
                area_size: space.area_size || 0,
                area_unit: space.area_unit || 'm2',
                is_active: space.is_active,
                memo: space.memo || ''
            });
        } else {
            setEditingSpace(null);
            setFormData({
                space_name: '',
                space_type: 'cultivation',
                location_info: '',
                area_size: 0,
                area_unit: 'm2',
                is_active: true,
                memo: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.space_name) {
            showAlert('알림', '시설/필지 이름을 입력해주세요.');
            return;
        }

        try {
            await invoke('save_production_space', {
                space: {
                    ...formData,
                    space_id: editingSpace ? editingSpace.space_id : 0,
                    area_size: parseFloat(formData.area_size) || 0
                }
            });
            setIsModalOpen(false);
            loadSpaces();
            showAlert('성공', '시설 정보가 저장되었습니다.');
        } catch (err) {
            showAlert('오류', `저장 실패: ${err}`);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await showConfirm('삭제 확인', '이 시설을 삭제하시겠습니까? 관련 데이터가 있을 경우 삭제되지 않을 수 있습니다.');
        if (confirmed) {
            try {
                await invoke('delete_production_space', { spaceId: id });
                loadSpaces();
            } catch (err) {
                showAlert('오류', `삭제 실패: ${err}`);
            }
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h3 className="text-xl font-black text-slate-700">시설 및 필지 목록</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">재배동, 저장고, 가공실 등 생산 공간을 관리합니다.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="h-12 px-6 bg-slate-900 border-none rounded-2xl font-black text-sm text-white flex items-center gap-2 shadow-xl shadow-slate-200 transition-all active:scale-[0.95] hover:bg-slate-800"
                >
                    <Plus size={18} /> 새 시설 등록
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {spaces.map(space => (
                    <div key={space.space_id} className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-6 group transition-all hover:translate-y-[-4px]">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <Warehouse size={24} />
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleOpenModal(space)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(space.space_id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-lg font-black text-slate-700">{space.space_name}</h4>
                                    {space.is_active ?
                                        <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 text-[9px] font-black uppercase">Active</span> :
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[9px] font-black uppercase">Inactive</span>
                                    }
                                </div>
                                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{space.space_type}</p>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
                                    <MapPin size={12} className="text-slate-300" />
                                    <span>{space.location_info || '위치 정보 없음'}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
                                    <Maximize2 size={12} className="text-slate-300" />
                                    <span>{space.area_size} {space.area_unit}</span>
                                </div>
                            </div>

                            {space.memo && (
                                <div className="p-3 bg-slate-50 rounded-xl">
                                    <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{space.memo}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {spaces.length === 0 && !isLoading && (
                    <div className="col-span-full py-20 bg-white/50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
                        <Warehouse size={48} className="text-slate-200 mb-4" />
                        <p className="text-slate-400 font-bold">등록된 생산 시설이 없습니다.</p>
                        <button onClick={() => handleOpenModal()} className="mt-4 text-indigo-600 font-black text-sm hover:underline">첫 시설 등록하기</button>
                    </div>
                )}
            </div>

            {/* Space Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"></div>
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-50">
                            <h3 className="text-xl font-black text-slate-800">{editingSpace ? '시설 정보 수정' : '새 시설 등록'}</h3>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">시설/필지 이름</label>
                                <input
                                    type="text"
                                    value={formData.space_name}
                                    onChange={e => setFormData({ ...formData, space_name: e.target.value })}
                                    placeholder="예: 제1동 재배실"
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-100"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">유형</label>
                                    <select
                                        value={formData.space_type}
                                        onChange={e => setFormData({ ...formData, space_type: e.target.value })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-100"
                                    >
                                        <option value="cultivation">재배/생산</option>
                                        <option value="processing">가공/포장</option>
                                        <option value="storage">저장/창고</option>
                                        <option value="lab">연구/배양</option>
                                        <option value="field">노지/필지</option>
                                    </select>
                                </div>
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">활성화</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setFormData({ ...formData, is_active: true })}
                                            className={`flex-1 h-12 rounded-2xl border-2 font-black text-xs transition-all ${formData.is_active ? 'bg-indigo-50 border-indigo-500 text-indigo-600' : 'bg-slate-50 border-transparent text-slate-400'}`}
                                        >사용 중</button>
                                        <button
                                            onClick={() => setFormData({ ...formData, is_active: false })}
                                            className={`flex-1 h-12 rounded-2xl border-2 font-black text-xs transition-all ${!formData.is_active ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-transparent text-slate-400'}`}
                                        >중단</button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">면적/규모</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={formData.area_size}
                                            onChange={e => setFormData({ ...formData, area_size: e.target.value })}
                                            className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-100"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">{formData.area_unit}</span>
                                    </div>
                                </div>
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">면적 단위</label>
                                    <select
                                        value={formData.area_unit}
                                        onChange={e => setFormData({ ...formData, area_unit: e.target.value })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-100"
                                    >
                                        <option value="m2">m² (제곱미터)</option>
                                        <option value="pyeong">평</option>
                                        <option value="shelf">단 (선반)</option>
                                        <option value="ha">ha (헥타르)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">상세 위치</label>
                                <input
                                    type="text"
                                    value={formData.location_info}
                                    onChange={e => setFormData({ ...formData, location_info: e.target.value })}
                                    placeholder="정확한 위치나 필지 번호"
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-100"
                                />
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">메모</label>
                                <textarea
                                    value={formData.memo}
                                    onChange={e => setFormData({ ...formData, memo: e.target.value })}
                                    className="w-full h-24 p-5 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all ring-1 ring-inset ring-slate-100 resize-none"
                                />
                            </div>
                        </div>
                        <div className="p-8 bg-slate-50 flex gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-2xl font-black text-sm text-slate-400 hover:text-slate-600 transition-colors">취소</button>
                            <button onClick={handleSave} className="flex-1 h-12 bg-slate-900 rounded-2xl font-black text-sm text-white shadow-xl shadow-indigo-100 transition-all active:scale-[0.95] hover:bg-slate-800">
                                {editingSpace ? '변경사항 저장' : '등록 완료'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductionSpaces;
