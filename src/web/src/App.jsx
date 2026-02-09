import React, { useState, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import MarkdownEditor from './components/MarkdownEditor';
import AISearch from './components/AISearch';
import ViewPosts from './components/ViewPosts';
import AuthorToolkit from './components/AuthorToolkit';
import MissedPosts from './components/MissedPosts';
import {
  Copy, Check, ExternalLink, Sparkles, ArrowRight,
  MessageSquare, Key, Settings2, Terminal, Bot, FileText,
  ChevronRight, Download, Paintbrush, Search as SearchIcon,
  LayoutGrid, PenTool, Sparkles as SparklesIcon,
  ChevronDown
} from 'lucide-react';

const SYSTEM_PROMPT = `Ты — ассистент, который помогает находить релевантный контент из Telegram-канала.

Тебе предоставлены данные постов канала в формате JSON. Каждый пост: {id, url, text, date}.

Правила:
1. Отвечай ТОЛЬКО готовым постом — без вступлений, без «Вот что я нашёл», без комментариев от себя.
2. Формат — Markdown.
3. Каждый найденный пост оформляй с гиперссылкой: [Краткое описание](url)
4. Группируй по темам с заголовками **Тема**.
5. К каждой ссылке добавь 1-2 предложения описания.
6. Используй ТОЛЬКО посты из предоставленных данных. Не придумывай ссылки.
7. Если точного совпадения нет — предложи ближайшие по смыслу.

Пример:

**Инструменты для кодинга**

1. **Cursor:** Мощный AI-редактор кода, хотя в последнее время стал хуже.
    * [Раньше было лучше: Cursor испортился](https://t.me/channel/422)
2. **Bolt:** Лучший выбор для быстрого прототипирования без глубокого кода.
    * [Как я попробовал все AI-инструменты для кода](https://t.me/channel/129)`;

/* ===================== Мини-компоненты ===================== */

const CopyButton = ({ text, label }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={handleCopy} className="btn-ghost"
      style={{ padding: '0.3rem 0.65rem', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Скопировано' : label}
    </button>
  );
};

/* Номер шага с градиентом */
const StepNumber = ({ n, gradient = 'linear-gradient(135deg, #6366f1, #a855f7)' }) => (
  <div style={{
    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
    background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: '700', fontSize: '1rem',
    boxShadow: '0 4px 16px rgba(99, 102, 241, 0.25)',
    outline: '4px solid var(--bg-dark)',
  }}>{n}</div>
);

/* Карточка-мини для настроек */
const MiniCard = ({ icon: Icon, title, children }) => (
  <div style={{
    padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
    transition: 'border-color 0.2s',
  }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
      <Icon size={14} style={{ color: 'var(--text-muted)' }} />
      <span style={{ fontSize: '0.83rem', fontWeight: '600', color: 'var(--text-primary)' }}>{title}</span>
    </div>
    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{children}</div>
  </div>
);

/* Элемент списка с шевроном */
const ListItem = ({ children }) => (
  <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
    <ChevronRight size={14} style={{ color: 'var(--primary-color)', marginTop: '2px', flexShrink: 0 }} />
    <span>{children}</span>
  </li>
);

const Code = ({ children }) => (
  <code style={{
    fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78em',
    background: 'rgba(0,0,0,0.3)', padding: '0.1em 0.4em', borderRadius: '4px',
    color: 'var(--accent-cyan)',
  }}>{children}</code>
);

const preStyle = {
  background: 'rgba(0,0,0,0.35)', padding: '0.65rem 0.85rem',
  borderRadius: 'var(--radius-sm)', color: '#7dd3fc',
  fontSize: '0.75rem', marginTop: '0.4rem', overflowX: 'auto',
  whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.5',
  border: '1px solid rgba(255,255,255,0.04)', fontFamily: "'JetBrains Mono', monospace",
};

const text2 = { color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.65' };

/* ===================== HowToUse ===================== */

const HowToUse = ({ onNavigate }) => {
  const [openSection, setOpenSection] = useState(null);

  const toggle = (key) => setOpenSection(openSection === key ? null : key);

  return (
    <div className="card" style={{ maxWidth: '920px', margin: '0 auto', padding: '2.5rem 3rem', lineHeight: '1.7' }}>
      {/* Заголовок */}
      <div style={{ marginBottom: '2.5rem', paddingBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>TeleTools</h2>
        <p style={{ ...text2, maxWidth: '640px' }}>
          Находите релевантный контент из любого Telegram-канала с помощью AI.
          Формируйте подборки, генерируйте новые идеи и отправляйте их себе в Telegram.
        </p>
      </div>

      {/* Секции инструкций */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* 1. Парсер */}
        <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div onClick={() => toggle('parser')} style={{
            padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <StepNumber n={1} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>Парсинг канала</h3>
            </div>
            <ChevronDown size={20} style={{ transform: openSection === 'parser' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {openSection === 'parser' && (
            <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ ...text2, marginBottom: '0.75rem' }}>
                Чтобы система узнала о контенте канала, нужно экспортировать историю сообщений.
              </p>
              <ul style={{ ...text2, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <ListItem>Откройте канал в <b>Telegram Desktop</b></ListItem>
                <ListItem>Нажмите <b>•••</b> → <b>Export chat history</b></ListItem>
                <ListItem>Формат: <b>HTML</b> (снимите галочки с фото/видео для скорости)</ListItem>
                <ListItem>Перейдите во вкладку <b>«Парсер»</b> и загрузите полученный <Code>messages.html</Code></ListItem>
              </ul>
            </div>
          )}
        </div>

        {/* 2. Тулкит Автора */}
        <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div onClick={() => toggle('toolkit')} style={{
            padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <StepNumber n={2} gradient="linear-gradient(135deg, #a855f7, #ec4899)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>Тулкит Автора</h3>
            </div>
            <ChevronDown size={20} style={{ transform: openSection === 'toolkit' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {openSection === 'toolkit' && (
            <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ ...text2, marginBottom: '0.75rem' }}>
                Инструмент для генерации новых идей на основе архива ваших постов.
              </p>
              <ul style={{ ...text2, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <ListItem>Выберите посты для контекста (можно сортировать по реакциям)</ListItem>
                <ListItem>Напишите инструкцию (например, "предложи темы для новых постов")</ListItem>
                <ListItem>Выберите модель Gemini и температуру (креативность)</ListItem>
                <ListItem>Нажмите <b>Сгенерировать</b></ListItem>
              </ul>
            </div>
          )}
        </div>

        {/* 3. Подборки */}
        <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div onClick={() => toggle('ai')} style={{
            padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <StepNumber n={3} gradient="linear-gradient(135deg, #06b6d4, #3b82f6)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>Подборки</h3>
            </div>
            <ChevronDown size={20} style={{ transform: openSection === 'ai' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {openSection === 'ai' && (
            <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ ...text2, marginBottom: '0.75rem' }}>
                Семантический поиск по всей базе знаний канала.
              </p>
              <ul style={{ ...text2, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <ListItem>Выберите канал</ListItem>
                <ListItem>Задайте вопрос (например: "Найди все посты про AI агентов")</ListItem>
                <ListItem>Получите ответ с ссылками на посты</ListItem>
                <ListItem>Отправьте результат себе в Telegram</ListItem>
              </ul>
            </div>
          )}
        </div>

        {/* 4. Что пропустил */}
        <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div onClick={() => toggle('missed')} style={{
            padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <StepNumber n={4} gradient="linear-gradient(135deg, #f59e0b, #d97706)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>Что пропустил</h3>
            </div>
            <ChevronDown size={20} style={{ transform: openSection === 'missed' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {openSection === 'missed' && (
            <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ ...text2, marginBottom: '0.75rem' }}>
                Персональная новостная лента за последние дни.
              </p>
              <ul style={{ ...text2, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <ListItem>Укажите свои интересы (например, "Python, AI, Startups")</ListItem>
                <ListItem>Выберите за сколько дней искать</ListItem>
                <ListItem>Получите список самых релевантных постов</ListItem>
              </ul>
            </div>
          )}
        </div>

        {/* 5. Форматтер */}
        <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div onClick={() => toggle('formatter')} style={{
            padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <StepNumber n={5} gradient="linear-gradient(135deg, #6366f1, #8b5cf6)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>Форматтер</h3>
            </div>
            <ChevronDown size={20} style={{ transform: openSection === 'formatter' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {openSection === 'formatter' && (
            <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ ...text2, marginBottom: '0.75rem' }}>
                Инструмент для ручной отправки сообщений ботом.
              </p>
              <ul style={{ ...text2, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <ListItem>Если вы использовали <b>Google AI Studio</b> напрямую, вставьте Markdown-ответ сюда.</ListItem>
                <ListItem>Проверьте, как выглядит пост (жирный, курсив, ссылки).</ListItem>
                <ListItem>Введите свой @username и нажмите <b>Отправить в Telegram</b>.</ListItem>
              </ul>
            </div>
          )}
        </div>

      </div>

      {/* Настройка окружения */}
      <div style={{ marginTop: '2.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--text-primary)' }}>Настройка окружения</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <MiniCard icon={Bot} title="Telegram бот">
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none' }}>@BotFather</a>
            {' → '}<Code>/newbot</Code>{' → получите токен'}
          </MiniCard>
          <MiniCard icon={Key} title="Google API Key">
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', textDecoration: 'none' }}>AI Studio → API Keys</a>
            {' → создайте ключ'}
          </MiniCard>
          <MiniCard icon={Settings2} title="Конфигурация">
            Заполните <Code>.env</Code> токеном бота и API-ключом (для работы AI функций)
          </MiniCard>
        </div>
      </div>

      {/* CTA */}
      <div style={{
        marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px' }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: '#34d399',
              animation: 'pulse 2s infinite', opacity: 0.6,
            }} />
            <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
          </span>
          System Online
        </div>
        <button className="btn" onClick={() => onNavigate('parser')}
          style={{ width: 'auto', padding: '0.7rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}>
          Начать работу <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

/* ===================== App ===================== */

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'home');

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const tabs = [
    { key: 'home', label: 'Инструкция', icon: FileText },
    { key: 'parser', label: 'Парсер', icon: Download },
    { key: 'view-posts', label: 'Посты', icon: LayoutGrid },
    { key: 'toolkit', label: 'Тулкит Автора', icon: PenTool },
    { key: 'missed', label: 'Что пропустил', icon: SparklesIcon },
    { key: 'ai', label: 'Подборки', icon: SearchIcon },
    { key: 'formatter', label: 'Форматтер', icon: Paintbrush },
  ];

  const descriptions = {
    'parser': 'Загрузка и обработка истории сообщений из Telegram.',
    'view-posts': 'Просмотр всех постов канала с сортировкой по дате и реакциям.',
    'toolkit': 'Инструменты для авторов: генерация новых идей на основе лучших постов.',
    'missed': 'Умный поиск пропущенного контента по вашим интересам.',
    'ai': 'AI-поиск и формирование подборок по базе знаний канала.',
    'formatter': 'Превращение Markdown-текста в красивый HTML пост для Telegram.',
  };

  return (
    <div className="app-container">
      <div className="grid-overlay" />

      <header style={{ textAlign: 'center', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/logo.svg" alt="Logo" style={{ width: '48px', height: '48px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(34, 211, 238, 0.3)' }} />
          <h1 className="hero-title" style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', margin: 0, lineHeight: 1 }}>TeleTools</h1>
        </div>
        <p className="hero-subtitle" style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.78rem', fontWeight: '500' }}>
          Тулкит для работы с Telegram-каналами
        </p>
      </header>

      <nav className="tabs" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </nav>

      <main>
        {activeTab !== 'home' && descriptions[activeTab] && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {descriptions[activeTab]}
          </div>
        )}
        {activeTab === 'home' && <HowToUse onNavigate={setActiveTab} />}
        {activeTab === 'parser' && <FileUpload />}
        {activeTab === 'view-posts' && <ViewPosts />}
        {activeTab === 'toolkit' && <AuthorToolkit />}
        {activeTab === 'missed' && <MissedPosts />}
        {activeTab === 'ai' && <AISearch />}
        {activeTab === 'formatter' && <MarkdownEditor />}
      </main>

      <footer style={{
        textAlign: 'center', marginTop: '3rem', paddingTop: '1.5rem',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          <a href="https://t.me/vladkor97" target="_blank" rel="noreferrer"
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.target.style.color = 'var(--accent-cyan)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
          >@vladkor97</a>
          <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>·</span>
          <a href="https://t.me/NGI_ru" target="_blank" rel="noreferrer"
            style={{ color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.target.style.color = 'var(--accent-cyan)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
          >@NGI_ru</a>
        </p>
      </footer>
    </div>
  );
}

export default App;
