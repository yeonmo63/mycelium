import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const MenuItem = ({ to, icon, label, end = false }) => (
    <li>
        <NavLink
            to={to}
            end={end}
            className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-medium text-[0.95rem]
                ${isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'}
            `}
        >
            <span className="material-symbols-rounded text-[20px]">{icon}</span>
            <span>{label}</span>
        </NavLink>
    </li>
);

const SubMenuItem = ({ to, icon, label }) => (
    <li>
        <NavLink
            to={to}
            className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 text-sm
                ${isActive
                    ? 'text-indigo-400 bg-indigo-500/10 font-bold'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}
            `}
        >
            <span className="material-symbols-rounded text-[18px]">{icon}</span>
            <span>{label}</span>
        </NavLink>
    </li>
);

const MenuGroup = ({ id, icon, label, children, activePrefix, expanded, onToggle, currentPath }) => {
    const active = activePrefix
        ? currentPath.startsWith(activePrefix)
        : currentPath.startsWith('/' + id);

    return (
        <li>
            <button
                onClick={() => onToggle(id)}
                className={`
                    w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 font-medium text-[0.95rem] group
                    ${active && !expanded ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-400 hover:bg-white/5 hover:text-white'}
                `}
            >
                <div className="flex items-center gap-3">
                    <span className={`material-symbols-rounded text-[20px] transition-colors ${active ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`}>{icon}</span>
                    <span>{label}</span>
                </div>
                <span className={`material-symbols-rounded text-[18px] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>expand_more</span>
            </button>

            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                <ul className="pl-4 border-l border-slate-800 ml-6 space-y-1">
                    {children}
                </ul>
            </div>
        </li>
    );
};

const Sidebar = () => {
    const [expandedMenus, setExpandedMenus] = useState({});
    const location = useLocation();

    const toggleMenu = (key) => {
        setExpandedMenus(prev => {
            if (prev[key]) {
                return { ...prev, [key]: false };
            }
            return { [key]: true };
        });
    };

    const isExpanded = (key) => !!expandedMenus[key];

    return (
        <nav className="w-72 h-screen bg-slate-950 border-r border-white/5 flex flex-col shrink-0 relative z-50">
            {/* Logo Area */}
            <div className="p-8 pb-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <span className="material-symbols-rounded text-white text-2xl">agriculture</span>
                    </div>
                    <h2 className="text-xl font-black tracking-tight text-white">
                        CSI <span className="text-indigo-400">Manager</span>
                    </h2>
                </div>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar">
                <ul className="space-y-1">
                    <MenuItem to="/" icon="dashboard" label="대시보드" end={true} />

                    <MenuGroup id="sales" icon="shopping_cart" label="판매 관리" expanded={isExpanded('sales')} onToggle={toggleMenu} currentPath={location.pathname}>
                        <SubMenuItem to="/sales/reception" icon="receipt_long" label="일반 접수" />
                        <SubMenuItem to="/sales/shipping" icon="local_shipping" label="배송 관리" />
                        <SubMenuItem to="/sales/claims" icon="assignment_return" label="취소/반품/교환" />
                        <SubMenuItem to="/sales/special" icon="event_seat" label="특판 행사 접수" />
                        <SubMenuItem to="/sales/online-sync" icon="sync_alt" label="쇼핑몰 주문 연동" />
                        <SubMenuItem to="/sales/daily-receipts" icon="history_edu" label="일일 접수 현황" />
                        <SubMenuItem to="/sales/daily" icon="person_search" label="개인별 판매 현황" />
                        <SubMenuItem to="/sales/stock" icon="inventory_2" label="재고 관리" />
                        <SubMenuItem to="/customer/event-mgmt" icon="fmd_good" label="행사(특판)장 관리" />
                    </MenuGroup>

                    <MenuGroup id="customer" icon="group" label="고객 관리" expanded={isExpanded('customer')} onToggle={toggleMenu} currentPath={location.pathname}>
                        <SubMenuItem to="/customer/register" icon="person_add" label="고객 등록" />
                        <SubMenuItem to="/customer/edit" icon="manage_accounts" label="고객 조회/수정" />
                        <SubMenuItem to="/sales/ledger" icon="account_balance_wallet" label="고객 미수금 관리" />
                        <SubMenuItem to="/customer/batch" icon="domain" label="고객 일괄 조회" />
                        <SubMenuItem to="/customer/consultation" icon="support_agent" label="상담 관리(CRM)" />
                        <SubMenuItem to="/customer/best" icon="grade" label="우수 고객 관리" />
                        <SubMenuItem to="/customer/special-care" icon="priority_high" label="집중 관리 고객" />
                    </MenuGroup>

                    <MenuGroup id="finance" icon="account_balance" label="회계/지출 관리" expanded={isExpanded('finance')} onToggle={toggleMenu} currentPath={location.pathname}>
                        <SubMenuItem to="/finance/purchase" icon="shopping_bag" label="매입 등록/내역" />
                        <SubMenuItem to="/finance/expense" icon="payments" label="일반 지출 관리" />
                        <SubMenuItem to="/finance/vendor" icon="factory" label="공급/거래처 관리" />
                        <SubMenuItem to="/status/financial-analysis" icon="analytics" label="손익/재무 분석" />
                    </MenuGroup>

                    <MenuGroup id="intel" icon="insights" label="판매 인텔리전스" expanded={isExpanded('intel')} onToggle={toggleMenu} currentPath={location.pathname}>
                        <SubMenuItem to="/intel/sales" icon="analytics" label="지능형 판매 리포트" />
                        <SubMenuItem to="/intel/customer" icon="psychology" label="AI 고객 성장 센터" />
                        <SubMenuItem to="/marketing/association" icon="hub" label="상품 연관 분석" />
                        <SubMenuItem to="/marketing/orm" icon="public" label="온라인 AI 평판" />
                        <SubMenuItem to="/intel/region-analysis" icon="map" label="AI 지역별 히트맵" />
                        <SubMenuItem to="/product/sales" icon="bar_chart" label="상품별 판매 현황" />
                        <SubMenuItem to="/customer/sms" icon="sms" label="판촉 문자 발송" />
                    </MenuGroup>

                    <MenuGroup id="experience" icon="calendar_today" label="체험 프로그램" activePrefix="/exp" expanded={isExpanded('experience')} onToggle={toggleMenu} currentPath={location.pathname}>
                        <SubMenuItem to="/exp/reservation-entry" icon="book_online" label="체험 예약 접수" />
                        <SubMenuItem to="/exp/reservation-status" icon="event_note" label="체험 예약 현황" />

                    </MenuGroup>

                    <MenuItem to="/schedule" icon="calendar_month" label="일정 관리" />

                    <MenuGroup id="settings" icon="settings" label="설정 및 관리" expanded={isExpanded('settings')} onToggle={toggleMenu} currentPath={location.pathname}>
                        <SubMenuItem to="/settings/user-list" icon="manage_accounts" label="사용자 관리" />
                        <SubMenuItem to="/settings/company-info" icon="business" label="업체 정보 관리" />
                        <SubMenuItem to="/settings/product-list" icon="inventory_2" label="상품/자재 마스터" />
                        <SubMenuItem to="/exp/program-mgmt" icon="settings_applications" label="체험 프로그램 설정" />
                        <SubMenuItem to="/settings/api-keys" icon="api" label="외부 서비스 연동" />
                        <SubMenuItem to="/settings/template-mgmt" icon="chat_bubble" label="메시지 템플릿" />
                        <SubMenuItem to="/settings/db-backup-restore" icon="backup" label="백업 및 복구" />
                        <SubMenuItem to="/settings/db-reset" icon="delete_forever" label="데이터 초기화" />
                    </MenuGroup>

                    <MenuItem to="/manual" icon="help" label="사용자 메뉴얼" />
                </ul>
            </div>
        </nav>
    );
};

export default Sidebar;
