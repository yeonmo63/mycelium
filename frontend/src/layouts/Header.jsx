import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useModal } from '../contexts/ModalContext';

const Header = () => {
    const navigate = useNavigate();
    const { showConfirm } = useModal();
    const username = sessionStorage.getItem('username') || '관리자';

    const handleLogout = async () => {
        const confirmed = await showConfirm('로그아웃', '정말 로그아웃 하시겠습니까?');
        if (confirmed) {
            // Clear login state
            sessionStorage.removeItem('isLoggedIn');
            sessionStorage.removeItem('userId');
            sessionStorage.removeItem('username');
            sessionStorage.removeItem('userRole');

            // Instant logout via event dispatch (App.jsx listens for this)
            window.dispatchEvent(new CustomEvent('app-logout'));
        }
    };

    return (
        <header>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>Mycelium</h1>
                {/* Global Search / Voice Search Bar */}
                <div className="voice-search-container" id="voice-search-bar"
                    style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '12px', padding: '4px 12px', minWidth: '400px', border: '1px solid #e2e8f0', transition: 'all 0.3s ease' }}>
                    <span className="material-symbols-rounded" style={{ color: '#64748b', fontSize: '20px' }}>search</span>
                    <input type="text" id="global-search-input" placeholder="'홍길동 검색' 또는 '고객 등록'이라고 말씀해 보세요..."
                        style={{ border: 'none', background: 'transparent', flex: 1, padding: '8px', outline: 'none', fontSize: '0.9rem' }} />
                    <button id="btn-voice-trigger"
                        style={{ background: 'rgba(99, 102, 241, 0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', width: '36px', height: '36px', borderRadius: '50%', transition: 'all 0.2s ease', marginLeft: '6px' }}>
                        <span className="material-symbols-rounded" id="mic-icon" style={{ fontSize: '20px' }}>mic</span>
                    </button>
                </div>
            </div>
            <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.95rem', color: '#475569' }}><strong id="header-user-name"
                    style={{ color: '#1e293b' }}>{username}</strong>님 환영합니다.</span>
                <button onClick={handleLogout} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>로그아웃</button>
            </div>
        </header>
    );
};

export default Header;
