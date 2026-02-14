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
                            대시보드는 농장의 경영 상태를 실시간으로 파악하는 전용 관제탑입니다. AI 분석과 실시간 데이터 연동을 통해 오늘의 핵심 과제를 제안합니다.
                        </p>

                        <SubSection number="1.1" title="🌤️ AI 날씨 & 브리핑">
                            <LogicBox color="indigo">
                                <b>실시간 기상 연동:</b> 현재 농장 위치의 날씨를 기반으로 수확, 건조, 배송 시 주의사항을 AI가 알려줍니다.
                                <b>경영 브리핑:</b> 전일 대비 매출 변화, 주요 이슈(부족 재고, 급증한 클레임 등)를 제니가 한 줄로 요약해 드립니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="1.2" title="📊 11대 핵심 지표">
                            <div className="grid grid-cols-2 gap-6">
                                <FeatureBox title="금일 매출/주문">오늘 접수된 유효 주문 수와 합계 금액입니다.</FeatureBox>
                                <FeatureBox title="신규/누적 고객">오늘 처음 인연을 맺은 고객과 우리 농장의 총 자산인 전체 고객 수입니다.</FeatureBox>
                                <FeatureBox title="송장 대기/예약">아직 송장이 입력되지 않은 주문과 오늘 예정된 체험 예약 수입니다.</FeatureBox>
                                <FeatureBox title="위험/상담 알림">안전 재고 미달 상품과 답신이 필요한 상담 건수를 빨간색으로 경고합니다.</FeatureBox>
                            </div>
                        </SubSection>

                        <JennyTip title="제니의 대시보드 활용법">
                            아침에 출근하시면 가장 먼저 대시보드의 <b>[기념일/생일 고객]</b>을 확인해 보세요. 생일인 우수 고객님께 축하 메시지 한 통을 보내는 것만으로도 재구매율이 40% 이상 높아집니다!
                        </JennyTip>
                    </div>

                    {/* Section 2: Sales */}
                    <SectionTitle number="02" title="판매 관리 (Sales Control)" id="sales" icon={<ShoppingCart size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="2.1" title="주문 접수 및 주문 경로">
                            <div className="space-y-4">
                                <p className="text-slate-500 font-medium leading-relaxed">전화, 방문, 특판(행사장), 쇼핑몰 주문을 모두 한곳에서 관리합니다.</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <FeatureBox title="일반 접수">전화/문자 주문용입니다. 고객 검색 후 상품을 담고 [일괄 저장]하세요.</FeatureBox>
                                    <FeatureBox title="특판 행사 접수">백화점 팝업 등 현장용입니다. 모바일 기기에 최적화되어 빠른 입력이 가능합니다.</FeatureBox>
                                    <FeatureBox title="쇼핑몰 주문 연동">네이버/쿠팡 등의 엑셀 주문서를 업로드하면 시스템 고객과 자동 매칭하여 등록합니다.</FeatureBox>
                                    <FeatureBox title="행사장(특판) 관리">팝업 스토어 등 외부 판매처의 장소를 등록하고 장소별 매출을 따로 집계합니다.</FeatureBox>
                                </div>
                            </div>
                        </SubSection>

                        <SubSection number="2.2" title="배송 효율화 및 클레임">
                            <LogicBox color="indigo">
                                <b>🚚 배송 관리:</b> 주소지가 같은 주문을 묶어서 운송장을 뽑거나, 송장 번호를 스캐너로 입력해 즉시 상태를 바꿀 수 있습니다.
                                <b>🔄 취소/반품/교환:</b> 단순 변심이나 배송 사고 시 처리를 담당합니다. 반품 시 '재고 복구'를 체크하면 창고 수량이 자동으로 다시 채워집니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="2.3" title="판매 데이터 시각화">
                            <div className="grid grid-cols-2 gap-6">
                                <FeatureBox title="일일 접수 현황">오늘 시간대별로 주문이 어떻게 들어왔는지 타임라인으로 확인합니다.</FeatureBox>
                                <FeatureBox title="개인별 판매 현황">직원이나 동업자별로 누가 실적이 좋은지 투명하게 리포팅합니다.</FeatureBox>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 3: Customer */}
                    <SectionTitle number="03" title="고객 관리 (CRM)" id="customer" icon={<Users size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="3.1" title="데이터 중심 고객 관리">
                            <p className="text-slate-500 font-medium leading-relaxed">단순한 연락처 저장을 넘어, 고객의 모든 여정을 데이터로 기록합니다.</p>
                            <div className="grid grid-cols-2 gap-6">
                                <FeatureBox title="고객 등록/수정">성함, 전화번호, 주소뿐만 아니라 고객의 특징(종교, 선호상품 등)을 메모하세요.</FeatureBox>
                                <FeatureBox title="상담 관리(CRM)">전화 응대 내용을 작성해 두면 다음에 다시 연락 왔을 때 제니가 상담 이력을 미리 보여줍니다.</FeatureBox>
                                <FeatureBox title="고객 일괄 조회">필터링 기능을 이용해 특정 지역 고객이나 이번 달 첫 구매 고객만 따로 뽑을 수 있습니다.</FeatureBox>
                                <FeatureBox title="우수/집중 관리">VIP 고객에게는 특별 혜택을 제안하고, 까다로운 고객에겐 🚨 주의 표시를 달아 대응력을 높입니다.</FeatureBox>
                            </div>
                        </SubSection>

                        <SubSection number="3.2" title="금융 및 미수금 관리">
                            <LogicBox color="rose" title="고객 미수금 장부">
                                선발송 후 입금이나 외상 거래 시 발생하는 미수금을 고객별로 추적합니다.
                                <b>입금 처리:</b> 통장에 돈이 들어오면 해당 고객의 미수금 관리 메뉴에서 [입금 등록]을 눌러 잔액을 영점으로 만드세요.
                            </LogicBox>
                        </SubSection>
                    </div>

                    {/* Section 4: Inventory & Production */}
                    <SectionTitle number="04" title="재고/생산/현장관리" id="inventory_prod" icon={<Clock size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="4.1" title="스마트 재고 및 생산">
                            <LogicBox color="violet">
                                <b>재고/생산 관리:</b> 원재료(자재)를 완제품으로 변환할 때 사용하는 메뉴입니다.
                                <b>BOM(Recipe) 연동:</b> 상품 설정에서 미리 '조립 방법'을 등록해두면, 완제품 1개를 만들 때 필요한 박스 1개, 라벨 1개 등이 자동으로 자재 창고에서 차감됩니다.
                            </LogicBox>
                        </SubSection>

                        <SubSection number="4.2" title="GAP / HACCP 인증센터">
                            <div className="space-y-4">
                                <p className="text-slate-500 font-medium leading-relaxed">인증 기관 제출용 서류를 수동 작업 없이 자동 생성하는 강력한 도구입니다.</p>
                                <FeatureBox title="이력 추적 (Traceability)">수확물마다 고유 번호를 부여해 배송 송장과 연결하면, 나중에 문제가 생겨도 몇 번 배치에서 나온 물건인지 즉시 파악됩니다.</FeatureBox>
                                <FeatureBox title="영농일지 자동화">모바일 앱으로 매일 기록하는 작업 일지가 인증 규격 PDF 리포트로 즉시 변환됩니다.</FeatureBox>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 5: Finance */}
                    <SectionTitle number="05" title="회계/지출 관리" id="finance" icon={<Calculator size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="5.1" title="현금 흐름 최적화">
                            <div className="grid grid-cols-2 gap-4">
                                <FeatureBox title="매입 등록/내역">자재 구입비를 기록합니다. 결제 상태(미수/완료)를 관리해 업체 대금 결제일을 놓치지 마세요.</FeatureBox>
                                <FeatureBox title="일반 지출 관리">임대료, 전기세, 유류비 등 영수증 항목을 분류하여 기록합니다.</FeatureBox>
                                <FeatureBox title="공급/거래처 관리">자재를 대주는 곳이나 협력 업체의 정보를 집중 관리합니다.</FeatureBox>
                                <FeatureBox title="손익/재무 분석">매출에서 모든 매입/지출을 뺀 순수익을 시각화합니다. 이번 달에 정말로 얼마를 벌었는지 알려드립니다.</FeatureBox>
                            </div>
                        </SubSection>

                        <SubSection number="5.2" title="🧾 세무 / 부가세 신고 편의">
                            <LogicBox color="amber">
                                <b>과면세 분리:</b> 농산물(면세)과 가공품(과세) 매출을 자동으로 나눠서 집계합니다.
                                <b>신고 리포트:</b> 부가세 신고 기간에 [세무 리포트] 버튼 한 번이면 공급가액과 부가세가 정리된 엑셀 파일을 얻을 수 있습니다.
                            </LogicBox>
                        </SubSection>
                    </div>

                    {/* Section 6: Intelligence */}
                    <SectionTitle number="06" title="판매 인텔리전스 (AI)" id="intel" icon={<BrainCircuit size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <p className="text-slate-500 font-medium mb-6">데이터 사이언스와 AI가 사장님의 마케팅 팀원이 되어 드립니다.</p>
                        <div className="grid grid-cols-2 gap-6">
                            <FeatureBox title="지능형 판매 리포트">상품별 매출 추이를 분석해 다음 달 예상 매출액을 예측합니다.</FeatureBox>
                            <FeatureBox title="AI 고객 성장 센터">고객의 구매 패턴을 분석해 '이탈 가능성'이 높은 고객을 미리 알려줍니다.</FeatureBox>
                            <FeatureBox title="지역별 히트맵">어느 지역에서 우리 상품이 인기가 많은지 지도로 시각화하여 배송 노선이나 홍보 전략을 짜게 돕습니다.</FeatureBox>
                            <FeatureBox title="판촉 문자 발송">추출된 타겟 고객군에게 마케팅 문자를 한 번에 발송합니다.</FeatureBox>
                        </div>
                    </div>

                    {/* Section 7: Experience */}
                    <SectionTitle number="07" title="체험 프로그램" id="exp" icon={<Calendar size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="7.1" title="방문 체험 예약 프로세스">
                            <LogicBox color="emerald">
                                <b>예약 접수:</b> 방문 날짜, 프로그램 종류, 인원수(성인/어린이)를 등록합니다.
                                <b>예약 현황:</b> 오늘 몇 명이 오기로 했는지 캘린더와 리스트로 확인하고 출석 체크를 관리합니다.
                            </LogicBox>
                        </SubSection>
                    </div>

                    {/* Section 8: Schedule */}
                    <SectionTitle number="08" title="통합 일정 관리" id="schedule" icon={<Settings size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <p className="text-slate-500 font-medium">배송일, 체험일, 개인 정기 일정을 하나로 묶어 보여주는 농장의 '표준 시간표'입니다.</p>
                        <FeatureBox title="자동 연동">판매 관리에서 입력한 [배송 희망일]이 자동으로 캘린더에 표시되어 업무가 겹치는 것을 방지합니다.</FeatureBox>
                        <JennyTip title="제니의 조언">
                            바쁜 시즌에는 캘린더의 <b>[배송 업무]</b> 필터만 켜보세요. 오늘 나가야 할 택배 물량을 한눈에 보고 작업을 분담할 수 있습니다!
                        </JennyTip>
                    </div>

                    {/* Section 9: Settings */}
                    <SectionTitle number="09" title="설정 및 관리 (Setup)" id="settings" icon={<Settings size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm space-y-12 mb-32">
                        <SubSection number="9.1" title="시스템 기저 설정">
                            <div className="grid grid-cols-2 gap-4">
                                <FeatureBox title="사용자 관리">직원별 권한(관리자/일반)을 부여하고 로그인 정보를 관리합니다.</FeatureBox>
                                <FeatureBox title="업체 정보 관리">송장이나 영수증에 인쇄될 내 농장의 상호, 주소, 로고를 등록합니다.</FeatureBox>
                                <FeatureBox title="상품/자재 마스터">가장 중요한 메뉴입니다. 상품명, 원가, 규격, BOM 구성을 정확히 입력해야 모든 수치가 올바르게 계산됩니다.</FeatureBox>
                                <FeatureBox title="모바일 연동 센터">현장에서 사용하는 모바일 앱과 연결하기 위해 PIN 번호를 설정하고 접속 URL을 확인합니다.</FeatureBox>
                            </div>
                        </SubSection>
                    </div>

                    {/* Section 10: Rescue */}
                    <SectionTitle number="10" title="제니의 긴급 구조 센터" id="rescue" icon={<HelpCircle size={28} />} />
                    <div className="bg-white rounded-[3rem] border border-slate-200/80 p-12 shadow-sm mb-32">
                        <div className="p-8 border-b border-slate-100 flex items-start gap-4 bg-rose-50/30 rounded-t-[3rem]">
                            <AlertCircle className="text-rose-500 shrink-0" size={24} />
                            <div>
                                <h4 className="font-black text-slate-800 mb-1">시스템 사용 중 문제가 생겼나요?</h4>
                                <p className="text-sm font-bold text-slate-400">당황하지 마시고 아래 절차를 따라해 보세요.</p>
                            </div>
                        </div>
                        <div className="p-12 space-y-8">
                            <SubSection number="1" title="화면이 멈추거나 먹통일 때">
                                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                    키보드의 <b>Ctrl + R</b> 또는 <b>F5</b>를 눌러 화면을 새로고침해 보세요. 대부분의 일시적인 통신 오류는 이 방법으로 해결됩니다.
                                </p>
                            </SubSection>
                            <SubSection number="2" title="데이터가 사라진 것 같아요!">
                                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                    [설정 &gt; 백업 및 복구] 메뉴에서 어제 날짜의 파일을 찾아 [복구하기]를 누르시면 완벽하게 되살릴 수 있습니다. Mycelium은 매일 자동으로 안전한 곳에 기록을 저장하고 있습니다.
                                </p>
                            </SubSection>
                            <SubSection number="3" title="장부 액수가 실제와 안 맞을 때">
                                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                    모든 전산 기록은 사람이 입력하는 것입니다. 과거의 틀린 데이터를 찾으려고 며칠을 고생하기보다, 오늘 시점의 실제 수량을 [재고 조정] 메뉴에서 강제로 맞춰주세요. 오늘을 'Day-0'로 다시 설정하는 것이 가장 효율적입니다.
                                </p>
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
