import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import dayjs from 'dayjs';
import { X, Printer, Download, Eye, FileText, CheckCircle2 } from 'lucide-react';

const workTypes = {
    plant: '식재/종균접종',
    water: '관수/영양제',
    fertilize: '비료/시비',
    pesticide: '방제/약제',
    harvest: '수확/채취',
    process: '가공/포장',
    clean: '청소/소독',
    inspect: '점검/예찰',
    education: '교육/훈련',
};

const reportLabels = {
    all: '통합 영농 및 작업 기록장',
    chemical: '농약 살포 및 시비 기록부',
    sanitation: '위생 관리 및 시설 점검표',
    harvest: '수확 및 출하 관리 대장',
    education: '교육 훈련 및 인력 관리 일지',
};

const reportCategoryMap = {
    all: null,
    chemical: ['pesticide', 'fertilize'],
    sanitation: ['clean', 'inspect', 'water'],
    harvest: ['harvest', 'process'],
    education: ['education'],
};

const FarmingReportView = ({ startDate, endDate, includeAttachments, includeApproval, reportType = 'all', onClose }) => {
    const [logs, setLogs] = useState([]);
    const [companyInfo, setCompanyInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [photoData, setPhotoData] = useState({});

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [logsData, companyData] = await Promise.all([
                invoke('get_farming_logs', {
                    batchId: null,
                    spaceId: null,
                    startDate: startDate,
                    endDate: endDate,
                    workType: reportCategoryMap[reportType]?.[0] // Note: Backend needs to support multiple workTypes or we filter here
                }),
                invoke('get_company_info')
            ]);

            let filteredLogs = logsData;
            const allowedCategories = reportCategoryMap[reportType];
            if (allowedCategories) {
                filteredLogs = logsData.filter(l => allowedCategories.includes(l.work_type));
            }

            const reversedLogs = [...filteredLogs].reverse();
            setLogs(reversedLogs);
            setCompanyInfo(companyData);

            // Load photos as base64 for reliable preview (Limit to 10 for performance)
            if (includeAttachments) {
                const photosToLoad = [];
                reversedLogs.forEach(l => {
                    if (l.photos && Array.isArray(l.photos)) {
                        l.photos.forEach(p => {
                            if (p.path && photosToLoad.length < 10) photosToLoad.push(p.path);
                        });
                    }
                });

                const loadedPhotos = {};
                await Promise.all(photosToLoad.map(async (path) => {
                    try {
                        const base64 = await invoke('get_media_base64', { fileName: path });
                        loadedPhotos[path] = base64;
                    } catch (e) {
                        console.error("Failed to load photo:", path, e);
                    }
                }));
                setPhotoData(loadedPhotos);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [startDate, endDate]);

    const handlePrint = async () => {
        if (isSaving) return;

        try {
            // Step 1: Request save location
            const savePath = await invoke('plugin:dialog|save', {
                options: {
                    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
                    defaultPath: `${reportLabels[reportType]}_${startDate}_${endDate}.pdf`
                }
            });

            if (!savePath) return;

            setIsSaving(true);

            // Step 2: Trigger backend generation
            await invoke('generate_production_pdf', {
                savePath,
                startDate,
                endDate,
                includeAttachments,
                includeApproval,
                reportType
            });

            // Optional: You could add a success toast here
        } catch (err) {
            console.error("PDF Save failed:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const { tableLogs, attachmentPhotos } = useMemo(() => {
        let currentPhotoIdx = 1;
        const photos = [];
        const processedLogs = logs.map(log => {
            const photoIndices = [];
            if (log.photos && Array.isArray(log.photos)) {
                log.photos.forEach(p => {
                    photoIndices.push(currentPhotoIdx);
                    photos.push({
                        ...p,
                        globalIdx: currentPhotoIdx,
                        log_date: log.log_date,
                        work_type: log.work_type,
                        log_id: log.log_id
                    });
                    currentPhotoIdx++;
                });
            }
            return { ...log, photoIndices };
        });
        return { tableLogs: processedLogs, attachmentPhotos: photos };
    }, [logs]);

    if (isLoading) return (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                <p className="text-sm font-black text-slate-400">리포트 데이터를 구성 중입니다...</p>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 print:p-0 print:bg-white print:block print:relative print:z-0">

            {/* Saving Overlay */}
            {isSaving && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
                    <div className="relative bg-white p-12 rounded-[3.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col items-center gap-8 border-2 border-indigo-50 animate-in zoom-in-95 duration-500">
                        <div className="relative">
                            <div className="w-24 h-24 border-8 border-indigo-50 rounded-full" />
                            <div className="absolute top-0 left-0 w-24 h-24 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Download className="text-indigo-600 animate-bounce" size={32} />
                            </div>
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-black text-slate-800 tracking-tight">PDF 리포트 저장 중</h3>
                            <p className="text-sm font-bold text-slate-400 max-w-[200px] leading-relaxed">
                                고품질 이미지 최적화 및<br />문서 구성을 진행하고 있습니다.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* UI Controls (Floating on top of the modal) */}
            <div className="fixed top-8 right-8 flex flex-col gap-4 print:hidden z-[210]">
                <button
                    onClick={onClose}
                    className="w-14 h-14 bg-white text-slate-400 rounded-2xl shadow-2xl hover:text-rose-500 hover:scale-110 active:scale-95 transition-all flex items-center justify-center group"
                    title="닫기"
                >
                    <X size={32} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>

                <div className="h-px bg-white/20 w-full" />

                <button
                    disabled={isSaving}
                    onClick={handlePrint}
                    className={`h-14 px-8 rounded-2xl font-black text-sm shadow-2xl transition-all flex items-center gap-3 
                        ${isSaving
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white shadow-indigo-500/30 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0'}`}
                >
                    {isSaving ? (
                        <>
                            <div className="w-5 h-5 border-3 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                            저장 중...
                        </>
                    ) : (
                        <>
                            <Download size={20} /> PDF 저장
                        </>
                    )}
                </button>
            </div>

            {/* Scrollable Container (Hidden on Print) */}
            <div className="w-full max-w-[210mm] max-h-[92vh] bg-white rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-y-auto custom-scrollbar print:max-h-none print:shadow-none print:rounded-none print:overflow-visible print:w-full relative">

                {/* Printable Content Area */}
                <div id="printable-report" className="p-[20mm] min-h-[297mm] bg-white text-slate-900 print:p-[10mm]">

                    {/* Report Header */}
                    <div className="flex justify-between items-start mb-12">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-8 bg-indigo-600 rounded-full" />
                                <h1 className="text-3xl font-black tracking-tighter text-slate-800">{reportLabels[reportType] || '영농 및 작업 기록장'}</h1>
                            </div>
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest pl-4">GAP/HACCP Certification Records - {reportType.toUpperCase()}</p>
                            <div className="pl-4">
                                <span className="inline-block px-3 py-1 bg-slate-100 rounded-lg text-xs font-black text-slate-500">
                                    기록 기간: {dayjs(startDate).format('YYYY년 MM월 DD일')} ~ {dayjs(endDate).format('YYYY년 MM월 DD일')}
                                </span>
                            </div>
                        </div>

                        {/* Approval Block */}
                        {includeApproval && (
                            <div className="flex border-2 border-slate-200 rounded-xl overflow-hidden shrink-0">
                                <div className="w-8 bg-slate-50 border-r-2 border-slate-200 flex items-center justify-center py-2">
                                    <p className="text-[10px] font-black text-slate-400" style={{ writingMode: 'vertical-rl' }}>결재란</p>
                                </div>
                                {['담당', '검토', '승인'].map((label, i) => (
                                    <div key={label} className={`w-20 text-center ${i < 2 ? 'border-r-2 border-slate-200' : ''}`}>
                                        <div className="py-1 bg-slate-50 border-b-2 border-slate-200 text-[10px] font-black text-slate-500">{label}</div>
                                        <div className="h-16" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Company Info Box */}
                    <div className="grid grid-cols-2 gap-px bg-slate-200 border-2 border-slate-200 rounded-2xl overflow-hidden mb-8 shadow-sm">
                        <div className="bg-slate-50 p-4 flex">
                            <span className="w-24 text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">농 장 명</span>
                            <span className="text-sm font-black text-slate-700">{companyInfo?.company_name || '-'}</span>
                        </div>
                        <div className="bg-slate-50 p-4 flex">
                            <span className="w-24 text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">대 표 자</span>
                            <span className="text-sm font-black text-slate-700">{companyInfo?.representative_name || '-'}</span>
                        </div>
                        <div className="bg-white p-4 flex">
                            <span className="w-24 text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">GAP 번호</span>
                            <span className="text-sm font-black text-slate-700">{companyInfo?.certification_info?.gap || '-'}</span>
                        </div>
                        <div className="bg-white p-4 flex">
                            <span className="w-24 text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">HACCP</span>
                            <span className="text-sm font-black text-slate-700">{companyInfo?.certification_info?.haccp || '-'}</span>
                        </div>
                    </div>

                    {/* Data Table */}
                    <div className="border-2 border-slate-800 rounded-2xl overflow-hidden mb-12 shadow-md">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="bg-slate-800 text-white">
                                    <th className="p-3 text-[10px] font-black border-r border-slate-700 w-16 text-center">일자</th>
                                    <th className="p-3 text-[10px] font-black border-r border-slate-700 w-24 text-center">구분</th>
                                    <th className="p-3 text-[10px] font-black border-r border-slate-700 text-left">주요 작업 내용</th>
                                    <th className="p-3 text-[10px] font-black border-r border-slate-700 w-32 text-left">투입 자재</th>
                                    <th className="p-3 text-[10px] font-black border-r border-slate-700 w-20 text-center">환경</th>
                                    <th className="p-3 text-[10px] font-black w-20 text-center">작업자</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {tableLogs.map((log) => {
                                    const mats = log.input_materials || [];
                                    const env = log.env_data || {};
                                    return (
                                        <tr key={log.log_id} className="hover:bg-slate-50 transition-colors break-inside-avoid">
                                            <td className="p-3 text-xs font-black text-slate-500 border-r border-slate-100 text-center">
                                                {dayjs(log.log_date).format('MM-DD')}
                                            </td>
                                            <td className="p-3 text-center border-r border-slate-100">
                                                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-[10px] font-black">
                                                    {workTypes[log.work_type] || log.work_type}
                                                </span>
                                            </td>
                                            <td className="p-3 text-xs font-medium text-slate-700 leading-relaxed border-r border-slate-100">
                                                {log.work_content}
                                                {log.photoIndices.length > 0 && (
                                                    <div className="mt-1 text-[10px] font-black text-emerald-600">
                                                        (증 {log.photoIndices.join(', ')})
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3 text-[10px] font-bold text-slate-500 border-r border-slate-100">
                                                {mats.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {mats.map((m, idx) => (
                                                            <div key={idx} className="flex justify-between border-b border-dotted border-slate-200 last:border-none pb-0.5">
                                                                <span>{m.name}</span>
                                                                <span className="text-slate-400">{m.quantity}{m.unit}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td className="p-3 text-[10px] font-black text-slate-400 border-r border-slate-100 text-center leading-tight">
                                                {env.temp && <div>{env.temp}°C</div>}
                                                {env.humidity && <div>{env.humidity}%</div>}
                                                {env.co2 && <div>{env.co2}ppm</div>}
                                                {env.light && <div>{env.light}lx</div>}
                                            </td>
                                            <td className="p-3 text-xs font-black text-slate-700 text-center">
                                                {log.worker_name === '시스템자동' ? (companyInfo?.representative_name || '관리자') : log.worker_name}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="py-20 text-center text-slate-400 font-bold italic">기록된 데이터가 없습니다.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Attachments Section */}
                    {includeAttachments && logs.some(l => l.photos?.length > 0) && (
                        <div className="page-break mt-12">
                            <div className="flex items-center gap-3 mb-8 border-b-2 border-slate-100 pb-4">
                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                                    <CheckCircle2 size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 tracking-tight">작업 증빙 자료</h2>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visual Evidence Attachments</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                {attachmentPhotos.map((p) => (
                                    <div key={`${p.log_id}-${p.globalIdx}`} className="bg-slate-50 rounded-2xl border-2 border-slate-100 p-4 break-inside-avoid shadow-sm hover:shadow-md transition-shadow">
                                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 mb-4 bg-white">
                                            <img
                                                src={photoData[p.path] || "https://placehold.co/400x300?text=Image+Loading..."}
                                                alt={p.label}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md text-white text-[9px] font-black rounded-lg">
                                                증 {p.globalIdx}
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 mb-1">{p.label || '현장 기록'}</p>
                                                <p className="text-xs font-black text-slate-800">{dayjs(p.log_date).format('YYYY년 MM월 DD일')}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-bold text-indigo-600 px-2 py-1 bg-indigo-50 rounded-md">
                                                    {workTypes[p.work_type] || p.work_type}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="mt-20 pt-8 border-t border-slate-100 text-center">
                        <p className="text-[10px] font-black text-slate-300 italic">
                            Generated by Mycelium Smart Farm Integration System v2.0
                        </p>
                    </div>
                </div>
            </div>

            <style>
                {`
                @media print {
                    @page { size: A4; margin: 0; }
                    html, body { 
                        background: white !important; 
                        color: black !important;
                        color-scheme: light !important;
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    #root, nav, .tauri-drag-region { display: none !important; }
                    div:not(#printable-report):not(#printable-report *):not(style):not(script) {
                        display: none !important;
                    }
                    #printable-report {
                        display: block !important;
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 15mm !important;
                        visibility: visible !important;
                        background: white !important;
                    }
                    #printable-report * {
                        visibility: visible !important;
                    }
                    .page-break {
                        page-break-before: always;
                    }
                    .break-inside-avoid {
                        break-inside: avoid;
                    }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                `}
            </style>
        </div>
    );
};

export default FarmingReportView;
