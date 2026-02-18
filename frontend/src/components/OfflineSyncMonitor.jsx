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
            <div className="fixed bottom-4 left-4 z-[100] animate-in slide-in-from-bottom duration-300">
                <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700">
                    <WifiOff size={18} className="text-orange-500" />
                    <div className="flex flex-col">
                        <span className="text-xs font-black tracking-tight">오프라인 모드</span>
                        <span className="text-[10px] text-slate-400 font-medium">데이터는 로컬에 안전하게 보관됩니다.</span>
                    </div>
                </div>
            </div>
        );
    }

    if (pendingCount > 0 || isSyncing || lastSyncResult) {
        return (
            <div className="fixed bottom-4 left-4 z-[100] animate-in slide-in-from-bottom duration-300">
                <div className="bg-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-100 min-w-[200px]">
                    {isSyncing ? (
                        <RefreshCw size={20} className="text-indigo-600 animate-spin" />
                    ) : lastSyncResult === 'success' ? (
                        <CheckCircle size={20} className="text-emerald-500" />
                    ) : (
                        <Wifi size={20} className="text-indigo-600" />
                    )}

                    <div className="flex flex-col flex-1">
                        <span className="text-xs font-black text-slate-800">
                            {isSyncing ? '데이터 동기화 중...' :
                                lastSyncResult === 'success' ? '동기화 완료' :
                                    `대기 중인 데이터 (${pendingCount})`}
                        </span>
                        <p className="text-[10px] text-slate-400 font-bold">
                            {isSyncing ? '서버로 전송하고 있습니다.' :
                                lastSyncResult === 'success' ? '모든 기록이 저장되었습니다.' :
                                    '온라인 상태입니다.'}
                        </p>
                    </div>

                    {!isSyncing && pendingCount > 0 && (
                        <button
                            onClick={triggerSync}
                            className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return null;
};

export default OfflineSyncMonitor;
