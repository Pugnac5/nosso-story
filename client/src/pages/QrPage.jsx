import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Check, Copy, Heart, Printer, Smartphone } from 'lucide-react';
import { useEventSettings } from '../lib/useEventSettings.js';

export default function QrPage() {
  const { settings } = useEventSettings();
  const [copied, setCopied] = useState(false);
  const joinUrl = `${window.location.origin}/participar`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copie o endereço abaixo:', joinUrl);
    }
  };

  return (
    <main className="qr-page">
      <div className="qr-card">
        <a className="qr-back-link" href="/"><ArrowLeft size={16} /> Voltar para o Nosso Story</a>
        <div className="qr-heading-mark">{settings.logo_url ? <img src={settings.logo_url} alt="Logo do casamento" /> : <Heart size={24} />}</div>
        <span className="section-kicker">COMPARTILHE ESTE ACESSO</span>
        <h1>Uma lembrança começa com um clique.</h1>
        <p>Peça aos convidados para apontar a câmera do celular para o QR Code e abrir a página do casamento.</p>
        <div className="qr-code-frame">
          <QRCodeSVG value={joinUrl} size={256} level="H" includeMargin bgColor="#ffffff" fgColor="#211b20" title="QR Code para participar do Nosso Story" />
        </div>
        <div className="qr-event-title">{settings.couple_names || 'Nosso casamento'}</div>
        <div className="qr-url-box">{joinUrl}</div>
        <div className="qr-actions">
          <button type="button" className="button button-primary" onClick={() => window.print()}><Printer size={17} /> Imprimir QR Code</button>
          <button type="button" className="stage-secondary-button" onClick={copyUrl}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Link copiado' : 'Copiar link'}</button>
        </div>
        <div className="qr-instructions"><Smartphone size={17} /><span>O QR Code abre a página pública. Cada convidado informa o nome, opcionalmente o WhatsApp, e depois pode tirar e compartilhar fotos.</span></div>
      </div>
    </main>
  );
}
