import React, { useState, useEffect } from 'react';
import { Search, ArrowUp, ArrowDown, Eye, MessageCircle, Share2, Calendar } from 'lucide-react';

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
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                        <thead style={{ background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--glass-border)' }}>
                            <tr>
                                <th style={thStyle} onClick={() => handleSort('date')}>
                                    <div style={thContentStyle}><Calendar size={14} /> Дата {renderSortIcon('date')}</div>
                                </th>
                                <th style={{ ...thStyle, width: '50%' }}>Текст</th>
                                <th style={thStyle} onClick={() => handleSort('reactions')}>
                                    <div style={thContentStyle}><MessageCircle size={14} /> Реакции {renderSortIcon('reactions')}</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Загрузка...
                                    </td>
                                </tr>
                            ) : posts.length === 0 ? (
                                <tr>
                                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        Постов не найдено
                                    </td>
                                </tr>
                            ) : (
                                posts.map(post => (
                                    <tr key={post.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={tdStyle}>{post.date}</td>
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
                                        <td style={tdStyle}><span style={{ color: '#818cf8' }}>{post.reactions}</span></td>
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
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Reactions: {previewPost.reactions}
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
