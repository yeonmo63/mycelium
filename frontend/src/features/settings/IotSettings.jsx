import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { callBridge as invoke } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Cpu,
    Plus,
    Edit2,
    Trash2,
    Wifi,
    Usb,
    Activity,
    CheckCircle2,
    Lock,
    Settings,
    MapPin,
    Radio
} from 'lucide-react';

const IotSettings = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();

    const [sensors, setSensors] = useState([]);
    const [spaces, setSpaces] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [editingSensor, setEditingSensor] = useState(null);
    const [formData, setFormData] = useState({
        sensor_name: '',
        space_id: null,
        device_type: 'wifi',
        connection_info: '',
        is_active: true
    });

    const checkRunComp = React.useRef(false);
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
    }, [checkAdmin, navigate]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [sensorList, spaceList] = await Promise.all([
                invoke('get_sensors'),
                invoke('get_production_spaces')
            ]);
            setSensors(sensorList || []);
            setSpaces(spaceList || []);
        } catch (err) {
            console.error("Failed to load IoT settings:", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthorized) {
            loadData();
        }
    }, [isAuthorized, loadData]);

    const handleEdit = (sensor) => {
        setEditingSensor(sensor);
        setFormData({
            sensor_name: sensor.sensor_name,
            space_id: sensor.space_id,
            device_type: sensor.device_type,
            connection_info: sensor.connection_info || '',
            is_active: sensor.is_active
        });
    };

    const handleReset = () => {
        setEditingSensor(null);
        setFormData({
            sensor_name: '',
            space_id: null,
            device_type: 'wifi',
            connection_info: '',
            is_active: true
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.sensor_name.trim()) {
            showAlert('필수 입력', '장비 이름을 입력해주세요.');
            return;
        }

        try {
            await invoke('save_sensor', {
                sensor: {
                    ...formData,
                    sensor_id: editingSensor ? editingSensor.sensor_id : 0,
                    space_id: formData.space_id ? parseInt(formData.space_id) : null
                }
            });

            showAlert('저장 완료', editingSensor ? '장비 정보가 수정되었습니다.' : '새로운 장비가 등록되었습니다.');
            handleReset();
            loadData();
        } catch (err) {
            showAlert('저장 실패', '오류가 발생했습니다: ' + err);
        }
    };

    const handleDelete = async (sensor) => {
        if (!await showConfirm('장치 삭제', `[${sensor.sensor_name}] 장치를 비활성화하시겠습니까?`)) return;
        try {
            await invoke('delete_sensor', { sensorId: sensor.sensor_id });
            loadData();
            if (editingSensor?.sensor_id === sensor.sensor_id) handleReset();
        } catch (err) {
            showAlert('삭제 실패', '오류가 발생했습니다: ' + err);
        }
    };

    if (!isAuthorized) {
        return (
            <div className="flex h-full items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400 font-bold">인증 확인 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-4">
                <div className="flex justify-between items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-emerald-500 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-emerald-600 uppercase">IoT Device Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter">
                            IoT 장비 관리 <span className="text-slate-300 font-light ml-1 text-xl">Integrated Gateway</span>
                        </h1>
                    </div>
                </div>
            </div>

            <div className="flex-1 px-6 lg:px-8 min-[2000px]:px-12 pb-8 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">

                    {/* LEFT: Registration Form */}
                    <div className="lg:col-span-4 flex flex-col gap-6">
                        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden ring-1 ring-slate-900/5 sticky top-0">
                            <div className="px-8 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="font-black text-slate-800 flex items-center gap-2">
                                    <Settings size={20} className="text-emerald-500" />
                                    {editingSensor ? '장비 설정 수정' : '새 장비 등록'}
                                </h3>
                                {editingSensor && (
                                    <button onClick={handleReset} className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-all">신규 등록</button>
                                )}
                            </div>

                            <form onSubmit={handleSave} className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label htmlFor="sensor-name-input" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">장비 이름</label>
                                    <input
                                        id="sensor-name-input"
                                        type="text"
                                        value={formData.sensor_name}
                                        onChange={e => setFormData({ ...formData, sensor_name: e.target.value })}
                                        placeholder="예: 1번 온실 메인 센서"
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm ring-1 ring-slate-200 focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="space-select" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">설치 구획</label>
                                    <select
                                        id="space-select"
                                        value={formData.space_id || ''}
                                        onChange={e => setFormData({ ...formData, space_id: e.target.value || null })}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm ring-1 ring-slate-200"
                                    >
                                        <option value="">구획 미지정</option>
                                        {spaces.map(s => <option key={s.space_id} value={s.space_id}>{s.space_name}</option>)}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left text-left">연결 방식</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['wifi', 'usb', 'virtual'].map(type => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, device_type: type })}
                                                className={`py-3 rounded-xl border-2 font-black text-[10px] uppercase flex flex-col items-center gap-1 transition-all ${formData.device_type === type ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-50 text-slate-400 hover:border-slate-100'
                                                    }`}
                                            >
                                                {type === 'wifi' ? <Wifi size={14} /> : type === 'usb' ? <Usb size={14} /> : <Cpu size={14} />}
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 text-left">연결 정보 (IP/COM포트)</label>
                                    <input
                                        type="text"
                                        value={formData.connection_info}
                                        onChange={e => setFormData({ ...formData, connection_info: e.target.value })}
                                        placeholder={formData.device_type === 'wifi' ? "192.168.1.100" : formData.device_type === 'usb' ? "COM3" : "Internal PID"}
                                        className="w-full h-12 px-5 bg-slate-50 border-none rounded-xl font-bold text-sm ring-1 ring-slate-200"
                                    />
                                </div>

                                <button type="submit" className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-100 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2">
                                    <CheckCircle2 size={18} /> {editingSensor ? '설정 내역 저장' : '장비 등록 완료'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* RIGHT: Sensor List */}
                    <div className="lg:col-span-8 flex flex-col gap-4">
                        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden flex flex-col h-full">
                            <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                                        <Activity size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 capitalize tracking-widest">Active Gateways</p>
                                        <p className="font-black text-slate-700">관리 중인 장비: {sensors.length}개</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                                        <tr>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">장비명/방식</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">설치 구획</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">연결 주소</th>
                                            <th className="px-6 py-4 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {sensors.map(s => (
                                            <tr key={s.sensor_id} className="hover:bg-slate-50/50 transition-all group">
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${s.device_type === 'wifi' ? 'bg-blue-50 text-blue-500' : s.device_type === 'usb' ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                            {s.device_type === 'wifi' ? <Wifi size={16} /> : s.device_type === 'usb' ? <Usb size={16} /> : <Cpu size={16} />}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-slate-700">{s.sensor_name}</p>
                                                            <p className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">{s.device_type} connection</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin size={14} className="text-slate-200" />
                                                        <span className="text-xs font-bold text-slate-600">
                                                            {spaces.find(sp => sp.space_id === s.space_id)?.space_name || '미지정'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <code className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-indigo-500">
                                                        {s.connection_info || 'N/A'}
                                                    </code>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleEdit(s)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"><Edit2 size={16} /></button>
                                                        <button onClick={() => handleDelete(s)} className="p-2 text-slate-300 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IotSettings;
