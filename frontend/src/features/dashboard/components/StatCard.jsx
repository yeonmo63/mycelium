import React from 'react';

const StatCard = ({
    icon,
    iconColor,
    iconBg,
    label,
    value,
    trend,
    isLoading,
    badge,
    onClick,
    className = "",
    secondaryValue
}) => {
    return (
        <div
            onClick={onClick}
            className={`bg-white rounded-[28px] py-5 px-6 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden group hover:shadow-[0_20px_40px_rgba(0,0,0,0.05)] transition-all duration-500 h-full min-h-[140px] flex flex-col justify-between cursor-pointer ${className}`}
        >
            <div className="flex justify-between items-start">
                <span className={`material-symbols-rounded ${iconColor} ${iconBg} p-2.5 rounded-[16px] text-[20px] shadow-sm`}>{icon}</span>
                {trend && !isLoading && (
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${trend.isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} shadow-sm`}>
                        <span className="material-symbols-rounded text-[14px]">{trend.isUp ? 'arrow_upward' : 'arrow_downward'}</span>
                        {trend.label || `${trend.pct}%`}
                    </div>
                )}
                {badge && <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md">{badge}</div>}
            </div>
            <div>
                <h3 className="text-slate-500 text-[0.8rem] font-bold uppercase tracking-wider mb-1">{label}</h3>
                <div className={`text-[1.4rem] font-black tracking-tighter leading-none ${isLoading ? 'text-slate-200 animate-pulse' : 'text-slate-800'}`}>
                    {isLoading ? "..." : value}
                </div>
                {secondaryValue && !isLoading && (
                    <div className="text-[10px] font-black text-slate-400 mt-1.5 flex items-center gap-2">
                        {secondaryValue}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatCard;
