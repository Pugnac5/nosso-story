import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Camera,
  Check,
  Heart,
  Image as ImageIcon,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react';

const API_HEALTH_URL = '/api/health';

function App() {
  const [apiStatus, setApiStatus] = useState('checking');
  const [lastChecked, setLastChecked] = useState(null);

  const checkApi = useCallback(async () => {
    setApiStatus('checking');

    try {
      const response = await fetch(API_HEALTH_URL, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`A API respondeu com status ${response.status}`);
      }

      const data = await response.json();
      if (data.status !== 'ok') {
        throw new Error('A API respondeu, mas não confirmou o estado esperado.');
      }

      setApiStatus('online');
      setLastChecked(new Date());
    } catch (error) {
      console.error('Falha ao consultar a API:', error);
      setApiStatus('offline');
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    checkApi();
  }, [checkApi]);

  const formattedCheckTime = lastChecked
    ? lastChecked.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Nosso Story, início">
          <span className="brand-mark"><Heart size={19} strokeWidth={1.8} /></span>
          <span className="brand-name">nosso<span>story</span></span>
        </a>

        <div className="topbar-note">
          <span className="topbar-dot" />
          UM LUGAR PARA GUARDAR MEMÓRIAS
        </div>

        <a className="topbar-link" href="#como-funciona">
          Como funciona <ArrowUpRight size={15} />
        </a>
      </header>

      <main>
        <section className="hero section-wrap" id="inicio">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> O GRANDE DIA, POR TODOS OS OLHARES</div>
            <h1>Uma história<br />feita por <span>todos nós.</span></h1>
            <p className="hero-description">
              Os melhores momentos não acontecem só diante das câmeras oficiais.
              Aqui, cada convidado ajuda a contar a história do casamento.
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href="#status-api">
                Conhecer o projeto <ArrowDown size={17} />
              </a>
              <span className="action-caption"><ShieldCheck size={16} /> Feito para compartilhar com cuidado</span>
            </div>

            <div className="hero-footnote">
              <span className="footnote-line" />
              <span>Uma foto, uma lembrança, uma história inteira.</span>
            </div>
          </div>

          <div className="hero-art" aria-label="Prévia ilustrativa da experiência de fotos do casamento">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="floating-note note-top"><Sparkles size={15} /> momentos espontâneos</div>
            <div className="photo-stack">
              <div className="photo-card photo-card-back">
                <div className="photo-abstract abstract-back"><span>♡</span></div>
                <div className="photo-card-footer"><span>uma lembrança</span><Heart size={14} /></div>
              </div>
              <div className="photo-card photo-card-front">
                <div className="photo-abstract abstract-front">
                  <div className="sun-glow" />
                  <div className="arch arch-one" />
                  <div className="arch arch-two" />
                  <div className="bouquet bouquet-one">✿</div>
                  <div className="bouquet bouquet-two">✿</div>
                  <div className="photo-caption">the beginning<br />of forever</div>
                </div>
                <div className="photo-card-footer"><span>o nosso grande dia</span><Heart size={14} fill="currentColor" /></div>
              </div>
            </div>
            <div className="floating-note note-bottom"><span className="note-avatar">A</span><span>feito por vocês, com carinho</span><Heart size={15} /></div>
            <div className="art-sparkle sparkle-one">✳</div>
            <div className="art-sparkle sparkle-two">✦</div>
          </div>
        </section>

        <section className="connection-section" id="status-api">
          <div className="section-wrap connection-inner">
            <div className="connection-copy">
              <span className="section-kicker">PRIMEIRA ETAPA · AMBIENTE DE DESENVOLVIMENTO</span>
              <h2>O começo de algo especial.</h2>
              <p>Estamos preparando a base do Nosso Story. Nesta etapa, a interface já conversa com o backend Node.js/Express.</p>
            </div>

            <div className={`api-card api-card-${apiStatus}`}>
              <div className="api-card-top">
                <span className="api-icon">
                  {apiStatus === 'online' ? <Wifi size={20} /> : apiStatus === 'offline' ? <WifiOff size={20} /> : <RefreshCw className="spin" size={20} />}
                </span>
                <span className="api-label">STATUS DA API</span>
                <span className={`status-pill status-${apiStatus}`}>
                  <span className="status-dot" />
                  {apiStatus === 'online' ? 'Conectada' : apiStatus === 'offline' ? 'Indisponível' : 'Verificando'}
                </span>
              </div>
              <div className="api-card-body">
                <div>
                  <strong>{apiStatus === 'online' ? 'Frontend e backend conectados' : apiStatus === 'offline' ? 'Não foi possível conectar' : 'Testando comunicação...'}</strong>
                  <span>{apiStatus === 'online' ? 'GET /api/health · resposta recebida' : apiStatus === 'offline' ? 'Confira se o servidor está executando na porta 3001.' : 'Aguardando resposta de /api/health.'}</span>
                </div>
                {apiStatus === 'online' && <Check className="api-check" size={21} />}
              </div>
              <div className="api-card-bottom">
                <span>{formattedCheckTime ? `Última verificação: ${formattedCheckTime}` : 'Primeira verificação'}</span>
                <button className="refresh-button" type="button" onClick={checkApi} disabled={apiStatus === 'checking'}>
                  <RefreshCw size={14} className={apiStatus === 'checking' ? 'spin' : ''} /> Testar novamente
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="features section-wrap" id="como-funciona">
          <div className="features-heading">
            <span className="section-kicker">O QUE VAMOS CONSTRUIR</span>
            <h2>Uma experiência. <span>Três formas de lembrar.</span></h2>
            <p>Uma base simples, pronta para crescer em etapas bem definidas.</p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <div className="feature-icon icon-camera"><Camera size={21} /></div>
              <span className="feature-number">01 / CONVIDADOS</span>
              <h3>Capture o momento</h3>
              <p>Cadastro rápido, câmera do celular e uma prévia para personalizar a foto antes de publicar.</p>
              <span className="feature-state">Próxima etapa</span>
            </article>
            <article className="feature-card">
              <div className="feature-icon icon-gallery"><ImageIcon size={21} /></div>
              <span className="feature-number">02 / STORY</span>
              <h3>Reviva cada lembrança</h3>
              <p>Uma galeria compartilhada para encontrar as fotos do casamento em um só lugar.</p>
              <span className="feature-state">Planejado</span>
            </article>
            <article className="feature-card">
              <div className="feature-icon icon-screen"><MonitorPlay size={21} /></div>
              <span className="feature-number">03 / TELÃO</span>
              <h3>Todo mundo faz parte</h3>
              <p>Uma apresentação em tela cheia, repetindo as fotos e acompanhando as novas publicações.</p>
              <span className="feature-state">Planejado</span>
            </article>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="section-wrap footer-inner">
          <a className="brand footer-brand" href="#inicio">
            <span className="brand-mark"><Heart size={16} strokeWidth={1.8} /></span>
            <span className="brand-name">nosso<span>story</span></span>
          </a>
          <span>Uma história compartilhada começa com um momento.</span>
          <span className="footer-version">BASE INICIAL · V0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
