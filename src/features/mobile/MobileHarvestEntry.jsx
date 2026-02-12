import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { Save, ArrowLeft, Package, Trash2, Scale, Info, CircleCheck, LayoutDashboard, ClipboardList, CirclePlus, Store, QrCode } from 'lucide-react';
import dayjs from 'dayjs';

const MobileHarvestEntry = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [formData, setFormData] = useState({
        harvest_id: 0,
        batch_id: null,
        harvest_date: dayjs().format('YYYY-MM-DD'),
        quantity: 0,
        defective_quantity: 0,
        loss_quantity: 0,
        unit: 'kg',
        grade: '특품',
        traceability_code: '',
        memo: '',
        package_count: 0,
        weight_per_package: 0,
        package_unit: 'kg'
    });

    const [isScanning, setIsScanning] = useState(false);

    const handleQrScan = () => {
        setIsScanning(true);
        // QR 스캔 시뮬레이션: 진행 중인 배치 중 하나를 랜덤하게 선택
        setTimeout(() => {
            setIsScanning(false);
            if (batches.length > 0) {
                const randomBatch = batches[Math.floor(Math.random() * batches.length)];
                setFormData(prev => ({ ...prev, batch_id: randomBatch.batch_id }));
            } else {
                showAlert("스캔 실패", "선택할 수 있는 활성 배치가 없습니다.");
            }
        }, 1200);
    };

    useEffect(() => {
        loadBatches();
    }, []);

    const loadBatches = async () => {
        try {
            const res = await callBridge('get_production_batches');
            // Filter only active batches if possible, or show all
            setBatches(res?.filter(b => b.status !== 'completed') || []);
        } catch (e) {
            console.error(e);
            showAlert("배치 로드 실패", "진행 중인 생산 배치 정보를 가져오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.batch_id) {
            showAlert("입력 확인", "수확할 생산 배치를 선택해 주세요.");
            return;
        }
        if (formData.quantity <= 0 && formData.defective_quantity <= 0) {
            showAlert("입력 확인", "수확 수량을 입력해 주세요.");
            return;
        }

        const confirmed = await showConfirm(
            "수확 기록 저장",
            "입력하신 수확 데이터를 저장하고 재고에 반영할까요?\n(정품 수량은 자동으로 완제품 재고에 합산됩니다.)"
        );

        if (!confirmed) return;

        try {
            const res = await callBridge('save_harvest_record', {
                record: {
                    ...formData,
                    quantity: parseFloat(formData.quantity),
                    defective_quantity: parseFloat(formData.defective_quantity),
                    loss_quantity: parseFloat(formData.loss_quantity),
                    harvest_date: formData.harvest_date
                },
                complete_batch: false // Default to false for mobile quick entry
            });

            if (res && res.success) {
                showAlert("저장 완료", "수확 기록이 성공적으로 저장되었습니다.");
                setFormData(prev => ({
                    ...prev,
                    quantity: 0,
                    defective_quantity: 0,
                    loss_quantity: 0,
                    memo: ''
                }));
            } else {
                throw new Error(res?.error || "Unknown error");
            }
        } catch (e) {
            console.error(e);
            showAlert("저장 실패", "기록 중 오류가 발생했습니다: " + e);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-24">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 p-4 pt-4 sticky top-0 z-50 flex items-center justify-between">
                <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400" onClick={() => window.history.back()}>
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-lg font-black text-slate-800">모바일 수확 입력</h1>
                <div className="w-10"></div>
            </div>

            <div className="p-4 space-y-4">
                {/* Batch Selection */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3 text-slate-800 font-black">
                            <Package size={18} className="text-indigo-500" />
                            <span>생산 배치 선택</span>
                        </div>
                        <button
                            onClick={handleQrScan}
                            disabled={isScanning}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-xs transition-all active:scale-95 ${isScanning ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}
                        >
                            {isScanning ? (
                                <>
                                    <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    <span>스캔 중...</span>
                                </>
                            ) : (
                                <>
                                    <QrCode size={14} />
                                    <span>QR 스캔</span>
                                </>
                            )}
                        </button>
                    </div>

                    <select
                        className="w-full h-14 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700"
                        value={formData.batch_id || ''}
                        onChange={(e) => setFormData({ ...formData, batch_id: e.target.value ? parseInt(e.target.value) : null })}
                    >
                        <option value="">배치를 선택하세요</option>
                        {batches.map(b => (
                            <option key={b.batch_id} value={b.batch_id}>{b.batch_code} ({b.status})</option>
                        ))}
                    </select>
                </div>

                {/* Main Quantity */}
                <div className="bg-indigo-600 rounded-[2.5rem] p-6 shadow-xl shadow-indigo-100 text-white space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Scale size={20} />
                            <span className="font-black text-lg">정품 수확량</span>
                        </div>
                        <div className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest">Main Stock</div>
                    </div>

                    <div className="flex items-end gap-3">
                        <input
                            type="number"
                            className="w-full bg-transparent border-b-2 border-white/30 focus:border-white text-4xl font-black text-white placeholder:text-white/30 outline-none pb-2"
                            placeholder="0.00"
                            value={formData.quantity || ''}
                            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        />
                        <span className="text-2xl font-black mb-2">kg</span>
                    </div>
                </div>

                {/* Sub Quantities */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2 text-rose-500 font-black text-xs">
                            <Info size={14} />
                            <span>비상품(파지)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                className="w-full bg-slate-50 border-none rounded-xl p-3 text-lg font-black text-slate-700"
                                placeholder="0"
                                value={formData.defective_quantity || ''}
                                onChange={(e) => setFormData({ ...formData, defective_quantity: e.target.value })}
                            />
                            <span className="font-bold text-slate-400">kg</span>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-3">
                        <div className="flex items-center gap-2 text-slate-400 font-black text-xs">
                            <Trash2 size={14} />
                            <span>현장 손실</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                className="w-full bg-slate-50 border-none rounded-xl p-3 text-lg font-black text-slate-700"
                                placeholder="0"
                                value={formData.loss_quantity || ''}
                                onChange={(e) => setFormData({ ...formData, loss_quantity: e.target.value })}
                            />
                            <span className="font-bold text-slate-400">kg</span>
                        </div>
                    </div>
                </div>

                {/* Grade & Memo */}
                <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
                    <div className="flex items-center gap-3 text-slate-800 font-black mb-2">
                        <CircleCheck size={18} className="text-indigo-500" />
                        <span>등급 및 기타 정보</span>
                    </div>

                    <div className="flex gap-2">
                        {['특품', '상품', '보통'].map(g => (
                            <button
                                key={g}
                                onClick={() => setFormData({ ...formData, grade: g })}
                                className={`flex-1 h-12 rounded-xl font-black text-sm transition-all ${formData.grade === g ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-slate-50 text-slate-400'}`}
                            >
                                {g}
                            </button>
                        ))}
                    </div>

                    <textarea
                        className="w-full min-h-[100px] bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-700 placeholder:text-slate-300 resize-none"
                        placeholder="특이사항이 있다면 기록해 주세요."
                        value={formData.memo}
                        onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                    />
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-4 pb-24 bg-white/80 backdrop-blur-xl border-t border-slate-100 z-40">
                <button
                    onClick={handleSave}
                    className="w-full h-14 bg-indigo-600 rounded-2xl text-white font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
                >
                    <Save size={20} />
                    수확 기록 저장하기
                </button>
            </div>

            {/* Bottom Tab Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around h-20 px-4 pb-4 z-50">
                <button onClick={() => navigate('/mobile-dashboard')} className="flex flex-col items-center gap-1 text-slate-400">
                    <LayoutDashboard size={24} />
                    <span className="text-[10px] font-black">현황판</span>
                </button>
                <button onClick={() => navigate('/mobile-event-sales')} className="flex flex-col items-center gap-1 text-slate-400">
                    <Store size={24} />
                    <span className="text-[10px] font-black">특판접수</span>
                </button>
                <button onClick={() => navigate('/mobile-worklog')} className="flex flex-col items-center gap-1 text-slate-400">
                    <ClipboardList size={24} />
                    <span className="text-[10px] font-black">작업일지</span>
                </button>
                <button onClick={() => navigate('/mobile-harvest')} className="flex flex-col items-center gap-1 text-indigo-600">
                    <CirclePlus size={24} />
                    <span className="text-[10px] font-black">수확입력</span>
                </button>
            </div>
        </div>
    );
};

export default MobileHarvestEntry;
