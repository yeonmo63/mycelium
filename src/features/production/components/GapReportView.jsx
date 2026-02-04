import React, { forwardRef } from 'react';
import dayjs from 'dayjs';

const GapReportView = forwardRef(({ logs = [], companyInfo = {} }, ref) => {
    return (
        <div ref={ref} id="printable-report" className="print-only p-8 bg-white text-black font-serif">
            {/* Report Header */}
            <div className="text-center mb-10 border-b-4 border-double border-black pb-6">
                <h1 className="text-3xl font-bold mb-2 tracking-tight">영농기록장 (농산물 우수관리 GAP)</h1>
                <p className="text-sm text-slate-600 mt-2 italic underline underline-offset-4">농림축산식품부 고시 표준 양식</p>
            </div>

            {/* Farm Information Section */}
            <div className="mb-8 overflow-hidden rounded-sm border border-black group">
                <div className="grid grid-cols-4 divide-x divide-black">
                    <div className="bg-slate-100 p-3 text-center font-bold text-sm flex items-center justify-center">포장명/시설명</div>
                    <div className="p-3 text-center text-sm flex items-center justify-center col-span-3">본사 재배동 및 부속 필지</div>
                    <div className="bg-slate-100 p-3 text-center font-bold text-sm flex items-center justify-center">작물호루</div>
                    <div className="p-3 text-center text-sm flex items-center justify-center col-span-3">표고버섯, 송고버섯</div>
                </div>
                <div className="grid grid-cols-4 divide-x divide-black border-t border-black">
                    <div className="bg-slate-100 p-3 text-center font-bold text-sm flex items-center justify-center">농업인 성명</div>
                    <div className="p-3 text-center text-sm flex items-center justify-center">{companyInfo?.representative_name || '관리자'}</div>
                    <div className="bg-slate-100 p-3 text-center font-bold text-sm flex items-center justify-center">농장 소재지</div>
                    <div className="p-3 text-center text-sm flex items-center justify-center">{companyInfo?.address || '농장 주소'}</div>
                </div>
            </div>

            {/* Logs Table */}
            <table className="w-full border-collapse border border-black text-xs leading-relaxed">
                <thead>
                    <tr className="bg-slate-100">
                        <th className="border border-black p-2 w-24">월/일</th>
                        <th className="border border-black p-2 w-32">작업단계/종류</th>
                        <th className="border border-black p-2">작업 내용 및 특이사항</th>
                        <th className="border border-black p-2 w-32">투입 자재/환경 데이터</th>
                        <th className="border border-black p-2 w-20">작업자</th>
                        <th className="border border-black p-2 w-16">확인</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.length > 0 ? logs.map((log, idx) => {
                        const env = log.env_data || {};
                        const materials = Array.isArray(log.input_materials) ? log.input_materials : [];

                        return (
                            <tr key={log.log_id || idx} className="h-20">
                                <td className="border border-black p-2 text-center font-bold">
                                    {dayjs(log.log_date).format('MM / DD')}
                                </td>
                                <td className="border border-black p-2 text-center align-middle font-semibold">
                                    {log.work_type}
                                </td>
                                <td className="border border-black p-2 align-top text-left whitespace-pre-wrap">
                                    {log.work_content}
                                </td>
                                <td className="border border-black p-2 align-top text-[10px]">
                                    {materials.length > 0 && (
                                        <div className="mb-2">
                                            <div className="font-bold border-b border-black/10 inline-block mb-1">[투입자재]</div>
                                            {materials.map((m, i) => (
                                                <div key={i}>• {m.name}: {m.quantity}{m.unit}</div>
                                            ))}
                                        </div>
                                    )}
                                    {(env.temp || env.humidity) && (
                                        <div>
                                            <div className="font-bold border-b border-black/10 inline-block mb-1">[환경데이터]</div>
                                            {env.temp && <div>• 온도: {env.temp}°C</div>}
                                            {env.humidity && <div>• 습도: {env.humidity}%</div>}
                                            {env.co2 && <div>• CO2: {env.co2}ppm</div>}
                                        </div>
                                    )}
                                </td>
                                <td className="border border-black p-2 text-center align-middle">
                                    {log.worker_name}
                                </td>
                                <td className="border border-black p-2 text-center align-middle">
                                    <div className="w-8 h-8 rounded-full border border-black/10 mx-auto"></div>
                                </td>
                            </tr>
                        );
                    }) : (
                        // Empty rows for professional look if no data
                        Array.from({ length: 10 }).map((_, i) => (
                            <tr key={i} className="h-16">
                                <td className="border border-black"></td>
                                <td className="border border-black"></td>
                                <td className="border border-black"></td>
                                <td className="border border-black"></td>
                                <td className="border border-black"></td>
                                <td className="border border-black"></td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {/* Footer */}
            <div className="mt-10 flex justify-between items-end">
                <div className="text-[10px] text-slate-500 italic">
                    * 본 영농기록장은 Mycelium 생산 관리 시스템에 의해 {dayjs().format('YYYY-MM-DD HH:mm')}에 자동 생성되었습니다.
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold mb-4">확인자: ________________ (인)</p>
                    <p className="text-lg font-black tracking-[0.3em]">마이셀륨 농업회사법인</p>
                </div>
            </div>

            {/* Page Break Control */}
            <div className="print:page-break-after-always"></div>
        </div>
    );
});

export default GapReportView;
