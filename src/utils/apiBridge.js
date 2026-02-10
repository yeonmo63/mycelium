import { invoke } from '@tauri-apps/api/core';

/**
 * Universal bridge to call backend commands either via Tauri invoke
 * or via HTTP fetch when running in a mobile/web browser.
 */
export async function callBridge(commandName, args = {}) {
    const isTauri = !!window.__TAURI__;

    if (isTauri) {
        return await invoke(commandName, args);
    } else {
        // Mapping Tauri command names to our Axum API routes
        const routeMap = {
            'get_dashboard_priority_stats': '/api/dashboard/priority-stats',
            'get_dashboard_secondary_stats': '/api/dashboard/secondary-stats',
            'get_weekly_sales_data': '/api/dashboard/weekly-sales',
            'get_top3_products_by_qty': '/api/dashboard/top-products',
            'get_top_profit_products': '/api/dashboard/top-profitable',
            'get_production_spaces': '/api/production/spaces',
            'get_production_batches': '/api/production/batches',
            'save_farming_log': '/api/farming/save-log',
            'save_harvest_record': '/api/production/save-harvest',
        };

        const route = routeMap[commandName];
        if (!route) {
            console.warn(`Bridge: No HTTP route defined for command "${commandName}". Falling back to mock/empty.`);
            return null;
        }

        const isPost = commandName.startsWith('save_');

        try {
            const response = await fetch(route, {
                method: isPost ? 'POST' : 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...(isPost ? { 'Content-Type': 'application/json' } : {})
                },
                ...(isPost ? { body: JSON.stringify(args) } : {})
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (err) {
            console.error(`Bridge: Failed to fetch ${route}:`, err);
            return null;
        }
    }
}
