import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../../contexts/ModalContext';
import {
    Plus, Boxes, Calendar, User, History,
    Trash2, Edit2, Search, Filter, ClipboardCheck,
    Tag, Scale, Info, QrCode, Zap, Speaker, CheckCircle2
} from 'lucide-react';
import dayjs from 'dayjs';
import LabelPrinter, { printLabel } from './LabelPrinter';

const HarvestRecords = () => {
    const [records, setRecords] = useState([]);
    const [batches, setBatches] = useState([]);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showAlert, showConfirm } = useModal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);

    const [formData, setFormData] = useState({
        harvest_id: 0,
        batch_id: null,
        harvest_date: dayjs().format('YYYY-MM-DD'),
        quantity: 0,
        defective_quantity: 0,
        loss_quantity: 0,
        unit: 'kg',
        grade: 'A',
        traceability_code: '',
        memo: '',
        package_count: 0,
        weight_per_package: 0,
        package_unit: '박스'
    });
    const [completeBatch, setCompleteBatch] = useState(false);
    const [printData, setPrintData] = useState(null);

    // Continuous Scanner Mode States
    const [isScannerMode, setIsScannerMode] = useState(false);
    const [scannerSubMode, setScannerSubMode] = useState('live'); // 'live' or 'batch'
    const [scanConfig, setScanConfig] = useState({
        batch_id: '',
        weight: 10,
        unit: 'kg',
        grade: 'A'
    });
    const [batchInput, setBatchInput] = useState('');
    const [recentScans, setRecentScans] = useState([]);
    const scanInputRef = useRef(null);

    // Auto calculate quantity
    useEffect(() => {
        if (formData.package_count > 0 && formData.weight_per_package > 0) {
            const total = (formData.package_count * formData.weight_per_package).toFixed(2);
            setFormData(prev => ({ ...prev, quantity: parseFloat(total) }));
        }
    }, [formData.package_count, formData.weight_per_package]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [recordsData, batchesData, productsData] = await Promise.all([
                invoke('get_harvest_records', { batchId: null }),
                invoke('get_production_batches'),
                invoke('get_product_list')
            ]);
            setRecords(recordsData);
            setBatches(batchesData);
            setProducts(productsData);
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
            setFormData({
                ...record,
                package_count: record.package_count || 0,
                weight_per_package: record.weight_per_package || 0,
                package_unit: record.package_unit || '박스'
            });
            setCompleteBatch(false);
        } else {
            setEditingRecord(null);
            setFormData({
                harvest_id: 0,
                batch_id: null,
                harvest_date: dayjs().format('YYYY-MM-DD'),
                quantity: 0,
                defective_quantity: 0,
                loss_quantity: 0,
                unit: 'kg',
                grade: 'A',
                traceability_code: '',
                memo: '',
                package_count: 0,
                weight_per_package: 0,
                package_unit: '박스'
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
                    quantity: parseFloat(formData.quantity) || 0,
                    defective_quantity: parseFloat(formData.defective_quantity) || 0,
                    loss_quantity: parseFloat(formData.loss_quantity) || 0,
                    package_count: parseInt(formData.package_count) || 0,
                    weight_per_package: parseFloat(formData.weight_per_package) || 0
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

    const handlePrint = (record) => {
        const batch = batches.find(b => String(b.batch_id) === String(record.batch_id));
        const product = products.find(p => String(p.product_id) === String(batch?.product_id));

        const displayCode = record.traceability_code ||
            (batch?.batch_code ? `B-${batch.batch_code}` : `H-${record.harvest_id}`);

        printLabel('harvest', {
            title: product?.product_name || '수확물(상품미정)',
            code: displayCode,
            spec: `${record.grade}등급 / ${record.quantity}${record.unit}`,
            date: `수확: ${dayjs(record.harvest_date).format('YY/MM/DD')}`,
            qrValue: `[${product?.product_name || '수확물'}] ${dayjs(record.harvest_date).format('YYYY-MM-DD')} | ${record.grade}등급 | ${record.quantity}${record.unit} | ${displayCode}`
        });
    };

    const handleQuickScan = async (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (!val) return;

            let targetBatch = batches.find(b => b.batch_code === val);
            if (!targetBatch && scanConfig.batch_id) {
                targetBatch = batches.find(b => String(b.batch_id) === String(scanConfig.batch_id));
            }

            if (!targetBatch) {
                setRecentScans(prev => [{ id: Date.now(), status: 'error', message: '배치나 관리 코드를 인식할 수 없습니다.' }, ...prev.slice(0, 4)]);
                e.target.value = '';
                return;
            }

            try {
                await invoke('save_harvest_record', {
                    record: {
                        harvest_id: 0,
                        batch_id: targetBatch.batch_id,
                        harvest_date: dayjs().format('YYYY-MM-DD'),
                        quantity: parseFloat(scanConfig.weight) || 0,
                        unit: scanConfig.unit || 'kg',
                        grade: scanConfig.grade || 'A',
                        traceability_code: `SCAN-${dayjs().format('HHmmss')}`,
                        memo: `[연속스캔] ${val} (자동입력)`,
                        package_count: 1,
                        weight_per_package: parseFloat(scanConfig.weight) || 0,
                        package_unit: '바구니'
                    },
                    completeBatch: false
                });

                setRecentScans(prev => [{
                    id: Date.now(),
                    status: 'success',
                    batch: targetBatch.batch_code,
                    qty: scanConfig.weight,
                    time: dayjs().format('HH:mm:ss')
                }, ...prev.slice(0, 4)]);

                loadData();
            } catch (err) {
                setRecentScans(prev => [{ id: Date.now(), status: 'error', message: `저장 실패: ${err}` }, ...prev.slice(0, 4)]);
            }
            e.target.value = '';
        }
    };

    const handleBatchProcess = async () => {
        const lines = batchInput.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return;

        setIsLoading(true);
        try {
            const recordsToSave = lines.map(val => {
                let targetBatch = batches.find(b => b.batch_code === val);
                if (!targetBatch && scanConfig.batch_id) {
                    targetBatch = batches.find(b => String(b.batch_id) === String(scanConfig.batch_id));
                }

                if (!targetBatch) return null;

                return {
                    harvest_id: 0,
                    batch_id: targetBatch.batch_id,
                    harvest_date: dayjs().format('YYYY-MM-DD'),
                    quantity: parseFloat(scanConfig.weight) || 0,
                    unit: scanConfig.unit || 'kg',
                    grade: scanConfig.grade || 'A',
                    traceability_code: `BATCH-${dayjs().format('HHmmss')}`,
                    memo: `[일괄처리] ${val}`,
                    package_count: 1,
                    weight_per_package: parseFloat(scanConfig.weight) || 0,
                    package_unit: '바구니'
                };
            }).filter(r => r !== null);

            if (recordsToSave.length === 0) {
                showAlert('알림', '인식 가능한 배치 정보가 없습니다. 배치 코드를 확인해주세요.');
                return;
            }

            await invoke('save_harvest_batch', { records: recordsToSave });
            setBatchInput('');
            loadData();
            showAlert('성공', `${recordsToSave.length}건의 기록이 한꺼번에 저장되었습니다.`);
        } catch (err) {
            showAlert('오류', `일괄 처리 중 오류: ${err}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isScannerMode && scannerSubMode === 'live' && scanInputRef.current) {
            scanInputRef.current.focus();
        }
    }, [isScannerMode, scannerSubMode]);

    useEffect(() => {
        const handleClick = () => {
            if (isScannerMode && scannerSubMode === 'live' && scanInputRef.current) {
                scanInputRef.current.focus();
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [isScannerMode, scannerSubMode]);

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

            {/* Continuous Scanner Mode Control */}
            <div className={`transition-all duration-300 ${isScannerMode ? 'bg-slate-900 border-none p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200' : 'bg-slate-50 p-4 rounded-3xl border border-slate-200'}`}>
                <div className="flex flex-col lg:flex-row gap-6 items-center">
                    <div className="flex items-center gap-4 min-w-[200px]">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isScannerMode ? 'bg-white text-slate-900 shadow-lg' : 'bg-slate-200 text-slate-500'}`}>
                            <Zap size={24} className={isScannerMode && scannerSubMode === 'live' ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <h4 className={`text-sm font-black ${isScannerMode ? 'text-white' : 'text-slate-700'}`}>현장 무인 수확 모드</h4>
                            <div className="flex gap-2 mt-1">
                                <button onClick={() => setScannerSubMode('live')} className={`text-[10px] font-black px-2 py-0.5 rounded-md ${scannerSubMode === 'live' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>실시간</button>
                                <button onClick={() => setScannerSubMode('batch')} className={`text-[10px] font-black px-2 py-0.5 rounded-md ${scannerSubMode === 'batch' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>일괄(스마트폰)</button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 w-full flex flex-col gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <select
                                value={scanConfig.batch_id}
                                onChange={e => setScanConfig({ ...scanConfig, batch_id: e.target.value })}
                                className={`h-12 px-4 rounded-2xl font-bold text-xs border-none ring-1 ${isScannerMode ? 'bg-slate-800 text-white ring-slate-700' : 'bg-white text-slate-700 ring-slate-200'}`}
                            >
                                <option value="">배치 미리 선택 (또는 배치 코드 스캔)</option>
                                {batches.map(b => (
                                    <option key={b.batch_id} value={b.batch_id}>
                                        [{b.batch_code}] {products.find(p => p.product_id === b.product_id)?.product_name || '미지정 상품'}
                                    </option>
                                ))}
                            </select>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={scanConfig.weight}
                                    onChange={e => setScanConfig({ ...scanConfig, weight: e.target.value })}
                                    placeholder="스캔당 중량"
                                    className={`w-full h-12 pl-10 pr-4 rounded-2xl font-bold text-xs border-none ring-1 text-right ${isScannerMode ? 'bg-slate-800 text-white ring-slate-700 placeholder:text-slate-600' : 'bg-white text-slate-700 ring-slate-200'}`}
                                />
                                <Scale size={14} className={`absolute left-4 top-1/2 -translate-y-1/2 ${isScannerMode ? 'text-slate-500' : 'text-slate-400'}`} />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            {scannerSubMode === 'live' ? (
                                <input
                                    ref={scanInputRef}
                                    type="text"
                                    onKeyDown={handleQuickScan}
                                    disabled={!isScannerMode}
                                    placeholder={isScannerMode ? "스캔 대기 중..." : "모드 활성화 필요"}
                                    className={`flex-1 h-12 px-4 rounded-2xl font-bold text-xs border-none ring-1 ${isScannerMode ? 'bg-white text-slate-900 ring-white' : 'bg-slate-100 text-slate-400 ring-slate-200'}`}
                                />
                            ) : (
                                <textarea
                                    value={batchInput}
                                    onChange={e => setBatchInput(e.target.value)}
                                    placeholder="현장에서 찍어온 바코드 리스트를 여기에 붙여넣으세요 (한 줄에 하나씩)"
                                    className={`flex-1 h-24 p-4 rounded-2xl font-bold text-xs border-none ring-1 resize-none ${isScannerMode ? 'bg-white text-slate-900 ring-white' : 'bg-slate-100 text-slate-400 ring-slate-200'}`}
                                />
                            )}
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => setIsScannerMode(!isScannerMode)}
                                    className={`px-6 h-12 rounded-2xl font-black text-xs transition-all ${isScannerMode ? 'bg-white text-slate-900 hover:bg-slate-50' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-100'}`}
                                >
                                    {isScannerMode ? '모드 종료' : '모드 시작'}
                                </button>
                                {isScannerMode && scannerSubMode === 'batch' && (
                                    <button
                                        onClick={handleBatchProcess}
                                        className="px-6 h-12 bg-indigo-600 text-white rounded-2xl font-black text-xs hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-200"
                                    >
                                        일괄 실행
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {isScannerMode && scannerSubMode === 'live' && recentScans.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-slate-800 flex flex-wrap gap-2">
                        {recentScans.map(scan => (
                            <div key={scan.id} className={`px-4 py-2 rounded-xl flex items-center gap-2 animate-in slide-in-from-left duration-300 ${scan.status === 'success' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                {scan.status === 'success' ? <CheckCircle2 size={14} /> : <Info size={14} />}
                                <span className="text-[10px] font-black">
                                    {scan.status === 'success' ? `[${scan.time}] ${scan.batch} → ${scan.qty}kg 완료` : scan.message}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">수확일</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">배치 코드</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">수확량(정품)</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">비상품/손실</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">수율</th>
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
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <Scale size={14} className="text-slate-300" />
                                                    <p className="text-xs font-black text-slate-700">{record.quantity} {record.unit}</p>
                                                </div>
                                                {record.package_count > 0 && (
                                                    <p className="text-[10px] text-slate-400 font-bold ml-5">
                                                        ({record.package_count}{record.package_unit} x {record.weight_per_package}kg)
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2 text-rose-500 mb-1">
                                                <span className="text-[10px] font-black bg-rose-50 px-1.5 py-0.5 rounded">파지</span>
                                                <p className="text-[11px] font-bold">{record.defective_quantity || 0}{record.unit}</p>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <span className="text-[10px] font-black bg-slate-100 px-1.5 py-0.5 rounded">손실</span>
                                                <p className="text-[11px] font-bold">{record.loss_quantity || 0}{record.unit}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            {(() => {
                                                const q = parseFloat(record.quantity) || 0;
                                                const d = parseFloat(record.defective_quantity) || 0;
                                                const l = parseFloat(record.loss_quantity) || 0;
                                                const total = q + d + l;
                                                const yield_val = total > 0 ? ((q / total) * 100).toFixed(1) : 0;
                                                return (
                                                    <div className="flex flex-col items-center">
                                                        <span className={`text-[11px] font-black ${yield_val > 90 ? 'text-teal-600' : yield_val > 70 ? 'text-indigo-600' : 'text-amber-600'}`}>{yield_val}%</span>
                                                        <div className="w-12 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                            <div className={`h-full transition-all duration-1000 ${yield_val > 90 ? 'bg-teal-500' : yield_val > 70 ? 'bg-indigo-500' : 'bg-amber-500'}`} style={{ width: `${yield_val}%` }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
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
                                                <button onClick={() => handlePrint(record)} className="p-2 text-slate-500 hover:text-indigo-600 transition-colors">
                                                    <span className="material-symbols-rounded text-[18px]">qr_code</span>
                                                </button>
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
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"></div>
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-5 border-b border-slate-50 flex justify-between items-center">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <Plus size={18} className="text-indigo-600" />
                                {editingRecord ? '수확 기록 수정' : '새 수확 기록 등록'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-slate-500 transition-colors">
                                <Trash2 size={18} />
                            </button>
                        </div>
                        <div className="px-8 py-6 space-y-4">
                            <div className="space-y-1 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수확 대상 배치</label>
                                <select
                                    value={formData.batch_id || ''}
                                    onChange={e => setFormData({ ...formData, batch_id: e.target.value })}
                                    className="w-full h-11 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100 focus:ring-indigo-100 transition-all outline-none"
                                >
                                    <option value="">배치 선택</option>
                                    {batches.map(b => (
                                        <option key={b.batch_id} value={b.batch_id}>
                                            [{b.batch_code}] {products.find(p => p.product_id === b.product_id)?.product_name || '미지정 상품'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수확일</label>
                                    <input type="date" value={formData.harvest_date} onChange={e => setFormData({ ...formData, harvest_date: e.target.value })} className="w-full h-11 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                                <div className="space-y-1 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">품질 등급</label>
                                    <select value={formData.grade} onChange={e => setFormData({ ...formData, grade: e.target.value })} className="w-full h-11 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100">
                                        <option value="A">A등급 (특상)</option>
                                        <option value="B">B등급 (보통)</option>
                                        <option value="C">C등급 (하)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50/50 rounded-[1.5rem] border border-slate-100 space-y-2.5">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                    <Boxes size={12} /> 포장 단위 입력 (선택)
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <label className="block text-[8px] font-bold text-slate-400 ml-1">수량(박스 등)</label>
                                        <input type="number" value={formData.package_count} onChange={e => setFormData({ ...formData, package_count: e.target.value })} className="w-full h-9 px-4 bg-white border-none rounded-xl font-bold text-xs ring-1 ring-slate-100 text-right" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[8px] font-bold text-slate-400 ml-1">단위당 중량</label>
                                        <input type="number" step="0.01" value={formData.weight_per_package} onChange={e => setFormData({ ...formData, weight_per_package: e.target.value })} className="w-full h-9 px-4 bg-white border-none rounded-xl font-bold text-xs ring-1 ring-slate-100 text-right" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="block text-[8px] font-bold text-slate-400 ml-1">단위</label>
                                        <input type="text" value={formData.package_unit} onChange={e => setFormData({ ...formData, package_unit: e.target.value })} className="w-full h-9 px-4 bg-white border-none rounded-xl font-bold text-xs ring-1 ring-slate-100" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">정품 수확량 (입고량)</label>
                                    <input type="number" step="0.1" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} className="w-full h-11 px-5 bg-slate-50 border-none rounded-2xl font-black text-sm ring-1 ring-indigo-100 text-indigo-600 text-right" />
                                </div>
                                <div className="space-y-1 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">중량 단위</label>
                                    <input type="text" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })} className="w-full h-11 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1 text-left">
                                    <label className="block text-[10px] font-black text-rose-400 uppercase tracking-widest ml-1">비상품(파지) 수량</label>
                                    <input type="number" step="0.1" value={formData.defective_quantity} onChange={e => setFormData({ ...formData, defective_quantity: e.target.value })} className="w-full h-11 px-5 bg-rose-50/30 border-none rounded-2xl font-black text-sm ring-1 ring-rose-100 text-rose-600 text-right" />
                                </div>
                                <div className="space-y-1 text-left">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">폐기/손실 수량</label>
                                    <input type="number" step="0.1" value={formData.loss_quantity} onChange={e => setFormData({ ...formData, loss_quantity: e.target.value })} className="w-full h-11 px-5 bg-slate-50 border-none rounded-2xl font-black text-sm ring-1 ring-slate-200 text-slate-400 text-right" />
                                </div>
                            </div>

                            {!editingRecord && (
                                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                                            <ClipboardCheck size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-900">배치 생산 종료</p>
                                            <p className="text-[9px] text-indigo-400 font-bold">이 배치를 완료 처리합니까?</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setCompleteBatch(!completeBatch)}
                                        className={`w-10 h-5 rounded-full transition-all relative ${completeBatch ? 'bg-indigo-600' : 'bg-slate-200'}`}
                                    >
                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${completeBatch ? 'left-5.5' : 'left-0.5'}`}></div>
                                    </button>
                                </div>
                            )}

                            <div className="space-y-1 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">비고/메모</label>
                                <textarea
                                    value={formData.memo}
                                    onChange={e => setFormData({ ...formData, memo: e.target.value })}
                                    className="w-full h-20 p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100 resize-none outline-none"
                                />
                            </div>
                        </div>

                        <div className="px-8 py-5 bg-slate-50 flex gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-2xl font-black text-sm text-slate-400">취소</button>
                            <button onClick={handleSave} className="flex-[2] h-12 bg-slate-900 rounded-2xl font-black text-sm text-white shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]">
                                기록 저장 및 재고 반영
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print Label Component */}
            <LabelPrinter type="harvest" data={printData} />
        </div>
    );
};

export default HarvestRecords;
