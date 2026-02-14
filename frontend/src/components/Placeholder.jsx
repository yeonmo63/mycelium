import React from 'react';

const Placeholder = ({ title }) => {
    return (
        <div className="flex items-center justify-center h-full bg-slate-50">
            <div className="text-center p-8">
                <span className="material-symbols-rounded text-6xl text-slate-300 mb-4 block">construction</span>
                <h2 className="text-2xl font-bold text-slate-600 mb-2">{title}</h2>
                <p className="text-slate-400">이 기능은 곧 제공될 예정입니다</p>
            </div>
        </div>
    );
};

export default Placeholder;
