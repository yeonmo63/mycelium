import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useModal } from '../../contexts/ModalContext';
import { formatPhoneNumber } from '../../utils/common';
import { useSalesReception } from './hooks/useSalesReception';

import ReceptionHeader from './components/reception/ReceptionHeader';
import CustomerInfoBar from './components/reception/CustomerInfoBar';
import SalesInputPanel from './components/reception/SalesInputPanel';
import SalesRowsTable from './components/reception/SalesRowsTable';
import ReceptionFooter from './components/reception/ReceptionFooter';
import CustomerSelectionModal from './components/reception/CustomerSelectionModal';
import QuickRegisterModal from './components/reception/QuickRegisterModal';
import AddressLayer from './components/reception/AddressLayer';
import TransactionStatementView from './components/reception/TransactionStatementView';

const SalesReception = () => {
    const { showAlert, showConfirm } = useModal();
    const {
        orderDate, setOrderDate,
        customer, setCustomer,
        addresses,
        products,
        salesRows,
        editingTempId,
        isProcessing,
        isDirty,
        inputState, setInputState,
        loadProducts, loadCompanyInfo, loadSalesHistory,
        selectCustomer,
        handleInputChange,
        handleAddRow,
        handleEditRow,
        handleDeleteRow,
        handleSaveAll,
        handleReset,
        handlePrintStatement,
        closeStatement,
        showStatement,
        handleCsvUpload,
        companyInfo,
        summary,
        isDraftRestored,
        tempDraft,
        handleRestoreDraft,
        handleDiscardDraft
    } = useSalesReception(showAlert, showConfirm);

    // Refs
    const custSearchRef = useRef(null);
    const prodSelectRef = useRef(null);
    const fileInputRef = useRef(null);

    // Local UI Modals State
    const [showSelectionModal, setShowSelectionModal] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showAddrLayer, setShowAddrLayer] = useState(false);
    const [quickRegisterName, setQuickRegisterName] = useState('');

    useEffect(() => {
        loadProducts();
        loadCompanyInfo();
    }, [loadProducts, loadCompanyInfo]);

    const initialLoadRef = useRef(true);
    useEffect(() => {
        if (!customer && custSearchRef.current) {
            custSearchRef.current.value = '';
        }
        if (isDraftRestored && initialLoadRef.current) {
            initialLoadRef.current = false;
            if (customer && custSearchRef.current) custSearchRef.current.value = customer.customer_name;
            return;
        }
        if (customer && orderDate) {
            loadSalesHistory(customer.customer_id, orderDate);
        }
    }, [customer, orderDate, loadSalesHistory, isDraftRestored]);

    const handleSearchCustomer = async () => {
        const query = custSearchRef.current?.value.trim();
        if (!query) return showAlert('알림', '조회할 고객명을 입력해주세요.');

        try {
            const results = await window.__TAURI__.core.invoke('search_customers_by_name', { name: query });
            if (!results || results.length === 0) {
                if (await showConfirm('신규 고객', '검색 결과가 없습니다. 새로운 고객으로 등록하시겠습니까?')) {
                    setQuickRegisterName(query);
                    setShowRegisterModal(true);
                }
                return;
            }
            if (results.length === 1) selectCustomer(results[0]);
            else { setSearchResults(results); setShowSelectionModal(true); }
        } catch (e) { showAlert('오류', '고객 검색 중 오류가 발생했습니다.'); }
    };

    const handleQuickRegister = async (data) => {
        try {
            await window.__TAURI__.core.invoke('create_customer', {
                ...data,
                joinDate: new Date().toISOString().split('T')[0],
                mobile: formatPhoneNumber(data.mobile),
                phone: formatPhoneNumber(data.phone)
            });
            const results = await window.__TAURI__.core.invoke('search_customers_by_name', { name: data.name });
            const created = results.find(r => r.mobile_number === data.mobile) || results[0];
            if (created) {
                selectCustomer(created);
                setShowRegisterModal(false);
                showAlert('성공', '신규 고객이 등록되었습니다.');
            }
        } catch (e) { showAlert('오류', `고객 등록 실패: ${e}`); }
    };

    const handleAddressSearch = (target = 'input') => {
        if (!window.daum || !window.daum.Postcode) return showAlert('오류', '주소 검색 서비스를 불러올 수 없습니다.');
        setShowAddrLayer(true);
        setTimeout(() => {
            new window.daum.Postcode({
                oncomplete: (data) => {
                    let fullAddr = data.address;
                    if (data.addressType === 'R') {
                        let extra = (data.bname !== '' ? data.bname : '') + (data.buildingName !== '' ? (data.bname !== '' ? `, ${data.buildingName}` : data.buildingName) : '');
                        fullAddr += extra !== '' ? ` (${extra})` : '';
                    }
                    if (target === 'input') setInputState(prev => ({ ...prev, shipZip: data.zonecode, shipAddr1: fullAddr }));
                    else {
                        if (target.zipId) document.getElementById(target.zipId).value = data.zonecode;
                        if (target.addr1Id) document.getElementById(target.addr1Id).value = fullAddr;
                    }
                    setShowAddrLayer(false);
                }, width: '100%', height: '100%'
            }).embed(document.getElementById('addr-layer-container'));
        }, 100);
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <ReceptionHeader fileInputRef={fileInputRef} onCsvUpload={handleCsvUpload} />
                <CustomerInfoBar
                    orderDate={orderDate} setOrderDate={setOrderDate}
                    custSearchRef={custSearchRef} handleSearchCustomer={handleSearchCustomer}
                    customer={customer}
                />
                {isDraftRestored && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center justify-between animate-in slide-in-from-top-2">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-rounded text-amber-500 text-sm">history_edu</span>
                            <span className="text-[11px] font-bold text-amber-700">이전 작업 내용이 복구되었습니다.</span>
                        </div>
                        <button onClick={handleReset} className="text-[10px] font-black text-amber-600 hover:text-amber-800 underline">새로 작성하기</button>
                    </div>
                )}
            </div>

            <div className={`px-6 lg:px-8 min-[2000px]:px-12 mt-1 flex flex-col gap-3 overflow-hidden flex-1 pb-6 lg:pb-8 min-[2000px]:pb-12 ${!customer ? 'pointer-events-none opacity-50' : ''}`}>
                <SalesInputPanel
                    inputState={inputState} handleInputChange={handleInputChange}
                    products={products} addresses={addresses} prodSelectRef={prodSelectRef}
                    handleAddressSearch={handleAddressSearch} handleAddRow={handleAddRow}
                    editingTempId={editingTempId}
                />
                <SalesRowsTable
                    salesRows={salesRows} editingTempId={editingTempId}
                    handleEditRow={handleEditRow} handleDeleteRow={handleDeleteRow}
                />
                <ReceptionFooter
                    summary={summary} handleReset={handleReset}
                    handlePrintStatement={handlePrintStatement} handleSaveAll={handleSaveAll}
                    isProcessing={isProcessing} customer={customer} salesRows={salesRows}
                />
            </div>

            <CustomerSelectionModal
                isOpen={showSelectionModal} onClose={() => setShowSelectionModal(false)}
                searchResults={searchResults} selectCustomer={selectCustomer}
                setQuickRegisterName={setQuickRegisterName} setShowRegisterModal={setShowRegisterModal}
                custSearchRef={custSearchRef}
            />

            <QuickRegisterModal
                isOpen={showRegisterModal} onClose={() => setShowRegisterModal(false)}
                quickRegisterName={quickRegisterName} fileInputRef={fileInputRef}
                handleQuickRegister={handleQuickRegister} handleAddressSearch={handleAddressSearch}
            />

            <AddressLayer isOpen={showAddrLayer} onClose={() => setShowAddrLayer(false)} />

            <TransactionStatementView
                isOpen={showStatement}
                onClose={closeStatement}
                customer={customer}
                salesRows={salesRows}
                companyInfo={companyInfo}
                orderDate={orderDate}
                summary={summary}
            />

            {/* Draft Recovery Modal */}
            {tempDraft && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-6">
                            <span className="material-symbols-rounded text-3xl">restore_page</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 mb-2">저장되지 않은 데이터가 있습니다</h3>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8">
                            마지막 실시간 저장된 데이터를 복구하시겠습니까?<br />
                            (고객: {tempDraft.customer?.customer_name || '미필터'}, 항목: {tempDraft.salesRows?.length || 0}건)
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleDiscardDraft}
                                className="flex-1 h-12 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm hover:bg-slate-200 transition-all"
                            >
                                무시하고 새로 작성
                            </button>
                            <button
                                onClick={handleRestoreDraft}
                                className="flex-1 h-12 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 shadow-lg shadow-indigo-200 transition-all"
                            >
                                데이터 복구하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesReception;
