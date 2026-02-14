import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { callBridge } from '../../utils/apiBridge';
import { useModal } from '../../contexts/ModalContext';
import { useAdminGuard } from '../../hooks/useAdminGuard';
import {
    Database,
    Sprout,
    Grape,
    Cherry,
    CheckCircle2,
    AlertTriangle,
    Loader2,
    X,
    Package,
    ChefHat,
    MapPin,
    ArrowRight,
    Sparkles,
    Trees,
    Smartphone,
    Save,
    History,
    Trash2,
    PlusCircle,
    User,
    Lock,
    XCircle,
    ShieldAlert
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
        name: '딸기 농가',
        description: '딸기 수경재배/토경재배를 위한 표준 데이터입니다.',
        details: [
            '기본 품목: 딸기(특/상), 잼용 딸기',
            '자재: 투명팩, 난좌, 잼 공병',
            'BOM: 선물용 딸기, 수제잼 레시피',
            '구역: 수경재배동, 육묘장, 예냉실'
        ],
        icon: Grape,
        color: 'rose',
        active: true
    },
    {
        id: 'potato',
        name: '식량 작물 (감자)',
        description: '감자, 고구마 등 식량 작물 농가를 위한 설정입니다.',
        details: [
            '기본 품목: 수미감자(왕특/특), 알감자',
            '자재: 전용박스(10kg/5kg), 그물망',
            'BOM: 선별 감자 박스 포장 레시피',
            '구역: 노지 필지, 저온저장고, 선별장'
        ],
        icon: Trees,
        color: 'amber',
        active: true
    },
    {
        id: 'shinemuscat',
        name: '샤인머스켓 농가',
        description: '포도(샤인머스켓) 재배 및 포장 농가를 위한 설정입니다.',
        details: [
            '기본 품목: 샤인머스켓(특/상), 원물',
            '자재: 전용 박스(2kg), 에어셀, 띠지',
            'BOM: 샤인머스켓 2kg 포장 레시피',
            '구역: 연동하우스, 예냉실, 소포장실'
        ],
        icon: Grape,
        color: 'lime',
        active: true
    },
    {
        id: 'apple',
        name: '과수 농가 (사과)',
        description: '사과(부사) 재배 및 자동 선별 농가를 위한 설정입니다.',
        details: [
            '기본 품목: 꿀사과(대과/중과), 원물',
            '자재: 전용 박스(5kg), 난좌, 폼 캡',
            'BOM: 사과 5kg 박스 포장 레시피',
            '구역: 과수원 구역, 대형 저장고, 선별장'
        ],
        icon: Cherry,
        color: 'red',
        active: true
    },
    {
        id: 'tomato',
        name: '토마토 농가',
        description: '방울토마토/완숙토마토 농가를 위한 설정입니다.',
        details: [
            '기본 품목: 대추방울토마토, 원물',
            '자재: 투명용기, 외박스, 직인 스티커',
            'BOM: 소포장 방울토마토 레시피',
            '구역: 생산동, 육묘실, 집하실'
        ],
        icon: Cherry,
        color: 'orange',
        active: true
    }
];

const PresetPreviewModal = ({ isOpen, onClose, onConfirm, preset, data, loading }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />

            <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl shadow-indigo-500/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
                {/* Modal Header */}
                <div className="p-8 pb-4 shrink-0 flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl bg-${preset.color}-50 flex items-center justify-center text-${preset.color}-600`}>
                            <preset.icon size={28} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`w-4 h-1 bg-${preset.color}-500 rounded-full`}></span>
                                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">Preset Preview</span>
                            </div>
                            <h2 className="text-2xl font-black text-slate-700 tracking-tight">
                                {preset.name} 구성 확인
                            </h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                        <div className="space-y-6">
                            <section>
                                <div className="flex items-center gap-2 mb-4 px-1">
                                    <Package size={18} className="text-indigo-500" />
                                    <h3 className="font-black text-slate-700">품목 및 자재 ({data.products.length})</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {data.products.map((p, idx) => (
                                        <div key={idx} className="bg-slate-50 border border-slate-100 p-3 rounded-2xl flex items-center justify-between group hover:bg-white hover:border-indigo-100 transition-all">
                                            <div>
                                                <div className="text-xs font-black text-slate-700">{p.name}</div>
                                                <div className="text-[10px] font-bold text-slate-400">{p.specification || '-'} | {p.category || '-'}</div>
                                            </div>
                                            <div className="text-xs font-black text-indigo-600">
                                                {p.price.toLocaleString()}원
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section>
                                <div className="flex items-center gap-2 mb-4 px-1">
                                    <MapPin size={18} className="text-rose-500" />
                                    <h3 className="font-black text-slate-700">생산/저장 구역 ({data.spaces.length})</h3>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {data.spaces.map((s, idx) => (
                                        <div key={idx} className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-[10px] font-black text-slate-500">
                                            {s.name} <span className="text-[8px] opacity-60 ml-1">({s.space_type})</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>

                        <div className="space-y-6">
                            <section>
                                <div className="flex items-center gap-2 mb-4 px-1">
                                    <ChefHat size={18} className="text-amber-500" />
                                    <h3 className="font-black text-slate-700">생산 레시피 (BOM)</h3>
                                </div>
                                <div className="space-y-3">
                                    {data.boms.map((bom, idx) => (
                                        <div key={idx} className="bg-slate-900 text-white p-4 rounded-3xl relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                                                <Sparkles size={40} />
                                            </div>
                                            <div className="text-[10px] font-black text-indigo-400 mb-1 uppercase tracking-wider">Production BOM</div>
                                            <div className="font-black text-lg mb-3 tracking-tight">{bom.product_name}</div>
                                            <div className="space-y-1.5">
                                                {bom.materials.map((m, midx) => (
                                                    <div key={midx} className="flex items-center justify-between text-xs font-bold text-slate-400">
                                                        <span>• {m.material_name}</span>
                                                        <span className="text-white">x{m.ratio}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-slate-400">
                        <AlertTriangle size={16} />
                        <span className="text-xs font-bold">이미 있는 품목/구역은 중복되지 않게 건너뜁니다.</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 h-12 rounded-xl font-black text-sm text-slate-400 hover:bg-slate-200 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={loading}
                            className={`
                                h-12 px-8 rounded-xl font-black text-sm flex items-center gap-2 shadow-lg transition-all active:scale-95
                                ${loading ? 'bg-slate-300' : `bg-${preset.color}-600 hover:bg-${preset.color}-500 text-white shadow-${preset.color}-200`}
                            `}
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
                            데이터 생성 시작
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SavePresetModal = ({ isOpen, onClose, onSave, loading }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-8 animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Save size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-700">현재 구성을 프리셋으로 저장</h2>
                        <p className="text-xs font-bold text-slate-400">나중에 동일하게 복원할 수 있습니다.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">프리셋 이름</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="우리 집 농장 구성 A"
                            className="w-full h-12 px-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">설명 (선택)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="상품 5종, BOM 3종 포함"
                            className="w-full h-24 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button
                        onClick={onClose}
                        className="flex-1 h-12 rounded-xl font-black text-sm text-slate-400 hover:bg-slate-50 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={() => onSave({ name, description })}
                        disabled={!name.trim() || loading}
                        className="flex-[2] h-12 bg-indigo-600 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:bg-slate-200 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        저장하기
                    </button>
                </div>
            </div>
        </div>
    );
};

const SettingsDbReset = () => {
    const navigate = useNavigate();
    const { showAlert, showConfirm } = useModal();
    const { isAuthorized, checkAdmin, isVerifying } = useAdminGuard();
    const [loading, setLoading] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [customPresets, setCustomPresets] = useState([]);
    const [confirmText, setConfirmText] = useState('');

    const checkRunComp = React.useRef(false);
    React.useEffect(() => {
        if (checkRunComp.current) return;
        checkRunComp.current = true;
        const init = async () => {
            const ok = await checkAdmin();
            if (!ok) navigate('/');
        };
        init();
    }, [checkAdmin, navigate]);

    const fetchCustomPresets = async () => {
        try {
            const data = await callBridge('get_custom_presets');
            setCustomPresets(data.map(cp => ({
                id: `custom_${cp.preset_id}`,
                name: cp.name,
                description: cp.description || '내가 저장한 전용 프리셋입니다.',
                details: [
                    `${cp.preset_data.products.length}개의 품목`,
                    `${cp.preset_data.boms.length}개의 레시피`,
                    `${cp.preset_data.spaces.length}개의 구역`
                ],
                icon: User,
                color: 'slate',
                active: true,
                isCustom: true,
                dbId: cp.preset_id
            })));
        } catch (error) {
            console.error(error);
        }
    };

    React.useEffect(() => {
        if (isAuthorized) {
            fetchCustomPresets();
        }
    }, [isAuthorized]);

    const handleSaveCurrent = async ({ name, description }) => {
        setLoading(true);
        try {
            await callBridge('save_current_as_preset', { name, description });
            setShowSaveModal(false);
            await showAlert("저장 완료", "현재 구성이 커스텀 프리셋으로 저장되었습니다.");
            fetchCustomPresets();
        } catch (error) {
            console.error(error);
            await showAlert("오류", "저장 중 오류가 발생했습니다: " + error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCustom = async (e, dbId) => {
        e.stopPropagation();
        if (await showConfirm("삭제 확인", "이 커스텀 프리셋을 정말 삭제하시겠습니까?")) {
            setLoading(true);
            try {
                await callBridge('delete_custom_preset', { presetId: dbId });
                fetchCustomPresets();
                if (selectedPreset === `custom_${dbId}`) setSelectedPreset(null);
            } catch (error) {
                console.error(error);
                await showAlert("오류", "삭제 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handlePreview = async () => {
        if (!selectedPreset) return;

        setLoading(true);
        try {
            const data = await callBridge('get_preset_data', { presetType: selectedPreset });
            setPreviewData(data);
            setShowPreview(true);
        } catch (error) {
            console.error(error);
            await showAlert("오류", "데이터를 불러오는 중 오류가 발생했습니다: " + error);
        } finally {
            setLoading(false);
        }
    };

    const handleApply = async () => {
        setLoading(true);
        try {
            await callBridge('apply_preset', { presetType: selectedPreset });
            setShowPreview(false);
            await showAlert("적용 완료", "프리셋 데이터가 성공적으로 반영되었습니다.");
            navigate('/settings/product-list');
        } catch (error) {
            console.error(error);
            await showAlert("오류", "적용 중 오류가 발생했습니다: " + error);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (confirmText !== '초기화') {
            showAlert('확인 필요', "'초기화'를 정확히 입력해주세요.");
            return;
        }

        if (!await showConfirm(
            '데이터 영구 삭제 경고',
            '정말로 모든 운영 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없으며 삭제된 데이터는 절대 복구할 수 없습니다.\n\n(※ 실행 전 백업을 강력히 권장합니다.)'
        )) return;

        setLoading(true);
        try {
            const msg = await callBridge('reset_database');
            await showAlert('초기화 완료', msg);
            setConfirmText('');
            fetchCustomPresets();
        } catch (err) {
            showAlert('초기화 실패', err);
        } finally {
            setLoading(false);
        }
    };

    const allPresets = [...PRESETS, ...customPresets];
    const currentPreset = allPresets.find(p => p.id === selectedPreset);

    if (!isAuthorized) {
        return (
            <div className="flex h-full items-center justify-center bg-[#f8fafc]">
                <div className="text-center animate-pulse">
                    {isVerifying ? (
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                    ) : (
                        <Lock size={48} className="mx-auto text-slate-300 mb-4" />
                    )}
                    <p className="text-slate-400 font-bold">
                        {isVerifying ? '인증 확인 중...' : '인증 대기 중...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-8 pb-4 shrink-0">
                <div className="flex items-end justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">System Init & Reset</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            데이터 초기화 및 프리셋 <span className="text-slate-300 font-light ml-1 text-xl tracking-normal">Factory Reset</span>
                        </h1>
                        <p className="text-slate-400 text-xs font-bold mt-2 ml-1">
                            농장 유형에 맞는 기본 데이터를 설정하거나, 나만의 구성을 저장하고 시스템을 완전히 청소합니다.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowSaveModal(true)}
                        className="group flex items-center gap-2 bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-100 hover:shadow-indigo-100/20 transition-all active:scale-95"
                    >
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                            <Save size={18} />
                        </div>
                        <div className="text-left">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Backup config</div>
                            <div className="text-xs font-black text-slate-700">현재 구성 저장하기</div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 lg:px-8 min-[2000px]:px-12 pb-12">
                {/* Section: Custom Presets */}
                {customPresets.length > 0 && (
                    <div className="mt-8 mb-4">
                        <div className="flex items-center gap-2 mb-6 px-1">
                            <History size={18} className="text-indigo-500" />
                            <h2 className="text-lg font-black text-slate-700">나만의 커스텀 프리셋</h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl">
                            {customPresets.map((preset) => (
                                <div
                                    key={preset.id}
                                    onClick={() => setSelectedPreset(preset.id)}
                                    className={`
                                        relative rounded-[2.5rem] p-8 border-2 transition-all cursor-pointer group
                                        ${selectedPreset === preset.id
                                            ? `border-indigo-500 bg-white ring-4 ring-indigo-500/10 shadow-xl shadow-indigo-500/20 transform scale-[1.02]`
                                            : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1'
                                        }
                                    `}
                                >
                                    <div className={`
                                        w-16 h-16 rounded-3xl flex items-center justify-center mb-6 text-2xl shadow-lg transition-transform group-hover:rotate-6
                                        bg-slate-50 text-indigo-600 shadow-indigo-100
                                    `}>
                                        <preset.icon size={32} strokeWidth={2.5} />
                                    </div>

                                    <h3 className="text-xl font-black text-slate-700 mb-2 truncate pr-10">{preset.name}</h3>
                                    <p className="text-sm font-bold text-slate-400 leading-relaxed mb-6 min-h-[40px]">
                                        {preset.description}
                                    </p>

                                    <div className="space-y-3 mb-4">
                                        {preset.details.map((detail, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                                <CheckCircle2 size={14} className="text-indigo-500" />
                                                {detail}
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={(e) => handleDeleteCustom(e, preset.dbId)}
                                        className="absolute top-6 right-6 p-2 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={18} />
                                    </button>

                                    {selectedPreset === preset.id && (
                                        <div className="absolute bottom-6 right-8 px-3 py-1 bg-indigo-100 text-indigo-600 text-[10px] font-black rounded-lg uppercase tracking-wide flex items-center gap-1">
                                            <CheckCircle2 size={12} /> Selected
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Section: Built-in Presets */}
                <div className="mt-12 mb-6">
                    <div className="flex items-center gap-2 mb-6 px-1">
                        <Sparkles size={18} className="text-amber-500" />
                        <h2 className="text-lg font-black text-slate-700">권장 라이브러리 프리셋</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl">
                        {PRESETS.map((preset) => (
                            <div
                                key={preset.id}
                                onClick={() => preset.active && !loading && setSelectedPreset(preset.id)}
                                className={`
                                    relative rounded-[2.5rem] p-8 border-2 transition-all cursor-pointer group
                                    ${!preset.active ? 'opacity-50 grayscale cursor-not-allowed border-slate-100 bg-slate-50' :
                                        selectedPreset === preset.id
                                            ? `border-${preset.color}-500 bg-white ring-4 ring-${preset.color}-500/10 shadow-xl shadow-${preset.color}-500/20 transform scale-[1.02]`
                                            : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1'
                                    }
                                `}
                            >
                                <div className={`
                                    w-16 h-16 rounded-3xl flex items-center justify-center mb-6 text-2xl shadow-lg transition-transform group-hover:rotate-6
                                    ${preset.active
                                        ? `bg-${preset.color}-50 text-${preset.color}-600 shadow-${preset.color}-100`
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

                {/* Section: Danger Zone (Factory Reset) */}
                <div className="mt-20 mb-12 border-t border-slate-200 pt-12">
                    <div className="flex items-center justify-between gap-8 bg-white rounded-[3rem] border border-rose-100 p-10 shadow-xl shadow-rose-500/5">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
                                    <AlertTriangle size={18} />
                                </div>
                                <h2 className="text-xl font-black text-slate-800 tracking-tight">위험구역: 공장 초기화</h2>
                            </div>
                            <p className="text-sm font-bold text-slate-400 leading-relaxed pr-8">
                                모든 운영 데이터(판매, 고객, 재고 등)를 영구적으로 삭제합니다.
                                <br /><span className="text-rose-600">이 작업은 되돌릴 수 없으므로 신중하게 진행해 주세요.</span>
                            </p>
                        </div>
                        <div className="w-96 space-y-4">
                            <div className="relative">
                                <input
                                    type="text"
                                    value={confirmText}
                                    onChange={e => setConfirmText(e.target.value)}
                                    placeholder="'초기화'를 입력하세요"
                                    className="w-full h-14 px-6 bg-slate-50 border border-slate-100 rounded-2xl font-black text-center text-rose-600 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-200 transition-all"
                                />
                            </div>
                            <button
                                onClick={handleReset}
                                disabled={confirmText !== '초기화' || loading}
                                className="w-full h-14 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-100 disabled:text-slate-300 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-95"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                전체 데이터 즉시 삭제
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar (Fixed at bottom) */}
            <div className="bg-white border-t border-slate-100 px-6 lg:px-8 py-6 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-500 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                    <Sparkles size={16} />
                    <p className="text-xs font-bold">
                        팁: 프리셋을 적용하면 상품, BOM, 창고 구역이 자동으로 세팅되어 업무 효율이 높아집니다.
                    </p>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={handlePreview}
                        disabled={!selectedPreset || loading}
                        className={`
                            h-12 px-8 rounded-xl font-black text-sm flex items-center gap-2 shadow-lg transition-all
                            ${!selectedPreset || loading
                                ? 'bg-slate-100 text-slate-300 cursor-not-allowed shadow-none'
                                : 'bg-slate-800 hover:bg-slate-700 text-white shadow-slate-200 active:scale-95'
                            }
                        `}
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
                        구성 미리보기
                    </button>
                </div>
            </div>

            {/* Modals */}
            <SavePresetModal
                isOpen={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                onSave={handleSaveCurrent}
                loading={loading}
            />

            {previewData && (
                <PresetPreviewModal
                    isOpen={showPreview}
                    onClose={() => setShowPreview(false)}
                    onConfirm={handleApply}
                    preset={currentPreset}
                    data={previewData}
                    loading={loading}
                />
            )}
        </div>
    );
};

export default SettingsDbReset;
