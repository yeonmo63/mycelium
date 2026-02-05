import React, { useState, useEffect } from 'react';
import {
    BookOpen,
    LayoutDashboard,
    ShoppingCart,
    Users,
    Calculator,
    BrainCircuit,
    Calendar,
    Settings,
    HelpCircle,
    ChevronRight,
    Star,
    AlertCircle,
    CheckCircle2,
    Info,
    ArrowUpRight,
    Search,
    Clock,
    Zap,
    MessageSquare,
    ShieldCheck,
    Truck,
    CreditCard,
    BarChart3,
    Map as MapIcon,
    RefreshCw,
    Database,
    Trash2,
    Cloud,
    AlertTriangle,
    MinusCircle
} from 'lucide-react';

const UserManual = () => {
    const [activeSection, setActiveSection] = useState('flowchart');
    const [searchTerm, setSearchTerm] = useState('');

    const sections = [
        { id: 'flowchart', label: '시스템 흐름도', icon: <BookOpen size={18} /> },
        { id: 'dashboard', label: '1. 대시보드', icon: <LayoutDashboard size={18} /> },
        { id: 'sales', label: '2. 판매 관리', icon: <ShoppingCart size={18} /> },
        { id: 'customer', label: '3. 고객 관리', icon: <Users size={18} /> },
        { id: 'inventory_prod', label: '4. 재고/생산/현장관리', icon: <Clock size={18} /> },
        { id: 'finance', label: '5. 회계/지출 관리', icon: <Calculator size={18} /> },
        { id: 'intel', label: '6. 판매 인텔리전스', icon: <BrainCircuit size={18} /> },
        { id: 'exp', label: '7. 체험 프로그램', icon: <Zap size={18} /> },
        { id: 'schedule', label: '8. 통합 일정 관리', icon: <Calendar size={18} /> },
        { id: 'settings', label: '9. 설정 및 관리', icon: <Settings size={18} /> },
        { id: 'rescue', label: '10. 제니의 긴급 구조', icon: <HelpCircle size={18} /> },
    ];

    const handleScroll = (id) => {
        setActiveSection(id);
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Components for reused elements
    const JennyTip = ({ title, children }) => (
        <div className="my-10 relative group">
            <div className="absolute inset-0 bg-amber-400/5 rounded-3xl blur-xl group-hover:bg-amber-400/10 transition-colors" />
            <div className="relative bg-[#fdfaf1] border-l-4 border-amber-400 rounded-2xl p-8 shadow-sm border border-amber-100">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <Star className="text-amber-600 fill-amber-600" size={24} />
                    </div>
                    <div>
                        <h4 className="text-amber-900 font-black text-base mb-2">{title || "제니의 안내"}</h4>
                        <div className="text-amber-800 text-[0.95rem] leading-relaxed font-medium space-y-2">
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const FeatureBox = ({ title, bg = "bg-white", children }) => (
        <div className={`${bg} rounded-3xl border border-slate-200/60 p-6 shadow-sm hover:shadow-md transition-all duration-300 h-full`}>
            <h5 className="font-black text-slate-800 mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-indigo-500" />
                {title}
            </h5>
            <div className="text-slate-500 text-sm leading-relaxed font-medium">
                {children}
            </div>
        </div>
    );

    const LogicBox = ({ title, children, color = "indigo" }) => {
        const colors = {
            indigo: "bg-indigo-50/50 border-indigo-100 text-indigo-900 ring-indigo-500/10",
            rose: "bg-rose-50/50 border-rose-100 text-rose-900 ring-rose-500/10",
            emerald: "bg-emerald-50/50 border-emerald-100 text-emerald-900 ring-emerald-500/10",
            amber: "bg-amber-50/50 border-amber-100 text-amber-900 ring-amber-500/10",
            violet: "bg-violet-50/50 border-violet-100 text-violet-900 ring-violet-500/10"
        };

        return (
            <div className={`${colors[color]} border rounded-2xl p-6 my-6 ring-1`}>
                {title && <div className="font-black text-sm mb-3 flex items-center gap-2">
                    <Info size={16} />
                    {title}
                </div>}
                <div className="text-[0.92rem] leading-[1.8] opacity-90 font-medium whitespace-pre-line">
                    {children}
                </div>
            </div>
        );
    };

    const SectionTitle = ({ number, title, id, icon }) => (
        <div id={id} className="scroll-mt-16 mb-12">
            <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center text-white">
                    {icon}
                </div>
                <div>
                    <span className="text-indigo-600 font-black text-xs uppercase tracking-widest block mb-1">Chapter {number}</span>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tighter">{title}</h2>
                </div>
            </div>
        </div>
    );

    const SubSection = ({ number, title, children }) => (
        <div className="mb-16 last:mb-0">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-3">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-black">{number}</span>
                {title}
            </h3>
            <div className="pl-11 space-y-6">
                {children}
            </div>
        </div>
    );

    return (
        <div className="flex h-full bg-[#f8fafc] overflow-hidden">
            {/* Sidebar Navigation */}
            <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 shadow-[10px_0_30px_rgba(0,0,0,0.02)]">
                <div className="p-8 pb-4">
                    <div className="flex items-center gap-3 mb-10">
                        <div className="w-12 h-12 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-200 ring-4 ring-indigo-50">
                            <BookOpen size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-800 tracking-tighter">Mycelium Guide</h2>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Master Platform v2.0</p>
                        </div>
                    </div>

                    <div className="relative mb-8">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="명령어나 기능을 검색하세요..."
                            className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 space-y-1 custom-scrollbar pb-12">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            onClick={() => handleScroll(section.id)}
                            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[0.88rem] font-black transition-all group ${activeSection === section.id
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-[1.02]'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
                                }`}
                        >
                            <span className={`${activeSection === section.id ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'}`}>
                                {section.icon}
                            </span>
                            {section.label}
                            {activeSection === section.id && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            )}
                        </button>
                    ))}

                    <div className="mt-10 pt-10 border-t border-slate-100 px-4">
                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-6">Expert Support</div>
                        <div className="space-y-4">
                            <button className="flex items-center gap-3 text-sm font-black text-slate-500 hover:text-indigo-600 transition-colors w-full text-left">
                                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center">
                                    <MessageSquare size={16} />
                                </div>
                                제니의 1:1 상담 창구
                            </button>
                            <button className="flex items-center gap-3 text-sm font-black text-slate-500 hover:text-indigo-600 transition-colors w-full text-left">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
                                    <ShieldCheck size={16} />
                                </div>
                                라이선스 및 보안 안내
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 relative">
                {/* Visual accents */}
                <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-indigo-400/5 rounded-full blur-[150px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-sky-400/5 rounded-full blur-[150px] pointer-events-none" />

                <div className="max-w-5xl mx-auto py-24 px-16 relative z-10">
                    {/* Hero Header */}
                    <div className="mb-24 text-center">
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-black uppercase tracking-[0.2em] mb-10 border border-indigo-100/50 shadow-sm">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                            </span>
                            Mycelium Enterprise Platform Guidance
                        </div>
                        <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-8 leading-[1.05]" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            Mycelium 운영의 모든 것,<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">완벽 가이드북</span>
                        </h1>
                        <p className="text-xl text-slate-500 font-medium leading-relaxed max-w-3xl mx-auto">
                            Mycelium는 단순한 기록을 넘어 데이터 인텔리전스와 AI의 힘으로 여러분의 농장을 스마트한 기업으로 변화시킵니다. 시스템의 모든 기능을 정복해 보세요.
                        </p>
                    </div>

                    {/* Section: Flowchart */}
                    <section id="flowchart" className="scroll-mt-24 mb-32">
                        <div className="bg-white rounded-[3.5rem] border border-slate-200/80 p-16 shadow-[0_30px_100px_rgba(0,0,0,0.04)] text-center relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />

                            <div className="topic-title mb-16 flex flex-col items-center">
                                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-800 mb-6 group-hover:rotate-12 transition-transform duration-500">
                                    <BookOpen size={32} />
                                </div>
                                <h2 className="text-2xl font-black text-slate-800 tracking-tighter">Mycelium 운영 프로세스 흐름도</h2>
                                <p className="text-slate-400 font-bold mt-2">Smart Farm Integrated Workflow</p>
                            </div>

                            <div className="relative flex flex-col items-center gap-12 max-w-4xl mx-auto">
                                {/* Flow Row 1 */}
                                <div className="flex items-center justify-center gap-8 w-full">
                                    <div className="w-64 p-6 bg-emerald-50 rounded-2xl border-2 border-emerald-200 text-emerald-900 shadow-sm hover:translate-y-[-5px] transition-transform">
                                        <div className="text-2xl mb-2">⚙️</div>
                                        <div className="font-black text-sm">9. 설정 및 관리</div>
                                        <div className="text-[11px] font-bold opacity-60 mt-1">상품 마스터 / 보안 / 업체 정보</div>
                                    </div>
                                </div>

                                <div className="text-slate-300"><ArrowUpRight className="rotate-45" size={40} /></div>

                                {/* Flow Row 2 */}
                                <div className="flex items-center justify-center gap-12 w-full">
                                    <div className="w-60 p-6 bg-sky-50 rounded-2xl border-2 border-sky-200 text-sky-900 shadow-sm hover:translate-y-[-5px] transition-transform">
                                        <div className="text-2xl mb-2">👥</div>
                                        <div className="font-black text-sm">3. 고객 관리 (CRM)</div>
                                        <div className="text-[11px] font-bold opacity-60 mt-1">AI 고객 통찰 / 실시간 상담</div>
                                    </div>
                                    <div className="flex items-center text-slate-200"><ChevronRight size={32} /></div>
                                    <div className="w-80 p-8 bg-indigo-600 rounded-[2rem] border-4 border-indigo-100 text-white shadow-2xl shadow-indigo-200 hover:scale-[1.05] transition-all">
                                        <div className="text-3xl mb-3">🛒</div>
                                        <div className="font-black text-xl">판매 관리 CENTER</div>
                                        <div className="text-[12px] font-bold opacity-80 mt-2">판매 접수 / 배송·입금 통합 관리</div>
                                    </div>
                                    <div className="flex items-center text-slate-200"><ChevronRight size={32} /></div>
                                    <div className="w-60 p-6 bg-sky-50 rounded-2xl border-2 border-sky-200 text-sky-900 shadow-sm hover:translate-y-[-5px] transition-transform">
                                        <div className="text-2xl mb-2">📅</div>
                                        <div className="font-black text-sm">8. 통합 일정 관리</div>
                                        <div className="text-[11px] font-bold opacity-60 mt-1">배송 / 체험예약 캘린더 연동</div>
                                    </div>
                                </div>

                                <div className="text-slate-300"><ArrowUpRight className="rotate-45" size={40} /></div>

                                {/* Flow Row 3 */}
                                <div className="flex items-center justify-center gap-12 w-full">
                                    <div className="w-64 p-6 bg-rose-50 rounded-2xl border-2 border-rose-200 text-rose-900 shadow-sm hover:translate-y-[-5px] transition-transform">
                                        <div className="text-2xl mb-2">🧠</div>
                                        <div className="font-black text-sm">6. 판매 인텔리전스</div>
                                        <div className="text-[11px] font-bold opacity-60 mt-1">수요예측 / RFM / 지역 히트맵</div>
                                    </div>
                                    <div className="flex items-center text-slate-200 text-2xl">🔄</div>
                                    <div className="w-64 p-6 bg-rose-50 rounded-2xl border-2 border-rose-200 text-rose-900 shadow-sm hover:translate-y-[-5px] transition-transform">
                                        <div className="text-2xl mb-2">📊</div>
                                        <div className="font-black text-sm">1. 대시보드</div>
                                        <div className="text-[11px] font-bold opacity-60 mt-1">핵심 지표 / AI 경영 브리핑</div>
                                    </div>
                                </div>
                            </div>

                            <p className="mt-16 text-slate-400 font-bold text-sm">
                                * 모든 데이터는 <span className="text-indigo-600 font-black">판매 관리</span>를 중심으로 유기적으로 연결되어 실시간 반영됩니다.
                            </p>
                        </div>
                    </section>

                    {/* Section 1: Dashboard */}
                    <SectionTitle number="01" title="대시보드 (Dashboard)" id="dashboard" icon={<LayoutDashboard size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <p className="text-slate-500 font-medium leading-[1.8] text-lg">
                            대시보드는 농장의 현재 상태를 한눈에 파악하고, AI의 도움을 받아 스마트한 경영 결정을 내릴 수 있도록 설계된 '관제 센터'입니다. 스크롤 없이 모든 현황을 즉시 파악할 수 있도록 11개의 주요 지표가 배치되어 있습니다.
                        </p>

                        <SubSection number="1.1" title="🌤️ AI 날씨 & 시즌 마케팅">
                            <LogicBox>
                                <b>날씨 실시간 연동:</b> 현재 강릉의 날씨와 기온을 실시간으로 가져옵니다.
                                <b>AI 맞춤 제안:</b> 단순히 날씨를 보여주는 것에 그치지 않고, "날씨가 흐리니 이런 상품의 홍보를 강화하면 좋다"는 등의 시즌 마케팅 조언을 AI가 매일 새롭게 제안합니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="1.2" title="📊 핵심 경영 지표 (Stats Grid)">
                            <div className="grid grid-cols-2 gap-6">
                                <FeatureBox title="💰 오늘의 매출/주문량">오늘 발생한 실제 매출액(취소 제외)과 총 주문 건수를 즉시 확인합니다.</FeatureBox>
                                <FeatureBox title="👥 신규 고객 현황">오늘 가입한 신규 고객 수와 전체 누적 고객 수를 한눈에 비교합니다.</FeatureBox>
                                <FeatureBox title="🚚 물류 및 예약 상태">배송 대기 주문, 오늘 예정된 체험 농장 예약 건수를 체크합니다.</FeatureBox>
                                <FeatureBox title="⚠️ 재고 및 상담 알림" bg="bg-rose-50/30">재고가 부족한 상품이나 답변 대기 중인 고객 상담 건수를 붉은색으로 강조합니다.</FeatureBox>
                            </div>
                        </SubSection>

                        <SubSection number="1.3" title="🤖 AI 일일 경영 & 상담 브리핑">
                            <div className="space-y-4">
                                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 italic font-medium text-slate-600 leading-relaxed">
                                    "어제의 총 매출은 지난주 대비 15% 상승했습니다. 오늘 오후 비가 예보되어 있으니 택배 포장 시 습기에 주의해 주세요."
                                </div>
                                <LogicBox title="지능형 요약 엔진">
                                    카드 클릭 시 제니가 수천 건의 데이터를 읽고, 사장님이 바로 행동에 옮길 수 있는 핵심 전략을 서신 형태로 브리핑해 드립니다.
                                </LogicBox>
                            </div>
                        </SubSection>

                        <SubSection number="1.4" title="🎂 기념일 고객 케어 & 매출 추이">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <h4 className="font-black text-rose-600 flex items-center gap-2 px-1">기념일 알림 (분홍색 카드)</h4>
                                    <p className="text-sm text-slate-500 font-medium leading-relaxed">3일 이내에 생일이나 기념일이 있는 고객을 자동 추출하여 선제적인 축하 문자 발송을 유도합니다.</p>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="font-black text-indigo-600 flex items-center gap-2 px-1">실시간 판매 랭킹</h4>
                                    <p className="text-sm text-slate-500 font-medium leading-relaxed">이번 달 판매량 1~3위 상품을 시각화하여 어떤 상품의 마진이 좋은지 직관적으로 보여줍니다.</p>
                                </div>
                            </div>
                        </SubSection>

                        <JennyTip title="제니의 대시보드 활용법">
                            농장에 출근하신 후 가장 먼저 확인해야 할 화면입니다. 제가 준비한 실시간 데이터와 마케팅 조언으로 활기찬 하루를 시작해 보세요! 5분마다 데이터가 자동으로 새로고침되어 항상 최신 상태를 유지합니다. ✨
                        </JennyTip>
                    </div>

                    {/* Section 2: Sales */}
                    <SectionTitle number="02" title="판매 관리 (Sales Control)" id="sales" icon={<ShoppingCart size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="2.1" title="판매 접수 가이드 (Manual/Special Entry)">
                            <div className="space-y-4">
                                <p className="text-slate-500 font-medium leading-relaxed">전화 주문이나 방문 고객 응대 시 사용하는 핵심 메뉴입니다. 접수 방식에 따라 일반 접수와 특판(행사) 접수를 선택할 수 있습니다.</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <FeatureBox title="일반 접수">성함/연락처로 고객을 조회하고 상품, 단가, 수량, 배송지를 입력하여 주문을 생성합니다.</FeatureBox>
                                    <FeatureBox title="특판/행사 접수">행사장(백화점, 팝업 등) 모바일 환경에 최적화된 UI로 QR 스캔을 통한 퀵 등록과 행사지별 자동 분류가 가능합니다.</FeatureBox>
                                </div>
                                <LogicBox title="일괄 저장의 중요성">
                                    화면의 [+ 추가] 버튼은 임시 장바구니에 담는 행위입니다. 반드시 하단의 <b>[일괄 저장]</b> 버튼을 눌러야 데이터베이스에 영구 기록됩니다.
                                </LogicBox>
                            </div>
                        </SubSection>

                        <SubSection number="2.2" title="배송 관리 & 운송장 자동화">
                            <LogicBox color="indigo">
                                <b>🚚 통합 배송 처리:</b> 입금 확인된 주문을 필터링하여 일괄적으로 택배사 및 송장 번호를 입력할 수 있습니다.
                                <b>🏢 송장 추출:</b> 엑셀 파일 업로드(스마트 스토어 등) 시 주소를 자동 분석해 지역별/택배사별 배송 목록을 생성합니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="2.3" title="취소 / 반품 / 교환 (Claims)">
                            <div className="space-y-4">
                                <p className="text-slate-500 font-medium leading-relaxed">잘못된 주문이나 단순 변심 등 클레임 발생 시 사후 처리를 관리합니다.</p>
                                <FeatureBox title="재고 자동 복구">반품 처리 시 '재고 복구' 옵션을 선택하면 차감되었던 상품 수량이 창고 재고로 자동 환원됩니다.</FeatureBox>
                                <FeatureBox title="환불 연동">미수금 장부와 연동되어 환불 시 고객의 예치금이나 잔액이 정확히 차감/증액됩니다.</FeatureBox>
                            </div>
                        </SubSection>

                        <SubSection number="2.4" title="판매 현황 리포트">
                            <div className="grid grid-cols-2 gap-6">
                                <FeatureBox title="일일 접수 현황">오늘 총 몇 건이 접수되었고, 입금/배송 상태가 어떠한지 실시간 타임라인으로 보여줍니다.</FeatureBox>
                                <FeatureBox title="개인별 판매 성과">상담원이나 직원별로 누가 얼마나 기여했는지 성과 지표를 제공합니다.</FeatureBox>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 3: Customer */}
                    <SectionTitle number="03" title="고객 관리 (CRM)" id="customer" icon={<Users size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="3.1" title="고객 성장 관리 & CRM">
                            <LogicBox color="emerald" title="360도 고객 프로필">
                                한 명의 고객이 언제 처음 구매했는지, 주로 어떤 상품을 찾는지, 어떤 상담을 남겼는지 모든 이력을 한 창에서 확인합니다.
                                <b>수정 모드 분리:</b> 오입력을 방지하기 위해 기본 조회 모드로 열리며, [수정하기] 버튼을 눌러야만 편집이 활성화됩니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="3.2" title="VIP 및 집중 관리 (Special Care)">
                            <div className="grid grid-cols-2 gap-6">
                                <FeatureBox title="우수 고객(VIP) 선정">구매 금액과 빈도를 분석해 상위 3% 고객을 자동 추출합니다. 특별 혜택을 제공하세요.</FeatureBox>
                                <FeatureBox title="집중 관리 고객">클레임이 잦거나 세심한 응대가 필요한 고객을 따로 분류해 접수 시 🚨 주의 경고를 띄웁니다.</FeatureBox>
                            </div>
                        </SubSection>

                        <SubSection number="3.3" title="미수금(외상) 통합 관리">
                            <p className="text-slate-500 font-medium leading-relaxed">입금 전 배송되거나 후불 결제인 거래를 위한 복식부기 장부입니다.</p>
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 font-black text-xs space-y-3">
                                <div className="flex justify-between text-rose-500"><span>청구액 (Debit)</span> <span>매출 발생 시 자동 합산 (+)</span></div>
                                <div className="flex justify-between text-emerald-500"><span>입금액 (Credit)</span> <span>실제 입금 시 차감 (-)</span></div>
                                <div className="h-px bg-slate-200" />
                                <div className="flex justify-between text-indigo-600 text-sm"><span>최종 미수금</span> <span>고객이 갚아야 할 잔액</span></div>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 4: Inventory & Production */}
                    <SectionTitle number="04" title="재고 / 생산 / 현장 관리" id="inventory_prod" icon={<Clock size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="4.1" title="재고 및 생산 전환 (BOM)">
                            <LogicBox color="violet">
                                <b>자재 &rarr; 완제품 전환:</b> "건표고 500g 세트" 1개를 생산하면 소요되는 "박스 1개", "라벨 1개"가 자재 창고에서 자동으로 차감됩니다.
                                <b>예측 소진일:</b> 현재 재고량과 최근 소모 속도를 비교해 며칠 뒤에 자재가 동날지 미리 경고해 줍니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="4.2" title="GAP / HACCP 인증센터">
                            <div className="grid grid-cols-1 gap-4">
                                <FeatureBox title="영농일지 자동 생성">현장 직원이 모바일로 기록한 작업 내용(관전, 시비, 수확 등)이 인증 기준에 맞는 일지로 자동 변환됩니다.</FeatureBox>
                                <FeatureBox title="이력 추적 관리">수확물별로 고유 코드를 부여해 어느 라인에서 나온 제품인지 출하부터 판매까지 추적이 가능합니다.</FeatureBox>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 5: Finance */}
                    <SectionTitle number="05" title="회계 / 지출 관리 (Finance)" id="finance" icon={<Calculator size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="5.1" title="매입 및 지출 통합">
                            <LogicBox color="indigo">
                                <b>📦 매입 연동:</b> 자재(박스 등)를 사올 때 '재고 연계'를 켜면 장부에 기록됨과 동시에 창고 수량이 늘어납니다.
                                <b>� 일반 지출:</b> 식비, 유류비 등 영수증 항목을 분류별로 기록해 세무 처리를 단순화합니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="5.2" title="✨ 세무 / 부가세 신고 센터 (New)">
                            <LogicBox color="amber">
                                <b>국세청 홈택스 대응:</b> 모든 매출을 '과세'와 '면세'로 자동 분류하여 리포트를 생성합니다.
                                <b>공급가액 자동 역산:</b> 합계 금액만 입력하면 부가세(10%)를 별도로 나눠서 저장해주므로, 신고 시 엑셀 다운로드 한 번으로 끝납니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="5.3" title="순이익(P&L) 분석">
                            <p className="text-slate-500 font-medium leading-[1.8]">
                                매출에서 매입 원가와 지출 비용을 뺀 <b>'진짜 남은 돈'</b>을 계산해 줍니다. 월별 수익 구조 변화를 시각화된 그래프로 관리하세요.
                            </p>
                        </SubSection>
                    </div>

                    {/* Section 6: Intelligence */}
                    <SectionTitle number="06" title="판매 인텔리전스 (AI Intelligence)" id="intel" icon={<BrainCircuit size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="6.1" title="AI 미래 수요 예측">
                            <FeatureBox title="지능형 수요 곡선">과거 3년 데이터를 머신러닝으로 분석해 향후 90일간 필요한 재고량을 미리 제안합니다.</FeatureBox>
                            <FeatureBox title="지역별 판매 히드맵">우리 농장 제품이 전국 어느 동네에서 가장 많이 팔리는지 지도로 시각화하여 타겟팅 광고를 돕습니다.</FeatureBox>
                        </SubSection>

                        <SubSection number="6.2" title="상품 연관 & AI 평판">
                            <div className="grid grid-cols-2 gap-6">
                                <FeatureBox title="연관 구매 분석">A 상품을 산 고객이 B 상품도 많이 산다면, 묶음 상품 구성을 제안해 드립니다.</FeatureBox>
                                <FeatureBox title="온라인 AI 평판">쇼핑몰 리뷰를 AI가 요약해 긍정/부정 여론과 개선해야 할 점을 짚어줍니다.</FeatureBox>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 7: Experience */}
                    <SectionTitle number="07" title="체험 프로그램 관리" id="exp" icon={<Zap size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <p className="text-slate-500 font-medium mb-6">농장 방문 체험 예약과 인원 통계를 관리하는 시스템입니다.</p>
                        <div className="grid grid-cols-2 gap-6">
                            <FeatureBox title="예약 접수/현황">일자별 예약 가능 인원을 체크하고, 성인을 비롯한 참가 인원 정보를 등록합니다.</FeatureBox>
                            <FeatureBox title="통합 일정 연동">예약 정보는 '일정 관리' 캘린더에 자동으로 표시되어 배송 업무와 겹치지 않게 관리됩니다.</FeatureBox>
                        </div>
                    </div>

                    {/* Section 8: Schedule */}
                    <SectionTitle number="08" title="통합 일정 관리 (Schedule)" id="schedule" icon={<Calendar size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="8.1" title="스마트 캘린더 운용">
                            <LogicBox color="indigo">
                                <b>📦 배송 일정 자동 반영:</b> 판매 접수 시 '배송 희망일'을 지정하면 캘린더에 택배 아이콘과 함께 자동 등록됩니다.
                                <b>🎨 카테고리별 색상:</b> 개인 일정, 배송 업무, 체험 예약이 서로 다른 색상으로 표시되어 업무 중복을 방지합니다.
                            </LogicBox>
                        </SubSection>
                    </div>

                    {/* Section 9: Settings */}
                    <SectionTitle number="09" title="설정 및 관리 (System Admin)" id="settings" icon={<Settings size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="8.1" title="마스터 데이터 관리">
                            <LogicBox color="emerald">
                                <b>상품 마스터:</b> 상품별 원가, 단가, 과세 여부(면세/과세), 소요 자재(BOM)를 설정하는 가장 기본적이고 중요한 단계입니다.
                                <b>API 연동:</b> 외부 문자 발송(카카오 알림톡), 쇼핑몰 동기화 등을 위한 인증키를 관리합니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="8.2" title="보안 및 백업/초기화">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100">
                                    <Database className="text-indigo-500 mb-4" size={32} />
                                    <h4 className="font-black text-slate-800 mb-2">백업 및 복구</h4>
                                    <p className="text-xs text-slate-500 font-bold leading-relaxed">매일 자동으로 데이터가 압축되어 저장됩니다. PC 교체 시 이 파일 하나로 모든 기록을 되살릴 수 있습니다.</p>
                                </div>
                                <div className="p-8 bg-rose-50/50 rounded-3xl border border-rose-100">
                                    <Trash2 className="text-rose-500 mb-4" size={32} />
                                    <h4 className="font-black text-slate-800 mb-2">데이터 초기화</h4>
                                    <p className="text-xs text-slate-500 font-bold leading-relaxed">연습용 데이터를 지우고 실제 운영을 시작할 때 사용합니다. <b>영구 삭제</b>되므로 주의가 필요합니다.</p>
                                </div>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 10: Rescue */}
                    <SectionTitle number="10" title="제니의 긴급 구조 센터 (Rescue)" id="rescue" icon={<HelpCircle size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <div className="grid grid-cols-1 gap-8">
                            <SubSection number="10.1" title="OCR 및 입력 오류 대처">
                                <LogicBox color="amber">
                                    명함 인식 시 '0'과 'O'를 혼동할 수 있습니다. 이미 입력된 텍스트는 언제든 마우스로 클릭해 수정이 가능하니, 저장 전 한 번 더 검토해 주세요.
                                </LogicBox>
                            </SubSection>
                            <SubSection number="10.2" title="화면이 멈추거나 백색 화면이 뜰 때">
                                <div className="flex gap-4 items-start p-6 bg-slate-100 rounded-2xl">
                                    <AlertTriangle className="text-orange-500 shrink-0" size={24} />
                                    <div className="text-sm font-bold text-slate-700 leading-relaxed">
                                        대부분의 일시적 오류는 프로그램을 종료 후 재실행하거나 <b>Ctrl + R (새로고침)</b>을 누르면 마법처럼 해결됩니다.
                                    </div>
                                </div>
                            </SubSection>
                            <SubSection number="10.3" title="장부 금액과 실재고가 안 맞아요">
                                <LogicBox title="영점 조절 가이드">
                                    과거의 누락된 데이터를 찾으려 애쓰기보다, [재고 조정] 메뉴에서 현재 시점의 실물 데이터로 '현행화' 하세요. 오늘을 기준으로 영점을 맞추고 기록을 새로 시작하는 것이 더 현명한 관리법입니다.
                                </LogicBox>
                            </SubSection>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center pt-24 border-t border-slate-200">
                        <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-10 shadow-xl shadow-indigo-100 rotate-3">
                            <Star size={32} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 mb-4">당신의 성공 파트너, 제니가 항상 곁에 있습니다</h3>
                        <p className="text-slate-400 font-bold text-sm mb-20">© 2026 Mycelium Enterprise Platform - User Instruction System v2.0</p>

                        <div className="flex justify-center gap-4">
                            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="px-6 py-3 bg-slate-800 text-white rounded-2xl font-black text-sm hover:bg-slate-700 transition-colors shadow-lg">맨 위로 이동</button>
                        </div>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            `}} />
        </div>
    );
};

export default UserManual;
