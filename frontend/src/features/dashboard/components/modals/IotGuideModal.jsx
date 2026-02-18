import React from 'react';

const IotGuideModal = ({ onClose }) => {
    const apiEndpoint = `${window.location.origin}/api/iot/push`;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
                <div className="p-8">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                                <span className="material-symbols-rounded text-indigo-600 bg-indigo-50 p-2 rounded-2xl">sensors</span>
                                실제 IoT 장부 연동 가이드
                            </h2>
                            <p className="text-slate-500 font-medium mt-1">자사 센서나 아두이노/ESP32 등을 Mycelium에 연결하는 방법입니다.</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                            <span className="material-symbols-rounded text-slate-400">close</span>
                        </button>
                    </div>

                    <div className="space-y-6">
                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
                                <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">1</span>
                                API 엔드포인트 정보
                            </h3>
                            <div className="bg-slate-50 p-4 rounded-2xl font-mono text-sm border border-slate-100 break-all">
                                <span className="text-indigo-600 font-bold">POST</span> {apiEndpoint}
                            </div>
                        </section>

                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
                                <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">2</span>
                                데이터 형식 (JSON Payload)
                            </h3>
                            <div className="bg-slate-800 p-5 rounded-2xl font-mono text-xs text-indigo-300 shadow-inner">
                                <pre>{JSON.stringify({
                                    sensor_id: 1,
                                    temp: 24.5,
                                    humid: 60.2,
                                    co2: 450
                                }, null, 2)}</pre>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-sm font-black text-slate-700 mb-3 flex items-center gap-2">
                                <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]">3</span>
                                아두이노 (HTTP Client) 예시 코드
                            </h3>
                            <div className="bg-slate-50 p-4 rounded-2xl font-mono text-[11px] text-slate-600 border border-slate-100 h-40 overflow-y-auto">
                                <pre>{`#include <HTTPClient.h>

void sendData() {
  HTTPClient http;
  http.begin("${apiEndpoint}");
  http.addHeader("Content-Type", "application/json");
  
  String json = "{\\"sensorId\\": 1, \\"temp\\": 25.4, \\"humid\\": 65.0, \\"co2\\": 480}";
  int httpCode = http.POST(json);
  
  if (httpCode > 0) {
    Serial.println("Data sent successfully");
  }
  http.end();
}`}</pre>
                            </div>
                        </section>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <button
                            onClick={onClose}
                            className="bg-slate-800 text-white px-8 py-3 rounded-2xl font-black text-sm hover:bg-slate-900 transition-all shadow-lg shadow-slate-200"
                        >
                            확인 완료
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IotGuideModal;
