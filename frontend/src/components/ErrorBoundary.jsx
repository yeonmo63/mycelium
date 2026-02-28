import React from 'react';

/**
 * Enhanced Error Boundary with premium UI and AI assistance integration
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl border border-red-100 overflow-hidden relative">
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-400 via-orange-400 to-amber-400"></div>

                        <div className="p-10 text-center">
                            <div className="w-20 h-20 mx-auto bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                                <span className="material-symbols-rounded text-4xl text-red-500">error</span>
                            </div>

                            <h2 className="text-2xl font-black text-slate-800 mb-2">문제가 발생했습니다</h2>
                            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
                                어플리케이션 처리 중 예기치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
                            </p>

                            <div className="bg-slate-50 rounded-2xl p-4 mb-8 text-left border border-slate-100 max-h-40 overflow-auto">
                                <p className="text-[11px] font-mono text-slate-400 break-all leading-tight">
                                    {this.state.error && this.state.error.toString()}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full h-12 bg-slate-900 text-white font-black rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-rounded text-lg">refresh</span>
                                    <span>페이지 새로고침</span>
                                </button>

                                <button
                                    onClick={() => this.setState({ hasError: false, error: null })}
                                    className="w-full h-12 bg-white text-slate-500 font-black rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
                                >
                                    홈으로 돌아가기
                                </button>
                            </div>
                        </div>

                        <div className="px-10 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
                                <span className="material-symbols-rounded text-teal-600 text-sm">auto_awesome</span>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Powered by AI Guide System</span>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
