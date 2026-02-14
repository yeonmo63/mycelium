import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { handlePrintRaw } from '../../../utils/printUtils';

// Configuration
const EVENT_NAME = 'mycelium-trigger-print';

/**
 * Public Accessor for all components
 */
export const printLabel = (type, data) => {
    console.log("[Jenny-Printer] 🚀 Isolated print requested:", type);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { type, data } }));
};

// Global legacy support
window.__MYCELIUM_PRINT__ = (type, data) => {
    printLabel(type, data);
};

const LabelPrinter = () => {
    const [job, setJob] = useState(null);
    const qrContainerRef = useRef(null);

    useEffect(() => {
        const handleRequest = (e) => {
            const { type, data } = e.detail;
            setJob({ type, data });
        };

        window.addEventListener(EVENT_NAME, handleRequest);
        console.log("[Jenny-Printer] 🛸 Isolated Sandbox Printer Mounted");
        return () => window.removeEventListener(EVENT_NAME, handleRequest);
    }, []);

    useEffect(() => {
        if (job) {
            // Wait for React to render the QR code in our hidden "factory" div
            const timer = setTimeout(() => {
                try {
                    executeIsolatedPrint(job);
                } catch (err) {
                    console.error("[Jenny-Printer] ❌ Print Failed:", err);
                } finally {
                    setJob(null);
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [job]);

    const executeIsolatedPrint = (jobData) => {
        const qrSvg = qrContainerRef.current?.innerHTML || '';

        console.log("[Jenny-Printer] 🛠️ Building Isolated Print Sandbox...");

        const html = `
                <style>
                    @page {
                        size: 40mm 30mm;
                        margin: 0;
                    }
                    .label-print-wrapper {
                        margin: 0;
                        padding: 0;
                        width: 40mm;
                        height: 30mm;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        overflow: hidden;
                        font-family: 'Inter', system-ui, sans-serif;
                    }
                    .label-container {
                        width: 38mm;
                        height: 28mm;
                        display: flex;
                        align-items: center;
                        gap: 2mm;
                        padding: 1mm;
                        box-sizing: border-box;
                    }
                    .qr-section {
                        width: 16mm;
                        height: 16mm;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .qr-section svg {
                        width: 100% !important;
                        height: 100% !important;
                    }
                    .data-section {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        height: 100%;
                        padding-left: 1mm;
                    }
                    .data-row {
                        display: flex;
                        align-items: center;
                        padding: 3px 0;
                        font-size: 11px;
                        font-weight: 800;
                        color: #000;
                        line-height: 1.1;
                    }
                    .data-label {
                        white-space: nowrap;
                        margin-right: 4px;
                        color: #000;
                    }
                    .data-value {
                        word-break: break-all;
                        overflow: hidden;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        color: #000;
                    }
                </style>
                <div class="label-print-wrapper">
                    <div class="label-container">
                        <div class="qr-section">
                            ${qrSvg}
                        </div>
                        <div class="data-section">
                            <div class="data-row">
                                <span class="data-label">품&nbsp;&nbsp;&nbsp;명:</span>
                                <span class="data-value">${jobData.data.title || '-'}</span>
                            </div>
                            ${jobData.type === 'product' ? `
                            <div class="data-row">
                                <span class="data-label">규&nbsp;&nbsp;&nbsp;격:</span>
                                <span class="data-value">${jobData.data.spec || '-'}</span>
                            </div>
                            <div class="data-row">
                                <span class="data-label">단&nbsp;&nbsp;&nbsp;가:</span>
                                <span class="data-value">￦${(jobData.data.price || 0).toLocaleString()}</span>
                            </div>
                            ` : `
                            <div class="data-row">
                                <span class="data-label">일&nbsp;&nbsp;&nbsp;자:</span>
                                <span class="data-value">${jobData.data.date || '-'}</span>
                            </div>
                            <div class="data-row">
                                <span class="data-label">중&nbsp;&nbsp;&nbsp;량:</span>
                                <span class="data-value">${jobData.data.weight || '-'}kg</span>
                            </div>
                            `}
                        </div>
                    </div>
                </div>
        `;

        handlePrintRaw(html);
    };

    return (
        <div
            id="isolated-qr-factory"
            style={{
                position: 'fixed',
                left: '-9999px',
                top: '-9999px',
                visibility: 'hidden',
                pointerEvents: 'none'
            }}
        >
            <div ref={qrContainerRef}>
                {job && (
                    <QRCodeSVG
                        value={job.data.qrValue || 'N/A'}
                        size={128}
                        level="H"
                        includeMargin={false}
                    />
                )}
            </div>
        </div>
    );
};

export default LabelPrinter;
