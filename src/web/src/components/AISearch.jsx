import React, { useState, useEffect } from 'react';
import TelegramPreview from './TelegramPreview';
import { Search, Send, Check, AlertCircle, Clock, Trash2, Settings, ChevronDown, RefreshCw, Zap } from 'lucide-react';

const AISearch = () => {
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [postsJson, setPostsJson] = useState('');
    const [question, setQuestion] = useState('');
    const [resultMarkdown, setResultMarkdown] = useState('');
    const [resultHtml, setResultHtml] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState('');

    // Модели
    const FALLBACK_MODELS = [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
    ];
    const [models, setModels] = useState(FALLBACK_MODELS);
    const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('gemini_model') || 'gemini-2.0-flash');
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelsError, setModelsError] = useState('');
    const [showSettings, setShowSettings] = useState(false);

    // История
    const [history, setHistory] = useState(() => {
        try { return JSON.parse(localStorage.getItem('ai_search_history') || '[]'); }
        catch { return []; }
    });

    // Telegram
    const [username, setUsername] = useState(() => localStorage.getItem('tg_username') || '');
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);

    useEffect(() => {
        fetch('/api/channels')
            .then(r => r.json())
            .then(data => {
                setChannels(data.channels || []);
                if (data.channels?.length > 0 && !selectedChannel) setSelectedChannel(data.channels[0]);
            })
            .catch(() => { });
        fetchModels();
    }, []);

    const fetchModels = async () => {
        setIsLoadingModels(true);
        setModelsError('');
        try {
            const r = await fetch('/api/gemini-models');
            const data = await r.json();
            if (data.ok && data.models?.length) {
                setModels(data.models);
            } else if (data.error) {
                setModelsError(data.error);
            }
        } catch (e) {
            setModelsError('Не удалось загрузить модели');
        }
        setIsLoadingModels(false);
    };

    useEffect(() => {
        if (!selectedChannel) return;
        fetch(`/api/channel-posts/${selectedChannel}`)
            .then(r => r.json())
            .then(data => setPostsJson(JSON.stringify(data, null, 0)))
            .catch(() => setPostsJson(''));
    }, [selectedChannel]);

    useEffect(() => {
        if (!resultMarkdown) { setResultHtml(''); return; }
        const timer = setTimeout(async () => {
            try {
                const resp = await fetch('/api/format', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: resultMarkdown }),
                });
                const data = await resp.json();
                setResultHtml(data.html);
            } catch { }
        }, 200);
        return () => clearTimeout(timer);
    }, [resultMarkdown]);

    const saveHistory = (items) => {
        setHistory(items);
        localStorage.setItem('ai_search_history', JSON.stringify(items));
    };

    const handleSearch = async () => {
        if (!question || !postsJson) return;
        setIsSearching(true);
        setError('');
        setResultMarkdown('');

        try {
            const resp = await fetch('/api/ai-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, posts_json: postsJson, model: selectedModel }),
            });
            const data = await resp.json();
            if (data.ok) {
                setResultMarkdown(data.markdown);
                localStorage.setItem('gemini_model', selectedModel);
                const entry = {
                    id: Date.now(), channel: selectedChannel,
                    question, markdown: data.markdown,
                    date: new Date().toLocaleString('ru-RU'),
                };
                saveHistory([entry, ...history].slice(0, 50));
            } else {
                setError(data.error || 'Ошибка');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsSearching(false);
        }
    };

    const loadFromHistory = (entry) => {
        setSelectedChannel(entry.channel);
        setQuestion(entry.question);
        setResultMarkdown(entry.markdown);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch(); }
    };

    const sendToTelegram = async (html) => {
        if (!html || !username) return;
        setIsSending(true);
        setSendResult(null);
        try {
            const resp = await fetch('/api/send-telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, html }),
            });
            const data = await resp.json();
            if (resp.ok && data.ok) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Настройки */}
            {/* Настройки */}
            <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                    <Settings size={14} style={{ display: 'inline', marginRight: '0.5rem' }} />
                    Настройки поиска
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                    {/* Модель */}
                    <div>
                        <label className="label" style={{ marginBottom: '0.35rem' }}>Модель Gemini</label>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                                className="input" style={{ flex: 1, appearance: 'auto' }}>
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                            <button onClick={fetchModels} disabled={isLoadingModels}
                                className="btn-ghost" style={{
                                    background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.18)',
                                    color: 'var(--accent-purple)', borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer', padding: '0.5rem 0.6rem', display: 'flex', alignItems: 'center',
                                }}
                                title="Загрузить актуальный список моделей из Google API"
                            >
                                <RefreshCw size={13} style={{
                                    animation: isLoadingModels ? 'spin 1s linear infinite' : 'none',
                                }} />
                            </button>
                        </div>
                        {modelsError && (
                            <p style={{ fontSize: '0.72rem', color: 'var(--error)', marginTop: '0.3rem' }}>
                                {modelsError}
                            </p>
                        )}
                    </div>

                    {/* Telegram */}
                    <div>
                        <label className="label" style={{ marginBottom: '0.35rem' }}>Получатель в Telegram</label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                            placeholder="@username" className="input" style={{ width: '100%' }} />
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Для отправки результатов ботом. Напишите ему /start.
                        </p>
                    </div>
                </div>
            </div>

            {/* Поиск */}
            <div className="card" style={{ padding: '1.5rem' }}>
                {channels.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div>
                            <label className="label" style={{ marginBottom: '0.35rem' }}>Канал</label>
                            <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}
                                className="input" style={{ width: '100%', appearance: 'auto' }}>
                                {channels.map(ch => <option key={ch} value={ch}>@{ch}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label" style={{ marginBottom: '0.35rem' }}>Ваш вопрос</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
                                    onKeyDown={handleKeyDown} className="input"
                                    placeholder="Какие инструменты автор рекомендует для..."
                                    style={{ flex: 1 }} />
                                <button className="btn" onClick={handleSearch}
                                    disabled={!question || !postsJson || isSearching}
                                    style={{ padding: '0.55rem 1.2rem', fontSize: '0.83rem', display: 'flex', gap: '0.4rem', alignItems: 'center', width: 'auto', whiteSpace: 'nowrap' }}>
                                    {isSearching ? (
                                        <><Zap size={13} style={{ animation: 'pulse 1s infinite' }} /> Поиск...</>
                                    ) : (
                                        <><Search size={13} /> Найти</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.83rem', textAlign: 'center', padding: '1.5rem 0' }}>
                        Сначала распарсьте канал на вкладке «Парсер»
                    </p>
                )}

                {error && (
                    <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
                        <AlertCircle size={14} /> {error}
                    </div>
                )}
            </div>

            {/* Результат */}
            {resultHtml && (
                <div className="card" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '700' }}>
                        <span className="glow-text">Результат</span>
                    </h3>
                    <div style={{ background: '#0e1621', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '1rem' }}>
                        <TelegramPreview html={resultHtml} />
                    </div>

                    <div style={{
                        display: 'flex', gap: '0.4rem', alignItems: 'center',
                        background: 'rgba(0,0,0,0.15)', padding: '0.6rem',
                        borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
                    }}>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                            placeholder="@username" className="input" style={{ flex: 1 }} />
                        <button className="btn" onClick={() => sendToTelegram(resultHtml)}
                            disabled={!resultHtml || !username || isSending}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.83rem', display: 'flex', gap: '0.4rem', alignItems: 'center', width: 'auto', whiteSpace: 'nowrap' }}>
                            <Send size={13} />
                            {isSending ? 'Отправка...' : 'В Telegram'}
                        </button>
                    </div>

                    {sendResult && (
                        <div className={`alert ${sendResult.type === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '0.5rem' }}>
                            {sendResult.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                            {sendResult.text}
                        </div>
                    )}
                </div>
            )}

            {/* История */}
            {history.length > 0 && (
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                            <Clock size={16} /> История
                        </h3>
                        <button onClick={() => saveHistory([])}
                            style={{
                                background: 'var(--error-bg)', border: '1px solid var(--error-border)',
                                color: 'var(--error)', padding: '0.25rem 0.55rem', borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem',
                            }}>
                            <Trash2 size={11} /> Очистить
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '240px', overflowY: 'auto' }}>
                        {history.map(entry => (
                            <div key={entry.id} onClick={() => loadFromHistory(entry)}
                                style={{
                                    padding: '0.55rem 0.75rem', background: 'rgba(0,0,0,0.15)',
                                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'rgba(129,140,248,0.25)';
                                    e.currentTarget.style.background = 'rgba(129,140,248,0.04)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                                    e.currentTarget.style.background = 'rgba(0,0,0,0.15)';
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{entry.question}</span>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: '0.75rem' }}>
                                        @{entry.channel} · {entry.date}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AISearch;
