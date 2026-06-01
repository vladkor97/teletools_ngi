import React, { useState, useEffect } from 'react';
import { Search, PenTool, Check, AlertCircle, Sparkles, MessageSquare, Copy, Eye, ArrowUp, ArrowDown, Settings, RefreshCw, Send, Share2 } from 'lucide-react';
import TelegramPreview from './TelegramPreview';

const AuthorToolkit = () => {
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [posts, setPosts] = useState([]);
    const [selectedPosts, setSelectedPosts] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [instruction, setInstruction] = useState('Проанализируй эти посты и предложи 3 темы для новых публикаций в том же стиле.');
    const [generatedContent, setGeneratedContent] = useState('');
    const [resultHtml, setResultHtml] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    // Sorting
    const [sortBy, setSortBy] = useState('date'); // date | reactions
    const [order, setOrder] = useState('desc'); // asc | desc

    // Settings
    const [models, setModels] = useState([
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
    ]);
    const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('gemini_model') || 'gemini-2.0-flash');
    const [temperature, setTemperature] = useState(0.7);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Telegram Sending
    const [username, setUsername] = useState(() => localStorage.getItem('telegram_username') || '');
    const [isSending, setIsSending] = useState(false);
    const [sendStatus, setSendStatus] = useState(null); // { ok: bool, msg: str }

    // Preview Modal
    const [previewPost, setPreviewPost] = useState(null);

    // Pagination for selection list
    const [page, setPage] = useState(1);
    const limit = 50;
    const [total, setTotal] = useState(0);

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

    useEffect(() => {
        localStorage.setItem('telegram_username', username);
    }, [username]);

    // Format content when generatedContent changes
    useEffect(() => {
        if (!generatedContent) { setResultHtml(''); return; }
        const timer = setTimeout(async () => {
            try {
                const resp = await fetch('/api/format', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: generatedContent }),
                });
                const data = await resp.json();
                setResultHtml(data.html);
            } catch { }
        }, 200);
        return () => clearTimeout(timer);
    }, [generatedContent]);

    const fetchModels = async () => {
        setIsLoadingModels(true);
        try {
            const r = await fetch('/api/gemini-models');
            const data = await r.json();
            if (data.ok && data.models?.length) {
                setModels(data.models);
            }
        } catch (e) { }
        setIsLoadingModels(false);
    };

    useEffect(() => {
        if (!selectedChannel) return;
        fetchPosts();
    }, [selectedChannel, page, sortBy, order]);

    const fetchPosts = async () => {
        setLoading(true);
        try {
            const offset = (page - 1) * limit;
            const query = new URLSearchParams({
                channel_name: selectedChannel,
                sort_by: sortBy,
                order: order,
                limit: limit,
                offset: offset,
            });
            if (search) query.append('search', search);

            const r = await fetch(`/api/posts?${query.toString()}`);
            const data = await r.json();
            setPosts(data.posts || []);
            setTotal(data.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        if (e.key === 'Enter') {
            setPage(1);
            fetchPosts();
        }
    };

    const togglePost = (id) => {
        const newSet = new Set(selectedPosts);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedPosts(newSet);
    };

    const openPreview = (e, post) => {
        e.stopPropagation();
        setPreviewPost(post);
    };

    const handleGenerate = async () => {
        if (selectedPosts.size === 0) {
            setError('Выберите хотя бы один пост для контекста');
            return;
        }
        if (!instruction) {
            setError('Введите инструкцию');
            return;
        }

        setIsGenerating(true);
        setError('');
        setGeneratedContent('');
        setSendStatus(null);

        // Save model preference
        localStorage.setItem('gemini_model', selectedModel);

        try {
            const resp = await fetch('/api/toolkit/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel_name: selectedChannel,
                    selected_post_ids: Array.from(selectedPosts),
                    instruction: instruction,
                    model: selectedModel,
                    temperature: temperature
                }),
            });
            const data = await resp.json();
            if (data.ok) {
                setGeneratedContent(data.content);
            } else {
                setError(data.error || 'Ошибка генерации');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const sendToTelegram = async () => {
        if (!username || !resultHtml) return;
        setIsSending(true);
        setSendStatus(null);
        try {
            const resp = await fetch('/api/send-telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username.replace('@', ''),
                    html: resultHtml
                }),
            });
            const data = await resp.json();
            if (data.ok) {
                setSendStatus({ ok: true, msg: 'Отправлено!' });
            } else {
                setSendStatus({ ok: false, msg: data.error || data.detail || 'Ошибка' });
            }
        } catch (e) {
            setSendStatus({ ok: false, msg: e.message });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 140px)', position: 'relative' }}>
            {/* Left: Selection */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '350px' }}>
                <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 className="text-secondary" style={{ fontSize: '0.95rem' }}>1. Выберите посты (контекст)</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--accent-purple)' }}>Выбрано: {selectedPosts.size}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <select value={selectedChannel} onChange={e => { setSelectedChannel(e.target.value); setPage(1); }}
                            className="input" style={{ width: '120px', appearance: 'auto' }}>
                            {channels.map(ch => <option key={ch} value={ch}>@{ch}</option>)}
                        </select>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            onKeyDown={handleSearch} className="input" placeholder="Поиск..."
                            style={{ flex: 1, minWidth: '100px' }} />
                        <button className="btn" onClick={() => { setPage(1); fetchPosts(); }} style={{ padding: '0.5rem' }}>
                            <Search size={14} />
                        </button>
                    </div>

                    {/* Sorting Controls */}
                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', alignItems: 'center', color: 'var(--text-secondary)' }}>
                        <span>Сортировать:</span>
                        <button className={`btn-ghost ${sortBy === 'date' ? 'active-sort' : ''}`}
                            onClick={() => { setSortBy('date'); setPage(1); }}
                            style={{ padding: '0.2rem 0.5rem', opacity: sortBy === 'date' ? 1 : 0.6 }}>
                            Дата
                        </button>
                        <button className={`btn-ghost ${sortBy === 'reactions' ? 'active-sort' : ''}`}
                            onClick={() => { setSortBy('reactions'); setPage(1); }}
                            style={{ padding: '0.2rem 0.5rem', opacity: sortBy === 'reactions' ? 1 : 0.6 }}>
                            Реакции
                        </button>
                        <button className={`btn-ghost ${sortBy === 'views' ? 'active-sort' : ''}`}
                            onClick={() => { setSortBy('views'); setPage(1); }}
                            style={{ padding: '0.2rem 0.5rem', opacity: sortBy === 'views' ? 1 : 0.6 }}>
                            Просмотры
                        </button>
                        <button className={`btn-ghost ${sortBy === 'forwards' ? 'active-sort' : ''}`}
                            onClick={() => { setSortBy('forwards'); setPage(1); }}
                            style={{ padding: '0.2rem 0.5rem', opacity: sortBy === 'forwards' ? 1 : 0.6 }}>
                            Пересылки
                        </button>
                        <button className="btn-ghost" onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
                            style={{ padding: '0.2rem 0.5rem' }}>
                            {order === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        </button>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
                        {loading ? (
                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Загрузка...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {posts.map(post => (
                                    <div key={post.id} onClick={() => togglePost(post.id)}
                                        style={{
                                            padding: '0.75rem',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            cursor: 'pointer',
                                            background: selectedPosts.has(post.id) ? 'rgba(129,140,248,0.1)' : 'transparent',
                                            display: 'flex', gap: '0.75rem',
                                            position: 'relative'
                                        }}>
                                        <div style={{
                                            width: '16px', height: '16px',
                                            borderRadius: '4px',
                                            border: selectedPosts.has(post.id) ? 'none' : '1px solid var(--text-muted)',
                                            background: selectedPosts.has(post.id) ? 'var(--accent-purple)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, marginTop: '2px'
                                        }}>
                                            {selectedPosts.has(post.id) && <Check size={12} color="white" />}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', flex: 1 }}>
                                            <div style={{ color: 'var(--text-primary)', marginBottom: '0.2rem', fontWeight: '500', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{post.date}</span>
                                                <button onClick={(e) => openPreview(e, post)} className="btn-ghost"
                                                    style={{ padding: '0 0.3rem', height: 'auto', color: 'var(--accent-cyan)' }}
                                                    title="Прочитать пост">
                                                    <Eye size={12} />
                                                </button>
                                            </div>
                                            <div style={{
                                                color: 'var(--text-secondary)',
                                                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                                            }}>
                                                {post.text}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'flex', gap: '0.75rem' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <Eye size={11} /> {post.views || 0}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <Share2 size={11} /> {post.forwards || 0}
                                                </span>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <span style={{ fontSize: '0.7rem' }}>❤️</span> {post.reactions || 0}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right: Generation */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <h3 className="text-secondary" style={{ fontSize: '0.95rem' }}>2. Настройки и Инструкция</h3>

                    {/* Settings Row */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <label className="label" style={{ marginBottom: '0.25rem', fontSize: '0.75rem' }}>Модель</label>
                            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                                className="input" style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', appearance: 'auto' }}>
                                {models.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <label className="label" style={{ marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                                Температура: {temperature}
                            </label>
                            <input type="range" min="0" max="1" step="0.1"
                                value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))}
                                style={{ width: '100%', accentColor: 'var(--accent-purple)' }} />
                        </div>
                    </div>

                    <textarea
                        className="input"
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                        placeholder="Опишите задачу: например, придумай 5 тем для постов или напиши дайджест за неделю..."
                        style={{ minHeight: '80px', resize: 'vertical' }}
                    />

                    <button className="btn" onClick={handleGenerate} disabled={isGenerating || selectedPosts.size === 0}
                        style={{ width: '100%', padding: '0.8rem', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {isGenerating ? <><Sparkles size={16} className="spin" /> Генерирую...</> : <><PenTool size={16} /> Сгенерировать</>}
                    </button>

                    {error && (
                        <div className="alert alert-error">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>

                {generatedContent && (
                    <div className="card" style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <h3 className="text-secondary" style={{ fontSize: '0.95rem' }}>3. Результат</h3>
                            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(generatedContent)}
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                                <Copy size={12} /> Копировать
                            </button>
                        </div>

                        {/* Wrapper for TelegramPreview */}
                        <div style={{ flex: 1, overflowY: 'auto', background: '#0e1621', borderRadius: 'var(--radius-md)', padding: '0.5rem', marginBottom: '1rem' }}>
                            {resultHtml ? (
                                <TelegramPreview html={resultHtml} />
                            ) : (
                                <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Форматирование...</div>
                            )}
                        </div>

                        {/* Telegram Send Control */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="@username для отправки"
                                className="input"
                                style={{ flex: 1 }}
                            />
                            <button className="btn" onClick={sendToTelegram} disabled={isSending || !username || !resultHtml}
                                style={{ padding: '0.6rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                {isSending ? '...' : <><Send size={16} /> Отправить</>}
                            </button>
                        </div>
                        {sendStatus && (
                            <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: sendStatus.ok ? 'var(--accent-green)' : 'var(--error)' }}>
                                {sendStatus.msg}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Post Preview Modal */}
            {previewPost && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
                }} onClick={() => setPreviewPost(null)}>
                    <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1rem' }}>Пост от {previewPost.date}</h3>
                            <button className="btn-ghost" onClick={() => setPreviewPost(null)}>✕</button>
                        </div>
                        <div style={{ padding: '1.5rem', overflowY: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                            {previewPost.text}
                        </div>
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Reactions: {previewPost.reactions}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuthorToolkit;
