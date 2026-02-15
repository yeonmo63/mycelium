import React, { useState, useEffect, useRef } from 'react';
import { useModal } from '../../../contexts/ModalContext';
import {
    Plus, Search, Filter, History, Calendar, User,
    Thermometer, Droplets, Image as ImageIcon, CheckCircle,
    ChevronDown, ClipboardList, PenTool, FlaskConical,
    Droplet, Sprout, Wind, Trash2, Edit2, Boxes, Paperclip,
    FileText, X as CloseIcon, Camera, Activity
} from 'lucide-react';
import dayjs from 'dayjs';

const ProductionLogs = () => {
    const [logs, setLogs] = useState([]);
    const [spaces, setSpaces] = useState([]);
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showAlert, showConfirm } = useModal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLog, setEditingLog] = useState(null);
    const fileInputRef = useRef(null);
    const [uploadType, setUploadType] = useState('photo');

    const [formData, setFormData] = useState({
        log_id: 0,
        batch_id: null,
        space_id: null,
        log_date: dayjs().format('YYYY-MM-DD'),
        worker_name: '',
        work_type: 'plant',
        work_content: '',
        input_materials: [],
        env_data: { temp: '', humidity: '', co2: '' },
        photos: []
    });

    const workTypes = [
        { id: 'plant', label: '식재/종균접종', icon: Sprout, color: 'emerald' },
        { id: 'water', label: '관수/영양제', icon: Droplet, color: 'blue' },
        { id: 'fertilize', label: '비료/시비', icon: FlaskConical, color: 'purple' },
        { id: 'pesticide', label: '방제/약제', icon: Wind, color: 'red' },
        { id: 'harvest', label: '수확/채취', icon: CheckCircle, color: 'teal' },
        { id: 'process', label: '가공/포장', icon: Boxes, color: 'indigo' },
        { id: 'clean', label: '청소/소독', icon: Droplets, color: 'indigo' },
        { id: 'inspect', label: '점검/예찰', icon: Search, color: 'amber' },
        { id: 'education', label: '교육/훈련', icon: ClipboardList, color: 'slate' },
    ];

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [resLogs, resSpaces, resBatches] = await Promise.all([
                fetch('/api/production/logs?limit=100'),
                fetch('/api/production/spaces'),
                fetch('/api/production/batches')
            ]);

            const logsData = await resLogs.json();
            const spacesData = await resSpaces.json();
            const batchesData = await resBatches.json();
            setLogs(logsData);
            setSpaces(spacesData);
            setBatches(batchesData);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleOpenModal = (log = null) => {
        if (log) {
            setEditingLog(log);
            setFormData({
                ...log,
                env_data: log.env_data || { temp: '', humidity: '', co2: '' },
                input_materials: Array.isArray(log.input_materials) ? log.input_materials : [],
                photos: Array.isArray(log.photos) ? log.photos : []
            });
        } else {
            setEditingLog(null);
            setFormData({
                log_id: 0,
                batch_id: null,
                space_id: null,
                log_date: dayjs().format('YYYY-MM-DD'),
                worker_name: localStorage.getItem('last_worker') || '',
                work_type: 'plant',
                work_content: '',
                input_materials: [],
                env_data: { temp: '', humidity: '', co2: '' },
                photos: []
            });
        }
        setIsModalOpen(true);
    };

    const handleFileUpload = (type = 'photo') => {
        setUploadType(type);
        fileInputRef.current.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formDataUpload = new FormData();
        formDataUpload.append('file', file);

        try {
            const res = await fetch('/api/production/media/upload', {
                method: 'POST',
                body: formDataUpload
            });

            if (res.ok) {
                const fileName = await res.json();
                const newPhotos = [...(formData.photos || [])];
                const labelIndex = newPhotos.length + 1;

                newPhotos.push({
                    id: Date.now(),
                    type: uploadType,
                    path: fileName,
                    label: `증${labelIndex})`,
                    displayPath: `/api/production/media/${fileName}`
                });

                setFormData({ ...formData, photos: newPhotos });
            } else {
                throw new Error("Upload failed");
            }
        } catch (err) {
            console.error('File upload failed:', err);
            showAlert('오류', '이미지 업로드 실패: ' + err);
        }

        // Reset input
        e.target.value = '';
    };

    const removeAttachment = (id) => {
        setFormData(prev => ({
            ...prev,
            photos: prev.photos.filter(p => p.id !== id)
        }));
    };

    const addMaterial = () => {
        const currentMaterials = Array.isArray(formData.input_materials) ? formData.input_materials : [];
        setFormData({
            ...formData,
            input_materials: [...currentMaterials, { id: Date.now(), name: '', quantity: '', unit: 'kg', purpose: '' }]
        });
    };

    const updateMaterial = (id, field, value) => {
        setFormData({
            ...formData,
            input_materials: formData.input_materials.map(m => m.id === id ? { ...m, [field]: value } : m)
        });
    };

    const removeMaterial = (id) => {
        setFormData({
            ...formData,
            input_materials: formData.input_materials.filter(m => m.id !== id)
        });
    };

    const handleSave = async () => {
        if (!formData.work_content || !formData.worker_name) {
            showAlert('알림', '작업 내용과 작업자 이름을 입력해주세요.');
            return;
        }

        try {
            const res = await fetch('/api/production/logs/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    batch_id: formData.batch_id ? parseInt(formData.batch_id) : null,
                    space_id: formData.space_id ? parseInt(formData.space_id) : null,
                    input_materials: formData.input_materials.length > 0 ? formData.input_materials : null
                })
            });
            if (!res.ok) throw new Error("Failed to save log");

            localStorage.setItem('last_worker', formData.worker_name);
            setIsModalOpen(false);
            loadData();
            showAlert('성공', '영농일지가 저장되었습니다.');
        } catch (err) {
            showAlert('오류', `저장 실패: ${err}`);
        }
    };

    const handleDelete = async (id) => {
        const confirmed = await showConfirm('알림', '정말로 이 일지를 삭제하시겠습니까?');
        if (confirmed) {
            try {
                const res = await fetch(`/api/production/logs/delete/${id}`, { method: 'POST' });
                if (!res.ok) throw new Error("Failed to delete log");
                loadData();
                showAlert('성공', '일지가 삭제되었습니다.');
            } catch (err) {
                showAlert('오류', `삭제 실패: ${err}`);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h3 className="text-xl font-black text-slate-700">영농일지 (GAP/HACCP 연동)</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">현장 작업을 실시간으로 기록하여 인증 서류 자동 생성 기반을 마련합니다.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => handleOpenModal()}
                        className="h-12 px-6 bg-indigo-600 border-none rounded-2xl font-black text-sm text-white flex items-center gap-2 shadow-xl shadow-indigo-100 transition-all active:scale-[0.95] hover:bg-indigo-500"
                    >
                        <Plus size={18} /> 일지 새로 쓰기
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        <input type="text" placeholder="작업 내용이나 작업자 검색..." className="w-full h-10 pl-12 pr-4 bg-white border-none rounded-xl text-sm font-bold shadow-sm ring-1 ring-slate-100 focus:ring-indigo-500/20 transition-all" />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">날짜/작업형태</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">장소/배치</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">작업 내용</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">작업자</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">환경</th>
                                <th className="px-6 py-4 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {logs.map(log => {
                                const workType = workTypes.find(t => t.id === log.work_type) || workTypes[0];
                                const space = spaces.find(s => s.space_id === log.space_id);
                                return (
                                    <tr key={log.log_id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex flex-col items-center justify-center shrink-0">
                                                    <span className="text-[10px] font-black text-slate-400 leading-none">{dayjs(log.log_date).format('MM')}</span>
                                                    <span className="text-sm font-black text-slate-700 leading-none mt-0.5">{dayjs(log.log_date).format('DD')}</span>
                                                </div>
                                                <div className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black uppercase">
                                                    {workType.label}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="space-y-1">
                                                <p className="text-xs font-black text-slate-700">{space?.space_name || '-'}</p>
                                                {log.batch_id && <p className="text-[10px] text-indigo-500 font-bold">BATCH-{log.batch_id}</p>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-xs font-bold text-slate-600 line-clamp-2 leading-relaxed max-w-sm">
                                                {log.work_content}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500">{log.worker_name?.[0]}</div>
                                                {log.worker_name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex gap-3 text-[10px] font-black text-slate-400">
                                                {log.env_data?.temp && <span className="flex items-center gap-1"><Thermometer size={12} /> {log.env_data.temp}°C</span>}
                                                {log.env_data?.humidity && <span className="flex items-center gap-1"><Droplets size={12} /> {log.env_data.humidity}%</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex gap-1 justify-end">
                                                <button onClick={() => handleOpenModal(log)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Edit2 size={16} /></button>
                                                <button onClick={() => handleDelete(log.log_id)} className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {logs.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan="6" className="py-20 text-center">
                                        <ClipboardList size={48} className="mx-auto text-slate-100 mb-3" />
                                        <p className="text-slate-400 font-bold">등록된 영농일지가 없습니다.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Log Entry Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity"></div>
                    <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-800">{editingLog ? '영농일지 수정' : '영농일지 작성'}</h3>
                            <div className="text-right">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">인증 대응 기록 시스템</p>
                                <p className="text-xs font-bold text-teal-600">GAP/HACCP 준수 모드</p>
                            </div>
                        </div>

                        <div className="p-8 grid grid-cols-2 gap-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">작업 날짜</label>
                                <input type="date" value={formData.log_date} onChange={e => setFormData({ ...formData, log_date: e.target.value })} className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                            </div>
                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">작업자</label>
                                <input type="text" value={formData.worker_name} onChange={e => setFormData({ ...formData, worker_name: e.target.value })} placeholder="성함 입력" className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100" />
                            </div>

                            <div className="space-y-2 text-left col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">작업 유형</label>
                                <div className="grid grid-cols-5 gap-2">
                                    {workTypes.map(type => (
                                        <button
                                            key={type.id}
                                            onClick={() => setFormData({ ...formData, work_type: type.id })}
                                            className={`
                                                flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all
                                                ${formData.work_type === type.id
                                                    ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                                    : 'bg-white border-slate-50 text-slate-400 hover:border-slate-100'}
                                            `}
                                        >
                                            <type.icon size={20} className="mb-2" />
                                            <span className="text-[10px] font-black">{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">작업 구획</label>
                                <select
                                    value={formData.space_id || ''}
                                    onChange={e => setFormData({ ...formData, space_id: e.target.value || null })}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100"
                                >
                                    <option value="">구획 선택</option>
                                    {spaces.map(s => <option key={s.space_id} value={s.space_id}>{s.space_name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2 text-left">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Batch Code (선택)</label>
                                <select
                                    value={formData.batch_id || ''}
                                    onChange={e => setFormData({ ...formData, batch_id: e.target.value || null })}
                                    className="w-full h-12 px-5 bg-slate-50 border-none rounded-2xl font-bold text-sm ring-1 ring-slate-100"
                                >
                                    <option value="">배치 선택</option>
                                    {batches.map(b => <option key={b.batch_id} value={b.batch_id}>{b.batch_code}</option>)}
                                </select>
                            </div>

                            <div className="space-y-2 text-left col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">상세 작업 내용</label>
                                <textarea
                                    value={formData.work_content}
                                    onChange={e => setFormData({ ...formData, work_content: e.target.value })}
                                    className="w-full h-24 p-5 bg-slate-50 border-none rounded-[2rem] font-bold text-sm ring-1 ring-slate-100 resize-none"
                                />
                            </div>

                            <div className="col-span-2 space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">투입 자재/약제 내역</label>
                                    <button type="button" onClick={addMaterial} className="text-[10px] font-black text-indigo-600 px-3 py-1 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all">+ 자재 추가</button>
                                </div>
                                <div className="space-y-2">
                                    {formData.input_materials.map(m => (
                                        <div key={m.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded-2xl border border-slate-100">
                                            <input type="text" placeholder="자재명" value={m.name} onChange={e => updateMaterial(m.id, 'name', e.target.value)} className="flex-2 h-9 px-3 bg-white border-none rounded-xl text-xs font-bold" />
                                            <input type="text" placeholder="수량" value={m.quantity} onChange={e => updateMaterial(m.id, 'quantity', e.target.value)} className="flex-1 h-9 px-3 bg-white border-none rounded-xl text-xs font-bold w-16" />
                                            <select value={m.unit} onChange={e => updateMaterial(m.id, 'unit', e.target.value)} className="h-9 px-2 bg-white border-none rounded-xl text-xs font-bold shadow-sm">
                                                <option value="kg">kg</option>
                                                <option value="L">L</option>
                                                <option value="g">g</option>
                                                <option value="ml">ml</option>
                                                <option value="포">포</option>
                                            </select>
                                            <input type="text" placeholder="용도/배수" value={m.purpose} onChange={e => updateMaterial(m.id, 'purpose', e.target.value)} className="flex-2 h-9 px-3 bg-white border-none rounded-xl text-xs font-bold" />
                                            <button type="button" onClick={() => removeMaterial(m.id)} className="p-2 text-rose-400 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="col-span-2 space-y-4">
                                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-3xl border border-slate-100">
                                    <div className="flex-1 grid grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase">Temp (°C)</label>
                                            <input type="number" step="0.1" value={formData.env_data.temp} onChange={e => setFormData({ ...formData, env_data: { ...formData.env_data, temp: e.target.value } })} className="w-full h-9 px-3 bg-white border-none rounded-xl text-xs font-black shadow-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase">Humid (%)</label>
                                            <input type="number" step="0.1" value={formData.env_data.humidity} onChange={e => setFormData({ ...formData, env_data: { ...formData.env_data, humidity: e.target.value } })} className="w-full h-9 px-3 bg-white border-none rounded-xl text-xs font-black shadow-sm" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase">CO2 (ppm)</label>
                                            <input type="number" value={formData.env_data.co2} onChange={e => setFormData({ ...formData, env_data: { ...formData.env_data, co2: e.target.value } })} className="w-full h-9 px-3 bg-white border-none rounded-xl text-xs font-black shadow-sm" />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                // Mock sensor data
                                                // const sensorData = await invoke('get_virtual_sensor_data');
                                                const sensorData = { temperature: 24.5, humidity: 65.0, co2: 450 };
                                                setFormData({
                                                    ...formData,
                                                    env_data: {
                                                        temp: sensorData.temperature.toString(),
                                                        humidity: sensorData.humidity.toString(),
                                                        co2: sensorData.co2.toString()
                                                    }
                                                });
                                            } catch (err) {
                                                console.error('Sensor fetch failed:', err);
                                            }
                                        }}
                                        className="ml-4 p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-all flex flex-col items-center gap-1 min-w-[80px]"
                                    >
                                        <Activity size={18} />
                                        <span className="text-[9px] font-black">센서값<br />가져오기</span>
                                    </button>
                                </div>
                            </div>

                            <div className="col-span-2 space-y-3">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">증빙 자료/영수증</label>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => handleFileUpload('photo')} className="flex-1 h-16 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-[10px] flex flex-col items-center justify-center gap-1 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600 transition-all"><Camera size={18} /> 현장 사진</button>
                                    <button type="button" onClick={() => handleFileUpload('receipt')} className="flex-1 h-16 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-[10px] flex flex-col items-center justify-center gap-1 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all"><FileText size={18} /> 영수증</button>
                                </div>
                                {formData.photos?.length > 0 && (
                                    <div className="grid grid-cols-4 gap-2 mt-2">
                                        {formData.photos.map(p => (
                                            <div key={p.id} className="relative aspect-square rounded-xl border border-slate-100 bg-slate-50 overflow-hidden group">
                                                <img src={p.displayPath} alt={p.label} className="w-full h-full object-cover" />
                                                <button onClick={() => removeAttachment(p.id)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><CloseIcon size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 flex gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 h-12 rounded-2xl font-black text-sm text-slate-400 hover:bg-slate-100">취소</button>
                            <button onClick={handleSave} className="flex-1 h-12 bg-indigo-600 rounded-2xl font-black text-sm text-white shadow-xl shadow-indigo-100 hover:bg-indigo-500">
                                {editingLog ? '기록 수정 완료' : '현장 일지 저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
            />
        </div>
    );
};

export default ProductionLogs;
