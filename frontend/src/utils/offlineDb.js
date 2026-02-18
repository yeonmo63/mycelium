import Dexie from 'dexie';

export const db = new Dexie('MyceliumOfflineDB');

// Define database schema
db.version(1).stores({
    offlineQueue: '++id, commandName, timestamp, status' // status: 'pending', 'syncing', 'failed'
});

/**
 * Add a command to the offline queue
 */
export async function addToOfflineQueue(commandName, args) {
    return await db.offlineQueue.add({
        commandName,
        args,
        timestamp: Date.now(),
        status: 'pending'
    });
}

/**
 * Get all pending items
 */
export async function getPendingSyncItems() {
    return await db.offlineQueue.where('status').equals('pending').toArray();
}

/**
 * Mark item as syncing
 */
export async function markAsSyncing(id) {
    return await db.offlineQueue.update(id, { status: 'syncing' });
}

/**
 * Mark item as failed
 */
export async function markAsFailed(id) {
    return await db.offlineQueue.update(id, { status: 'failed' });
}

/**
 * Remove successfully synced item
 */
export async function removeSyncedItem(id) {
    return await db.offlineQueue.delete(id);
}

/**
 * Check if there are pending items
 */
export async function hasPendingItems() {
    const count = await db.offlineQueue.where('status').equals('pending').count();
    return count > 0;
}
