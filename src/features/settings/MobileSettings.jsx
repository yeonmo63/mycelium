import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import { Smartphone, Laptop, QrCode, Wifi, ShieldCheck, ArrowRight } from 'lucide-react';

const MobileSettings = () => {
    const { showAlert } = useModal();
    const [localIp, setLocalIp] = useState('Checking...');
    const [port] = useState('8989'); // Prod Mobile Server Port
    const [isServerActive, setIsServerActive] = useState(false);

    useEffect(() => {
        loadNetworkInfo();
    }, []);

    const loadNetworkInfo = async () => {
        try {
            const ip = await invoke('get_local_ip_command').catch(() => '127.0.0.1');
            setLocalIp(ip || '127.0.0.1');
            setIsServerActive(true);
        } catch (e) {
            console.error(e);
            setLocalIp('127.0.0.1');
        }
    };

    const mobileUrl = `http://${localIp}:${port}/mobile-dashboard`;

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-700">
            <div className="max-w-4xl mx-auto w-full py-12 px-6">
                {/* Header */}
                <div className="mb-10 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black tracking-widest uppercase mb-4">
                        <Smartphone size={12} />
                        Connected Farm Ecosystem
                    </div>
                    <h1 className="text-4xl font-black text-slate-800 tracking-tight">모바일 연동 센터</h1>
                    <p className="mt-3 text-slate-500 font-medium">현장 작업자의 기기를 연결하여 생산성을 극대화하세요.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left: QR Section */}
                    <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                        <div className="relative p-6 bg-slate-50 rounded-[2rem] mb-6 group">
                            <div className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-full scale-0 group-hover:scale-100 transition-transform duration-700"></div>
                            <QRCodeSVG
                                value={mobileUrl}
                                size={200}
                                level="H"
                                includeMargin={true}
                                className="relative z-10"
                            />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-black text-slate-700 text-lg">QR 코드로 빠른 연결</h3>
                            <p className="text-sm text-slate-400 font-bold">스마트폰 카메라로 스캔하여 즉시 현장 대시보드에 접속합니다.</p>
                        </div>
                        <div className="mt-8 bg-indigo-50/50 px-6 py-3 rounded-2xl border border-indigo-100 flex items-center gap-3">
                            <code className="text-indigo-600 font-black tracking-wider text-sm">{mobileUrl}</code>
                        </div>
                    </div>

                    {/* Right: Info Section */}
                    <div className="space-y-6">
                        <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-slate-100 space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                                    <Wifi size={24} />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-700">동일한 네트워크 필요</h4>
                                    <p className="text-sm text-slate-500 font-medium mt-1">데스크탑과 모바일 기기가 같은 와이파이(Wi-Fi)에 연결되어 있어야 합니다.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                    <ShieldCheck size={24} />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-700">안전한 데이터 보안</h4>
                                    <p className="text-sm text-slate-500 font-medium mt-1">별도의 클라우드 거침없이 농장 내부망을 통해 직접 데이터를 송수신합니다.</p>
                                </div>
                            </div>
                        </div>

                        {/* Shortcuts */}
                        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-8 rounded-[2rem] text-white shadow-xl shadow-indigo-200 relative overflow-hidden group">
                            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 blur-3xl rounded-full group-hover:scale-150 transition-transform duration-700"></div>
                            <h4 className="font-black text-xl mb-4 relative z-10">모바일 전용 화면</h4>
                            <div className="space-y-3 relative z-10 font-bold text-sm">
                                <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors cursor-pointer group/item">
                                    <span>수확량 실시간 입력</span>
                                    <ArrowRight size={16} className="group-hover/item:translate-x-1 transition-transform" />
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors cursor-pointer group/item">
                                    <span>현장 생산 일지 작성</span>
                                    <ArrowRight size={16} className="group-hover/item:translate-x-1 transition-transform" />
                                </div>
                                <div className="flex items-center justify-between p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors cursor-pointer group/item">
                                    <span>실시간 매출 모니터링</span>
                                    <ArrowRight size={16} className="group-hover/item:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Warning */}
                <div className="mt-12 p-6 bg-slate-100/50 rounded-2xl border border-dashed border-slate-200 text-center">
                    <p className="text-xs text-slate-400 font-bold italic">
                        * 외부망에서 접속을 원하실 경우 포트 포워딩(Port Forwarding) 또는 클라우드 동기화 설정을 별도로 진행해야 합니다.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MobileSettings;
