# Mycelium (마이셀리움) - v1.0.0 🍄✨

> **"The Operating System for Next-Gen Agri-Commerce"**  
> **[농장]**의 흙내음부터 **[식탁]**의 즐거움까지, 모든 여정을 데이터로 연결하는 **AI 기반 차세대 농산물 통합 관리 시스템**입니다.

---

### 🌟 Project Vision
**Mycelium**은 단순한 재고 관리(ERP)를 넘어, **"수익을 창출하는 비즈니스 파트너"**를 지향합니다.  
농산물의 생산(Harvest), 가공(Processing), 판매(Sales), 그리고 고객 관리(CRM)까지의 전 과정을 **유기적인 데이터 흐름(Mycelial Network)**으로 연결하여, 운영자에게 **'지금 무엇을 해야 하는지'**에 대한 명확한 통찰을 제공합니다.

---

## 🚀 Key Features (v1.0.0 Highlights)

### 1. 🏭 Farm-to-Box 정밀 재고 관리
**"원물부터 박스까지, 1g의 오차도 허용하지 않는 완벽한 추적"**
- **Hybrid Inventory**: `농산물(원물)`과 `부자재(박스/포장재)`를 통합 관리하며, 상품화 과정에서 이 둘의 **자동 차감 및 수율(Loss/Save) 분석**을 실시간으로 제공합니다.
- **Dynamic Conversion**: 복잡한 농산물 가공(소분/포장) 과정을 클릭 몇 번으로 처리하며, 생산 원가를 투명하게 산출합니다.

### 2. 🧠 Hyper-Local AI Intelligence
**"데이터가 당신에게 말을 겁니다."**
- **Freshness Golden Time**: 입고된 농산물의 **신선도 유효기간(골든 타임)**을 AI가 추적하여, 7일 경과 시 Warning, 위험 시 Alert를 띄워 **폐기율 0%**에 도전합니다.
- **Smart Forecasting**: 최근 30일간의 판매 속도를 분석하여 **'7일 내 품절 예상 품목'**을 미리 알려줍니다.
- **Daily Executive Briefing**: 매일 아침, 전날의 매출/기상/주요 이슈를 요약한 **AI 모닝 브리핑**을 제공합니다.

### 3. 💎 Retention CRM & Marketing
**"한 번 온 고객을 평생 단골로."**
- **AI Repurchase Target**: 고객별 소비 패턴을 학습하여 **재구매 타이밍(골든 타임)**이 도래한 고객을 찾아냅니다.
- **Generative SMS Drafting**: "잘 지내셨나요?" 같은 뻔한 문구 대신, 상황에 맞는 **초개인화된 안부/판촉 메시지**를 AI가 작성해줍니다.

### 4. 🛡 Enterprise-Grade Reliability
**"금융 시스템급의 안정성"**
- **Rust & Tauri Core**: 압도적인 성능과 메모리 안전성을 보장하는 Rust 백엔드.
- **PostgreSQL Database**: 대용량 트랜잭션도 거뜬한 강력한 관계형 데이터베이스.
- **Smart Audit Logs**: **'누가, 언제, 왜'** 재고를 변경했는지 100% 추적 가능한 투명한 감사 로그 시스템.

---

## 🛠 Tech Stack

| Category | Technologies |
|:---:|:---|
| **Core Engine** | ![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust) **Rust** (High Performance & Safety) |
| **Framework** | ![Tauri](https://img.shields.io/badge/Tauri-24C8DB?style=flat&logo=tauri) **Tauri 2.0** (Cross-Platform Desktop) |
| **Frontend** | ![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react) **React**, **Vite**, **TailwindCSS** |
| **Database** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql) **PostgreSQL**, **SQLx** |
| **AI Solution** | ![Gemini](https://img.shields.io/badge/Google%20AI-4285F4?style=flat&logo=google) **Google Gemini Pro** |

---

## 💻 Installation & Setup

```bash
# 1. Repository Clone
git clone https://github.com/yeonmo63/Mycelium.git
cd Mycelium

# 2. Install Dependencies
npm install

# 3. Database Migration (PostgreSQL required)
# Ensure DATABASE_URL is set in .env
cargo sqlx migrate run --source src-tauri/migrations

# 4. Run Development Mode
npm run tauri dev
```

---

> **Mycelium** combines the intuition of a farmer with the precision of AI.  
> *Developed with the "Vibe Coding" philosophy.*
