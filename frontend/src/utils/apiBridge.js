import { addToOfflineQueue } from './offlineDb';

/**
 * Universal bridge to call backend commands either via Tauri invoke
 * or via HTTP fetch when running in a mobile/web browser.
 */
export async function callBridge(commandName, args = {}) {
    // ... rest of the mappings ...
    const routeMap = {
        // [Existing routes...]
        'get_dashboard_stats': '/api/dashboard/stats',
        'get_dashboard_priority_stats': '/api/dashboard/priority-stats',
        'get_dashboard_secondary_stats': '/api/dashboard/secondary-stats',
        'get_sms_logs': '/api/crm/sms/logs',
        'get_dashboard_schedule_stats': '/api/dashboard/schedule-stats',
        'get_weekly_sales_data': '/api/dashboard/weekly-sales',
        'get_recent_sales': '/api/dashboard/recent-sales',
        'get_top3_products_by_qty': '/api/dashboard/top-qty',
        'get_top_profit_products': '/api/dashboard/top-profitable',
        'get_business_report_data': '/api/dashboard/report',
        'get_ten_year_sales_stats': '/api/dashboard/ten-year-stats',
        'get_monthly_sales_by_cohort': '/api/dashboard/cohort-stats',
        'get_daily_sales_stats_by_month': '/api/dashboard/daily-stats',
        'upload_media': '/api/production/media/upload',
        'get_production_summary': '/api/production/summary',
        'get_production_spaces': '/api/production/spaces',
        'save_production_space': '/api/production/spaces/save',
        'delete_production_space': '/api/production/spaces/delete',
        'get_production_batches': '/api/production/batches',
        'save_production_batch': '/api/production/batches/save',
        'get_production_logs': '/api/production/logs',
        'get_production_harvests': '/api/production/harvest',
        'save_farming_log': '/api/production/logs/save',
        'save_harvest_record': '/api/production/harvest/save',
        'get_customers': '/api/customer/list',
        'search_customers': '/api/customers/search',
        'create_customer': '/api/customer/create',
        'create_product': '/api/product/create',
        'create_sale': '/api/sales/create',
        'fetch_external_orders': '/api/sales/external/fetch',
        'get_all_users': '/api/auth/users',
        'create_user': '/api/auth/users/create',
        'update_user': '/api/auth/users/update',
        'delete_user': '/api/auth/users/delete',
        'verify_admin_password': '/api/auth/verify-admin',
        'get_company_info': '/api/auth/company',
        'save_company_info': '/api/auth/company/save',
        'get_auth_status': '/api/auth/status',
        'check_auth': '/api/auth/check',
        'verify_mobile_pin': '/api/auth/verify',
        'get_update_status': '/api/system/check-update',
        'get_all_events': '/api/event/list',
        'create_event': '/api/event/create',
        'update_event': '/api/event/update',
        'delete_event': '/api/event/delete',
        'get_ledger_debtors': '/api/sales/ledger/debtors',
        'get_ledger': '/api/sales/ledger',
        'create_ledger_entry': '/api/sales/ledger/create',
        'update_ledger_entry': '/api/sales/ledger/update',
        'delete_ledger_entry': '/api/sales/ledger/delete',
        'system_setup': '/api/setup/system',
        'get_vendors': '/api/finance/vendors',
        'save_vendor': '/api/finance/vendors/save',
        'delete_vendor': '/api/finance/vendors/delete',
        'get_tax_report': '/api/finance/tax/report',
        'submit_tax_report': '/api/finance/tax/submit',
        'get_expenses': '/api/finance/expenses',
        'save_expense': '/api/finance/expenses/save',
        'delete_expense': '/api/finance/expenses/delete',
        'get_purchases': '/api/finance/purchases',
        'save_purchase': '/api/finance/purchases/save',
        'delete_purchase': '/api/finance/purchases/delete',
        'get_finance_analysis': '/api/finance/analysis',
        'get_monthly_pl': '/api/finance/analysis/monthly-pl',
        'get_cost_breakdown': '/api/finance/analysis/cost-breakdown',
        'get_vendor_ranking': '/api/finance/analysis/vendor-ranking',
        'get_product_list': '/api/product/list',
        'get_product_history': '/api/product/history',
        'get_product_bom': '/api/product/bom',
        'save_product_bom': '/api/product/bom/save',
        'update_product': '/api/product/update',
        'delete_product': '/api/product/delete',
        'discontinue_product': '/api/product/discontinue',
        'apply_preset': '/api/preset/apply',
        'get_preset_data': '/api/preset/data',
        'save_current_as_preset': '/api/preset/save-current',
        'get_custom_presets': '/api/preset/custom-list',
        'delete_custom_preset': '/api/preset/delete-custom',
        'reset_database': '/api/maintenance/reset-db',
        'get_experience_programs': '/api/experience/programs',
        'create_experience_program': '/api/experience/programs/create',
        'update_experience_program': '/api/experience/programs/update',
        'delete_experience_program': '/api/experience/programs/delete',
        'get_all_integrations_config': '/api/settings/integrations',
        'save_gemini_api_key': '/api/settings/integrations/gemini',
        'save_sms_config': '/api/settings/integrations/sms',
        'save_naver_keys': '/api/settings/integrations/naver',
        'save_mall_keys': '/api/settings/integrations/mall',
        'save_courier_config': '/api/settings/integrations/courier',
        'save_tax_filing_config': '/api/settings/integrations/tax',
        'save_tax_filing_config': '/api/settings/integrations/tax',
        'get_sensors': '/api/iot/sensors',
        'save_sensor': '/api/iot/sensors/save',
        'delete_sensor': '/api/iot/sensors/delete',
        'get_latest_readings': '/api/iot/latest',
        'push_sensor_data': '/api/iot/push',
        'get_upcoming_anniversaries': '/api/schedule/anniversary',
        'get_repurchase_candidates': '/api/crm/repurchase',
        'get_inventory_forecast_alerts': '/api/product/forecast-alerts',
        'get_product_freshness': '/api/product/freshness',
        'get_product_logs': '/api/product/logs',
        'adjust_product_stock': '/api/product/stock/adjust',
        'convert_product_stock': '/api/product/stock/convert',
        'get_weather_marketing_advice': '/api/ai/weather-advice',
        'get_message_templates': '/api/settings/templates',
        'save_message_templates': '/api/settings/templates/save',
        'reset_message_templates': '/api/settings/templates/reset',
        'get_mobile_config': '/api/mobile/config',
        'save_mobile_config': '/api/mobile/config/save',
        'get_local_ip_command': '/api/mobile/local-ip',
        'save_general_sales_batch': '/api/sales/batch-save',
        'get_auto_backups': '/api/backup/auto',
        'run_daily_custom_backup': '/api/backup/run',
        'restore_database': '/api/backup/restore',
        'run_db_maintenance': '/api/backup/maintenance',
        'cleanup_old_logs': '/api/backup/cleanup',
        'get_internal_backup_path': '/api/backup/path/internal',
        'get_external_backup_path': '/api/backup/path/external',
        'save_external_backup_path': '/api/backup/path/external',
        'get_backup_status': '/api/backup/status',
        'get_backup_progress': '/api/backup/progress',
        'cancel_backup_restore': '/api/backup/cancel',
        'cleanup_old_backups': '/api/backup/cleanup-files',
        'get_custom_presets': '/api/preset/list',
        'apply_preset': '/api/preset/apply',
        'save_current_as_preset': '/api/preset/save',
        'delete_custom_preset': '/api/preset/delete',
        'get_preset_data': '/api/preset/data',
        'reset_database': '/api/preset/reset',
        'save_general_sales_batch': '/api/sales/batch-save',
        'search_customers_by_name': '/api/customer/search/name',
        'search_customers_by_mobile': '/api/customer/search/mobile',
        'get_customer_addresses': '/api/customers/addresses',
        'get_customer_sales_on_date': '/api/sales/query/date',
        'create_customer': '/api/customer/create',
        'get_shipments_by_status': '/api/sales/shipments',
        'update_sale_status': '/api/sales/update-status',
        'complete_shipment': '/api/sales/complete-shipment',
        'batch_sync_courier_statuses': '/api/sales/sync-courier',
        'get_sales_claims': '/api/sales/claims',
        'create_sales_claim': '/api/sales/claims/create',
        'process_sales_claim': '/api/sales/claims/process',
        'update_sales_claim': '/api/sales/claims/update',
        'delete_sales_claim': '/api/sales/claims/delete',
        'get_sale_detail': '/api/sales/detail',
        'search_sales_by_any': '/api/sales/search',
        'search_sales_all': '/api/sales/search-all',
        'create_consultation': '/api/crm/consultations/create',
        'search_events_by_name': '/api/event/list',
        'get_sales_by_event_id_and_date_range': '/api/sales/special/list',
        'save_special_sales_batch': '/api/sales/special/batch',
        'get_daily_receipts': '/api/sales/daily',
        'delete_sale': '/api/sales/delete',
        'call_gemini_ai': '/api/ai/gemini',
        'get_ai_demand_forecast': '/api/ai/forecast',
        'get_customer': '/api/customer/get',
        'get_product_sales_stats': '/api/finance/analysis/product-stats',
        'get_product_monthly_analysis': '/api/finance/analysis/product-monthly',
        'get_product_10yr_sales_stats': '/api/finance/analysis/product-trend',
        'get_sales_by_region_analysis': '/api/finance/analysis/region-stats',
        'get_profit_margin_analysis': '/api/finance/analysis/profit-margin',
        'get_rfm_analysis': '/api/crm/rfm-analysis',
        'get_membership_sales_analysis': '/api/finance/membership-sales',
        'update_customer_level': '/api/crm/update-level',
        'get_ai_behavior_strategy': '/api/ai/behavior',
        'get_ai_repurchase_analysis': '/api/ai/repurchase',
        'update_customer_memo_batch': '/api/crm/update-memo-batch',
        'get_product_associations': '/api/crm/product-associations',
        'get_ai_marketing_proposal': '/api/ai/marketing-proposal',
        'get_ai_detailed_plan': '/api/ai/detailed-plan',
        'fetch_naver_search': '/api/ai/naver-search',
        'analyze_online_sentiment': '/api/ai/online-sentiment',
        'get_claim_targets': '/api/crm/claim-targets',
        'send_sms_simulation': '/api/crm/sms/send',
        'create_experience_reservation': '/api/experience/reservations/create',
        'get_experience_reservations': '/api/experience/reservations',
        'update_experience_reservation': '/api/experience/reservations/update',
        'delete_experience_reservation': '/api/experience/reservations/delete',
        'update_experience_status': '/api/experience/reservations/status',
        'update_experience_payment_status': '/api/experience/reservations/payment',
        'get_schedules': '/api/schedule/list',
        'create_schedule': '/api/schedule/create',
        'update_schedule': '/api/schedule/update',
        'delete_schedule': '/api/schedule/delete',
        'delete_harvest_record': '/api/production/harvest/delete',
        'delete_production_batch': '/api/production/batches/delete',
        'delete_production_space': '/api/production/spaces/delete',
        'delete_farming_log': '/api/production/logs/delete',
        'get_customer_addresses': '/api/customer/addresses',
        'get_customer_logs': '/api/customer/logs',
        'update_customer': '/api/customer/update',
        'delete_customer': '/api/customer/delete',
        'reactivate_customer': '/api/customer/reactivate',
        'get_customer_ai_insight': '/api/customer/ai-insight',
        'create_customer_address': '/api/customer/address/create',
        'update_customer_address': '/api/customer/address/update',
        'delete_customer_address': '/api/customer/address/delete',
        'set_default_address': '/api/customer/address/set-default',
        'get_customer_sales': '/api/customer/sales',
        'search_customer_batch': '/api/customer/batch/search',
        'search_dormant_customers': '/api/customer/batch/dormant',
        'delete_customers_batch': '/api/customer/batch/delete',
        'reactivate_customers_batch': '/api/customer/batch/reactivate',
        'get_best_customers': '/api/customer/best',
        'update_customer_membership_batch': '/api/customer/batch/membership',
        'get_consultations': '/api/crm/consultations',
        'update_consultation': '/api/crm/consultations/update',
        'delete_consultation': '/api/crm/consultations/delete',
        'get_special_care': '/api/crm/special-care',
        'get_ai_briefing': '/api/crm/ai/briefing',
        'get_ai_summary': '/api/crm/ai/summary',
        'get_ai_advisor': '/api/crm/ai/advisor',
        'parse_business_card': '/api/ai/business-card',
        'login': '/api/auth/login',
        'get_auth_sessions': '/api/auth/sessions',
        'revoke_auth_session': '/api/auth/sessions/revoke',
        'get_security_status': '/api/auth/security-status',
        'get_audit_logs': '/api/auth/audit-logs',
        'get_auto_backups': '/api/backup/auto',
        'run_daily_custom_backup': '/api/backup/run',
        'restore_database': '/api/backup/restore',
        'get_backup_status': '/api/backup/status',
        'get_backup_path_internal': '/api/backup/path/internal',
        'get_backup_path_external': '/api/backup/path/external',
        'save_external_backup_path': '/api/backup/path/external',
        'run_db_maintenance': '/api/backup/maintenance',
        'cleanup_old_logs': '/api/backup/cleanup',
        'cleanup_old_backups': '/api/backup/cleanup-files',
        'cancel_backup_restore': '/api/backup/cancel',
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
        'get_daily_sales_stats_by_month',
        'save_production_space',
        'delete_production_space',
        'save_production_batch',
        'create_customer',
        'create_product',
        'create_sale',
        'delete_sale',
        'create_user',
        'update_user',
        'delete_user',
        'adjust_product_stock',
        'convert_product_stock',
        'verify_admin_password',
        'save_company_info',
        'create_product',
        'update_product',
        'delete_product',
        'discontinue_product',
        'apply_preset',
        'save_current_as_preset',
        'delete_custom_preset',
        'reset_database',
        'create_experience_program',
        'update_experience_program',
        'delete_experience_program',
        'create_experience_reservation',
        'update_experience_reservation',
        'delete_experience_reservation',
        'update_experience_status',
        'update_experience_payment_status',
        'create_schedule',
        'update_schedule',
        'delete_schedule',
        'delete_harvest_record',
        'delete_production_batch',
        'delete_production_space',
        'delete_farming_log',
        'save_sensor',
        'save_sensor',
        'delete_sensor',
        'reset_message_templates',
        'run_daily_custom_backup',
        'restore_database',
        'run_db_maintenance',
        'cleanup_old_logs',
        'save_external_backup_path',
        'cancel_backup_restore',
        'cleanup_old_backups',
        'update_sale_status',
        'complete_shipment',
        'batch_sync_courier_statuses',
        'create_sales_claim',
        'process_sales_claim',
        'update_sales_claim',
        'delete_sales_claim',
        'create_consultation',
        'call_gemini_ai',
        'get_ai_demand_forecast',
        'update_customer_level',
        'update_customer_memo_batch',
        'get_ai_marketing_proposal',
        'get_ai_detailed_plan',
        'fetch_naver_search',
        'analyze_online_sentiment',
        'send_sms_simulation',
        'push_sensor_data',
        'login',
        'verify_mobile_pin',
        'create_event',
        'update_event',
        'delete_event',
        'create_ledger_entry',
        'update_ledger_entry',
        'delete_ledger_entry',
        'system_setup',
        'save_vendor',
        'delete_vendor',
        'upload_media',
        'logout',
        'submit_tax_report',
        'save_expense',
        'delete_expense',
        'save_purchase',
        'delete_purchase',
        'update_customer',
        'delete_customer',
        'reactivate_customer',
        'create_customer_address',
        'update_customer_address',
        'delete_customer_address',
        'set_default_address',
        'delete_customers_batch',
        'reactivate_customers_batch',
        'update_customer_membership_batch',
        'update_consultation',
        'get_ai_advisor',
        'parse_business_card',
        'revoke_auth_session'
    ];
    const isPost = postCommands.includes(commandName) || commandName.startsWith('save_');

    try {
        let baseUrl = localStorage.getItem('API_BASE_URL') || '';
        // Ensure baseUrl doesn't end with slash if present
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        let url = baseUrl + route;

        if (isPost) {
            // No change to url
        } else {
            // Filter out null/undefined to prevent them from being sent as "null" or "undefined" strings
            const filteredArgs = {};
            for (const key in args) {
                if (args[key] !== null && args[key] !== undefined) {
                    filteredArgs[key] = args[key];
                }
            }
            const params = new URLSearchParams({ ...filteredArgs, _t: Date.now() });
            url = `${url}?${params.toString()}`;
        }

        const token = localStorage.getItem('token');
        const isFormData = args instanceof FormData;

        const headers = {
            'Accept': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        };

        if (isPost && !isFormData) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            method: isPost ? 'POST' : 'GET',
            headers: headers,
            ...(isPost ? { body: isFormData ? args : JSON.stringify(args) } : {})
        });

        let result = null;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        }

        if (!response.ok) {
            if (result && result.error) {
                throw new Error(result.error);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // The backend now always returns { success, data?, error? }
        if (result && typeof result === 'object') {
            if (result.success === false) {
                throw new Error(result.error || "Unknown server error");
            }

            // For backward compatibility and ease of use in existing components:
            // If data is an array/object, merge success: true into it or return it directly
            if ('data' in result) {
                if (result.data === null || result.data === undefined) {
                    return { success: true };
                }
                if (Array.isArray(result.data)) {
                    const arr = result.data;
                    arr.success = true;
                    return arr;
                }
                if (typeof result.data === 'object') {
                    const obj = result.data;
                    if (obj.success === undefined) obj.success = true;
                    return obj;
                }
                return result.data; // Primitives
            }
            return result;
        }

        // Fallback for unexpected non-object responses
        return { success: response.ok };
    } catch (err) {
        console.error(`Bridge: Failed to fetch ${route}:`, err);

        // --- Offline Support ---
        // If it's a POST/Save command and it's a network error (no response), 
        // we add it to the offline queue instead of failing.
        // DO NOT queue 'login' or other critical auth commands that need immediate validation
        const noOfflineQueueCommands = ['login', 'verify_mobile_pin', 'verify_admin_password'];
        const isNetworkError = err instanceof TypeError || err.message.includes('fetch');
        if (isPost && isNetworkError && !noOfflineQueueCommands.includes(commandName)) {
            console.log(`Bridge: Offline detected. Queuing command "${commandName}" for later sync.`);
            try {
                await addToOfflineQueue(commandName, args);
                // Return a special result so the UI knows it was queued
                return { success: true, offline: true, message: '오프라인 모드: 연결 시 자동 저장됩니다.' };
            } catch (dbErr) {
                console.error("Bridge: Failed to add to offline queue:", dbErr);
            }
        }

        throw err; // Rethrow so the caller component can handle it
    }
}

export const invoke = callBridge;
