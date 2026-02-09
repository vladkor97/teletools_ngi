import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle, Download, AlertCircle, Database } from 'lucide-react';

const FileUpload = () => {
    const [file, setFile] = useState(null);
    const [channelLink, setChannelLink] = useState('https://t.me/channel');
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [parseResult, setParseResult] = useState(null);
    const [channelName, setChannelName] = useState(null);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);
    const [channels, setChannels] = useState([]);

    useEffect(() => {
        fetch('/api/channels')
            .then(r => r.json())
            .then(data => setChannels(data.channels || []))
            .catch(() => {});
    }, [parseResult]);

    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);

    const handleDrop = (e) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files[0]) validateAndSetFile(e.dataTransfer.files[0]);
    };

    const handleFileInput = (e) => {
        if (e.target.files[0]) validateAndSetFile(e.target.files[0]);
    };

    const validateAndSetFile = (f) => {
        if (f.name === 'messages.html') { setFile(f); setError(null); setParseResult(null); }
        else setError('Пожалуйста, загрузите именно «messages.html».');
    };

    const handleUpload = async () => {
        if (!file) return;
        setIsUploading(true); setError(null);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('channel_link', channelLink);
        try {
            const r = await fetch('/api/parse', { method: 'POST', body: formData });
            if (!r.ok) throw new Error('Ошибка парсинга');
            const data = await r.json();
            setParseResult(data);
            setChannelName(data.channel_name || null);
        } catch (err) { setError(err.message); }
        finally { setIsUploading(false); }
    };

    const handleDownload = (ch) => {
        const name = ch || channelName;
        const q = name ? `?channel=${encodeURIComponent(name)}` : '';
        window.location.href = `/api/posts/download${q}`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '620px', margin: '0 auto' }}>
            <div className="card">
                <h2 style={{ textAlign: 'center', marginBottom: '1.75rem', fontSize: '1.3rem', fontWeight: '800' }}>
                    <span className="glow-text">Загрузка экспорта</span>
                </h2>

                <div style={{ marginBottom: '1.25rem' }}>
                    <label className="label">Ссылка на канал</label>
                    <input type="text" value={channelLink} onChange={(e) => setChannelLink(e.target.value)}
                        placeholder="https://t.me/yourchannel" className="input" style={{ width: '100%' }} />
                </div>

                <div className={`upload-zone ${isDragging ? 'active' : ''}`}
                    onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                    onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                    <input type="file" ref={fileInputRef} onChange={handleFileInput}
                        style={{ display: 'none' }} accept=".html" />
                    {file ? (
                        <div>
                            <FileText size={40} className="upload-icon" style={{ color: 'var(--accent-purple)' }} />
                            <p style={{ fontSize: '1.1rem', fontWeight: '700', marginTop: '0.5rem' }}>{file.name}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Готов к загрузке</p>
                        </div>
                    ) : (
                        <div>
                            <Upload size={40} className="upload-icon" />
                            <p style={{ fontSize: '1.1rem', fontWeight: '700', marginTop: '0.5rem' }}>
                                Перетащите messages.html сюда
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>или нажмите для выбора</p>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="alert alert-error" style={{ marginTop: '1.25rem' }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {parseResult && (
                    <div className="alert alert-success" style={{
                        marginTop: '1.25rem', flexDirection: 'column', gap: '0.75rem', padding: '1rem',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={18} />
                            <span>Распознано <b>{parseResult.count}</b> постов</span>
                        </div>
                        <button className="btn btn-success" onClick={() => handleDownload()}
                            style={{ width: 'auto', padding: '0.5rem 1.2rem', fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Download size={15} /> Скачать JSON
                        </button>
                    </div>
                )}

                {!parseResult && (
                    <button className="btn" onClick={handleUpload} disabled={!file || isUploading}
                        style={{ width: '100%', marginTop: '1.5rem' }}>
                        {isUploading ? 'Обработка...' : 'Обработать файл'}
                    </button>
                )}
            </div>

            {/* Ранее распарсенные каналы */}
            {channels.length > 0 && (
                <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-secondary)' }}>
                        <Database size={16} /> Распарсенные каналы
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {channels.map(ch => (
                            <div key={ch} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.5rem 0.7rem', background: 'rgba(0,0,0,0.12)',
                                borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
                                transition: 'border-color 0.2s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(129,140,248,0.2)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--glass-border)'}
                            >
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>@{ch}</span>
                                <button onClick={() => handleDownload(ch)}
                                    style={{
                                        background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.18)',
                                        color: 'var(--accent-purple)', padding: '0.25rem 0.7rem', borderRadius: 'var(--radius-sm)',
                                        cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
                                        fontWeight: '600', transition: 'all 0.2s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(129,140,248,0.14)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(129,140,248,0.08)'}
                                >
                                    <Download size={12} /> JSON
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileUpload;
