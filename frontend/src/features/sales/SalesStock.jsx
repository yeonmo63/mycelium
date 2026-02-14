import React from 'react';
import { useModal } from '../../contexts/ModalContext';
import { useSalesStock } from './hooks/useSalesStock';
import InventoryQuickInfo from './components/stock/InventoryQuickInfo';
import StockTabs from './components/stock/StockTabs';
import StockTable from './components/stock/StockTable';
import AuditTrail from './components/stock/AuditTrail';
import StockAdjustModal from './components/modals/StockAdjustModal';
import HarvestEntryModal from './components/modals/HarvestEntryModal';
import BatchProductionModal from './components/modals/BatchProductionModal';
import BomManagementModal from './components/modals/BomManagementModal';

const SalesStock = () => {
    const { showAlert, showConfirm } = useModal();
    const {
        tab, setTab,
        products,
        searchQuery, setSearchQuery,
        logSearchQuery, setLogSearchQuery,
        hideAutoLogs, setHideAutoLogs,
        auxSubTab, setAuxSubTab,
        convertModal, setConvertModal,
        harvestModal, setHarvestModal,
        adjustModal, setAdjustModal,
        bomModal, setBomModal,
        loadData,
        getFreshnessInfo,
        filteredProducts,
        filteredLogs,
        openAdjustModal,
        handleAdjustStock,
        openHarvestModal,
        handleHarvest,
        openConvertModal,
        handleBatchConvert,
        openBomModal
    } = useSalesStock(showAlert, showConfirm);

    return (
        <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
            {/* Header */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1 shrink-0">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Inventory Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            재고/생산 관리 <span className="text-slate-300 font-light ml-1 text-xl">Stock & Production</span>
                        </h1>
                    </div>
                </div>
                <InventoryQuickInfo />
            </div>

            {/* Main Layout Grid */}
            <div className="flex-1 flex gap-5 px-6 lg:px-8 min-[2000px]:px-12 pb-6 lg:pb-8 min-[2000px]:pb-12 min-h-0">
                {/* LEFT: Current Stock Panel */}
                <div className="flex-1 flex flex-col bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden relative">
                    <StockTabs
                        tab={tab} setTab={setTab}
                        openHarvestModal={openHarvestModal}
                        openConvertModal={openConvertModal}
                        auxSubTab={auxSubTab} setAuxSubTab={setAuxSubTab}
                        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                    />
                    <StockTable
                        products={filteredProducts}
                        tab={tab}
                        getFreshnessInfo={getFreshnessInfo}
                        openAdjustModal={openAdjustModal}
                        openHarvestModal={openHarvestModal}
                        openConvertModal={openConvertModal}
                        openBomModal={openBomModal}
                    />
                </div>

                {/* RIGHT: Audit Trail */}
                <AuditTrail
                    logs={filteredLogs}
                    hideAutoLogs={hideAutoLogs} setHideAutoLogs={setHideAutoLogs}
                    logSearchQuery={logSearchQuery} setLogSearchQuery={setLogSearchQuery}
                    loadData={loadData}
                />
            </div>

            {/* Modals */}
            <StockAdjustModal
                isOpen={adjustModal.open}
                onClose={() => setAdjustModal(prev => ({ ...prev, open: false }))}
                product={adjustModal.product}
                val={adjustModal.val} setVal={v => setAdjustModal(prev => ({ ...prev, val: v }))}
                reason={adjustModal.reason} setReason={r => setAdjustModal(prev => ({ ...prev, reason: r }))}
                memo={adjustModal.memo} setMemo={m => setAdjustModal(prev => ({ ...prev, memo: m }))}
                handleAdjustStock={handleAdjustStock}
            />

            <HarvestEntryModal
                isOpen={harvestModal.open}
                onClose={() => setHarvestModal(prev => ({ ...prev, open: false }))}
                harvestModal={harvestModal} setHarvestModal={setHarvestModal}
                products={products}
                handleHarvest={handleHarvest}
            />

            <BatchProductionModal
                isOpen={convertModal.open}
                onClose={() => setConvertModal(prev => ({ ...prev, open: false }))}
                convertModal={convertModal} setConvertModal={setConvertModal}
                products={products}
                handleBatchConvert={handleBatchConvert}
            />

            <BomManagementModal
                isOpen={bomModal.open}
                onClose={() => setBomModal(prev => ({ ...prev, open: false }))}
                product={bomModal.product}
                allProducts={products}
            />
        </div>
    );
};

export default SalesStock;
