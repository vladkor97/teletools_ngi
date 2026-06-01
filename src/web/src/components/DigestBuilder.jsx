import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen, Calendar, Search, Copy, Check, AlertCircle,
  Sparkles, Send, Link, ChevronDown, ChevronUp, Eye, X
} from 'lucide-react';
import TelegramPreview from './TelegramPreview';

const API = '';

// Пресеты периодов
const PERIOD_PRESETS = [
  { label: 'Неделя', days: 7 },
  { label: '2 недели', days: 14 },
  { label: 'Месяц', days: 30 },
];

const toDateStr = (d) => d.toISOString().split('T')[0];

const DigestBuilder = () => {
  // Каналы
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');

  // Период
  const [dateTo, setDateTo] = useState(toDateStr(new Date()));
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return toDateStr(d);
  });
  const [activePreset, setActivePreset] = useState(7);

  // Посты
  const [posts, setPosts] = useState([]);
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [sortBy, setSortBy] = useState('date_asc');

  // Прошлый дайджест
  const [prevDigestLink, setPrevDigestLink] = useState('');
  const [digestNumber, setDigestNumber] = useState(null);
  const [findingPrev, setFindingPrev] = useState(false);

  // Промпт / генерация
  const [customInstruction, setCustomInstruction] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [resultHtml, setResultHtml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Модель
  const [models, setModels] = useState([
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  ]);
  const [selectedModel, setSelectedModel] = useState(() =>
    localStorage.getItem('gemini_model') || 'gemini-2.0-flash'
  );
  const [temperature, setTemperature] = useState(0.7);

  // Telegram
  const [username, setUsername] = useState(() =>
    localStorage.getItem('telegram_username') || ''
  );
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);

  // Превью поста
  const [previewPost, setPreviewPost] = useState(null);

  // Загрузка каналов и моделей
  useEffect(() => {
    fetch(`${API}/api/channels`).then(r => r.json())
      .then(data => {
        setChannels(data.channels || []);
        if (data.channels?.length > 0 && !selectedChannel) setSelectedChannel(data.channels[0]);
      }).catch(() => {});

    fetch(`${API}/api/gemini-models`).then(r => r.json())
      .then(data => { if (data.ok && data.models?.length) setModels(data.models); })
      .catch(() => {});
  }, []);

  useEffect(() => { localStorage.setItem('telegram_username', username); }, [username]);

  // Форматирование результата
  useEffect(() => {
    if (!generatedContent) { setResultHtml(''); return; }
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`${API}/api/format`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: generatedContent }),
        });
        const data = await resp.json();
        setResultHtml(data.html);
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
  }, [generatedContent]);

  // Применение пресета
  const applyPreset = (days) => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - days);
    setDateTo(toDateStr(to));
    setDateFrom(toDateStr(from));
    setActivePreset(days);
  };

  // Загрузка постов
  const fetchPosts = async () => {
    if (!selectedChannel || !dateFrom || !dateTo) return;
    setLoadingPosts(true);
    setError('');
    try {
      const resp = await fetch(`${API}/api/digest/posts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_name: selectedChannel, date_from: dateFrom, date_to: dateTo }),
      });
      const data = await resp.json();
      setPosts(data.posts || []);
      setExcludedIds(new Set());
    } catch (e) { setError(e.message); }
    finally { setLoadingPosts(false); }
  };

  useEffect(() => { if (selectedChannel) fetchPosts(); }, [selectedChannel, dateFrom, dateTo]);

  // Автопоиск прошлого дайджеста
  const findPreviousDigest = async () => {
    if (!selectedChannel) return;
    setFindingPrev(true);
    try {
      const resp = await fetch(`${API}/api/digest/find-previous?channel_name=${selectedChannel}`);
      const data = await resp.json();
      if (data.found) {
        if (data.post_url) setPrevDigestLink(data.post_url);
        if (data.digest_number) setDigestNumber(data.digest_number);
      } else {
        setError('Предыдущий дайджест не найден');
      }
    } catch (e) { setError(e.message); }
    finally { setFindingPrev(false); }
  };

  // Включённые посты
  const includedPosts = useMemo(
    () => posts.filter(p => !excludedIds.has(p.id)),
    [posts, excludedIds]
  );

  // Отсортированные посты для отображения
  const sortedPostsForDisplay = useMemo(() => {
    let arr = [...posts];
    if (sortBy === 'date_asc') arr.sort((a, b) => (a.id || 0) - (b.id || 0));
    else if (sortBy === 'date_desc') arr.sort((a, b) => (b.id || 0) - (a.id || 0));
    else if (sortBy === 'reactions_desc') arr.sort((a, b) => (b.reactions || 0) - (a.reactions || 0));
    else if (sortBy === 'views_desc') arr.sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (sortBy === 'forwards_desc') arr.sort((a, b) => (b.forwards || 0) - (a.forwards || 0));
    return arr;
  }, [posts, sortBy]);

  const togglePost = (id) => {
    const next = new Set(excludedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExcludedIds(next);
  };

  // Примерная оценка токенов
  const estimatedTokens = useMemo(() => {
    const chars = includedPosts.reduce((s, p) => s + (p.text?.length || 0), 0);
    return Math.round(chars / 3.5);
  }, [includedPosts]);

  // Копирование промпта
  const copyPrompt = async () => {
    setError('');
    try {
      const resp = await fetch(`${API}/api/digest/prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_name: selectedChannel, date_from: dateFrom, date_to: dateTo,
          prev_digest_link: prevDigestLink, digest_number: digestNumber,
          custom_instruction: customInstruction, excluded_post_ids: Array.from(excludedIds),
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        await navigator.clipboard.writeText(data.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } else { setError(data.error); }
    } catch (e) { setError(e.message); }
  };

  // Генерация через API
  const generateDigest = async () => {
    setIsGenerating(true);
    setError('');
    setGeneratedContent('');
    setSendStatus(null);
    localStorage.setItem('gemini_model', selectedModel);
    try {
      const resp = await fetch(`${API}/api/digest/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_name: selectedChannel, date_from: dateFrom, date_to: dateTo,
          prev_digest_link: prevDigestLink, digest_number: digestNumber,
          custom_instruction: customInstruction, excluded_post_ids: Array.from(excludedIds),
          model: selectedModel, temperature,
        }),
      });
      const data = await resp.json();
      if (data.ok) { setGeneratedContent(data.content); }
      else { setError(data.error || 'Ошибка генерации'); }
    } catch (e) { setError(e.message); }
    finally { setIsGenerating(false); }
  };

  // Отправка в Telegram
  const sendToTelegram = async () => {
    if (!username || !resultHtml) return;
    setIsSending(true); setSendStatus(null);
    try {
      const resp = await fetch(`${API}/api/send-telegram`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.replace('@', ''), html: resultHtml }),
      });
      const data = await resp.json();
      setSendStatus(data.ok ? { ok: true, msg: 'Отправлено!' } : { ok: false, msg: data.error || 'Ошибка' });
    } catch (e) { setSendStatus({ ok: false, msg: e.message }); }
    finally { setIsSending(false); }
  };

  const cardStyle = { padding: '1.25rem 1.5rem' };
  const labelStyle = { marginBottom: '0.35rem' };

  return (
    <div style={{ display: 'flex', gap: '1.5rem', minHeight: 'calc(100vh - 200px)' }}>
      {/* Левая колонка: настройки + посты */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '380px' }}>

        {/* Канал + Период */}
        <div className="card" style={cardStyle}>
          <h3 className="text-secondary" style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>
            1. Канал и период
          </h3>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label className="label" style={labelStyle}>Канал</label>
              <select value={selectedChannel} onChange={e => setSelectedChannel(e.target.value)}
                className="input" style={{ width: '100%', appearance: 'auto' }}>
                {channels.map(ch => <option key={ch} value={ch}>@{ch}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label className="label" style={labelStyle}>От</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset(null); }}
                className="input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label className="label" style={labelStyle}>До</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset(null); }}
                className="input" style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {PERIOD_PRESETS.map(p => (
              <button key={p.days} className={`btn-ghost`} onClick={() => applyPreset(p.days)}
                style={{
                  padding: '0.3rem 0.75rem', fontSize: '0.8rem',
                  background: activePreset === p.days ? 'rgba(129,140,248,0.15)' : 'transparent',
                  border: activePreset === p.days ? '1px solid rgba(129,140,248,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  color: activePreset === p.days ? 'var(--accent-purple)' : 'var(--text-secondary)',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Список постов */}
        <div className="card" style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 className="text-secondary" style={{ fontSize: '0.95rem' }}>
              2. Посты за период
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.78rem' }}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="input" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', appearance: 'auto', minHeight: 'auto', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent' }}>
                <option value="date_asc">Сначала старые</option>
                <option value="date_desc">Сначала новые</option>
                <option value="reactions_desc">По реакциям</option>
                <option value="views_desc">По просмотрам</option>
                <option value="forwards_desc">По пересылкам</option>
              </select>
              <span style={{ color: 'var(--text-muted)' }}>
                {includedPosts.length}/{posts.length} постов
              </span>
              <span style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                ~{estimatedTokens.toLocaleString()} токенов
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>
            {loadingPosts ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Загрузка...</div>
            ) : posts.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Нет постов за выбранный период
              </div>
            ) : (
              sortedPostsForDisplay.map(post => {
                const included = !excludedIds.has(post.id);
                return (
                  <div key={post.id} onClick={() => togglePost(post.id)} style={{
                    padding: '0.6rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', opacity: included ? 1 : 0.4,
                    background: included ? 'transparent' : 'rgba(0,0,0,0.2)',
                    display: 'flex', gap: '0.6rem', transition: 'opacity 0.15s',
                  }}>
                    <div style={{
                      width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0, marginTop: '2px',
                      border: included ? 'none' : '1px solid var(--text-muted)',
                      background: included ? 'var(--accent-purple)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {included && <Check size={10} color="white" />}
                    </div>
                    <div style={{ flex: 1, fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.15rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{post.date?.split(' ')[0]}</span>
                        <button onClick={e => { e.stopPropagation(); setPreviewPost(post); }}
                          className="btn-ghost" style={{ padding: '0 0.3rem', height: 'auto', color: 'var(--accent-cyan)' }}>
                          <Eye size={11} />
                        </button>
                      </div>
                      <div style={{
                        color: 'var(--text-secondary)',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        lineHeight: '1.4',
                      }}>
                        {post.text || '(медиа)'}
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
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
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Правая колонка: настройки генерации + результат */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Прошлый дайджест + инструкция */}
        <div className="card" style={cardStyle}>
          <h3 className="text-secondary" style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>
            3. Настройки дайджеста
          </h3>

          {/* Прошлый дайджест */}
          <div style={{ marginBottom: '1rem' }}>
            <label className="label" style={labelStyle}>Ссылка на прошлый дайджест</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" value={prevDigestLink} onChange={e => setPrevDigestLink(e.target.value)}
                placeholder="https://t.me/channel/123" className="input" style={{ flex: 1 }} />
              <button className="btn-ghost" onClick={findPreviousDigest} disabled={findingPrev}
                style={{
                  padding: '0.5rem 0.75rem', fontSize: '0.78rem',
                  border: '1px solid rgba(129,140,248,0.2)', borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}>
                <Link size={12} />
                {findingPrev ? '...' : 'Найти'}
              </button>
            </div>
            {digestNumber && (
              <span style={{ fontSize: '0.72rem', color: 'var(--accent-purple)', marginTop: '0.25rem', display: 'block' }}>
                Последний дайджест: №{digestNumber} → следующий: №{digestNumber + 1}
              </span>
            )}
          </div>

          {/* Модель + температура */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="label" style={labelStyle}>Модель</label>
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="input" style={{ width: '100%', appearance: 'auto', padding: '0.4rem' }}>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="label" style={labelStyle}>Температура: {temperature}</label>
              <input type="range" min="0" max="1" step="0.1" value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-purple)' }} />
            </div>
          </div>

          {/* Дополнительная инструкция */}
          <div style={{ marginBottom: '1rem' }}>
            <label className="label" style={labelStyle}>Дополнительная инструкция (опционально)</label>
            <textarea className="input" value={customInstruction} onChange={e => setCustomInstruction(e.target.value)}
              placeholder="Добавь больше эмодзи, сделай акцент на AI-теме, используй неформальный стиль..."
              style={{ minHeight: '60px', resize: 'vertical', width: '100%' }} />
          </div>

          {/* Кнопки действий */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn" onClick={generateDigest}
              disabled={isGenerating || includedPosts.length === 0}
              style={{ flex: 1, padding: '0.75rem', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isGenerating
                ? <><Sparkles size={15} className="spin" /> Генерирую...</>
                : <><Sparkles size={15} /> Сгенерировать через API</>
              }
            </button>
            <button className="btn-ghost" onClick={copyPrompt}
              disabled={includedPosts.length === 0}
              style={{
                flex: 1, padding: '0.75rem', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem',
                border: '1px solid rgba(129,140,248,0.25)', borderRadius: 'var(--radius-sm)',
                background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(129,140,248,0.06)',
                color: copied ? 'var(--accent-green)' : 'var(--accent-purple)',
                transition: 'all 0.2s',
              }}>
              {copied ? <><Check size={15} /> Скопировано!</> : <><Copy size={15} /> Копировать промпт</>}
            </button>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        {/* Результат */}
        {generatedContent && (
          <div className="card" style={{ ...cardStyle, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 className="text-secondary" style={{ fontSize: '0.95rem' }}>4. Результат</h3>
              <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(generatedContent)}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Copy size={12} /> Копировать MD
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: '#0e1621', borderRadius: 'var(--radius-md)', padding: '0.5rem', marginBottom: '1rem' }}>
              {resultHtml
                ? <TelegramPreview html={resultHtml} />
                : <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Форматирование...</div>
              }
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)' }}>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="@username" className="input" style={{ flex: 1 }} />
              <button className="btn" onClick={sendToTelegram} disabled={isSending || !username || !resultHtml}
                style={{ padding: '0.6rem 1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                {isSending ? '...' : <><Send size={14} /> Отправить</>}
              </button>
            </div>
            {sendStatus && (
              <div style={{ fontSize: '0.78rem', marginTop: '0.4rem', color: sendStatus.ok ? 'var(--accent-green)' : 'var(--error)' }}>
                {sendStatus.msg}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модалка превью поста */}
      {previewPost && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
        }} onClick={() => setPreviewPost(null)}>
          <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1rem' }}>Пост от {previewPost.date}</h3>
              <button className="btn-ghost" onClick={() => setPreviewPost(null)}>✕</button>
            </div>
            <div style={{ padding: '1.5rem', overflowY: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              {previewPost.text}
            </div>
            <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              ❤️ {previewPost.reactions} · <a href={previewPost.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>Открыть в Telegram</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DigestBuilder;
