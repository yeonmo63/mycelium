import React, { useState, useEffect } from 'react';
import { useModal } from '../../../contexts/ModalContext';
import {
    Plus, FlaskConical, Calendar, CheckCircle2, AlertCircle,
    ArrowRight, Tag, Boxes, Trash2, Edit2, Play, Square, Warehouse, Activity, ClipboardList, Search, Droplets, Thermometer
} from 'lucide-react';
import dayjs from 'dayjs';
import { QRCodeSVG } from 'qrcode.react';
import { printLabel } from './LabelPrinter';

const ProductionBatches = () => {
    const [batches, setBatches] = useState([]);
    const [spaces, setSpaces] = useState([]);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showAlert, showConfirm } = useModal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBatch, setEditingBatch] = useState(null);
    const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);
    const [printJob, setPrintJob] = useState(null);
    const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
    const [selectedBatchForLog, setSelectedBatchForLog] = useState(null);

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
            const [resBatches, resSpaces, resProducts] = await Promise.all([
                fetch('/api/production/batches'),
                fetch('/api/production/spaces'),
                fetch('/api/product/list')
            ]);

            const batchesData = await resBatches.json();
            const spacesData = await resSpaces.json();
            const productsData = await resProducts.json();
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
            const res = await fetch('/api/production/batches/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    product_id: parseInt(formData.product_id),
                    space_id: formData.space_id ? parseInt(formData.space_id) : null,
                    initial_quantity: parseFloat(formData.initial_quantity) || 0
                })
            });
            if (!res.ok) throw new Error("Failed to save batch");
            setIsModalOpen(false);
            loadData();
            showAlert('성공', '생산 배치가 등록되었습니다.');
        } catch (err) {
            showAlert('오류', `저장 실패: ${err}`);
        }
    };

    const handlePrint = (batch) => {
        const product = products.find(p => p.product_id === batch.product_id);
        const space = spaces.find(s => s.space_id === batch.space_id);

        const jobData = {
            title: product?.product_name || '미지정 상품',
            code: batch.batch_code,
            date: dayjs(batch.start_date).format('YYYY.MM.DD'),
            location: space?.space_name || '시설 미지정',
            qrValue: `BATCH|${batch.batch_id}|${batch.batch_code}|${product?.product_name || 'NA'}|${space?.space_name || 'NA'}`
        };

        setPrintJob(jobData);
        setIsPrintPreviewOpen(true);
    };

    const executePrint = () => {
        if (printJob) {
            printLabel('batch', printJob);
            setIsPrintPreviewOpen(false);
        }
    };

    const handleQuickLog = (batch) => {
        setSelectedBatchForLog(batch);
        setIsQuickLogOpen(true);
    };

    // saveQuickLog is now inside QuickLogModal component for better isolation

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
                                <h4 className="text-lg font-black text-slate-700 mb-1">{product?.product_name || '상품 정보 없음'}</h4>
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
                                <button
                                    onClick={() => handlePrint(batch)}
                                    className="h-10 w-10 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors flex items-center justify-center"
                                    title="배치 라벨 인쇄"
                                >
                                    <span className="material-symbols-rounded text-[20px]">qr_code</span>
                                </button>
                                <button
                                    onClick={() => handleQuickLog(batch)}
                                    className="flex-1 h-10 bg-indigo-600 text-white rounded-xl font-black text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-500 transition-all"
                                >
                                    <Play size={14} className="inline mr-1" /> 작업 기록
                                </button>
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

            {/* QR Print Preview Modal */}
            {isPrintPreviewOpen && printJob && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"></div>
                    <div className="bg-white w-full max-w-sm rounded-[3rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 flex flex-col items-center">
                            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6">
                                <span className="material-symbols-rounded text-[40px]">qr_code</span>
                            </div>

                            <h3 className="text-xl font-black text-slate-800 mb-2">관리 코드 인쇄 미리보기</h3>
                            <p className="text-xs font-bold text-slate-400 mb-8 text-center px-6">
                                이 라벨을 출력하여 재배 구역이나<br />재배판(Tray)에 부착하시겠습니까?
                            </p>

                            {/* QR Preview Card - Refined Layout */}
                            <div className="w-full bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 mb-8 flex flex-row items-center gap-6">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="bg-white p-2 rounded-xl border-2 border-slate-900 leading-[0]">
                                        <QRCodeSVG
                                            value={printJob.qrValue}
                                            size={90}
                                            level="M"
                                        />
                                    </div>
                                    <div className="text-[9px] font-black border border-slate-900 px-1.5 py-0.5 bg-white whitespace-nowrap">
                                        스마트 정밀 재배 관리
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col justify-center min-w-0">
                                    <div className="border-t-2 border-slate-900 pt-2 pb-1 space-y-2">
                                        <div className="flex items-center text-[11px] leading-none">
                                            <span className="font-black text-slate-900 w-12 shrink-0">품&nbsp;&nbsp;&nbsp;명:</span>
                                            <span className="font-black text-slate-900 truncate">{printJob.title}</span>
                                        </div>
                                        <div className="flex items-center text-[11px] leading-none">
                                            <span className="font-black text-slate-900 w-12 shrink-0">시작일:</span>
                                            <span className="font-black text-slate-900 truncate">{printJob.date}</span>
                                        </div>
                                        <div className="flex items-center text-[11px] leading-none">
                                            <span className="font-black text-slate-900 w-12 shrink-0">장&nbsp;&nbsp;&nbsp;소:</span>
                                            <span className="font-black text-slate-900 truncate">{printJob.location}</span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] font-black text-slate-900 pt-2 border-t-2 border-slate-900 mt-1 truncate">
                                        {printJob.code}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setIsPrintPreviewOpen(false)}
                                    className="flex-1 h-14 rounded-2xl font-black text-slate-400 hover:bg-slate-50 transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={executePrint}
                                    className="flex-[2] h-14 bg-slate-900 rounded-2xl font-black text-white shadow-xl shadow-slate-200 flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-[0.98]"
                                >
                                    <span className="material-symbols-rounded text-[20px]">print</span>
                                    라벨 인쇄 시작
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Log Entry Modal */}
            <QuickLogModal
                isOpen={isQuickLogOpen}
                batch={selectedBatchForLog}
                onClose={() => setIsQuickLogOpen(false)}
                showAlert={showAlert}
            />
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"></div>
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
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수확 목표 원물 (농산물)</label>
                                <select
                                    value={formData.product_id || ''}
                                    onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100"
                                >
                                    <option value="">생산 원물 선택</option>
                                    {products
                                        .filter(p => p.item_type === 'harvest_item' || p.item_type === '농산물')
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


const QuickLogModal = ({ isOpen, batch, onClose, showAlert }) => {
    const [quickLogData, setQuickLogData] = useState({
        log_id: 0,
        batch_id: null,
        space_id: null,
        work_type: 'inspect',
        work_content: '',
        worker_name: localStorage.getItem('last_worker') || '',
        log_date: dayjs().format('YYYY-MM-DD'),
        env_data: { temp: '', humidity: '', co2: '' },
        photos: []
    });

    useEffect(() => {
        if (isOpen && batch) {
            setQuickLogData({
                log_id: 0,
                batch_id: batch.batch_id,
                space_id: batch.space_id,
                work_type: 'inspect',
                work_content: '',
                worker_name: localStorage.getItem('last_worker') || '',
                log_date: dayjs().format('YYYY-MM-DD'),
                env_data: { temp: '', humidity: '', co2: '' },
                photos: []
            });
        }
    }, [isOpen, batch]);

    if (!isOpen) return null;

    const saveQuickLog = async () => {
        if (!quickLogData.work_content || !quickLogData.worker_name) {
            showAlert('알림', '작업 내용과 작업자를 입력해주세요.');
            return;
        }

        try {
            const res = await fetch('/api/production/logs/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...quickLogData,
                    batch_id: parseInt(quickLogData.batch_id),
                    space_id: quickLogData.space_id ? parseInt(quickLogData.space_id) : null,
                    input_materials: null
                })
            });
            if (!res.ok) throw new Error("Failed to save log");
            localStorage.setItem('last_worker', quickLogData.worker_name);
            onClose();
            showAlert('성공', '작업 기록이 저장되었습니다.');
        } catch (err) {
            showAlert('오류', `저장 실패: ${err}`);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose}></div>
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-indigo-600 text-white">
                    <div>
                        <h3 className="text-xl font-black">현장 작업 즉시 기록</h3>
                        <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-0.5">Quick Batch Activity Log</p>
                    </div>
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                        <ClipboardList size={24} />
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">작업자</label>
                            <input
                                type="text"
                                value={quickLogData.worker_name}
                                onChange={e => setQuickLogData({ ...quickLogData, worker_name: e.target.value })}
                                placeholder="성함 입력"
                                className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm ring-1 ring-slate-100 focus:ring-indigo-500/20 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">작업 날짜</label>
                            <input
                                type="date"
                                value={quickLogData.log_date}
                                onChange={e => setQuickLogData({ ...quickLogData, log_date: e.target.value })}
                                className="w-full h-11 px-4 bg-slate-50 border-none rounded-xl font-bold text-sm ring-1 ring-slate-100"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">작업 유형</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'inspect', label: '점검/예찰', icon: Search },
                                { id: 'water', label: '관수/영양', icon: Droplets },
                                { id: 'clean', label: '청소/소독', icon: Activity }
                            ].map(type => (
                                <button
                                    key={type.id}
                                    onClick={() => setQuickLogData({ ...quickLogData, work_type: type.id })}
                                    className={`flex flex-col items-center p-3 rounded-2xl border-2 transition-all ${quickLogData.work_type === type.id ? 'bg-indigo-50 border-indigo-600 text-indigo-700' : 'bg-white border-slate-50 text-slate-400 hover:border-slate-100'}`}
                                >
                                    <type.icon size={18} className="mb-1" />
                                    <span className="text-[9px] font-black">{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">작업 내용</label>
                        <textarea
                            value={quickLogData.work_content}
                            onChange={e => setQuickLogData({ ...quickLogData, work_content: e.target.value })}
                            placeholder="무엇을 하셨나요? (예: 배양실 환기 및 필터 점검)"
                            className="w-full h-24 p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100 resize-none focus:ring-indigo-500/20 transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex-1 grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2">
                                <Thermometer size={14} className="text-rose-400" />
                                <input type="number" step="0.1" value={quickLogData.env_data.temp} onChange={e => setQuickLogData({ ...quickLogData, env_data: { ...quickLogData.env_data, temp: e.target.value } })} placeholder="온도" className="w-full h-8 bg-white border-none rounded-lg text-xs font-black shadow-sm" />
                            </div>
                            <div className="flex items-center gap-2">
                                <Droplets size={14} className="text-blue-400" />
                                <input type="number" step="0.1" value={quickLogData.env_data.humidity} onChange={e => setQuickLogData({ ...quickLogData, env_data: { ...quickLogData.env_data, humidity: e.target.value } })} placeholder="습도" className="w-full h-8 bg-white border-none rounded-lg text-xs font-black shadow-sm" />
                            </div>
                        </div>
                        <button
                            onClick={async () => {
                                try {
                                    // Mock sensor data for web version or fetch from API if available
                                    // const sensor = await invoke('get_virtual_sensor_data');
                                    const sensor = { temperature: 24.5, humidity: 65.0, co2: 450 };
                                    setQuickLogData({ ...quickLogData, env_data: { ...quickLogData.env_data, temp: sensor.temperature.toString(), humidity: sensor.humidity.toString(), co2: sensor.co2.toString() } });
                                } catch (e) { console.error(e); }
                            }}
                            className="p-2 bg-white text-indigo-600 rounded-xl hover:bg-indigo-50 shadow-sm border border-slate-100"
                        >
                            <Activity size={18} />
                        </button>
                    </div>
                </div>

                <div className="p-8 bg-slate-50 flex gap-3">
                    <button onClick={onClose} className="flex-1 h-12 rounded-2xl font-black text-sm text-slate-400">취소</button>
                    <button onClick={saveQuickLog} className="flex-1 h-12 bg-indigo-600 rounded-2xl font-black text-sm text-white shadow-xl shadow-indigo-100 hover:bg-indigo-500 transition-all">작업 기록 저장</button>
                </div>
            </div>
        </div>
    );
};

export default ProductionBatches;
