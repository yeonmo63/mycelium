import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { Camera, Save, ArrowLeft, Thermometer, Droplets, MapPin, LayoutDashboard, ClipboardList, CirclePlus } from 'lucide-react';
import dayjs from 'dayjs';

const MobileWorkLog = () => {
    const navigate = useNavigate();
    const { showAlert } = useModal();
    const [spaces, setSpaces] = useState([]);
    const [batches, setBatches] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [formData, setFormData] = useState({
        log_id: 0,
        batch_id: null,
        space_id: null,
        log_date: dayjs().format('YYYY-MM-DD'),
        worker_name: sessionStorage.getItem('username') || '',
        work_type: '일반작업',
        work_content: '',
        input_materials: null,
        env_data: { temp: '', humi: '' },
        photos: null
    });

    useEffect(() => {
        loadBaseData();
    }, []);

    const loadBaseData = async () => {
        try {
            const [sRes, bRes] = await Promise.all([
                callBridge('get_production_spaces'),
                callBridge('get_production_batches')
            ]);
            setSpaces(sRes || []);
            setBatches(bRes || []);
        } catch (e) {
            console.error(e);
            showAlert("데이터 로드 실패", "실제 생산 정보를 가져오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.work_content) {
            showAlert("입력 확인", "작업 내용을 입력해 주세요.");
            return;
        }

        try {
            const res = await callBridge('save_farming_log', { log: formData });
            if (res && res.success) {
                showAlert("저장 완료", "현장 작업 일지가 성공적으로 기록되었습니다.");
                setFormData(prev => ({
                    ...prev,
                    work_content: '',
                    env_data: { temp: '', humi: '' }
                }));
            } else {
                throw new Error(res?.error || "Unknown error");
            }
        } catch (e) {
            console.error(e);
            showAlert("저장 실패", "일지 기록 중 오류가 발생했습니다: " + e);
        }
    };

    const handlePhoto = () => {
        // Placeholder for real camera implementation
        showAlert("카메라 연동", "모바일 브라우저의 카메라 권한을 요청하거나 사진첩을 엽니다. (현재 시뮬레이션)");
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-20">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 p-4 pt-8 sticky top-0 z-50 flex items-center justify-between">
                <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400" onClick={() => window.history.back()}>
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-lg font-black text-slate-800">현장 작업 일지</h1>
                <div className="w-10"></div>
            </div>

            <div className="p-5 space-y-6">
                {/* Space & Batch Selection */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                    <div className="flex items-center gap-3 text-slate-800 font-black mb-2">
                        <MapPin size={18} className="text-indigo-500" />
                        <span>작업 구역/배치 선택</span>
                    </div>

                    <div className="space-y-3">
                        <select
                            className="w-full h-14 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700 appearance-none bg-no-repeat bg-[right_1rem_center]"
                            value={formData.space_id || ''}
                            onChange={(e) => setFormData({ ...formData, space_id: e.target.value ? parseInt(e.target.value) : null })}
                        >
                            <option value="">구역 선택 (필수 제외)</option>
                            {spaces.map(s => (
                                <option key={s.space_id} value={s.space_id}>{s.space_name}</option>
                            ))}
                        </select>

                        <select
                            className="w-full h-14 bg-slate-50 border-none rounded-2xl px-4 text-sm font-bold text-slate-700"
                            value={formData.batch_id || ''}
                            onChange={(e) => setFormData({ ...formData, batch_id: e.target.value ? parseInt(e.target.value) : null })}
                        >
                            <option value="">생산 배치 선택 (필수 제외)</option>
                            {batches.map(b => (
                                <option key={b.batch_id} value={b.batch_id}>{b.batch_code}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Env Data */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
                            <Thermometer size={18} />
                        </div>
                        <input
                            type="number"
                            placeholder="온도"
                            className="w-full bg-transparent border-none text-sm font-black text-slate-800 placeholder:text-slate-300"
                            value={formData.env_data.temp}
                            onChange={(e) => setFormData({ ...formData, env_data: { ...formData.env_data, temp: e.target.value } })}
                        />
                        <span className="text-xs font-bold text-slate-400">°C</span>
                    </div>
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                            <Droplets size={18} />
                        </div>
                        <input
                            type="number"
                            placeholder="습도"
                            className="w-full bg-transparent border-none text-sm font-black text-slate-800 placeholder:text-slate-300"
                            value={formData.env_data.humi}
                            onChange={(e) => setFormData({ ...formData, env_data: { ...formData.env_data, humi: e.target.value } })}
                        />
                        <span className="text-xs font-bold text-slate-400">%</span>
                    </div>
                </div>

                {/* Work Content */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                    <div className="flex items-center gap-3 text-slate-800 font-black mb-2">
                        <ClipboardList size={18} className="text-indigo-500" />
                        <span>작업 내용 기록</span>
                    </div>
                    <textarea
                        className="w-full min-h-[150px] bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-700 placeholder:text-slate-300 resize-none"
                        placeholder="어떤 작업을 하셨나요? (예: 영양제 살포, 솎아주기 등)"
                        value={formData.work_content}
                        onChange={(e) => setFormData({ ...formData, work_content: e.target.value })}
                    />
                </div>

                {/* Photo */}
                <button
                    onClick={handlePhoto}
                    className="w-full bg-white p-6 rounded-3xl shadow-sm border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 group active:bg-slate-50 transition-colors"
                >
                    <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                        <Camera size={24} />
                    </div>
                    <span className="text-sm font-black text-slate-400 group-hover:text-indigo-500">현장 사진 첨부 (선택)</span>
                </button>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 p-4 pb-24 bg-white/80 backdrop-blur-xl border-t border-slate-100 z-40">
                <button
                    onClick={handleSave}
                    className="w-full h-14 bg-indigo-600 rounded-2xl text-white font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
                >
                    <Save size={20} />
                    일지 저장하기
                </button>
            </div>

            {/* Bottom Tab Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around h-20 px-4 pb-4 z-50">
                <button onClick={() => navigate('/mobile-dashboard')} className="flex flex-col items-center gap-1 text-slate-400">
                    <LayoutDashboard size={24} />
                    <span className="text-[10px] font-black">현황판</span>
                </button>
                <button onClick={() => navigate('/mobile-worklog')} className="flex flex-col items-center gap-1 text-indigo-600">
                    <ClipboardList size={24} />
                    <span className="text-[10px] font-black">작업일지</span>
                </button>
                <button onClick={() => navigate('/mobile-harvest')} className="flex flex-col items-center gap-1 text-slate-400">
                    <CirclePlus size={24} />
                    <span className="text-[10px] font-black">수확입력</span>
                </button>
            </div>
        </div>
    );
};

export default MobileWorkLog;
