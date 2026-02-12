import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * JENNY'S BULLETPROOF PRINTER
 * 
 * Strategy:
 * 1. Global trigger attached to window to ensure cross-module calling reliability.
 * 2. React Portal to body to keep the label outside the normal layout.
 * 3. Pure CSS @media print to hide app and show ONLY the label during print.
 * 4. Direct window.print() for maximum compatibility with Tauri/WebView2.
 */

// Global access for the print trigger
window.__MYCELIUM_PRINT__ = (type, data) => {
    console.log("[Jenny-Printer] Triggering print job:", type, data);
    if (window.__TRIGGER_INTERNAL_PRINT__) {
        window.__TRIGGER_INTERNAL_PRINT__(type, data);
    } else {
        console.error("[Jenny-Printer] Internal printer component not mounted!");
    }
};

// Public Accessor for components
export const printLabel = (type, data) => {
    window.__MYCELIUM_PRINT__(type, data);
};

const LabelPrinter = () => {
    const [job, setJob] = useState(null);
    const [isPrinting, setIsPrinting] = useState(false);

    useEffect(() => {
        // Register the internal trigger
        window.__TRIGGER_INTERNAL_PRINT__ = (type, data) => {
            setJob({ type, data });
            setIsPrinting(true);
        };
        console.log("[Jenny-Printer] Internal trigger registered ✓");
        return () => { window.__TRIGGER_INTERNAL_PRINT__ = null; };
    }, []);

    useEffect(() => {
        if (isPrinting && job) {
            // Wait for React to finish rendering the portal content
            const timer = setTimeout(() => {
                window.focus();
                window.print();

                // Cleanup after print dialog closes
                setTimeout(() => {
                    setIsPrinting(false);
                    setJob(null);
                }, 100);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isPrinting, job]);

    if (!job) return null;

    // Use Portal to render at the very end of <body>
    return createPortal(
        <div id="mycelium-print-mount">
            <style>{`
                /* Hide on screen */
                @media screen {
                    #mycelium-print-mount {
                        display: none !important;
                    }
                }

                /* Show ONLY this on print */
                @media print {
                    @page { 
                        size: 80mm 40mm; 
                        margin: 0; 
                    }
                    
                    /* Hide everything in the main app */
                    body > *:not(#mycelium-print-mount) {
                        display: none !important;
                    }

                    #mycelium-print-mount {
                        display: block !important;
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 80mm;
                        height: 40mm;
                        background: white;
                        color: black;
                        margin: 0;
                        padding: 0;
                        z-index: 9999999;
                    }

                    .label-wrapper {
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        width: 79mm;
                        height: 39mm;
                        padding: 4mm;
                        box-sizing: border-box;
                        font-family: 'Pretendard', 'Malgun Gothic', sans-serif;
                    }

                    .qr-section {
                        flex-shrink: 0;
                        text-align: center;
                        margin-right: 4mm;
                    }

                    .qr-box {
                        border: 2px solid black;
                        padding: 1mm;
                        background: white;
                        display: inline-block;
                    }

                    .gap-mark {
                        font-size: 8px;
                        font-weight: 900;
                        margin-top: 2px;
                        line-height: 1.1;
                    }

                    .info-section {
                        flex-grow: 1;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        justify-content: center;
                    }

                    .label-header {
                        border-bottom: 2px solid black;
                        padding-bottom: 2px;
                        margin-bottom: 4px;
                    }

                    .label-type {
                        font-size: 7px;
                        font-weight: bold;
                        color: #666;
                        text-transform: uppercase;
                    }

                    .label-title {
                        font-size: 13px;
                        font-weight: 900;
                        margin: 0;
                        line-height: 1.2;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        max-width: 150px;
                    }

                    .data-row {
                        display: flex;
                        justify-content: space-between;
                        border-bottom: 1px solid #eee;
                        padding: 2px 0;
                        font-size: 9px;
                    }

                    .data-label { color: #666; font-weight: 500; }
                    .data-value { color: black; font-weight: 900; }

                    .label-footer {
                        margin-top: auto;
                        text-align: right;
                        font-size: 6px;
                        color: #999;
                        font-style: italic;
                    }
                }
            `}</style>

            <div className="label-wrapper">
                <div className="qr-section">
                    <div className="qr-box">
                        <QRCodeCanvas
                            value={job.data.qrValue || 'ERROR'}
                            size={TYPE_SIZES[job.type] || 80}
                            level="M"
                            includeMargin={false}
                        />
                    </div>
                    {job.type === 'harvest' && (
                        <div className="gap-mark">GAP 인증<br />농산물</div>
                    )}
                </div>

                <div className="info-section">
                    <div className="label-header">
                        <div className="label-type">
                            {job.type === 'product' ? 'PRODUCT LABEL' : 'HARVEST RECORD'}
                        </div>
                        <h1 className="label-title">{job.data.title || '-'}</h1>
                    </div>

                    <div className="data-row">
                        <span className="data-label">관리번호</span>
                        <span className="data-value">{job.data.code || '-'}</span>
                    </div>

                    <div className="data-row">
                        <span className="data-label">규격/등급</span>
                        <span className="data-value">{job.data.spec || '-'}</span>
                    </div>

                    <div className="data-row" style={{ border: 'none' }}>
                        <span className="data-label">일자/정보</span>
                        <span className="data-value">{job.data.date || '-'}</span>
                    </div>

                    <div className="label-footer">Smart Farm Mycelium System</div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const TYPE_SIZES = {
    harvest: 70,
    product: 85
};

export default LabelPrinter;
