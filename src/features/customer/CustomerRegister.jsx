import React, { useState, useEffect, useRef } from 'react';
import { formatPhoneNumber } from '../../utils/common';
import { useModal } from '../../contexts/ModalContext';

/**
 * CustomerRegister.jsx
 * "고객 등록" - 프리미엄 UI 및 향상된 CRM 기능
 */
const CustomerRegister = () => {
    const { showAlert, showConfirm } = useModal();

    // --- State Management ---
    const initialFormState = {
        joinDate: new Date().toISOString().split('T')[0],
        name: '',
        level: '일반',
        email: '',
        zip: '',
        addr1: '',
        addr2: '',
        phone: '',
        mobile: '',
        marketingConsent: false,
        anniversaryDate: '',
        anniversaryType: '',
        acquisition: '',
        purchaseCycle: '',
        prefProduct: '',
        prefPackage: '',
        subInterest: false,
        familyType: '',
        healthConcern: '',
        memo: ''
    };

    const [formData, setFormData] = useState(initialFormState);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showAddrLayer, setShowAddrLayer] = useState(false);

    // Refs
    const nameInputRef = useRef(null);
    const mobileInputRef = useRef(null);
    const ocrInputRef = useRef(null);

    useEffect(() => {
        // Auto-focus name on mount
        if (nameInputRef.current) nameInputRef.current.focus();
    }, []);

    // --- Handlers ---
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        let val = type === 'checkbox' ? checked : value;

        if (name === 'mobile' || name === 'phone') {
            val = formatPhoneNumber(val);
        }

        setFormData(prev => ({
            ...prev,
            [name]: val
        }));
    };

    const handleAddressSearch = () => {
        if (!window.daum || !window.daum.Postcode) {
            showAlert('오류', '주소 검색 서비스(Daum)를 불러올 수 없습니다.');
            return;
        }

        setShowAddrLayer(true);

        setTimeout(() => {
            new window.daum.Postcode({
                oncomplete: (data) => {
                    let fullAddr = data.address;
                    let extraAddr = '';

                    if (data.addressType === 'R') {
                        if (data.bname !== '') extraAddr += data.bname;
                        if (data.buildingName !== '') extraAddr += (extraAddr !== '' ? `, ${data.buildingName}` : data.buildingName);
                        fullAddr += (extraAddr !== '' ? ` (${extraAddr})` : '');
                    }

                    setFormData(prev => ({
                        ...prev,
                        zip: data.zonecode,
                        addr1: fullAddr
                    }));
                    setShowAddrLayer(false);
                },
                width: '100%',
                height: '100%'
            }).embed(document.getElementById('addr-layer-container-reg'));
        }, 100);
    };

    const checkDuplicates = async () => {
        const { name, mobile } = formData;
        if (!name && !mobile) return [];

        if (!window.__TAURI__) return [];

        try {
            let duplicates = [];
            const invoke = window.__TAURI__.core.invoke;

            if (name) {
                const nameDups = await invoke('search_customers_by_name', { name });
                duplicates = duplicates.concat(nameDups);
            }
            if (mobile && mobile.length > 5) {
                const mobileDups = await invoke('search_customers_by_mobile', { mobile });
                const nameIds = new Set(duplicates.map(d => d.customer_id));
                const uniqueMobileDups = mobileDups.filter(d => !nameIds.has(d.customer_id));
                duplicates = duplicates.concat(uniqueMobileDups);
            }

            return duplicates;
        } catch (e) {
            console.error("Duplicate check failed:", e);
            return [];
        }
    };

    const handleBlurCheck = async (e) => {
        const { value } = e.target;
        if (!value || value.length < 2) return;

        const dups = await checkDuplicates();
        if (dups.length > 0) {
            await showAlert('중복 확인', `중복 가능성이 있는 고객이 ${dups.length}명 발견되었습니다. 이미 등록된 고객인지 확인해주세요.`);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name) {
            await showAlert('알림', '고객명을 입력해주세요.');
            nameInputRef.current?.focus();
            return;
        }

        if (formData.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.email)) {
                await showAlert('알림', '올바른 이메일 형식을 입력해주세요.');
                return;
            }
        }

        // 최종 중복 체크
        const dups = await checkDuplicates();
        const exactMatch = dups.find(d =>
            d.customer_name === formData.name &&
            (d.mobile_number === formData.mobile || d.phone_number === formData.mobile)
        );

        if (exactMatch) {
            if (exactMatch.status === '말소') {
                if (!await showConfirm('재등록 확인', '이전에 말소된 동일한 정보의 고객이 발견되었습니다.\n정보를 복구하여 재등록하시겠습니까?')) return;
            } else {
                if (!await showConfirm('중복 확인', '동일한 이름과 번호를 가진 활성 고객이 이미 존재합니다. 그래도 등록하시겠습니까?')) return;
            }
        } else if (dups.length > 0) {
            if (!await showConfirm('중복 확인', `중복 가능성이 있는 고객이 ${dups.length}명 발견되었습니다. 그래도 등록하시겠습니까?`)) return;
        } else {
            if (!await showConfirm('확인', '고객을 등록하시겠습니까?')) return;
        }

        await submitRegistration();
    };

    const submitRegistration = async () => {
        setIsProcessing(true);
        try {
            const payload = {
                customerName: formData.name,
                mobileNumber: formData.mobile,
                membershipLevel: formData.level,
                phoneNumber: formData.phone || null,
                email: formData.email || null,
                zipCode: formData.zip || null,
                addressPrimary: formData.addr1 || null,
                addressDetail: formData.addr2 || null,
                memo: formData.memo || null,
                anniversaryDate: formData.anniversaryDate || null,
                anniversaryType: formData.anniversaryType || null,
                marketingConsent: formData.marketingConsent,
                acquisitionChannel: formData.acquisition || null,
                // These CRM fields are not in the current create_customer signature, 
                // but might be needed in the future or ignored by Tauri if extra
                prefProductType: formData.prefProduct || null,
                prefPackageType: formData.prefPackage || null,
                familyType: formData.familyType || null,
                healthConcern: formData.healthConcern || null,
                subInterest: formData.subInterest,
                purchaseCycle: formData.purchaseCycle || null
            };

            if (window.__TAURI__) {
                await window.__TAURI__.core.invoke('create_customer', payload);
                await showAlert('성공', '고객이 성공적으로 등록되었습니다.');
                handleReset();
            }
        } catch (error) {
            console.error('Failed to register customer:', error);
            await showAlert('오류', '고객 등록에 실패했습니다: ' + error);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReset = () => {
        setFormData(initialFormState);
        if (nameInputRef.current) nameInputRef.current.focus();
    };

    const handleOcrFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result.split(',')[1];
            await processBusinessCard(base64, file.type);
            e.target.value = '';
        };
        reader.readAsDataURL(file);
    };

    const processBusinessCard = async (base64, mimeType) => {
        setIsProcessing(true);
        try {
            const result = await window.__TAURI__.core.invoke('parse_business_card_ai', {
                imageBase64: base64,
                mimeType: mimeType
            });

            setFormData(prev => ({
                ...prev,
                name: result.name || prev.name,
                mobile: result.mobile || prev.mobile,
                phone: result.phone || prev.phone,
                email: result.email || prev.email,
                addr1: result.address || prev.addr1,
                memo: (prev.memo ? prev.memo + "\n" : "") +
                    [result.company, result.job_title, result.memo].filter(Boolean).join("\n")
            }));

            await showAlert('성공', '명함 정보가 성공적으로 인식되어 입력되었습니다.');
        } catch (err) {
            console.error(err);
            let msg = '명함 인식에 실패했습니다. 이미지를 확인해주세요.';
            const errStr = String(err);

            if (errStr.includes('API 키') || errStr.includes('400') || errStr.includes('403')) {
                msg = 'AI 설정 오류: API 키가 올바르지 않거나 설정되지 않았습니다.';
            } else if (errStr.includes('Network Error')) {
                msg = '네트워크 연결 상태를 확인해주세요.';
            }

            await showAlert('오류', msg);
        } finally {
            setIsProcessing(false);
        }
    };

    // Camera Refs and State
    const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);

    const handleCameraOcr = async () => {
        setIsCameraModalOpen(true);
    };

    // Start camera when modal opens
    useEffect(() => {
        if (isCameraModalOpen) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isCameraModalOpen]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (e) {
            console.error("Camera error:", e);
            showAlert('오류', '카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
            setIsCameraModalOpen(false);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        // Match canvas size to video size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get base64
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        stopCamera();
        setIsCameraModalOpen(false);

        // Process OCR
        await processBusinessCard(base64, 'image/jpeg');
    };

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden animate-in fade-in duration-700">
            {/* Header Area - Matches SalesReception Pattern */}
            <div className="px-6 lg:px-8 min-[2000px]:px-12 pt-6 lg:pt-8 min-[2000px]:pt-12 pb-1">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="w-6 h-1 bg-indigo-600 rounded-full"></span>
                            <span className="text-[9px] font-black tracking-[0.2em] text-indigo-600 uppercase">Customer Relationship Management</span>
                        </div>
                        <h1 className="text-3xl font-black text-slate-600 tracking-tighter" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                            고객 등록 <span className="text-slate-300 font-light ml-1 text-xl">Registration</span>
                        </h1>
                    </div>
                    <div className="flex gap-3">
                        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-tight">명함 인식 (OCR)</span>
                            <input type="file" ref={ocrInputRef} accept="image/*" className="hidden" onChange={handleOcrFileChange} />
                            <button
                                onClick={() => ocrInputRef.current?.click()}
                                className="h-10 px-4 rounded-xl bg-slate-50 text-indigo-600 font-bold hover:bg-indigo-50 transition-all flex items-center gap-2 text-sm border border-indigo-100"
                            >
                                <span className="material-symbols-rounded text-lg">upload_file</span> 파일 선택
                            </button>
                            <button
                                onClick={handleCameraOcr}
                                className="h-10 px-4 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all flex items-center gap-2 text-sm shadow-sm"
                            >
                                <span className="material-symbols-rounded text-lg">photo_camera</span> 카메라 촬영
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <form onSubmit={handleSubmit} className="px-4 lg:px-6 min-[2000px]:px-10 mt-0.5 flex flex-col gap-2 overflow-hidden flex-1 pb-4 lg:pb-6 min-[2000px]:pb-10">
                <div className="flex-1 overflow-y-auto pr-2 space-y-2">

                    {/* section 1: Basic Info */}
                    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/30 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                        <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                                <span className="material-symbols-rounded text-xl">info</span>
                            </div>
                            기본 인적 사항
                        </h3>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-2 gap-x-4">
                            <div className="lg:col-span-3 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">등록 일자</label>
                                <div className="relative">
                                    <input type="date" name="joinDate" value={formData.joinDate} onChange={handleChange}
                                        className="w-full h-10 bg-slate-50 border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 transition-all" />
                                </div>
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">고객명 <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <input type="text" name="name" ref={nameInputRef} value={formData.name} onChange={handleChange} onBlur={handleBlurCheck}
                                        placeholder="이름 입력" required
                                        className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-800 px-4 focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm" />
                                </div>
                            </div>
                            <div className="lg:col-span-2 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">회원 등급</label>
                                <select name="level" value={formData.level} onChange={handleChange}
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 transition-all appearance-none shadow-sm">
                                    <option value="일반">일반</option>
                                    <option value="VIP">VIP</option>
                                    <option value="VVIP">VVIP</option>
                                    <option value="법인/단체">법인/단체</option>
                                </select>
                            </div>
                            <div className="lg:col-span-5 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">이메일 주소</label>
                                <input type="email" name="email" value={formData.email} onChange={handleChange}
                                    placeholder="example@mail.com"
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-2 gap-x-4 mt-3">
                            <div className="lg:col-span-2 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">우편번호</label>
                                <input type="text" name="zip" value={formData.zip} readOnly onClick={handleAddressSearch}
                                    placeholder="검색"
                                    className="w-full h-10 bg-slate-50 border-slate-200 border rounded-xl font-bold text-slate-700 px-4 cursor-pointer hover:bg-slate-100 transition-all text-center" />
                            </div>
                            <div className="lg:col-span-5 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">기본 주소</label>
                                <input type="text" name="addr1" value={formData.addr1} onClick={handleAddressSearch}
                                    placeholder="클릭하여 주소 검색" readOnly
                                    className="w-full h-10 bg-slate-50 border-slate-200 border rounded-xl font-bold text-slate-700 px-4 cursor-pointer hover:bg-slate-100 transition-all" />
                            </div>
                            <div className="lg:col-span-5 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">상세 주소</label>
                                <input type="text" name="addr2" value={formData.addr2} onChange={handleChange}
                                    placeholder="아파트 동/호수 등 상세 입력"
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-y-2 gap-x-4 mt-3">
                            <div className="lg:col-span-3 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">일반 전화</label>
                                <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                                    placeholder="02-000-0000"
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm" />
                            </div>
                            <div className="lg:col-span-3 space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">휴대 전화</label>
                                <input type="tel" name="mobile" value={formData.mobile} onChange={handleChange} onBlur={handleBlurCheck}
                                    placeholder="010-0000-0000"
                                    className="w-full h-10 bg-white border-indigo-200 border-2 rounded-xl font-black text-slate-900 px-4 focus:ring-4 focus:ring-indigo-500/20 transition-all shadow-sm" />
                            </div>
                            <div className="lg:col-span-6 flex items-end pb-1">
                                <label className="flex items-center gap-3 bg-slate-50 border border-slate-200 px-6 py-3 rounded-2xl cursor-pointer hover:bg-indigo-50 transition-all w-full group/check">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" name="marketingConsent" checked={formData.marketingConsent} onChange={handleChange}
                                            className="w-5 h-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer" />
                                    </div>
                                    <span className="text-sm font-black text-slate-600 group-hover/check:text-indigo-700">마케팅 정보 수신 동의</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: CRM & Taste */}
                    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50/30 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                        <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                                <span className="material-symbols-rounded text-xl">volunteer_activism</span>
                            </div>
                            CRM 및 고객 취향 정보
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-2 gap-x-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">주요 기념일</label>
                                <input type="date" name="anniversaryDate" value={formData.anniversaryDate} onChange={handleChange}
                                    className="w-full h-10 bg-slate-50 border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 transition-all" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">기념일 종류</label>
                                <select name="anniversaryType" value={formData.anniversaryType} onChange={handleChange}
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 appearance-none shadow-sm focus:ring-2 focus:ring-indigo-500">
                                    <option value="">선택 안함</option>
                                    <option value="생일">생일</option>
                                    <option value="결혼기념일">결혼기념일</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">유입 경로</label>
                                <select name="acquisition" value={formData.acquisition} onChange={handleChange}
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 appearance-none shadow-sm focus:ring-2 focus:ring-indigo-500">
                                    <option value="">선택 하세요</option>
                                    <option value="SNS(인스타/페이스북)">SNS</option>
                                    <option value="인터넷 검색">인터넷 검색</option>
                                    <option value="지인 소개">지인 소개</option>
                                    <option value="유튜브">유튜브</option>
                                    <option value="광고">광고</option>
                                    <option value="기타">기타</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">구매 주기</label>
                                <select name="purchaseCycle" value={formData.purchaseCycle} onChange={handleChange}
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 appearance-none shadow-sm focus:ring-2 focus:ring-indigo-500">
                                    <option value="">선택 하세요</option>
                                    <option value="매달 정기적">매달 정기적</option>
                                    <option value="분기별">분기별</option>
                                    <option value="명절/기념일">명절/기념일</option>
                                    <option value="가끔 주문">가끔 주문</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-2 gap-x-4 mt-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">선호 상품군</label>
                                <select name="prefProduct" value={formData.prefProduct} onChange={handleChange}
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 appearance-none shadow-sm focus:ring-2 focus:ring-indigo-500">
                                    <option value="">선택 하세요</option>
                                    <option value="생버섯">생버섯</option>
                                    <option value="건버섯">건버섯</option>
                                    <option value="가공품(가루/차)">가공품</option>
                                    <option value="체험 프로그램">체험 프로그램</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">선호 포장</label>
                                <select name="prefPackage" value={formData.prefPackage} onChange={handleChange}
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 appearance-none shadow-sm focus:ring-2 focus:ring-indigo-500">
                                    <option value="">선택 하세요</option>
                                    <option value="실속형(가정용)">실속형</option>
                                    <option value="선물용(프리미엄)">선물용</option>
                                </select>
                            </div>
                            <div className="lg:col-span-2 flex items-end pb-1">
                                <label className="flex items-center gap-3 bg-white border border-indigo-100 px-6 py-3 rounded-2xl cursor-pointer hover:bg-indigo-50 transition-all w-full group/check">
                                    <input type="checkbox" name="subInterest" checked={formData.subInterest} onChange={handleChange}
                                        className="w-5 h-5 rounded-lg border-2 border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                    <span className="text-sm font-black text-slate-600 group-hover/check:text-indigo-700">정기 배송(구독형) 서비스 관심</span>
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-4 mt-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">가족 구성 특징</label>
                                <input type="text" name="familyType" value={formData.familyType} onChange={handleChange}
                                    placeholder="예: 자녀 있음, 부모님 선물용 위주 등"
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-black text-slate-400 uppercase ml-1">건강 관심사</label>
                                <input type="text" name="healthConcern" value={formData.healthConcern} onChange={handleChange}
                                    placeholder="예: 당뇨관리, 면역력 등"
                                    className="w-full h-10 bg-white border-slate-200 border rounded-xl font-bold text-slate-700 px-4 focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Memo */}
                    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 mb-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase ml-1 mb-1 block">고객 상세 메모</label>
                        <textarea name="memo" value={formData.memo} onChange={handleChange} rows="3"
                            placeholder="특이사항이나 상담 메모를 남겨주세요."
                            className="w-full bg-slate-50 border-slate-200 border rounded-xl font-bold text-slate-700 p-3 focus:ring-2 focus:ring-indigo-500 transition-all resize-none" />
                    </div>

                    {/* Action Buttons - Moved inside scrollable area */}
                    <div className="flex justify-end gap-3 pt-4 pb-2 border-t border-slate-100">
                        <button type="button" onClick={handleReset}
                            className="h-10 px-8 rounded-2xl bg-white border border-slate-200 text-slate-500 font-black hover:bg-slate-50 transition-all flex items-center gap-2">
                            <span className="material-symbols-rounded">refresh</span> 화면 초기화
                        </button>
                        <button type="submit" disabled={isProcessing}
                            className="h-10 px-12 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-50">
                            <span className="material-symbols-rounded">{isProcessing ? 'sync' : 'person_add'}</span>
                            {isProcessing ? '처리 중...' : '고객 등록'}
                        </button>
                    </div>
                </div>
            </form>

            {/* Daum Postcode Layer */}
            {showAddrLayer && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAddrLayer(false)} />
                    <div className="relative w-full max-w-xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300">
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white">
                            <h3 className="text-xl font-black">주소 검색</h3>
                            <button onClick={() => setShowAddrLayer(false)} className="w-10 h-9 rounded-full hover:bg-white/20 transition-colors flex items-center justify-center">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>
                        <div id="addr-layer-container-reg" className="w-full h-[500px]" />
                    </div>
                </div>
            )}

            {/* Camera Modal */}
            {isCameraModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
                    <div className="relative w-full max-w-2xl bg-black rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                        <div className="absolute top-4 right-4 z-10">
                            <button onClick={() => setIsCameraModalOpen(false)} className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-all">
                                <span className="material-symbols-rounded">close</span>
                            </button>
                        </div>

                        <div className="relative aspect-[4/3] bg-black">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            <canvas ref={canvasRef} className="hidden" />

                            {/* Overlay Guide */}
                            <div className="absolute inset-0 border-[3px] border-white/30 m-8 rounded-2xl pointer-events-none flex items-center justify-center">
                                <div className="text-white/70 font-bold bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm text-sm">명함을 사각형 안에 맞춰주세요</div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-900 flex justify-center items-center gap-6">
                            <button onClick={() => setIsCameraModalOpen(false)} className="px-6 py-3 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-all">
                                취소
                            </button>
                            <button onClick={capturePhoto} className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-indigo-500/30">
                                <div className="w-12 h-12 rounded-full bg-indigo-600 border-2 border-white" />
                            </button>
                            <div className="w-[88px]" /> {/* Spacer for centering */}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerRegister;
