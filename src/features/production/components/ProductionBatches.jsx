import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../../contexts/ModalContext';
import {
    Plus, FlaskConical, Calendar, CheckCircle2, AlertCircle,
    ArrowRight, Tag, Boxes, Trash2, Edit2, Play, Square
} from 'lucide-react';
import dayjs from 'dayjs';

const ProductionBatches = () => {
    const [batches, setBatches] = useState([]);
    const [spaces, setSpaces] = useState([]);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showAlert, showConfirm } = useModal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBatch, setEditingBatch] = useState(null);

    const [formData, setFormData] = useState({
        batch_id: 0,
        batch_code: '',
        product_id: null,
        space_id: null,
        start_date: dayjs().format('YYYY-MM-DD'),
        expected_harvest_date: '',
        status: 'growing',
        initial_quantity: 0,
        unit: '개'
    });

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [batchesData, spacesData, productsData] = await Promise.all([
                invoke('get_production_batches'),
                invoke('get_production_spaces'),
                invoke('get_product_list')
            ]);
            setBatches(batchesData);
            setSpaces(spacesData);
            setProducts(productsData);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const generateCode = () => {
        const datePart = dayjs().format('YYMMDD');
        const randPart = Math.floor(Math.random() * 999).toString().padStart(3, '0');
        setFormData(prev => ({ ...prev, batch_code: `B-${datePart}-${randPart}` }));
    };

    const handleOpenModal = (batch = null) => {
        if (batch) {
            setEditingBatch(batch);
            setFormData({ ...batch });
        } else {
            setEditingBatch(null);
            setFormData({
                batch_id: 0,
                batch_code: '',
                product_id: null,
                space_id: null,
                start_date: dayjs().format('YYYY-MM-DD'),
                expected_harvest_date: '',
                status: 'growing',
                initial_quantity: 0,
                unit: '개'
            });
            setTimeout(() => generateCode(), 0);
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.batch_code || !formData.product_id) {
            showAlert('알림', '배치 코드와 대상 상품을 선택해주세요.');
            return;
        }

        try {
            await invoke('save_production_batch', {
                batch: {
                    ...formData,
                    product_id: parseInt(formData.product_id),
                    space_id: formData.space_id ? parseInt(formData.space_id) : null,
                    initial_quantity: parseFloat(formData.initial_quantity) || 0
                }
            });
            setIsModalOpen(false);
            loadData();
            showAlert('성공', '생산 배치가 등록되었습니다.');
        } catch (err) {
            showAlert('오류', `저장 실패: ${err}`);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h3 className="text-xl font-black text-slate-700">배치 및 작업 주기 관리</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">상품 생산의 시작과 끝(사이클)을 관리하고 이력을 추적합니다.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="h-12 px-6 bg-slate-900 border-none rounded-2xl font-black text-sm text-white flex items-center gap-2 shadow-xl shadow-slate-200 transition-all hover:bg-slate-800"
                >
                    <Plus size={18} /> 새 생산 주기 시작
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {batches.map(batch => {
                    const product = products.find(p => p.product_id === batch.product_id);
                    const space = spaces.find(s => s.space_id === batch.space_id);
                    return (
                        <div key={batch.batch_id} className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-6 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                    {batch.batch_code}
                                </div>
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${batch.status === 'growing' ? 'bg-teal-50 text-teal-600' : 'bg-slate-100 text-slate-500'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${batch.status === 'growing' ? 'bg-teal-500 animate-pulse' : 'bg-slate-400'}`}></div>
                                    {batch.status === 'growing' ? '성장 중' : '완료됨'}
                                </div>
                            </div>

                            <div className="flex-1">
                                <h4 className="text-lg font-black text-slate-700 mb-1">{product?.full_name || '상품 정보 없음'}</h4>
                                <p className="text-xs font-bold text-slate-400 mb-6 flex items-center gap-1">
                                    <Warehouse size={12} /> {space?.space_name || '미지정'}
                                </p>

                                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl mb-6">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">시작일</p>
                                        <p className="text-xs font-black text-slate-700">{dayjs(batch.start_date).format('YYYY.MM.DD')}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">수확예정</p>
                                        <p className="text-xs font-black text-slate-700">{batch.expected_harvest_date ? dayjs(batch.expected_harvest_date).format('MM.DD') : '-'}</p>
                                    </div>
                                    <div className="col-span-2 pt-2 border-t border-slate-200/50">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">투입 규모</p>
                                        <p className="text-xs font-black text-slate-700">{batch.initial_quantity} {batch.unit}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => handleOpenModal(batch)} className="flex-1 h-10 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 font-bold text-[11px] transition-colors"><Edit2 size={14} className="inline mr-1" /> 수정</button>
                                <button className="flex-1 h-10 bg-indigo-600 text-white rounded-xl font-black text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-500 transition-all"><Play size={14} className="inline mr-1" /> 작업 기록</button>
                            </div>
                        </div>
                    );
                })}

                {batches.length === 0 && !isLoading && (
                    <div className="col-span-full py-20 bg-white/50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center">
                        <FlaskConical size={48} className="text-slate-200 mb-4" />
                        <p className="text-slate-400 font-bold">진행 중인 생산 배치가 없습니다.</p>
                    </div>
                )}
            </div>

            {/* Batch Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)}></div>
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-50">
                            <h3 className="text-xl font-black text-slate-800">생산 주기 시작</h3>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">배치 코드</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={formData.batch_code} onChange={e => setFormData({ ...formData, batch_code: e.target.value })} className="flex-1 h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm ring-1 ring-slate-100" />
                                        <button onClick={generateCode} className="px-3 bg-slate-100 rounded-xl text-slate-500 hover:text-indigo-600"><Tag size={16} /></button>
                                    </div>
                                </div>
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">상태</label>
                                    <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm ring-1 ring-slate-100">
                                        <option value="growing">성장 중 (Active)</option>
                                        <option value="completed">완료 (Done)</option>
                                        <option value="failed">폐기 (Failed)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">최종 수확 예정 상품 (판매 품목)</label>
                                <select
                                    value={formData.product_id || ''}
                                    onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100"
                                >
                                    <option value="">상품 선택</option>
                                    {products
                                        .filter(p => p.item_type === '상품')
                                        .map(p => (
                                            <option key={p.product_id} value={p.product_id}>
                                                {p.product_name} {p.specification ? `(${p.specification})` : ''}
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">배정 시설</label>
                                <select
                                    value={formData.space_id || ''}
                                    onChange={e => setFormData({ ...formData, space_id: e.target.value || null })}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100"
                                >
                                    <option value="">시설 미배정</option>
                                    {spaces.map(s => <option key={s.space_id} value={s.space_id}>{s.space_name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">시작일</label>
                                    <input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수확 예정일</label>
                                    <input type="date" value={formData.expected_harvest_date} onChange={e => setFormData({ ...formData, expected_harvest_date: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">초기 투입량</label>
                                    <input type="number" value={formData.initial_quantity} onChange={e => setFormData({ ...formData, initial_quantity: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">단위</label>
                                    <input type="text" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} placeholder="개, kg, 판 등" className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 flex gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-2xl font-black text-sm text-slate-400">취소</button>
                            <button onClick={handleSave} className="flex-1 h-12 bg-slate-900 rounded-2xl font-black text-sm text-white shadow-xl hover:bg-slate-800">생산 주기 시작</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductionBatches;
