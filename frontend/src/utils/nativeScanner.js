import { Capacitor } from '@capacitor/core';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';

/**
 * Universal QR scanner handler. 
 * Uses native scanner if on mobile, otherwise falls back to web.
 */
export async function scanNativeQr() {
    if (!Capacitor.isNativePlatform()) {
        return { isNative: false };
    }

    try {
        // The OutSystems plugin doesn't require explicit permission check/hideBackground 
        // as it handles the UI internally (or uses a standard scanner UI).
        const result = await CapacitorBarcodeScanner.scanBarcode({
            hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
            scanInstructions: "QR 코드를 사각형 안에 맞춰주세요.",
            scanButton: false
        });

        if (result && result.ScanResult) {
            return { isNative: true, content: result.ScanResult };
        }
        return { isNative: true, content: null };
    } catch (err) {
        console.error('Native scan failed:', err);
        throw err;
    }
}

export async function stopNativeQr() {
    // This plugin doesn't have a stopScan method as it's a one-shot call.
    // If it was possible to stop, it would be through UI cancellation.
}
