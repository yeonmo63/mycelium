import React from 'react';
import dayjs from 'dayjs';

const WeatherHero = ({ weatherAdvice, isWeatherLoading }) => {
    const getWeatherIcon = (desc) => {
        if (!desc) return 'cloud';
        if (desc.includes('눈')) return 'ac_unit';
        if (desc.includes('비')) return 'umbrella';
        if (desc.includes('맑음')) return 'wb_sunny';
        if (desc.includes('흐림') || desc.includes('구름')) return 'filter_drama';
        return 'cloud';
    };

    return (
        <div className="col-span-full bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-black rounded-[32px] p-8 min-[2000px]:p-10 shadow-2xl relative overflow-hidden h-full min-h-[160px] min-[2000px]:min-h-[220px] flex items-center group transition-all duration-700 hover:shadow-indigo-500/10">
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none"></div>
            <div className="absolute bottom-[-50%] left-[-10%] w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none"></div>

            <div className="relative z-10 flex items-center gap-8 min-[2000px]:gap-12 w-full">
                <div className="w-20 h-20 min-[2000px]:w-28 min-[2000px]:h-28 rounded-[28px] bg-white/10 backdrop-blur-2xl border border-white/20 flex items-center justify-center shrink-0 shadow-2xl group-hover:rotate-6 transition-transform duration-500">
                    <span className="material-symbols-rounded text-amber-400 text-5xl min-[2000px]:text-7xl drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                        {getWeatherIcon(weatherAdvice?.weather_desc)}
                    </span>
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                        <h3 className="text-white text-[1.4rem] font-black tracking-tight drop-shadow-sm">오늘의 현황</h3>
                        {!isWeatherLoading && (
                            <div className="bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full text-white/90 text-[0.9rem] font-bold border border-white/10 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                강릉 {weatherAdvice?.temperature?.toFixed(1)}°C · {weatherAdvice?.weather_desc}
                            </div>
                        )}
                    </div>
                    <p className="text-slate-300 text-[0.95rem] font-medium leading-relaxed max-w-[90%] drop-shadow-sm">
                        {isWeatherLoading ? "인공지능이 오늘의 날씨와 데이터를 통합 분석 중입니다..." : (weatherAdvice?.marketing_advice || "오늘의 최적화된 마케팅 전략을 확인하세요.")}
                    </p>
                    {!isWeatherLoading && (
                        <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                            <span className="material-symbols-rounded text-xs">info</span>
                            이 분석은 최근 3년간의 계절별 판매 기록과 실시간 날씨 데이터를 바탕으로 작성되었습니다.
                        </div>
                    )}
                </div>
                <div className="hidden 2xl:block pr-8 shrink-0">
                    <div className="text-right">
                        <div className="text-slate-500 text-[0.7rem] font-black uppercase tracking-[0.3em] mb-1">최근 갱신</div>
                        <div className="text-white font-mono text-lg font-bold">{dayjs().format('HH:mm:ss')}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WeatherHero;
