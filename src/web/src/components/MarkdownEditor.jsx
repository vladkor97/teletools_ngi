import React, { useState, useEffect } from 'react';
import TelegramPreview from './TelegramPreview';
import { Send, Check, AlertCircle } from 'lucide-react';

const MarkdownEditor = () => {
    const [markdown, setMarkdown] = useState('');
    const [html, setHtml] = useState('');
    const [username, setUsername] = useState(() => localStorage.getItem('tg_username') || '');
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);

    useEffect(() => {
        if (!markdown) { setHtml(''); return; }
        const timer = setTimeout(async () => {
            try {
                const r = await fetch('/api/format', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: markdown }),
                });
                const data = await r.json();
                setHtml(data.html);
            } catch { }
        }, 300);
        return () => clearTimeout(timer);
    }, [markdown]);

    const sendToTelegram = async () => {
        if (!html || !username) return;
        setIsSending(true);
        setSendResult(null);
        try {
            const r = await fetch('/api/send-telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, html }),
            });
            const data = await r.json();
            if (r.ok && data.ok) {
                setSendResult({ type: 'success', text: 'Отправлено в Telegram!' });
                localStorage.setItem('tg_username', username);
            } else {
                setSendResult({ type: 'error', text: data.error || data.detail || 'Ошибка' });
            }
        } catch (err) {
            setSendResult({ type: 'error', text: err.message });
        } finally {
            setIsSending(false);
            setTimeout(() => setSendResult(null), 5000);
        }
    };

    return (
        <div className="editor-layout">
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700' }}>
                    <span className="glow-text">Markdown</span>
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    Сюда можно вставить результат из AI Studio (Markdown), чтобы отформатировать его для Telegram.
                    Проверьте предпросмотр справа и отправьте себе в бот.
                </p>
                <textarea
                    placeholder={"Вставьте текст...\n\n**Жирный**\n*Курсив*\n[Ссылка](https://example.com)\n\n1. Нумерованный\n• Маркированный"}
                    value={markdown}
                    onChange={(e) => setMarkdown(e.target.value)}
                />
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700' }}>
                    <span className="glow-text">Предпросмотр</span>
                </h3>

                <div style={{ flex: 1, background: '#0e1621', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <TelegramPreview html={html} />
                </div>

                <div style={{
                    display: 'flex', gap: '0.4rem', alignItems: 'center',
                    background: 'rgba(0,0,0,0.15)', padding: '0.6rem',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
                }}>
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                        placeholder="@username" className="input" style={{ flex: 1 }} />
                    <button className="btn" onClick={sendToTelegram}
                        disabled={!html || !username || isSending}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.83rem', display: 'flex', gap: '0.4rem', alignItems: 'center', width: 'auto', whiteSpace: 'nowrap' }}>
                        <Send size={13} />
                        {isSending ? 'Отправка...' : 'В Telegram'}
                    </button>
                </div>

                {sendResult && (
                    <div className={`alert ${sendResult.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                        {sendResult.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                        {sendResult.text}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarkdownEditor;
