import React, { useState, useEffect } from 'react';
import { Search, Clock, Calendar, AlertCircle, Zap, ArrowRight } from 'lucide-react';
import MarkdownEditor from './MarkdownEditor';
// Reusing MarkdownEditor for read-only display if valid component, 
// or I can just use a simple div with markdown rendering. 
// Given I haven't seen MarkdownEditor content, I'll stick to a simple display 
// or copy the "TelegramPreview" pattern if it returns HTML. 
// The API returns markdown. I'll use a simple pre-wrap div for now or 
// if I want to be fancy, I can use a markdown library if available.
// `AISearch` uses `resultMarkdown` and then calls `/api/format` to get HTML. 
// I should probably do the same for consistency!

const MissedPosts = () => {
    const [channels, setChannels] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [daysBack, setDaysBack] = useState(30);
    const [interest, setInterest] = useState('');
    const [resultMarkdown, setResultMarkdown] = useState('');
    const [resultHtml, setResultHtml] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/channels')
            .then(r => r.json())
            .then(data => {
                setChannels(data.channels || []);
                if (data.channels?.length > 0 && !selectedChannel) setSelectedChannel(data.channels[0]);
            })
            .catch(() => { });
    }, []);

    // Effect to format markdown to HTML
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


    const handleSearch = async () => {
        if (!interest) {
            setError('Введите ваши интересы');
            return;
        }

        setLoading(true);
        setError('');
        setResultMarkdown('');
        setResultHtml('');

        try {
            const resp = await fetch('/api/missed/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel_name: selectedChannel,
                    days_back: parseInt(daysBack),
                    user_interest: interest
                }),
            });
            const data = await resp.json();
            if (data.ok) {
                setResultMarkdown(data.markdown);
            } else {
                setError(data.error || 'Ошибка поиска');
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card" style={{ padding: '2rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 className="text-xl font-bold glow-text" style={{ marginBottom: '0.5rem' }}>Что я пропустил?</h2>
                    <p className="text-muted">Найдем главное за последнее время по вашим интересам</p>
                </div>

                <div style={{ display: 'grid', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label className="label">Канал</label>
                            <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}
                                className="input" style={{ width: '100%', appearance: 'auto' }}>
                                {channels.map(ch => <option key={ch} value={ch}>@{ch}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="label">Период (дней)</label>
                            <div style={{ position: 'relative' }}>
                                <Clock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                <input type="number" value={daysBack} onChange={e => setDaysBack(e.target.value)}
                                    className="input" style={{ width: '100%', paddingLeft: '2.5rem' }} min="1" max="365" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="label">Что вам интересно?</label>
                        <textarea
                            value={interest}
                            onChange={e => setInterest(e.target.value)}
                            placeholder="Например: AI агенты, новости дизайна, React 19..."
                            className="input"
                            style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                        />
                    </div>

                    <button className="btn" onClick={handleSearch} disabled={loading}
                        style={{ justifyContent: 'center', padding: '0.8rem', fontSize: '1rem' }}>
                        {loading ? <><Zap size={18} className="spin" /> Анализирую посты...</> : <><Search size={18} /> Найти интересное</>}
                    </button>

                    {error && (
                        <div className="alert alert-error">
                            <AlertCircle size={16} /> {error}
                        </div>
                    )}
                </div>
            </div>

            {resultHtml && (
                <div className="card" style={{ padding: '2rem', animation: 'fadeIn 0.5s' }}>
                    <h3 className="text-lg font-bold" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkles size={20} className="text-accent" /> Результат
                    </h3>
                    <div className="telegram-content" dangerouslySetInnerHTML={{ __html: resultHtml }}
                        style={{
                            lineHeight: '1.6',
                            color: 'var(--text-secondary)',
                            background: 'rgba(0,0,0,0.2)',
                            padding: '1.5rem',
                            borderRadius: 'var(--radius-md)'
                        }}
                    />
                </div>
            )}
        </div>
    );
};

// Simple Sparkles icon needed if not imported. 
// Ah, I imported Sparkles from lucide-react? No, I imported Zap, but implementation used Sparkles.
// Let me fix imports.
import { Sparkles as SparklesIcon } from 'lucide-react';
// Actually I'll just add Sparkles to the top import.

const Sparkles = ({ size, className }) => <SparklesIcon size={size} className={className} />;

export default MissedPosts;
