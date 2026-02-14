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
            'get_all_users': '/api/auth/users',
            'create_user': '/api/auth/users/create',
            'update_user': '/api/auth/users/update',
            'delete_user': '/api/auth/users/delete',
            'verify_admin_password': '/api/auth/verify-admin',
            'get_company_info': '/api/auth/company',
            'save_company_info': '/api/auth/company/save',
            'get_auth_status': '/api/auth/status',
            'verify_mobile_pin': '/api/auth/verify',
            'get_all_events': '/api/event/all',
            'get_product_list': '/api/product/list',
            'get_product_history': '/api/product/history',
            'get_product_bom': '/api/product/bom',
            'save_product_bom': '/api/product/bom/save',
            'create_product': '/api/product/create',
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
            'cancel_backup_restore': '/api/backup/cancel',
            'get_custom_presets': '/api/preset/list',
            'apply_preset': '/api/preset/apply',
            'save_current_as_preset': '/api/preset/save',
            'delete_custom_preset': '/api/preset/delete',
            'get_preset_data': '/api/preset/data',
            'reset_database': '/api/preset/reset',
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
            'get_daily_sales_stats_by_month',
            'create_user',
            'update_user',
            'delete_user',
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
            'create_experience_program',
            'update_experience_program',
            'delete_experience_program',
            'save_sensor',
            'save_sensor',
            'delete_sensor',
            'reset_message_templates',
            'run_daily_custom_backup',
            'restore_database',
            'run_db_maintenance',
            'cleanup_old_logs',
            'save_external_backup_path',
            'cancel_backup_restore'
        ];
        const isPost = postCommands.includes(commandName) || commandName.startsWith('save_');

        try {
            let url = route;
            if (isPost) {
                // No change
            } else {
                const params = new URLSearchParams({ ...args, _t: Date.now() });
                url = `${route}?${params.toString()}`;
            }

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
