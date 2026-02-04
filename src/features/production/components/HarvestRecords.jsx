import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../../contexts/ModalContext';
import {
    Plus, Boxes, Calendar, User, History,
    Trash2, Edit2, Search, Filter, ClipboardCheck,
    Tag, Scale, Info
} from 'lucide-react';
import dayjs from 'dayjs';

const HarvestRecords = () => {
    const [records, setRecords] = useState([]);
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showAlert, showConfirm } = useModal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);

    const [formData, setFormData] = useState({
        harvest_id: 0,
        batch_id: null,
        harvest_date: dayjs().format('YYYY-MM-DD'),
        quantity: 0,
        unit: 'kg',
        grade: 'A',
        traceability_code: '',
        memo: ''
    });
    const [completeBatch, setCompleteBatch] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [recordsData, batchesData] = await Promise.all([
                invoke('get_harvest_records', { batchId: null }),
                invoke('get_production_batches')
            ]);
            setRecords(recordsData);
            setBatches(batchesData.filter(b => b.status === 'growing' || b.status === 'active' || b.status === 'completed'));
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleOpenModal = (record = null) => {
        if (record) {
            setEditingRecord(record);
            setFormData({ ...record });
            setCompleteBatch(false);
        } else {
            setEditingRecord(null);
            setFormData({
                harvest_id: 0,
                batch_id: null,
                harvest_date: dayjs().format('YYYY-MM-DD'),
                quantity: 0,
                unit: 'kg',
                grade: 'A',
                traceability_code: '',
                memo: ''
            });
            setCompleteBatch(false);
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.batch_id || !formData.quantity) {
            showAlert('알림', '배치와 수확량을 입력해주세요.');
            return;
        }

        try {
            await invoke('save_harvest_record', {
                record: {
                    ...formData,
                    batch_id: parseInt(formData.batch_id),
                    quantity: parseFloat(formData.quantity) || 0
                },
                completeBatch: completeBatch
            });
            setIsModalOpen(false);
            loadData();
            showAlert('성공', '수확 기록 및 재고 반영이 완료되었습니다.');
        } catch (err) {
            showAlert('오류', `저장 실패: ${err}`);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await showConfirm('삭제 확인', '이 수확 기록을 삭제하시겠습니까?');
        if (confirmed) {
            try {
                await invoke('delete_harvest_record', { harvestId: id });
                loadData();
            } catch (err) {
                showAlert('오류', `삭제 실패: ${err}`);
            }
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h3 className="text-xl font-black text-slate-700">수확 및 이력 관리</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">생산된 버섯의 수확량과 품질 등급을 관리합니다.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="h-12 px-6 bg-slate-900 border-none rounded-2xl font-black text-sm text-white flex items-center gap-2 shadow-xl shadow-slate-200 transition-all active:scale-[0.95] hover:bg-slate-800"
                >
                    <Plus size={18} /> 새 수확 기록
                </button>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">수확일</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">배치 코드</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">수확량</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">등급</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">이력번호</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {records.map(record => {
                                const batch = batches.find(b => b.batch_id === record.batch_id);
                                return (
                                    <tr key={record.harvest_id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                                                    <Calendar size={18} />
                                                </div>
                                                <p className="text-xs font-black text-slate-700">{dayjs(record.harvest_date).format('YYYY-MM-DD')}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 font-bold text-xs text-indigo-600">
                                            {batch?.batch_code || '-'}
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <Scale size={14} className="text-slate-300" />
                                                <p className="text-xs font-black text-slate-700">{record.quantity} {record.unit}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${record.grade === 'A' ? 'bg-teal-50 text-teal-600' :
                                                record.grade === 'B' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                                                }`}>
                                                {record.grade} 등급
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-xs text-slate-500 font-bold">
                                            {record.traceability_code || '-'}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => handleDelete(record.harvest_id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {records.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan="6" className="py-20 text-center">
                                        <Boxes size={48} className="mx-auto text-slate-100 mb-3" />
                                        <p className="text-slate-400 font-bold">수확 기록이 없습니다.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Harvest Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" onClick={() => setIsModalOpen(false)}></div>
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-50">
                            <h3 className="text-xl font-black text-slate-800">새 수확 기록 등록</h3>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수확 대상 배치</label>
                                <select
                                    value={formData.batch_id || ''}
                                    onChange={e => setFormData({ ...formData, batch_id: e.target.value })}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100"
                                >
                                    <option value="">배치 선택</option>
                                    {batches.map(b => (
                                        <option key={b.batch_id} value={b.batch_id}>
                                            [{b.batch_code}] {dayjs(b.start_date).format('MM/DD')} 시작분
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수확일</label>
                                    <input type="date" value={formData.harvest_date} onChange={e => setFormData({ ...formData, harvest_date: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">품질 등급</label>
                                    <select value={formData.grade} onChange={e => setFormData({ ...formData, grade: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100">
                                        <option value="A">A등급 (특상)</option>
                                        <option value="B">B등급 (보통)</option>
                                        <option value="C">C등급 (하)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수확량</label>
                                    <input type="number" step="0.1" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                                <div className="space-y-2 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">단위</label>
                                    <input type="text" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">이력추적 관리번호</label>
                                <div className="flex gap-2">
                                    <input type="text" value={formData.traceability_code} onChange={e => setFormData({ ...formData, traceability_code: e.target.value })} placeholder="예: GAP-2026-001" className="flex-1 h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                    <button className="px-3 bg-slate-100 rounded-2xl text-slate-500 hover:text-indigo-600"><Tag size={16} /></button>
                                </div>
                            </div>

                            <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black text-indigo-900">배치 생산 종료</p>
                                    <p className="text-[10px] text-indigo-500 font-bold">이 배치의 모든 수확이 완료되었습니까?</p>
                                </div>
                                <button
                                    onClick={() => setCompleteBatch(!completeBatch)}
                                    className={`w-12 h-6 rounded-full transition-all relative ${completeBatch ? 'bg-indigo-600' : 'bg-slate-200'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${completeBatch ? 'left-7' : 'left-1'}`}></div>
                                </button>
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">비고/메모</label>
                                <textarea
                                    value={formData.memo}
                                    onChange={e => setFormData({ ...formData, memo: e.target.value })}
                                    className="w-full h-24 p-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100 resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 flex gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-2xl font-black text-sm text-slate-400">취소</button>
                            <button onClick={handleSave} className="flex-1 h-12 bg-slate-900 rounded-2xl font-black text-sm text-white shadow-xl hover:bg-slate-800">수확 기록 저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HarvestRecords;
