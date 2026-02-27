import React, { useState, useEffect } from 'react';
import { getPendingSyncItems, removeSyncedItem, markAsSyncing, markAsFailed, hasPendingItems } from '../utils/offlineDb';
import { invoke } from '../utils/apiBridge';
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

const OfflineSyncMonitor = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncResult, setLastSyncResult] = useState(null); // 'success', 'error'

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        updatePendingCount();

        // Check every 30 seconds
        const timer = setInterval(() => {
            updatePendingCount();
        }, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(timer);
        };
    }, []);

    // Trigger sync when coming back online
    useEffect(() => {
        if (isOnline) {
            triggerSync();
        }
    }, [isOnline]);

    const updatePendingCount = async () => {
        const items = await getPendingSyncItems();
        setPendingCount(items.length);
    };

    const triggerSync = async () => {
        const items = await getPendingSyncItems();
        if (items.length === 0 || isSyncing) return;

        setIsSyncing(true);
        console.log(`PWA Sync: Starting sync for ${items.length} items...`);

        let successCount = 0;
        for (const item of items) {
            try {
                await markAsSyncing(item.id);
                // Call callBridge again. Since we are online, it should hit the network.
                // We use a bypass flag or just rely on navigator.onLine which apiBridge checks.
                const result = await invoke(item.commandName, item.args);

                if (result && result.success !== false) {
                    await removeSyncedItem(item.id);
                    successCount++;
                } else {
                    await markAsFailed(item.id);
                }
            } catch (err) {
                console.error(`PWA Sync: Failed to sync item ${item.id}`, err);
                await markAsFailed(item.id);
            }
        }

        setIsSyncing(false);
        updatePendingCount();

        if (successCount > 0) {
            setLastSyncResult('success');
            setTimeout(() => setLastSyncResult(null), 5000);
        }
    };

    if (!isOnline) {
        return (
            <div className="fixed bottom-24 left-4 z-[100] animate-in slide-in-from-left fade-in duration-500">
                <div className="bg-slate-950/80 backdrop-blur-xl text-white px-5 py-3.5 rounded-[1.5rem] shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex items-center gap-4 border border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.6)]"></div>
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30 animate-pulse">
                        <WifiOff size={20} className="text-orange-500" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-black tracking-tight text-white leading-tight">오프라인 모드</span>
                        <span className="text-[10px] text-slate-400 font-bold tracking-tighter uppercase mt-0.5">LOCAL PERSISTENCE ACTIVE</span>
                    </div>
                </div>
            </div>
        );
    }

    if (pendingCount > 0 || isSyncing || lastSyncResult) {
        return (
            <div className="fixed bottom-24 left-4 z-[100] animate-in slide-in-from-left fade-in duration-500">
                <div className="bg-white/80 backdrop-blur-xl px-5 py-3.5 rounded-[1.5rem] shadow-[0_12px_40px_rgba(0,0,0,0.08)] flex items-center gap-4 border border-white/40 min-w-[240px] group transition-all">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${isSyncing ? 'bg-indigo-50 border-indigo-100' :
                            lastSyncResult === 'success' ? 'bg-emerald-50 border-emerald-100' :
                                'bg-slate-50 border-slate-100'
                        }`}>
                        {isSyncing ? (
                            <RefreshCw size={24} className="text-indigo-600 animate-spin" />
                        ) : lastSyncResult === 'success' ? (
                            <CheckCircle size={24} className="text-emerald-500 animate-in zoom-in-50 duration-300" />
                        ) : (
                            <Wifi size={24} className="text-indigo-600" />
                        )}
                    </div>

                    <div className="flex flex-col flex-1">
                        <span className="text-sm font-black text-slate-800 leading-tight">
                            {isSyncing ? '데이터 동기화 중' :
                                lastSyncResult === 'success' ? '동기화 완료' :
                                    `대기 데이터: ${pendingCount}건`}
                        </span>
                        <p className="text-[10px] text-slate-400 font-bold tracking-tighter uppercase mt-0.5">
                            {isSyncing ? 'SYCHRONIZING WITH SERVER' :
                                lastSyncResult === 'success' ? 'LEDGER UPDATED SUCCESSFULLY' :
                                    'ONLINE & READY TO SYNC'}
                        </p>
                    </div>

                    {!isSyncing && pendingCount > 0 && (
                        <button
                            onClick={triggerSync}
                            className="w-10 h-10 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 flex items-center justify-center hover:bg-indigo-700 active:scale-90 transition-all"
                        >
                            <RefreshCw size={18} />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return null;
};

export default OfflineSyncMonitor;
