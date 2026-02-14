
export function formatCurrency(amount) {
    if (amount === undefined || amount === null) return '0';
    if (amount === '') return '';
    if (amount === '-') return '-';
    const num = typeof amount === 'number' ? amount : Number(String(amount).replace(/[^0-9.-]/g, ''));
    if (isNaN(num)) return '0';
    return new Intl.NumberFormat('ko-KR').format(num);
}

export function parseNumber(str) {
    if (!str) return 0;
    return parseInt(String(str).replace(/,/g, ''), 10) || 0;
}

export function formatDateTime(date) {
    if (!date) return '';
    // Naive ISO strings from backend without 'Z' are treated as UTC by convention in this app
    const isoStr = (typeof date === 'string' && !date.includes('Z') && !date.includes('+'))
        ? `${date.replace(' ', 'T')}Z`
        : date;
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(date);

    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${month}-${day} ${hours}:${minutes}`;
}

export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatPhoneNumber(value) {
    if (!value) return "";
    value = value.replace(/[^0-9]/g, "");
    if (value.length < 4) return value;
    if (value.length < 7) {
        return value.substr(0, 3) + "-" + value.substr(3);
    }
    if (value.length < 11) {
        return value.substr(0, 3) + "-" + value.substr(3, 3) + "-" + value.substr(6);
    }
    return value.substr(0, 3) + "-" + value.substr(3, 4) + "-" + value.substr(7);
}

export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log("Copied to clipboard:", text);
        return true;
    } catch (err) {
        console.error("Failed to copy:", err);
        return false;
    }
}

export function getBadgeClass(status) {
    switch (status) {
        case '접수': return 'badge-new';
        case '주문접수': return 'badge-new'; // Legacy
        case '결제완료': return 'badge-paid';
        case '입금완료': return 'badge-paid';
        case '배송중': return 'badge-shipping';
        case '배송완료': return 'badge-complete';
        case '주문취소': return 'badge-cancelled';
        default: return 'badge-default';
    }
}

// React-friendly Confirm/Alert helpers (Wrappers for window.confirm/alert for now, usually replaced by Context)
// In a full React app, these should be replaced by a Modal Context.
// For quick migration, we will use browser defaults or simple dom manipulation if possible, but React way is better.
// We will stick to simple window methods for initial port if UI components are not ready, 
// OR we can implement a simple GlobalModal component later.

export async function showConfirm(title, message) {
    // Fallback if called outside React Context (should be avoided)
    console.warn("showConfirm called from common.js - Use useModal() hook instead!");
    let msg = message;
    if (!msg && title) msg = title;
    return window.confirm(msg);
}

export async function showAlert(title, message) {
    // Fallback if called outside React Context
    console.warn("showAlert called from common.js - Use useModal() hook instead!");
    let msg = message;
    if (!msg && title) msg = title;
    window.alert(msg);
}

export function showLocalLoading() {
    console.log("Loading started...");
}

export function hideLocalLoading() {
    console.log("Loading ended.");
}
