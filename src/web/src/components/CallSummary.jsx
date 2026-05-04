import React, { useState, useEffect } from 'react';
import {
  FileAudio, Copy, Check, AlertCircle, Sparkles, Send, Trash2
} from 'lucide-react';
import TelegramPreview from './TelegramPreview';

const API = '';

const CallSummary = () => {
  const [transcript, setTranscript] = useState('');
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
  const [temperature, setTemperature] = useState(0.3);

  // Telegram
  const [username, setUsername] = useState(() =>
    localStorage.getItem('telegram_username') || ''
  );
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState(null);

  useEffect(() => {
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

  // Примерная оценка токенов
  const estimatedTokens = Math.round((transcript.length || 0) / 3.5);

  // Копирование промпта
  const copyPrompt = async () => {
    if (!transcript.trim()) { setError('Вставьте транскрипт'); return; }
    setError('');
    try {
      const resp = await fetch(`${API}/api/summary/prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, custom_instruction: customInstruction }),
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
  const generateSummary = async () => {
    if (!transcript.trim()) { setError('Вставьте транскрипт'); return; }
    setIsGenerating(true);
    setError('');
    setGeneratedContent('');
    setSendStatus(null);
    localStorage.setItem('gemini_model', selectedModel);
    try {
      const resp = await fetch(`${API}/api/summary/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript, custom_instruction: customInstruction,
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

  return (
    <div style={{ display: 'flex', gap: '1.5rem', minHeight: 'calc(100vh - 200px)' }}>
      {/* Левая колонка: ввод транскрипта */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '380px' }}>
        <div className="card" style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 className="text-secondary" style={{ fontSize: '0.95rem' }}>
              1. Транскрипт звонка
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                ~{estimatedTokens.toLocaleString()} токенов
              </span>
              {transcript && (
                <button className="btn-ghost" onClick={() => { setTranscript(''); setGeneratedContent(''); }}
                  style={{ padding: '0.2rem 0.4rem', color: 'var(--error)', fontSize: '0.72rem' }}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>

          <textarea
            className="input"
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Вставьте текст транскрипта из MacWhisper, Otter.ai или любого другого источника..."
            style={{
              flex: 1, minHeight: '300px', resize: 'vertical', width: '100%',
              fontFamily: "'JetBrains Mono', monospace", fontSize: '0.82rem', lineHeight: '1.6',
            }}
          />
        </div>
      </div>

      {/* Правая колонка: настройки + результат */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 className="text-secondary" style={{ fontSize: '0.95rem', marginBottom: '1rem' }}>
            2. Настройки
          </h3>

          {/* Модель + температура */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="label" style={{ marginBottom: '0.35rem' }}>Модель</label>
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
                className="input" style={{ width: '100%', appearance: 'auto', padding: '0.4rem' }}>
                {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="label" style={{ marginBottom: '0.35rem' }}>Температура: {temperature}</label>
              <input type="range" min="0" max="1" step="0.1" value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-purple)' }} />
            </div>
          </div>

          {/* Дополнительная инструкция */}
          <div style={{ marginBottom: '1rem' }}>
            <label className="label" style={{ marginBottom: '0.35rem' }}>
              Дополнительная инструкция (опционально)
            </label>
            <textarea className="input" value={customInstruction} onChange={e => setCustomInstruction(e.target.value)}
              placeholder="Сфокусируйся на action items, выдели ключевые метрики, напиши в формате bullet points..."
              style={{ minHeight: '50px', resize: 'vertical', width: '100%' }} />
          </div>

          {/* Кнопки */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn" onClick={generateSummary}
              disabled={isGenerating || !transcript.trim()}
              style={{ flex: 1, padding: '0.75rem', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isGenerating
                ? <><Sparkles size={15} className="spin" /> Генерирую...</>
                : <><Sparkles size={15} /> Сгенерировать через API</>
              }
            </button>
            <button className="btn-ghost" onClick={copyPrompt}
              disabled={!transcript.trim()}
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
          <div className="card" style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 className="text-secondary" style={{ fontSize: '0.95rem' }}>3. Результат</h3>
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
    </div>
  );
};

export default CallSummary;
