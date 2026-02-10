import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Thermometer, Droplets, Wind, Activity, RefreshCw, Layers } from 'lucide-react';

const VirtualIotHub = () => {
    const [sensors, setSensors] = useState([]);
    const [readings, setReadings] = useState({});
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const sensorList = await invoke('get_sensors');
            setSensors(sensorList);

            if (sensorList.length > 0) {
                const sensorIds = sensorList.map(s => s.sensor_id);
                const latestReadings = await invoke('get_latest_readings', { sensorIds });

                const readingMap = {};
                latestReadings.forEach(r => {
                    readingMap[r.sensor_id] = r;
                });
                setReadings(readingMap);
            }
        } catch (err) {
            console.error('Failed to fetch IoT data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // 1 minute
        return () => clearInterval(interval);
    }, []);

    // Simulation tool for user testing
    const simulateData = async (sensorId, type) => {
        try {
            const randomVal = (base, range) => (base + (Math.random() * range - range / 2)).toFixed(1);
            await invoke('push_sensor_data', {
                sensorId,
                temp: parseFloat(randomVal(22, 4)),
                humid: parseFloat(randomVal(60, 10)),
                co2: parseFloat(randomVal(500, 200))
            });
            fetchData();
        } catch (err) {
            console.error('Simulation failed:', err);
        }
    };

    return (
        <div className="bg-white rounded-[28px] py-6 px-6 border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col h-full group transition-all duration-500 hover:border-indigo-200">
            <div className="flex justify-end mb-2">
                <button onClick={fetchData} className={`p-1.5 bg-slate-50 rounded-xl text-slate-300 hover:text-indigo-500 transition-all ${isLoading ? 'animate-spin' : ''}`}>
                    <RefreshCw size={12} />
                </button>
            </div>

            <div className="flex-1 flex flex-col justify-center">
                {sensors.slice(0, 1).map(sensor => {
                    const data = readings[sensor.sensor_id];
                    return (
                        <div key={sensor.sensor_id} className="grid grid-cols-3 gap-2">
                            <div className="flex flex-col items-center">
                                <Thermometer size={18} className="text-rose-400 mb-1" />
                                <span className="text-[10px] font-black text-slate-400 mb-1">온도</span>
                                <span className="text-lg font-black text-slate-700">{data?.temperature || '0.0'}°C</span>
                            </div>
                            <div className="flex flex-col items-center border-x border-slate-100 px-2">
                                <Droppets size={18} className="text-blue-400 mb-1" />
                                <span className="text-[10px] font-black text-slate-400 mb-1">습도</span>
                                <span className="text-lg font-black text-slate-700">{data?.humidity || '0.0'}%</span>
                            </div>
                            <div className="flex flex-col items-center leading-tight">
                                <Wind size={18} className="text-emerald-500 mb-1" />
                                <span className="text-[10px] font-black text-slate-400 mb-1">CO2 농도</span>
                                <span className="text-lg font-black text-slate-700">{data?.co2 || '0'}<small className="text-[10px] ml-0.5">ppm</small></span>
                            </div>
                        </div>
                    );
                })}

                {sensors.length === 0 && !isLoading && (
                    <div className="text-center text-slate-300">
                        <p className="text-[10px] font-bold">센서 데이터 대기 중...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const Droppets = ({ size, className }) => (
    <Droplets size={size} className={className} />
);

export default VirtualIotHub;
