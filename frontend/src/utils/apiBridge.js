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
            'get_dashboard_stats': '/api/dashboard/stats',
            'get_dashboard_priority_stats': '/api/dashboard/priority-stats',
            'get_dashboard_secondary_stats': '/api/dashboard/secondary-stats',
            'get_dashboard_schedule_stats': '/api/dashboard/schedule-stats',
            'get_weekly_sales_data': '/api/dashboard/weekly-sales',
            'get_recent_sales': '/api/dashboard/recent-sales',
            'get_top3_products_by_qty': '/api/dashboard/top-qty',
            'get_top_profit_products': '/api/dashboard/top-profitable',
            'get_business_report_data': '/api/dashboard/report',
            'get_ten_year_sales_stats': '/api/dashboard/ten-year-stats',
            'get_monthly_sales_by_cohort': '/api/dashboard/cohort-stats',
            'get_daily_sales_stats_by_month': '/api/dashboard/daily-stats',
            'get_production_spaces': '/api/production/spaces',
            'get_production_batches': '/api/production/batches',
            'save_farming_log': '/api/farming/save-log',
            'save_harvest_record': '/api/production/save-harvest',
            'get_auth_status': '/api/auth/status',
            'verify_mobile_pin': '/api/auth/verify',
            'get_all_events': '/api/event/all',
            'get_product_list': '/api/product/list',
            'save_general_sales_batch': '/api/sales/batch-save',
        };

        const route = routeMap[commandName];
        if (!route) {
            console.warn(`Bridge: No HTTP route defined for command "${commandName}". Falling back to mock/empty.`);
            return null;
        }

        const postCommands = [
            'save_farming_log',
            'save_harvest_record',
            'save_general_sales_batch',
            'get_business_report_data',
            'get_monthly_sales_by_cohort',
            'get_daily_sales_stats_by_month'
        ];
        const isPost = postCommands.includes(commandName) || commandName.startsWith('save_');

        try {
            const url = isPost ? route : `${route}?_t=${Date.now()}`;
            const response = await fetch(url, {
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

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.warn(`Bridge: Received non-json response from ${route}. ${contentType}`, text.substring(0, 50));
                return null;
            }

            return await response.json();
        } catch (err) {
            console.error(`Bridge: Failed to fetch ${route}:`, err);
            return null;
        }
    }
}
