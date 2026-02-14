import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { Smartphone, Laptop, QrCode, Wifi, ShieldCheck, ArrowRight, Lock, Globe, Save, RefreshCw } from 'lucide-react';

const MobileSettings = () => {
    const { showAlert, showConfirm } = useModal();
    const [localIp, setLocalIp] = useState('Checking...');
    const [port] = useState('8989');
    const [isServerActive, setIsServerActive] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Mobile Config State
    const [config, setConfig] = useState({
        remote_ip: '',
        access_pin: '',
        use_pin: false
    });

    const [viewMode, setViewMode] = useState('local'); // 'local' or 'remote'

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [ip, mobileConfig] = await Promise.all([
                invoke('get_local_ip_command').catch(() => '127.0.0.1'),
                invoke('get_mobile_config')
            ]);
            setLocalIp(ip || '127.0.0.1');
            setConfig(mobileConfig || { remote_ip: '', access_pin: '', use_pin: false });
            setIsServerActive(true);
        } catch (e) {
            console.error(e);
            setLocalIp('127.0.0.1');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await invoke('save_mobile_config', { config });
            showAlert("저장 완료", "모바일 연동 설정이 안전하게 저장되었습니다.");
        } catch (e) {
            console.error(e);
            showAlert("저장 실패", "설정 저장 중 오류가 발생했습니다.");
        } finally {
            setIsSaving(false);
        }
    };

    const localUrl = `http://${localIp}:${port}/mobile-dashboard`;
    const remoteUrl = config.remote_ip ? `http://${config.remote_ip}:${port}/mobile-dashboard` : null;
    const activeUrl = viewMode === 'local' ? localUrl : remoteUrl;

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-700 overflow-y-auto">
            <div className="max-w-4xl mx-auto w-full py-12 px-6 pb-24">
                {/* Header */}
                <div className="mb-10 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black tracking-widest uppercase mb-4">
                        <Smartphone size={12} />
                        Connected Farm Ecosystem
                    </div>
                    <h1 className="text-4xl font-black text-slate-800 tracking-tight">모바일 연동 센터</h1>
                    <p className="mt-3 text-slate-500 font-medium">현장 작업자의 기기를 연결하여 생산성을 극대화하세요.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    {/* Left: QR Section */}
                    <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center relative overflow-hidden">
                        {/* View Mode Switch */}
                        <div className="absolute top-6 left-6 right-6 flex p-1 bg-slate-50 rounded-2xl">
                            <button
                                onClick={() => setViewMode('local')}
                                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${viewMode === 'local' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Wifi size={14} /> 내부망 (Wi-Fi)
                                </div>
                            </button>
                            <button
                                onClick={() => setViewMode('remote')}
                                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${viewMode === 'remote' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Globe size={14} /> 외부망 (노지)
                                </div>
                            </button>
                        </div>

                        <div className="mt-12 mb-6">
                            {activeUrl ? (
                                <div className="relative p-6 bg-slate-50 rounded-[2rem] group">
                                    <div className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-full scale-0 group-hover:scale-100 transition-transform duration-700"></div>
                                    <QRCodeSVG
                                        value={activeUrl}
                                        size={180}
                                        level="H"
                                        includeMargin={true}
                                        className="relative z-10"
                                    />
                                </div>
                            ) : (
                                <div className="w-[228px] h-[228px] bg-slate-50 rounded-[2rem] flex flex-col items-center justify-center text-slate-300 gap-3 border-2 border-dashed border-slate-100">
                                    <Globe size={40} />
                                    <span className="text-xs font-bold px-8">외부 IP(Tailscale)를<br />먼저 입력해주세요.</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <h3 className="font-black text-slate-700 text-lg">
                                {viewMode === 'local' ? '로컬 접속 QR' : '원격 접속 QR'}
                            </h3>
                            <p className="text-sm text-slate-400 font-bold">
                                {viewMode === 'local'
                                    ? '같은 네트워크 환경에서 사용합니다.'
                                    : 'Tailscale 연결 후 어디서든 접속 가능합니다.'}
                            </p>
                        </div>

                        <div className="mt-8 bg-indigo-50/50 px-6 py-3 rounded-2xl border border-indigo-100 flex items-center gap-3 max-w-full">
                            <code className="text-indigo-600 font-black tracking-wider text-[10px] truncate">
                                {activeUrl || '주소 정보 없음'}
                            </code>
                        </div>
                    </div>

                    {/* Right: Security & Remote Config */}
                    <div className="space-y-6">
                        <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-slate-100 space-y-6">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                                    <ShieldCheck size={20} />
                                </div>
                                <h3 className="font-black text-slate-800">보안 및 원격 설정</h3>
                            </div>

                            {/* Remote IP */}
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 ml-1">Tailscale IP 주소</label>
                                <div className="group">
                                    <input
                                        type="text"
                                        placeholder="100.xx.xx.xx"
                                        className="w-full h-12 bg-slate-50 border-none rounded-2xl px-6 text-sm font-bold text-slate-700 placeholder:text-slate-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all text-center"
                                        value={config.remote_ip}
                                        onChange={(e) => setConfig({ ...config, remote_ip: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* PIN Use Toggle */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                                <div className="flex items-center gap-3">
                                    <Lock size={18} className="text-slate-500" />
                                    <div>
                                        <div className="text-xs font-black text-slate-700">모바일 PIN 보안 사용</div>
                                        <div className="text-[10px] text-slate-400 font-bold">로그인 없이 바로 접속 방지</div>
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.use_pin}
                                        onChange={(e) => setConfig({ ...config, use_pin: e.target.checked })}
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            {/* PIN Code */}
                            {config.use_pin && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-xs font-black text-slate-400 ml-1">접속 PIN 번호 (4~6자리)</label>
                                    <input
                                        type="password"
                                        maxLength={6}
                                        placeholder="설정할 PIN 번호 입력"
                                        className="w-full h-12 bg-slate-50 border-none rounded-2xl px-4 text-center text-lg font-black tracking-[0.5em] text-slate-700 placeholder:text-sm placeholder:tracking-normal focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        value={config.access_pin}
                                        onChange={(e) => setConfig({ ...config, access_pin: e.target.value.replace(/[^0-9]/g, '') })}
                                    />
                                </div>
                            )}

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="w-full h-12 bg-indigo-600 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                                설정사항 저장하기
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer Warning */}
                <div className="mt-8 p-6 bg-slate-100/50 rounded-2xl border border-dashed border-slate-200">
                    <h4 className="text-xs font-black text-slate-500 mb-2">노지/외부에서 접속하시나요?</h4>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                        1. 각 기기에 **Tailscale**을 설치하고 로그인하세요.<br />
                        2. 메인 컴퓨터의 Tailscale IP를 상단 설정에 입력하세요.<br />
                        3. 외부망 모드(Globe 아이콘)로 변경된 QR코드를 스마트폰으로 스캔하세요.<br />
                        4. 보안을 위해 반드시 **PIN 보안 사용**을 권장합니다.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MobileSettings;
