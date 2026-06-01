import React, { useState, useEffect } from 'react';
import { Search, ArrowUp, ArrowDown, Eye, MessageCircle, Share2, Calendar, Bot, RefreshCw, Download, ArrowDownCircle, FileText, Copy, Check } from 'lucide-react';

const ViewPosts = () => {
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [posts, setPosts] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('date');
    const [order, setOrder] = useState('desc');
    const [page, setPage] = useState(1);
    const limit = 20;
    const [previewPost, setPreviewPost] = useState(null);
    const [botStatus, setBotStatus] = useState(null);
    const [checkingBot, setCheckingBot] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [fetchingNew, setFetchingNew] = useState(false);

    // Состояния для просмотра JSON
    const [showJsonModal, setShowJsonModal] = useState(false);
    const [jsonLimit, setJsonLimit] = useState(20);
    const [jsonContent, setJsonContent] = useState('');
    const [loadingJson, setLoadingJson] = useState(false);
    const [jsonCopied, setJsonCopied] = useState(false);

    // Подгрузка JSON-контента при открытии модального окна или смене лимита/поиска
    useEffect(() => {
        if (!showJsonModal || !selectedChannel) return;

        const fetchJsonData = async () => {
            setLoadingJson(true);
            try {
                const query = new URLSearchParams({
                    channel_name: selectedChannel,
                    sort_by: sortBy,
                    order: order,
                    limit: jsonLimit === 'all' ? 5000 : jsonLimit,
                    offset: 0,
                });
                if (search) query.append('search', search);

                const r = await fetch(`/api/posts?${query.toString()}`);
                const data = await r.json();
                setJsonContent(JSON.stringify(data.posts || [], null, 2));
            } catch (e) {
                setJsonContent(`Ошибка загрузки JSON: ${e.message}`);
            } finally {
                setLoadingJson(false);
            }
        };

        fetchJsonData();
    }, [showJsonModal, selectedChannel, jsonLimit, search, sortBy, order]);

    const handleCopyJson = () => {
        navigator.clipboard.writeText(jsonContent);
        setJsonCopied(true);
        setTimeout(() => setJsonCopied(false), 2000);
    };

    useEffect(() => {
        fetch('/api/channels')
            .then(r => r.json())
            .then(data => {
                setChannels(data.channels || []);
                if (data.channels?.length > 0 && !selectedChannel) setSelectedChannel(data.channels[0]);
            })
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (!selectedChannel) return;
        fetchPosts();
    }, [selectedChannel, page, sortBy, order]);

    // Проверяем статус бота при смене канала
    useEffect(() => {
        if (!selectedChannel) return;
        checkBotStatus();
    }, [selectedChannel]);

    const checkBotStatus = async () => {
        setCheckingBot(true);
        try {
            const r = await fetch(`/api/bot-status?channel=${selectedChannel}`);
            const data = await r.json();
            setBotStatus(data);
        } catch { setBotStatus(null); }
        finally { setCheckingBot(false); }
    };

    const syncStats = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const r = await fetch('/api/sync/stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_name: selectedChannel }),
            });
            const data = await r.json();
            setSyncResult(data);
            if (data.ok) fetchPosts();
        } catch (e) {
            setSyncResult({ ok: false, error: e.message });
        } finally { setSyncing(false); }
    };

    const fetchNewPostsData = async () => {
        setFetchingNew(true);
        setSyncResult(null);
        try {
            const r = await fetch('/api/sync/fetch-new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel_name: selectedChannel }),
            });
            const data = await r.json();
            setSyncResult(data);
            if (data.ok) fetchPosts();
        } catch (e) {
            setSyncResult({ ok: false, error: e.message });
        } finally { setFetchingNew(false); }
    };

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

    const handleSort = (field) => {
        if (sortBy === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setOrder('desc');
        }
        setPage(1);
    };

    const renderSortIcon = (field) => {
        if (sortBy !== field) return <span style={{ width: 14 }}></span>;
        return order === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <label className="label" style={{ marginBottom: '0.35rem' }}>Канал</label>
                        <select value={selectedChannel} onChange={e => { setSelectedChannel(e.target.value); setPage(1); }}
                            className="input" style={{ width: '100%', appearance: 'auto' }}>
                            {channels.map(ch => <option key={ch} value={ch}>@{ch}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 2, minWidth: '300px' }}>
                        <label className="label" style={{ marginBottom: '0.35rem' }}>Поиск по тексту</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                onKeyDown={handleSearch} className="input" placeholder="Введите текст и нажмите Enter..."
                                style={{ flex: 1 }} />
                            <button className="btn" onClick={() => { setPage(1); fetchPosts(); }}
                                style={{ padding: '0.55rem 1rem', width: 'auto' }}>
                                <Search size={16} />
                            </button>
                            <button className="btn-ghost" onClick={() => setShowJsonModal(true)}
                                style={{ padding: '0.55rem 1rem', width: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <FileText size={16} />
                                JSON
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Статус бота */}
            {botStatus && (
                <>
                <div style={{
                    display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap',
                    padding: '0.6rem 1rem', background: botStatus.is_admin ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                    borderRadius: 'var(--radius-sm)', border: `1px solid ${botStatus.is_admin ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Bot size={14} style={{ color: botStatus.is_admin ? 'var(--accent-green)' : 'var(--text-muted)' }} />
                        <span style={{ fontSize: '0.78rem', color: botStatus.is_admin ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                            {botStatus.is_admin
                                ? `@${botStatus.bot_username} — админ`
                                : botStatus.bot_username
                                    ? `@${botStatus.bot_username} — не админ`
                                    : 'Бот не настроен'
                            }
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: botStatus.polling ? '#22c55e' : '#ef4444',
                        }} />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {botStatus.polling ? 'Polling активен' : 'Polling выключен'}
                        </span>
                    </div>
                    {!botStatus.is_admin && botStatus.bot_username && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                            Добавьте @{botStatus.bot_username} админом для live-статистики
                        </span>
                    )}
                    <button className="btn-ghost" onClick={checkBotStatus} disabled={checkingBot}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <RefreshCw size={11} className={checkingBot ? 'spin' : ''} />
                    </button>
                    {botStatus.is_admin && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-ghost" onClick={fetchNewPostsData} disabled={fetchingNew || syncing}
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <ArrowDownCircle size={12} className={fetchingNew ? 'spin' : ''} />
                                {fetchingNew ? 'Загрузка...' : 'Загрузить новые'}
                            </button>
                            <button className="btn" onClick={syncStats} disabled={syncing || fetchingNew}
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Download size={12} className={syncing ? 'spin' : ''} />
                                {syncing ? 'Синхронизация...' : 'Обновить стату'}
                            </button>
                        </div>
                    )}
                </div>
                {syncResult && (
                    <div style={{
                        padding: '0.4rem 1rem', fontSize: '0.75rem',
                        color: syncResult.ok ? 'var(--accent-green)' : 'var(--error)',
                        background: syncResult.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                        borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                        marginTop: '-0.25rem',
                    }}>
                        {syncResult.ok
                            ? `✅ Операция успешна: ${syncResult.updated} постов обработано (всего: ${syncResult.total})`
                            : `❌ ${syncResult.error}`
                        }
                    </div>
                )}
                </>
            )}

            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                {/* Подсказка если views пустые */}
                {posts.length > 0 && posts.every(p => !p.views) && (
                    <div style={{
                        padding: '0.6rem 1rem', background: 'rgba(129,140,248,0.06)',
                        borderBottom: '1px solid var(--glass-border)', fontSize: '0.78rem',
                        color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    }}>
                        <Eye size={13} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                        <span>Просмотры и пересылки недоступны при импорте через HTML. Добавьте бота админом в канал для живой статистики.</span>
                    </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)' }}>
                            <tr>
                                <th style={thStyle} onClick={() => handleSort('date')}>
                                    <div style={thContentStyle}><Calendar size={14} /> Дата {renderSortIcon('date')}</div>
                                </th>
                                <th style={{ ...thStyle, width: '40%' }}>Текст</th>
                                <th style={thStyle} onClick={() => handleSort('views')}>
                                    <div style={thContentStyle}><Eye size={14} /> 👁 {renderSortIcon('views')}</div>
                                </th>
                                <th style={thStyle} onClick={() => handleSort('reactions')}>
                                    <div style={thContentStyle}><MessageCircle size={14} /> ❤️ {renderSortIcon('reactions')}</div>
                                </th>
                                <th style={thStyle} onClick={() => handleSort('forwards')}>
                                    <div style={thContentStyle}><Share2 size={14} /> ↗️ {renderSortIcon('forwards')}</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Загрузка...
                                    </td>
                                </tr>
                            ) : posts.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Постов не найдено
                                    </td>
                                </tr>
                            ) : (
                                posts.map(post => (
                                    <tr key={post.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={tdStyle}>{post.date?.split(' ')[0]}</td>
                                        <td style={tdStyle}>
                                            <div style={{
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                                color: 'var(--text-secondary)',
                                                marginBottom: '0.25rem'
                                            }}>
                                                {post.text || <em style={{ opacity: 0.5 }}>Нет текста</em>}
                                            </div>
                                            <button onClick={() => setPreviewPost(post)} className="btn-ghost"
                                                style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem', color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Eye size={12} /> Читать
                                            </button>
                                        </td>
                                        <td style={tdStyle}><span style={{ color: post.views ? 'var(--text-muted)' : 'rgba(255,255,255,0.15)' }}>{post.views || '—'}</span></td>
                                        <td style={tdStyle}><span style={{ color: '#818cf8' }}>{post.reactions || 0}</span></td>
                                        <td style={tdStyle}><span style={{ color: post.forwards ? 'var(--text-muted)' : 'rgba(255,255,255,0.15)' }}>{post.forwards || '—'}</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Всего: {total} | Страница {page} из {Math.ceil(total / limit) || 1}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn-ghost" disabled={page === 1} onClick={() => setPage(page - 1)}
                            style={{ padding: '0.4rem 0.8rem', opacity: page === 1 ? 0.5 : 1 }}>
                            Назад
                        </button>
                        <button className="btn-ghost" disabled={page * limit >= total} onClick={() => setPage(page + 1)}
                            style={{ padding: '0.4rem 0.8rem', opacity: page * limit >= total ? 0.5 : 1 }}>
                            Вперед
                        </button>
                    </div>
                </div>
            </div>

            {/* JSON Modal */}
            {showJsonModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
                }} onClick={() => setShowJsonModal(false)}>
                    <div className="card" style={{ maxWidth: '800px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={16} style={{ color: 'var(--accent-cyan)' }} />
                                Экспорт постов в JSON — @{selectedChannel}
                            </h3>
                            <button className="btn-ghost" onClick={() => setShowJsonModal(false)}>✕</button>
                        </div>
                        
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Показать постов:</span>
                                <select value={jsonLimit} onChange={e => setJsonLimit(e.target.value)}
                                    className="input" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', width: 'auto', appearance: 'auto' }}>
                                    <option value={20}>Последние 20</option>
                                    <option value={50}>Последние 50</option>
                                    <option value={100}>Последние 100</option>
                                    <option value={500}>Последние 500</option>
                                    <option value="all">Все посты (до 5000)</option>
                                </select>
                            </div>
                            
                            {search && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                    Поиск: "{search}"
                                </span>
                            )}
                            
                            <button className="btn" onClick={handleCopyJson} disabled={loadingJson}
                                style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto', width: 'auto' }}>
                                {jsonCopied ? <Check size={13} /> : <Copy size={13} />}
                                {jsonCopied ? 'Скопировано!' : 'Скопировать все'}
                            </button>
                        </div>

                        <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {loadingJson ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    Загрузка JSON...
                                </div>
                            ) : (
                                <textarea
                                    readOnly
                                    value={jsonContent}
                                    style={{
                                        flex: 1,
                                        width: '100%',
                                        minHeight: '40vh',
                                        background: 'rgba(0, 0, 0, 0.3)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: '#7dd3fc',
                                        fontFamily: "'JetBrains Mono', monospace",
                                        fontSize: '0.78rem',
                                        padding: '1rem',
                                        resize: 'none',
                                        outline: 'none',
                                        whiteSpace: 'pre',
                                        overflow: 'auto',
                                    }}
                                    onClick={e => e.target.select()}
                                />
                            )}
                        </div>
                        
                        <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'right' }}>
                            Нажмите в любом месте текстового поля, чтобы выделить весь JSON.
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
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
                        <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', gap: '1.5rem' }}>
                            <span>👁 {previewPost.views || 0}</span>
                            <span>❤️ {previewPost.reactions || 0}</span>
                            <span>↗️ {previewPost.forwards || 0}</span>
                            <a href={previewPost.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', marginLeft: 'auto' }}>Открыть в Telegram</a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const thStyle = {
    padding: '1rem',
    cursor: 'pointer',
    userSelect: 'none',
    color: 'var(--text-primary)',
    fontWeight: '600'
};

const thContentStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
};

const tdStyle = {
    padding: '0.8rem 1rem',
    color: 'var(--text-muted)',
    fontSize: '0.85rem'
};

export default ViewPosts;
