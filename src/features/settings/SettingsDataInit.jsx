import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useModal } from '../../contexts/ModalContext';
import {
    Database,
    Sprout,
    Grape,
    Cherry,
    CheckCircle2,
    AlertTriangle,
    Loader2
} from 'lucide-react';

const PRESETS = [
    {
        id: 'mushroom',
        name: '버섯 농장 (표고/느타리)',
        description: '표고버섯, 느타리버섯 재배에 최적화된 초기 데이터입니다.',
        details: [
            '기본 품목: 생표고(1kg/2kg), 건표고, 원물',
            '자재: 박스(1kg/2kg), 스티커, 아이스팩',
            'BOM: 생표고 1kg 생산 레시피 포함',
            '구역: 1~3동 재배사, 저온창고, 선별장'
        ],
        icon: Sprout,
        color: 'indigo',
        active: true
    },
    {
        id: 'strawberry',
        name: '딸기 농장 (준비중)',
        description: '딸기 수경재배/토경재배를 위한 표준 데이터입니다.',
        details: [
            '기본 품목: 딸기(특/상/보통), 잼용 딸기',
            '스티로폼 박스, 난좌, 필름',
            '선별장, 예냉실 구성'
        ],
        icon: Grape, // Strawberry icon not directly available in lucide basic set without lookup, using generic fruit
        color: 'rose',
        active: false
    },
    {
        id: 'tomato',
        name: '토마토 농장 (준비중)',
        description: '방울토마토/완숙토마토 농가를 위한 설정입니다.',
        details: [
            '기본 품목: 방울토마토(3kg/5kg)',
            '박스, 컵 포장재',
            '양액기, 재배동 구성'
        ],
        icon: Cherry, // Tomato icon alternative
        color: 'orange',
        active: false
    }
];

const SettingsDataInit = () => {
    const navigate = useNavigate();
    const { showConfirm, showAlert } = useModal();
    const [loading, setLoading] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState(null);

    const handleApply = async () => {
        if (!selectedPreset) return;

        const preset = PRESETS.find(p => p.id === selectedPreset);
        if (!preset) return;

        const ok = await showConfirm(
            "데이터 초기화",
            `'${preset.name}' 프리셋을 적용하시겠습니까?\n\n기존 데이터가 있는 경우, 중복되지 않는 항목만 추가됩니다.\n이미 존재하는 품목명이나 구역명은 건너뜁니다.`
        );

        if (!ok) return;

        setLoading(true);
        try {
            await invoke('apply_preset', { presetType: preset.id });
            await showAlert("적용 완료", "성공적으로 데이터가 추가되었습니다.\n[상품 관리] 및 [생산 구역] 메뉴에서 확인해보세요.");
            navigate('/settings/product-list');
        } catch (error) {
            console.error(error);
            await showAlert("오류", "적용 중 오류가 발생했습니다: " + error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-8 pb-4 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">System Init</span>
                </div>
                <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    업종별 데이터 초기화 <span className="text-slate-300 font-light ml-1 text-xl">Presets</span>
                </h1>
                <p className="text-slate-400 text-xs font-bold mt-2 ml-1">
                    농장 유형에 맞는 기본 데이터(상품, 자재, BOM, 구역)를 한 번에 설정합니다.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 lg:px-8 min-[2000px]:px-12 pb-12">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl">
                    {PRESETS.map((preset) => (
                        <div
                            key={preset.id}
                            onClick={() => preset.active && !loading && setSelectedPreset(preset.id)}
                            className={`
                                relative rounded-[2rem] p-8 border-2 transition-all cursor-pointer group
                                ${!preset.active ? 'opacity-50 grayscale cursor-not-allowed border-slate-100 bg-slate-50' :
                                    selectedPreset === preset.id
                                        ? `border-${preset.color}-500 bg-white ring-4 ring-${preset.color}-500/10 shadow-xl shadow-${preset.color}-500/20 transform scale-[1.02]`
                                        : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1'
                                }
                            `}
                        >
                            <div className={`
                                w-16 h-16 rounded-3xl flex items-center justify-center mb-6 text-2xl shadow-lg
                                ${preset.active
                                    ? `bg-${preset.color}-50 text-${preset.color}-600 shadow-${preset.color}-200`
                                    : 'bg-slate-100 text-slate-400'
                                }
                            `}>
                                <preset.icon size={32} strokeWidth={2.5} />
                            </div>

                            <h3 className="text-xl font-black text-slate-700 mb-2">{preset.name}</h3>
                            <p className="text-sm font-bold text-slate-400 leading-relaxed mb-6 min-h-[40px]">
                                {preset.description}
                            </p>

                            <div className="space-y-3 mb-8">
                                {preset.details.map((detail, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                        <CheckCircle2 size={14} className={preset.active ? `text-${preset.color}-500` : "text-slate-300"} />
                                        {detail}
                                    </div>
                                ))}
                            </div>

                            {!preset.active && (
                                <div className="absolute top-6 right-6 px-3 py-1 bg-slate-100 text-slate-400 text-[10px] font-black rounded-lg uppercase tracking-wide">
                                    Coming Soon
                                </div>
                            )}

                            {selectedPreset === preset.id && (
                                <div className={`absolute top-6 right-6 px-3 py-1 bg-${preset.color}-100 text-${preset.color}-600 text-[10px] font-black rounded-lg uppercase tracking-wide flex items-center gap-1`}>
                                    <CheckCircle2 size={12} /> Selected
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="bg-white border-t border-slate-100 px-6 lg:px-8 py-6 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-500 bg-amber-50 px-4 py-2 rounded-xl border border-amber-100">
                    <AlertTriangle size={16} />
                    <p className="text-xs font-bold">
                        주의: 이미 등록된 상품명과 동일한 항목은 건너뛰고, 없는 항목만 새로 추가됩니다.
                    </p>
                </div>

                <button
                    onClick={handleApply}
                    disabled={!selectedPreset || loading}
                    className={`
                        h-12 px-8 rounded-xl font-black text-sm flex items-center gap-2 shadow-lg transition-all
                        ${!selectedPreset || loading
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-200 active:scale-95'
                        }
                    `}
                >
                    {loading ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            처리중...
                        </>
                    ) : (
                        <>
                            <Database size={18} />
                            데이터 적용하기
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

export default SettingsDataInit;
