#![allow(clippy::too_many_arguments, clippy::type_complexity)]
pub mod commands;
pub mod db;
pub mod error;

use commands::config::{get_db_url, update_db_ip_in_config, SetupState};

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

pub static IS_EXITING: AtomicBool = AtomicBool::new(false);
pub static DB_MODIFIED: AtomicBool = AtomicBool::new(false);
pub static BACKUP_CANCELLED: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.app_handle().clone();

            // Initialize SetupState as 'Initializing'
            app_handle.manage(SetupState {
                status: std::sync::Mutex::new(crate::commands::config::SetupStatus::Initializing),
            });

            // Spawn initialization in the background to prevent UI freeze
            tauri::async_runtime::spawn(async move {
                println!("System: Starting background initialization...");

                // 1. Try to update DB IP if needed
                println!("System: Checking DB IP connectivity...");
                let _ = update_db_ip_in_config(&app_handle).await;

                let mut final_status = crate::commands::config::SetupStatus::NotConfigured;

                // 2. Initialize Pool and Database
                match get_db_url(&app_handle) {
                    Ok(url) => {
                        println!("System: DB URL verified. Initializing connection pool...");
                        match crate::db::init_pool(&url).await {
                            Ok(pool) => {
                                println!("System: DB Pool successful. Starting schema sync...");
                                app_handle.manage(pool.clone());

                                // Run migrations in background - don't block app startup
                                let pool_clone = pool.clone();
                                tauri::async_runtime::spawn(async move {
                                    if let Err(e) = crate::db::init_database(&pool_clone).await {
                                        eprintln!("Warning: DB migration failed (non-fatal): {:?}", e);
                                    }
                                });
                                
                                // Always mark as Configured since pool is valid
                                println!("System: Database synchronization dispatched.");
                                final_status = crate::commands::config::SetupStatus::Configured;
                            }
                            Err(e) => {
                                eprintln!("System: Failed to initialize DB Pool (check credentials/network): {:?}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("System: Configuration error: {}", e);
                    }
                }

                // Update status when done
                println!(
                    "System: Initialization finished with status: {:?}",
                    match final_status {
                        crate::commands::config::SetupStatus::Configured => "Configured",
                        _ => "NotConfigured",
                    }
                );

                if let Some(state) = app_handle.try_state::<SetupState>() {
                    if let Ok(mut status) = state.status.lock() {
                        *status = final_status;
                    }
                }
            });

            // Force window size and center
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    window
                        .with_webview(|webview| {
                            #[cfg(target_os = "windows")]
                            unsafe {
                                use webview2_com::Microsoft::Web::WebView2::Win32::{
                                    ICoreWebView2Controller, ICoreWebView2Settings4,
                                };
                                use windows::core::Interface;

                                if let Ok(controller) =
                                    webview.controller().cast::<ICoreWebView2Controller>()
                                {
                                    if let Ok(core) = controller.CoreWebView2() {
                                        if let Ok(settings) = core.Settings() {
                                            if let Ok(settings4) =
                                                settings.cast::<ICoreWebView2Settings4>()
                                            {
                                                let _ =
                                                    settings4.SetIsGeneralAutofillEnabled(false);
                                                let _ =
                                                    settings4.SetIsPasswordAutosaveEnabled(false);
                                            }
                                        }
                                    }
                                }
                            }
                        })
                        .unwrap_or_default();
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_app::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if IS_EXITING.load(Ordering::Relaxed) {
                    // Allow close
                } else {
                    api.prevent_close();
                    let _ = window.emit("window_close_requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::config::check_setup_status,
            commands::config::setup_system,
            commands::utility::greet,
            commands::customer::search_customers_by_name,
            commands::customer::search_customers_by_mobile,
            commands::customer::get_customer,
            commands::customer::create_customer,
            commands::customer::update_customer,
            commands::customer::get_customer_logs,
            commands::customer::delete_customer,
            commands::customer::reactivate_customer,
            commands::customer::delete_customers_batch,
            commands::customer::reactivate_customers_batch,
            commands::customer::create_customer_address,
            commands::customer::update_customer_address,
            commands::customer::get_customer_addresses,
            commands::customer::delete_customer_address,
            commands::customer::set_default_customer_address,
            commands::dashboard::get_dashboard_stats,
            commands::dashboard::get_dashboard_priority_stats,
            commands::dashboard::get_dashboard_schedule_stats,
            commands::dashboard::get_dashboard_secondary_stats,
            commands::dashboard::get_business_report_data,
            commands::ledger::get_customer_ledger,
            commands::ledger::create_ledger_entry,
            commands::ledger::update_ledger_entry,
            commands::ledger::delete_ledger_entry,
            commands::ledger::get_customers_with_debt,
            commands::dashboard::get_recent_sales,
            commands::dashboard::get_weekly_sales_data,
            commands::dashboard::get_top3_products_by_qty,
            commands::dashboard::get_top_profit_products,
            commands::customer::search_customers_by_date,
            commands::customer::search_dormant_customers,
            commands::customer::check_duplicate_customer,
            commands::customer::search_best_customers,
            commands::customer::update_customer_membership_batch,
            commands::customer::get_sales_by_customer_id,
            commands::sales::create_sale,
            commands::product::get_product_list,
            commands::product::get_discontinued_product_names,
            commands::product::consolidate_products,
            commands::config::create_user,
            commands::config::update_user,
            commands::config::delete_user,
            commands::config::get_company_info,
            commands::config::save_company_info,
            commands::product::create_product,
            commands::product::update_product,
            commands::product::delete_product,
            commands::product::discontinue_product,
            commands::product::hard_delete_product,
            commands::product::get_product_price_history,
            commands::product::get_product_history,
            commands::event::get_last_event,
            commands::utility::debug_db_schema,
            commands::event::create_event,
            commands::event::search_events_by_name,
            commands::utility::init_db_schema,
            commands::product::update_product_stock,
            commands::product::adjust_product_stock,
            commands::product::convert_stock,
            commands::product::get_inventory_logs,
            commands::product::get_product_freshness,
            commands::product::get_inventory_forecast_alerts,
            commands::logistics::get_shipments_by_status,
            commands::sales::save_general_sales_batch,
            commands::sales::get_customer_sales_history,
            commands::sales::get_customer_sales_on_date,
            commands::event::update_event,
            commands::event::delete_event,
            commands::ai::get_ai_demand_forecast,
            commands::event::get_all_events,
            commands::config::verify_admin_password,
            commands::backup::confirm_exit,
            commands::backup::backup_database,
            commands::backup::restore_database,
            commands::backup::reset_database,
            commands::experience::get_experience_programs,
            commands::experience::create_experience_program,
            commands::experience::update_experience_program,
            commands::experience::delete_experience_program,
            commands::experience::get_experience_reservations,
            commands::experience::create_experience_reservation,
            commands::experience::update_experience_reservation,
            commands::experience::delete_experience_reservation,
            commands::experience::update_experience_payment_status,
            commands::experience::update_experience_status,
            commands::experience::get_experience_dashboard_stats,
            commands::finance::get_product_sales_stats,
            commands::dashboard::get_ten_year_sales_stats,
            commands::dashboard::get_monthly_sales_by_cohort,
            commands::finance::get_product_10yr_sales_stats,
            commands::finance::get_product_monthly_analysis,
            commands::schedule::get_schedules,
            commands::schedule::create_schedule,
            commands::schedule::update_schedule,
            commands::schedule::delete_schedule,
            commands::sales::save_special_sales_batch,
            commands::analysis::sales_polars_analysis_v4,
            commands::analysis::get_all_time_customer_analysis,
            commands::analysis::get_sales_by_region_analysis,
            commands::analysis::get_order_value_distribution,
            commands::analysis::get_sales_period_analysis,
            commands::finance::get_membership_sales_analysis,
            commands::crm::get_ltv_analysis,
            commands::crm::get_product_associations,
            commands::crm::get_churn_risk_customers,
            commands::config::get_gemini_api_key_for_ui,
            commands::config::save_gemini_api_key,
            commands::config::get_tax_config_for_ui,
            commands::config::save_tax_config,
            commands::production::get_production_spaces,
            commands::production::save_production_space,
            commands::production::delete_production_space,
            commands::production::get_production_batches,
            commands::production::save_production_batch,
            commands::production::get_farming_logs,
            commands::production::save_farming_log,
            commands::production::delete_farming_log,
            commands::production::get_harvest_records,
            commands::production::save_harvest_record,
            commands::production::delete_harvest_record,
            commands::production::save_harvest_batch,
            commands::production::delete_production_batch,
            commands::production::upload_farming_photo,
            commands::production::get_media_base64,
            commands::production::generate_production_pdf,
            commands::config::get_sms_config_for_ui,
            commands::config::save_sms_config,
            commands::config::get_naver_client_id_for_ui,
            commands::config::save_naver_keys,
            commands::utility::open_external_url,
            commands::ai::fetch_naver_search,
            commands::ai::get_ai_marketing_proposal,
            commands::ai::get_ai_detailed_plan,
            commands::customer::get_customer_ai_insight,
            commands::crm::get_rfm_analysis,
            commands::crm::update_customer_level,
            commands::utility::restart_app,
            commands::logistics::get_shipping_base_date,
            commands::backup::run_db_maintenance,
            commands::backup::cleanup_old_logs,
            commands::ai::get_ai_behavior_strategy,
            commands::ai::analyze_online_sentiment,
            commands::ai::get_morning_briefing,
            commands::ai::get_ai_repurchase_analysis,
            commands::ai::get_weather_marketing_advice,
            commands::ai::test_gemini_connection,
            commands::consultation::create_consultation,
            commands::consultation::get_consultations,
            commands::consultation::update_consultation,
            commands::consultation::delete_consultation,
            commands::ai::parse_business_card_ai,
            commands::utility::save_qr_image,
            commands::utility::generate_qr_code,
            commands::schedule::get_upcoming_anniversaries,
            commands::crm::get_claim_customer_count,
            commands::crm::get_claim_targets,
            commands::crm::get_special_care_customers,
            commands::ai::call_gemini_ai,
            commands::dashboard::get_daily_sales_stats_by_month,
            commands::crm::send_sms_simulation,
            commands::crm::get_repurchase_candidates,
            commands::finance::get_profit_margin_analysis,
            commands::ai::get_consultation_briefing,
            commands::ai::get_pending_consultations_summary,
            commands::consultation::get_top_pending_consultations,
            commands::ai::get_ai_consultation_advice,
            commands::finance::get_vendor_list,
            commands::finance::save_vendor,
            commands::finance::delete_vendor,
            commands::finance::get_purchase_list,
            commands::finance::save_purchase,
            commands::finance::delete_purchase,
            commands::finance::get_expense_list,
            commands::finance::save_expense,
            commands::finance::delete_expense,
            commands::finance::get_monthly_pl_report,
            commands::finance::get_cost_breakdown_stats,
            commands::finance::get_vendor_purchase_ranking,
            commands::backup::trigger_auto_backup,
            commands::backup::get_auto_backups,
            commands::backup::restore_database_sql,
            commands::backup::delete_backup,
            commands::backup::check_daily_backup,
            commands::config::save_external_backup_path,
            commands::config::get_external_backup_path,
            commands::config::login,
            commands::config::change_password,
            commands::config::get_all_users,
            commands::config::get_message_templates,
            commands::config::save_message_templates,
            commands::config::reset_message_templates,
            commands::backup::check_db_location,
            commands::backup::get_backup_status,
            commands::backup::cancel_backup_restore,
            commands::backup::run_daily_custom_backup,
            commands::backup::get_internal_backup_path,
            commands::sales::get_daily_sales,
            commands::sales::search_sales_by_any,
            commands::sales::update_sale_status,
            commands::sales::cancel_sale,
            commands::sales::get_sales_by_event_id_and_date_range,
            commands::sales::get_daily_receipts,
            commands::sales::delete_sale,
            commands::sales::update_sale,
            commands::sales::complete_shipment,
            commands::sales::get_sales_claims,
            commands::sales::create_sales_claim,
            commands::sales::process_sales_claim,
            commands::sales::delete_sales_claim,
            commands::sales::update_sales_claim,
            commands::sales::get_sale_detail,
            commands::product::get_product_bom,
            commands::product::save_product_bom,
            commands::product::convert_stock_bom,
            commands::product::batch_convert_stock,
            commands::config::refresh_database_ip,
            commands::config::get_mall_config_for_ui,
            commands::config::save_mall_keys,
            commands::sales::fetch_external_mall_orders,
            commands::config::save_courier_config,
            commands::config::get_courier_config_for_ui,
            commands::sales::get_tax_report,
            crate::commands::preset::apply_preset,
            crate::commands::preset::get_preset_data,
            crate::commands::preset::save_current_as_preset,
            crate::commands::preset::get_custom_presets,
            crate::commands::preset::delete_custom_preset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
