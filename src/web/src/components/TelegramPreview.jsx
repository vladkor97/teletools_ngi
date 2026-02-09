import React from 'react';

const TelegramPreview = ({ html }) => (
    <div className="telegram-preview">
        {/* Хедер чата */}
        <div style={{
            display: 'flex', alignItems: 'center', padding: '0.5rem 0.6rem',
            marginBottom: '0.75rem', background: 'rgba(23, 33, 43, 0.8)',
            borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)',
        }}>
            <div style={{
                width: '30px', height: '30px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #818cf8, #22d3ee)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', color: 'white', fontSize: '0.7rem', marginRight: '0.6rem',
                flexShrink: 0,
            }}>
                TT
            </div>
            <div>
                <div style={{ fontWeight: '600', fontSize: '0.82rem', color: '#e2e8f0' }}>TeleTools</div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>preview</div>
            </div>
        </div>

        {/* Баббл сообщения */}
        <div className="telegram-bubble">
            {html ? (
                <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
                <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.85rem' }}>
                    Предпросмотр сообщения...
                </span>
            )}
            <div style={{
                textAlign: 'right', fontSize: '10px', color: '#64748b',
                marginTop: '4px', display: 'flex', justifyContent: 'flex-end',
                alignItems: 'center', gap: '3px',
            }}>
                {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                <svg width="12" height="8" viewBox="0 0 16 11" fill="none">
                    <path d="M11.5 0.5L5.5 8.5L3.5 6" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14.5 0.5L8.5 8.5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
            </div>
        </div>
    </div>
);

export default TelegramPreview;
