import dayjs from 'dayjs';

/**
 * Robust Printing System for Tauri
 * Instead of iframes (which are buggy in Tauri builds), 
 * we use a dedicated mount point in the main document index.html.
 */

export const handlePrintRaw = (htmlContent, cleanupMs = 3000) => {
    const printMount = document.getElementById('print-mount-point');
    if (!printMount) {
        console.error("❌ Print mount point not found.");
        window.print();
        return;
    }

    const docEl = document.documentElement;
    const isMobile = window.__MYCELIUM_MOBILE__;
    const originalDocBg = docEl.style.backgroundColor;
    const originalDocScheme = docEl.style.colorScheme;
    const themeMeta = document.querySelector('meta[name="color-scheme"]');

    // 1. Inject Style to Hide App & Show Print Mount
    // This strictly enforces that ONLY the print mount is visible.
    const styleEl = document.createElement('style');
    styleEl.id = 'print-enforcer';
    styleEl.textContent = `
        @media print {
            html, body { background: white !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            #root, #app-root, .tauri-drag-region, .no-print { display: none !important; }
            #print-mount-point { 
                display: block !important; 
                position: absolute !important; 
                top: 0 !important; 
                left: 0 !important; 
                width: 100% !important; 
                min-height: 100vh !important;
                z-index: 99999 !important; 
                background: white !important;
                visibility: visible !important;
            }
            #print-mount-point * { visibility: visible !important; }
        }
    `;
    document.head.appendChild(styleEl);

    // 2. Inject Full Content (Styles + HTML) directly
    // We do NOT strip styles anymore. We let the browser handle scaping and application.
    printMount.innerHTML = htmlContent;

    // 3. Ensure Visibility of Content
    // Only clear explicit 'display: none' to avoid breaking flex/grid layouts
    const forceVisible = (node) => {
        if (node.style && node.style.display === 'none') {
            node.style.display = '';
        }
        if (node.children) {
            Array.from(node.children).forEach(forceVisible);
        }
    };
    forceVisible(printMount);

    docEl.classList.add('printing-active');
    printMount.classList.remove('hidden');

    // 4. Print with extended delay (1000ms) to ensure styles and layout are fully applied by WebView2
    setTimeout(() => {
        window.print();

        // 5. Cleanup
        setTimeout(() => {
            if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
            printMount.innerHTML = '';
            printMount.classList.add('hidden');
            docEl.classList.remove('printing-active');
            docEl.style.backgroundColor = originalDocBg;
            docEl.style.colorScheme = originalDocScheme;
            if (themeMeta) themeMeta.content = isMobile ? 'light' : 'dark';
        }, 1000);
    }, 1000);
};

export const handlePrint = (title, contentHTML) => {
    let processedContent = contentHTML;
    if (typeof contentHTML === 'string' && contentHTML.includes('===')) {
        processedContent = contentHTML.split('===').map((section, idx) => `
            <div class="report-section ${idx === 0 ? 'first' : ''}">
                ${section.trim().replace(/\n/g, '<br/>')}
            </div>
        `).join('');
    }

    const html = `
        <div class="print-container" style="background: white !important; color: #1e293b !important; padding: 20px;">
            <style>
                @page { size: A4; margin: 15mm; }
                .print-container { font-family: 'Pretendard', 'Inter', sans-serif; line-height: 1.6; }
                .print-header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #334155; padding-bottom: 20px; }
                .print-header h1 { margin: 0; font-size: 28px; font-weight: 800; color: #0f172a !important; }
                .print-header .date { font-size: 11px; color: #64748b !important; margin-top: 8px; font-weight: bold; }
                .content { font-size: 14px; white-space: pre-wrap; font-weight: 500; color: #1e293b !important; }
                .report-section { margin-bottom: 25px; padding: 15px; background: #f8fafc !important; border-radius: 12px; border: 1px solid #e2e8f0 !important; }
                .report-section.first { border-left: 5px solid #6366f1 !important; }
                .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #94a3b8 !important; border-top: 1px solid #f1f5f9 !important; padding-top: 20px; }
                
                @media print {
                    @page { margin: 15mm; }
                    html, body { 
                        background: white !important; 
                        color: #1e293b !important;
                        color-scheme: light !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    #root, #app-root { display: none !important; }
                    .print-container { background: white !important; width: 100% !important; margin: 0 !important; }
                    .report-section { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
                }
            </style>
            <div class="print-header">
                <h1>${title}</h1>
                <div class="date">REPORTED ON ${dayjs().format('YYYY. MM. DD. HH:mm')}</div>
            </div>
            <div class="content">${processedContent}</div>
            <div class="footer">본 리포트는 Mycelium Intelligence System에 의해 자동 생성된 문서입니다.</div>
        </div>
    `;

    handlePrintRaw(html);
};
