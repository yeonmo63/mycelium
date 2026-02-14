import React, { useState, useEffect, useRef } from 'react';
import { useModal } from '../../contexts/ModalContext';

/**
 * CustomerSms.jsx
 * 판촉 문자 발송 (Promotional SMS)
 * Ported from MushroomFarm and styled with Premium React UI.
 * Features:
 * - Target Group Selection
 * - Claim History Selection Modal
 * - SMS/LMS/Kakao Mode Switch
 * - Template Management
 * - Byte Counting
 */
const CustomerSms = () => {
    const { showAlert, showConfirm } = useModal();

    // --- Constants ---
    const SMS_TEMPLATES = {
        greeting: `[{COMPANY}] 안녕하세요 고객님! 🍄\n싱싱한 버섯 향기가 가득한 계절입니다.\n항상 저희를 아껴주시는 마음에 깊이 감사드리며, 환절기 건강 유의하시길 바랍니다.`,
        promo: `[{COMPANY}/광고] 🎉 감사 대잔치!\n오늘 단 하루, 전 품목 20% 할인 혜택을 드립니다.\n산지의 신선함을 지금 바로 주문하세요!\n무료수신거부: 080-1234-5678`,
        repurchase: `[{COMPANY}] 버섯 드실 때가 되었네요! 😉\n고객님이 좋아하시는 생표고버섯이 오늘 아침 아주 좋게 들어왔습니다. 산지 직송의 맛 그대로 보내드릴게요.`,
        seasonal: `[{COMPANY}] ❄️ 찬바람 불 때 생각나는 뜨끈한 버섯 전골!\n가족과 함께하는 주말 한 끼, 저희 버섯으로 풍성하게 채워보세요.`,
        anniversary: `[{COMPANY}] 🎂 고객님의 소중한 날을 축하합니다!\n감사의 마음을 담아 5,000원 할인 쿠폰을 넣어드렸습니다.\n즐거운 하루 보내세요!`,
        recovery: `[{COMPANY}] 죄송하고 감사한 마음을 담았습니다. 🙏\n지난번 이용에 불편을 드려 다시 한번 사과드립니다. 너그러이 이해해 주셔서 감사하며, 다음 주문 시 사용 가능한 [감사 할인권]을 발송해 드립니다. 더 좋은 품질로 보답하겠습니다.`
    };

    // --- State ---
    const [targets, setTargets] = useState({
        all: false,
        vvip: false,
        vip: false,
        normal: false,
        corp: false,
        recovery: false
    });

    // Recovery (Claim) selection
    const [selectedClaimTargets, setSelectedClaimTargets] = useState([]);
    const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
    const [claimHistory, setClaimHistory] = useState([]);
    const [claimSearchDays, setClaimSearchDays] = useState(90);
    const [isLoadingClaims, setIsLoadingClaims] = useState(false);

    // Message
    const [msgMode, setMsgMode] = useState('sms'); // 'sms' or 'kakao'
    const [message, setMessage] = useState('');
    const [byteCount, setByteCount] = useState(0);
    const [msgType, setMsgType] = useState('SMS'); // SMS or LMS
    const [companyName, setCompanyName] = useState('Mycelium');

    // Stats
    const [estimatedCount, setEstimatedCount] = useState(0);

    // --- Initialization ---
    useEffect(() => {
        loadCompanyInfo();
    }, []);

    const loadCompanyInfo = async () => {
        if (window.__TAURI__) {
            try {
                const info = await window.__TAURI__.core.invoke('get_company_info');
                if (info && info.company_name) setCompanyName(info.company_name);
            } catch (e) {
                console.error("Company Info Error:", e);
            }
        }
    };

    // --- Effects ---
    useEffect(() => {
        calculateEstimatedCount();
    }, [targets, selectedClaimTargets]);

    useEffect(() => {
        updateByteCount(message);
    }, [message]);

    // --- Logic ---

    const handleTargetChange = (key, checked) => {
        if (key === 'all') {
            setTargets({
                all: checked,
                vvip: checked,
                vip: checked,
                normal: checked,
                corp: checked,
                recovery: checked && targets.recovery // Don't auto-check recovery unless intended? Matches original behavior roughly
            });
        } else {
            setTargets(prev => {
                const newTargets = { ...prev, [key]: checked };
                const allChecked = ['vvip', 'vip', 'normal', 'corp', 'recovery'].every(k => newTargets[k]);
                return { ...newTargets, all: false };
            });
        }
    };

    const calculateEstimatedCount = () => {
        let count = 0;
        if (targets.all) {
            count = 1150; // Mock total
        } else {
            if (targets.vvip) count += 12;
            if (targets.vip) count += 65;
            if (targets.normal) count += 280;
            if (targets.corp) count += 40;
            if (targets.recovery) {
                // If specific targets selected, use that count. Else mock total for category.
                count += selectedClaimTargets.length > 0 ? selectedClaimTargets.length : 15; // 15 is mock default
            }
        }
        setEstimatedCount(count);
    };

    const updateByteCount = (text) => {
        let total = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            total += (char > 127) ? 2 : 1;
        }
        setByteCount(total);
        setMsgType(total > 90 ? 'LMS' : 'SMS');
    };

    const handleTemplateChange = (e) => {
        const key = e.target.value;
        if (!key) return;
        let content = SMS_TEMPLATES[key] || '';
        content = content.replace(/\{COMPANY\}/g, companyName);
        setMessage(content);
    };

    const handleSend = async () => {
        const anyTarget = Object.values(targets).some(v => v) || targets.all;
        if (!anyTarget) {
            showAlert('알림', '발송 대상을 하나 이상 선택해주세요.');
            return;
        }

        if (!message.trim()) {
            showAlert('알림', '메시지 내용을 입력해주세요.');
            return;
        }

        const modeText = msgMode === 'kakao' ? '카카오 알림톡' : '문자 메시지';
        const confirmed = await showConfirm('발송 확인', `약 ${estimatedCount.toLocaleString()}명에게 ${modeText}를 발송하시겠습니까?\n(실제 발송은 API 설정에 따릅니다)`);

        if (confirmed) {
            if (window.__TAURI__) {
                try {
                    const selectedGroups = Object.keys(targets).filter(k => targets[k] && k !== 'all');
                    if (targets.all) selectedGroups.push('all');

                    // Simulation Invoke
                    const result = await window.__TAURI__.core.invoke('send_sms_simulation', {
                        mode: msgMode,
                        recipients: selectedGroups,
                        content: message,
                        templateCode: msgMode === 'kakao' ? 'TEMPLATE_001' : null
                    });

                    if (result.success) {
                        showAlert('발송 성공', `메시지 아이디: ${result.message_id}\n성공적으로 접수되었습니다.`, 'success');
                        setMessage('');
                    } else {
                        showAlert('발송 실패', result.error);
                    }
                } catch (e) {
                    console.error(e);
                    showAlert('오류', '발송 중 오류가 발생했습니다.');
                }
            } else {
                // Browser Mock
                await new Promise(r => setTimeout(r, 1000));
                showAlert('발송 성공', '성공적으로 접수되었습니다. (Demo)', 'success');
                setMessage('');
            }
        }
    };

    // --- Claim Modal Logic ---
    const openClaimModal = () => {
        setIsClaimModalOpen(true);
        loadClaims(claimSearchDays);
    };

    const loadClaims = async (days) => {
        setIsLoadingClaims(true);
        try {
            if (!window.__TAURI__) {
                await new Promise(r => setTimeout(r, 1000));
                // Mock Claims
                const mock = [
                    { mobile: '010-1111-2222', name: '홍길동', is_member: true, claim_type: '반품', reason: '단순 변심', date: '2024-01-15' },
                    { mobile: '010-3333-4444', name: '김철수', is_member: false, claim_type: '취소', reason: '배송 지연', date: '2024-01-12' },
                    { mobile: '010-5555-6666', name: '이영희', is_member: true, claim_type: '반품', reason: '상품 파손', date: '2024-01-10' },
                ];
                setClaimHistory(mock);
            } else {
                const data = await window.__TAURI__.core.invoke('get_claim_targets', { days: parseInt(days) });
                setClaimHistory(data || []);
            }
        } catch (e) {
            console.error(e);
            showAlert('오류', '클레임 내역 로드 실패');
        } finally {
            setIsLoadingClaims(false);
        }
    };

    const toggleClaimSelection = (mobile) => {
        setSelectedClaimTargets(prev => {
            if (prev.includes(mobile)) return prev.filter(m => m !== mobile);
            return [...prev, mobile];
        });
    };

    const confirmClaimSelection = () => {
        handleTargetChange('recovery', true);
        setIsClaimModalOpen(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header */}
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-1 bg-violet-600 rounded-full"></span>
                    <span className="text-[9px] font-black tracking-[0.2em] text-violet-600 uppercase">Promotion</span>
                </div>
                <h1 className="text-3xl font-black text-slate-700 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                    판촉 문자 발송 <span className="text-slate-300 font-light ml-1 text-xl">SMS Promotion</span>
                </h1>
                <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">
                    <span className="material-symbols-rounded text-sm">sms</span>
                    고객 등급별 맞춤형 메시지를 전송하여 매출을 증대시키세요.
                </p>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden p-6 lg:p-8 pt-0 flex flex-col xl:flex-row gap-6">

                {/* Left: Targeting */}
                <div className="flex-1 flex flex-col gap-6 min-w-[350px] overflow-y-auto custom-scrollbar">

                    {/* Target Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-indigo-600 font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-rounded">group</span> 발송 대상 선택
                        </h3>

                        <div className="flex flex-col gap-3">
                            {/* All */}
                            <label className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-indigo-200 transition-all group bg-white">
                                <input type="checkbox" checked={targets.all} onChange={(e) => handleTargetChange('all', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" />
                                <div className="flex items-center gap-4">
                                    <span className="material-symbols-rounded text-slate-400 group-hover:text-indigo-500 text-2xl">groups</span>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-600 group-hover:text-indigo-700">전체 고객</span>
                                        <span className="text-xs text-slate-400">모든 등급의 고객에게 발송</span>
                                    </div>
                                </div>
                            </label>

                            {/* Groups Grid */}
                            <div className="grid grid-cols-2 gap-3">
                                {['VVIP', 'VIP', '일반', '법인/단체'].map(type => {
                                    const key = type === '법인/단체' ? 'corp' : type === '일반' ? 'normal' : type.toLowerCase();
                                    return (
                                        <label key={key} className={`flex items-center justify-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${targets[key] ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                            <input type="checkbox" checked={targets[key]} onChange={(e) => handleTargetChange(key, e.target.checked)} className="hidden" />
                                            <span>{type}</span>
                                        </label>
                                    );
                                })}

                                {/* Recovery Special Card */}
                                <div className="col-span-2 relative">
                                    <label className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${targets.recovery ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                        <input type="checkbox" checked={targets.recovery} onChange={(e) => handleTargetChange('recovery', e.target.checked)} className="w-5 h-5 text-amber-500 rounded focus:ring-amber-500" />
                                        <span className="material-symbols-rounded text-amber-500">sentiment_dissatisfied</span>
                                        <span className={`font-bold ${targets.recovery ? 'text-amber-800' : 'text-slate-500'}`}>클레임 이력 대상</span>
                                    </label>
                                    {targets.recovery && (
                                        <button
                                            onClick={openClaimModal}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-white border border-amber-200 text-amber-600 text-xs font-bold rounded-lg shadow-sm hover:bg-amber-50 flex items-center gap-1">
                                            <span className="material-symbols-rounded text-sm">{selectedClaimTargets.length > 0 ? 'check_circle' : 'list_alt'}</span>
                                            {selectedClaimTargets.length > 0 ? `${selectedClaimTargets.length}명 선택됨` : '목록 선택'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Status Box */}
                        <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex justify-between items-center">
                            <div>
                                <span className="text-xs font-bold text-slate-500 block">예상 발송 대상</span>
                                <span className="text-[10px] text-slate-400">* 중복 제거된 수치</span>
                            </div>
                            <strong className="text-xl font-black text-indigo-600">{estimatedCount.toLocaleString()} 명</strong>
                        </div>
                    </div>

                    {/* Guide Card */}
                    <div className="bg-gradient-to-br from-violet-50 to-white rounded-2xl border border-violet-200 p-5 shadow-sm">
                        <h4 className="text-violet-800 font-bold mb-2 flex items-center gap-2 text-sm">
                            <span className="material-symbols-rounded text-lg">lightbulb</span> 발송 가이드라인
                        </h4>
                        <p className="text-xs text-violet-600 leading-relaxed font-medium">
                            영리 목적의 광고성 문자 발송 시 반드시 <strong>(광고)</strong> 표시와 하단에 <strong>080 수신거부</strong> 번호를 포함해야 합니다.
                        </p>
                    </div>

                </div>

                {/* Right: Composer */}
                <div className="flex-[2] bg-white rounded-2xl shadow-lg border border-slate-200 p-6 flex flex-col gap-5 min-h-[500px]">

                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-100 pb-4">
                        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <span className="p-1.5 bg-violet-100 text-violet-600 rounded-lg material-symbols-rounded">edit_square</span>
                            메시지 작성
                        </h3>

                        <div className="flex flex-wrap items-center gap-4">
                            {/* Mode Switch */}
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setMsgMode('sms')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${msgMode === 'sms' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    SMS/LMS
                                </button>
                                <button
                                    onClick={() => setMsgMode('kakao')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${msgMode === 'kakao' ? 'bg-yellow-400 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    카톡 알림톡
                                </button>
                            </div>

                            {/* Template Select */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">템플릿</span>
                                <select onChange={handleTemplateChange} className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg p-2 outline-none focus:border-violet-500 font-medium">
                                    <option value="">선택하세요</option>
                                    <option value="greeting">👋 안부 및 감사</option>
                                    <option value="promo">🎁 신상품 및 할인 행사</option>
                                    <option value="repurchase">🍄 재구매 제안</option>
                                    <option value="seasonal">❄️ 시즌 마케팅</option>
                                    <option value="anniversary">🎂 기념일 축하</option>
                                    <option value="recovery">✨ 클레임 대응</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Kakao Notice */}
                    {msgMode === 'kakao' && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 flex gap-3 text-xs text-yellow-800 font-medium animate-in fade-in slide-in-from-top-2">
                            <span className="material-symbols-rounded text-lg">info</span>
                            <p><b>카카오 알림톡 알림:</b> 알림톡은 미리 승인된 템플릿만 전송 가능합니다. 템플릿 버튼을 사용하거나 관리자 승인을 확인하세요.</p>
                        </div>
                    )}

                    {/* Text Area */}
                    <div className="relative flex-1">
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="w-full h-full p-5 bg-slate-50 border border-slate-200 rounded-2xl resize-none outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all text-slate-700 leading-relaxed font-medium"
                            placeholder="발송할 내용을 작성하거나 템플릿을 선택하세요."
                        ></textarea>

                        <div className="absolute bottom-4 right-4 flex items-center gap-3 bg-white/90 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-full shadow-sm text-xs font-bold text-slate-500 pointer-events-none">
                            <span className={`${msgType === 'LMS' ? 'text-violet-600' : 'text-slate-500'}`}>{msgType}</span>
                            <span className="w-px h-3 bg-slate-200"></span>
                            <span><span className="text-slate-800">{byteCount}</span> / 2000 bytes</span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-2">
                        <button onClick={() => { setMessage(''); updateByteCount(''); }} className="px-4 py-3 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 font-bold text-sm flex items-center gap-2 transition-colors">
                            <span className="material-symbols-rounded">delete_outline</span> 초기화
                        </button>
                        <button
                            onClick={handleSend}
                            className={`px-8 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg transition-all transform active:scale-95 ${msgMode === 'kakao' ? 'bg-yellow-400 hover:bg-yellow-500 text-slate-900 shadow-yellow-200' : 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200'}`}
                        >
                            <span className="material-symbols-rounded">{msgMode === 'kakao' ? 'chat' : 'send'}</span>
                            {msgMode === 'kakao' ? '알림톡 발송하기' : '즉시 발송하기'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Claim History Modal */}
            {isClaimModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                            <div>
                                <h2 className="text-xl font-black text-slate-800">클레임 고객 명단 선택</h2>
                                <p className="text-sm text-slate-500 mt-1">최근 클레임(취소/반품)이 발생한 고객 중 발송 대상을 선택하세요.</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <select
                                    value={claimSearchDays}
                                    onChange={(e) => {
                                        setClaimSearchDays(e.target.value);
                                        loadClaims(e.target.value);
                                    }}
                                    className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg p-2 outline-none focus:border-indigo-500"
                                >
                                    <option value="7">최근 7일</option>
                                    <option value="30">최근 30일</option>
                                    <option value="90">최근 90일</option>
                                    <option value="365">최근 1년</option>
                                </select>
                                <button onClick={() => setIsClaimModalOpen(false)} className="bg-slate-100 p-2 rounded-full hover:bg-slate-200"><span className="material-symbols-rounded text-slate-500">close</span></button>
                            </div>
                        </div>

                        {/* Modal List */}
                        <div className="flex-1 overflow-y-auto p-0 min-h-0 custom-scrollbar relative">
                            {isLoadingClaims && (
                                <div className="absolute inset-0 z-10 bg-white/80 flex items-center justify-center">
                                    <span className="material-symbols-rounded animate-spin text-4xl text-indigo-500">sync</span>
                                </div>
                            )}

                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="py-3 px-4 w-[50px] text-center">선택</th>
                                        <th className="py-3 px-4">고객명</th>
                                        <th className="py-3 px-4">연락처</th>
                                        <th className="py-3 px-4 text-center">구분</th>
                                        <th className="py-3 px-4 text-center">클레임 유형</th>
                                        <th className="py-3 px-4">사유</th>
                                        <th className="py-3 px-4 text-center">날짜</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {claimHistory.map((row, i) => {
                                        const isSelected = selectedClaimTargets.includes(row.mobile);
                                        return (
                                            <tr key={i} onClick={() => toggleClaimSelection(row.mobile)} className={`cursor-pointer transition-colors hover:bg-slate-50 ${isSelected ? 'bg-indigo-50/50' : ''}`}>
                                                <td className="py-3 px-4 text-center">
                                                    <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                                                </td>
                                                <td className="py-3 px-4 font-bold text-slate-700">{row.name}</td>
                                                <td className="py-3 px-4 text-slate-500 font-mono">{row.mobile}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${row.is_member ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                        {row.is_member ? '회원' : '비회원'}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${row.claim_type === '취소' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                        {row.claim_type}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-slate-600">{row.reason || '-'}</td>
                                                <td className="py-3 px-4 text-center text-slate-400 text-xs">{row.date}</td>
                                            </tr>
                                        )
                                    })}
                                    {claimHistory.length === 0 && !isLoadingClaims && (
                                        <tr><td colSpan="7" className="p-8 text-center text-slate-400">데이터가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                            <div className="text-sm text-slate-600 font-bold">
                                총 <span className="text-indigo-600">{selectedClaimTargets.length}</span>명 선택됨
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setSelectedClaimTargets([])} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 font-bold hover:bg-white">선택 해제</button>
                                <button onClick={confirmClaimSelection} className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm">선택 완료</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default CustomerSms;
