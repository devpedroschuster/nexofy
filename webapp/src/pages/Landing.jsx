import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './landing.css';
import { useEstudioPublico } from '../hooks/useEstudioPublico';
import { usePlanosPublicos } from '../hooks/usePlanosPublicos';

// Domínios aceitos para embed do Google Maps — defesa em profundidade contra
// um iframe apontando pra origem inesperada, caso o campo maps_embed_url
// venha corrompido/malicioso por qualquer motivo.
const MAPS_EMBED_HOSTS_PERMITIDOS = ['www.google.com', 'maps.google.com'];

function isMapsEmbedUrlSegura(url) {
  if (!url) return false;
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === 'https:' && MAPS_EMBED_HOSTS_PERMITIDOS.includes(hostname);
  } catch {
    return false;
  }
}

// Normaliza o campo "instagram" do estúdio: aceita tanto uma URL completa
// já salva quanto um @handle solto, e sempre retorna uma URL válida ou null.
function normalizarInstagramUrl(valor) {
  if (!valor) return null;
  const limpo = valor.trim();
  if (/^https?:\/\//i.test(limpo)) return limpo;
  const handle = limpo.replace(/^@/, '');
  return handle ? `https://instagram.com/${handle}` : null;
}

// Normaliza o número de WhatsApp pra apenas dígitos, do jeito que a API do wa.me espera.
function normalizarWhatsappDigits(valor) {
  if (!valor) return null;
  const digits = String(valor).replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

export default function Landing() {
  const navigate = useNavigate();

  // ── Dados públicos do estúdio (resolvido pelo subdomínio) ────────────
  const {
    data: estudio,
    isLoading: estudioLoading,
    isError: estudioError,
    slug,
  } = useEstudioPublico();

  // ── Planos (useQuery, com cache — substitui o useEffect manual) ──────
  const { planos, loading: planosLoading } = usePlanosPublicos(estudio?.id);

  // ── Lead form state ─────────────────────────────────────────────────
  const [leadNome, setLeadNome] = useState('');
  const [leadTel, setLeadTel] = useState('');
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadStatus, setLeadStatus] = useState(null); // 'ok' | 'err' | null
  const [leadErro, setLeadErro] = useState('');
  // Honeypot simples anti-bot: campo invisível que um usuário humano nunca
  // preenche. Bots que preenchem todos os inputs de um form caem aqui.
  const [honeypot, setHoneypot] = useState('');

  // ── Tela de falha ao resolver o estúdio (rede/RLS/infra) ──────────────
  // Importante: isso é diferente de "slug não existe no banco" (ver abaixo).
  // Antes essas duas situações caíam na mesma mensagem de "não encontrado",
  // o que é enganoso durante uma instabilidade passageira do Supabase.
  if (!estudioLoading && estudioError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</p>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#1f2937', marginBottom: '8px' }}>
            Não foi possível carregar esta página
          </h1>
          <p style={{ color: '#6b7280' }}>
            Tente novamente em alguns instantes.
          </p>
        </div>
      </div>
    );
  }

  // ── Tela de erro: slug no hostname mas estúdio não existe no banco ────
  if (!estudioLoading && !estudioError && slug && !estudio) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</p>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#1f2937', marginBottom: '8px' }}>
            Estúdio não encontrado
          </h1>
          <p style={{ color: '#6b7280' }}>
            Nenhum estúdio cadastrado para <strong>{slug}</strong>.gestao.app
          </p>
        </div>
      </div>
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  function formatTelefone(val) {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  async function handleLeadSubmit(e) {
    e.preventDefault();
    if (!estudio?.id) return; // guarda contra submit antes do estúdio resolver
    if (!leadNome.trim() || !leadTel.trim()) return;

    // Honeypot preenchido = bot. Finge sucesso pra não dar dica de detecção.
    if (honeypot) {
      setLeadStatus('ok');
      setLeadNome('');
      setLeadTel('');
      return;
    }

    const telefoneDigits = leadTel.replace(/\D/g, '');
    if (telefoneDigits.length < 10) {
      setLeadStatus('err');
      setLeadErro('Informe um telefone válido com DDD.');
      return;
    }

    setLeadLoading(true);
    setLeadStatus(null);
    setLeadErro('');
    try {
      const { error } = await supabase
        .from('presencas_agenda')
        .insert([{
          estudio_id: estudio.id,                    // ← isolamento multi-tenant
          nome_visitante: leadNome.trim(),
          telefone_visitante: telefoneDigits,
          status_conversao: 'pendente',
        }]);

      if (error) throw error;
      setLeadStatus('ok');
      setLeadNome('');
      setLeadTel('');
    } catch (err) {
      console.error('[Landing] Falha ao registrar lead:', err);
      setLeadStatus('err');
      setLeadErro('Não conseguimos registrar agora. Tente novamente ou fale pelo WhatsApp.');
    } finally {
      setLeadLoading(false);
    }
  }

  // ── Plan helpers ─────────────────────────────────────────────────────
  const isFeatured = (plano, todos) => {
    if (todos.length === 0) return false;
    const mid = Math.floor(todos.length / 2);
    return todos.indexOf(plano) === mid;
  };

  // ── Dados de contato (Supabase > fallback hardcoded) ─────────────────
  // Enquanto o estúdio ainda está carregando, não mostramos nome/marca
  // errados (evita o "flash" de branding genérico antes do real aparecer).
  const nomeEstudio = estudioLoading ? '' : (estudio?.nome ?? 'Gestão App');

  const whatsappDigits = normalizarWhatsappDigits(estudio?.whatsapp);
  const WHATSAPP_URL = whatsappDigits
    ? `https://wa.me/${whatsappDigits}?text=Olá!%20Vi%20o%20site%20e%20quero%20saber%20mais.`
    : null;

  const INSTAGRAM_URL = normalizarInstagramUrl(estudio?.instagram);
  const MAPS_URL = estudio?.maps_url || null;
  const MAPS_EMBED = isMapsEmbedUrlSegura(estudio?.maps_embed_url)
    ? estudio.maps_embed_url
    : null;

  return (
    <div id="page-landing">

      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav className="navbar">
        <a className="nav-logo" href="/">
          <div className="logo-mark">{(nomeEstudio || 'G').charAt(0).toUpperCase()}</div>
          <span className="logo-name">{nomeEstudio.toUpperCase()}</span>
        </a>
        <div className="nav-links">
          <button className="nav-link" onClick={() => scrollTo('sec-aulas')}>Modalidades</button>
          <button className="nav-link" onClick={() => scrollTo('sec-planos')}>Planos</button>
          <button className="nav-link" onClick={() => scrollTo('sec-footer')}>Contato</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/login')}
          >
            Já sou aluno →
          </button>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-deco">
          <div className="hero-blob"></div>
          <div className="hero-circle" style={{ width: '600px', height: '600px', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}></div>
          <div className="hero-circle" style={{ width: '400px', height: '400px', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}></div>
          <div className="hero-circle" style={{ width: '220px', height: '220px', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(217,142,115,.05)' }}></div>
        </div>

        <div className="hero-content" style={{ maxWidth: '680px', position: 'relative', zIndex: 1 }}>
          <div className="hero-tag anim-fade-up">
            <span className="hero-dot"></span>
            Funcional · Dança · Bem-estar
          </div>

          <h1 className="anim-fade-up s1">
            Mova-se,<br />expresse-se,<br /><em>ilumine-se.</em>
          </h1>

          <p className="hero-sub anim-fade-up s2">
            Treinamento funcional e dança para quem quer resultado e não abre mão de se sentir bem.
            Primeira aula grátis — sem compromisso.
          </p>

          {/* ── Inline Lead Form ──────────────────────────────────── */}
          <div className="hero-form-wrap anim-fade-up s3">
            {leadStatus === 'ok' ? (
              <div className="lead-success anim-scale-in">
                <span className="lead-success-icon">✓</span>
                <div>
                  <strong>Perfeito! Aguarde nosso contato.</strong>
                  <span>Nossa equipe vai chamar você em breve pelo WhatsApp.</span>
                </div>
              </div>
            ) : (
              <form className="hero-form" onSubmit={handleLeadSubmit}>
                {/* Honeypot: invisível pra humanos, atrai bots que preenchem tudo */}
                <input
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={e => setHoneypot(e.target.value)}
                  autoComplete="off"
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{ position: 'absolute', left: '-9999px', width: 0, height: 0, opacity: 0 }}
                />
                <div className="hero-form-fields">
                  <div className="inp-group" style={{ marginBottom: 0 }}>
                    <input
                      className={`inp${leadStatus === 'err' ? ' error' : ''}`}
                      type="text"
                      placeholder="Seu nome"
                      value={leadNome}
                      onChange={e => setLeadNome(e.target.value)}
                      required
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="inp-group" style={{ marginBottom: 0 }}>
                    <input
                      className={`inp${leadStatus === 'err' ? ' error' : ''}`}
                      type="tel"
                      placeholder="WhatsApp (com DDD)"
                      value={leadTel}
                      onChange={e => setLeadTel(formatTelefone(e.target.value))}
                      required
                      autoComplete="tel"
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary hero-form-submit"
                    disabled={leadLoading || !estudio}
                  >
                    {leadLoading
                      ? <><span className="spinner"></span> Enviando…</>
                      : 'Quero uma aula experimental'}
                  </button>
                </div>
                {leadStatus === 'err' && (
                  <p className="inp-err" style={{ marginTop: '10px' }}>{leadErro}</p>
                )}
                <p className="hero-form-hint">
                  Gratuito, sem cartão, sem compromisso.{WHATSAPP_URL && (
                    <> Ou{' '}
                      <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="hero-form-link">
                        fale direto no WhatsApp →
                      </a>
                    </>
                  )}
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Modalidades ────────────────────────────────────────────── */}
      <section id="sec-aulas" className="section section-alt">
        <div className="section-header">
          <div className="section-tag">O que oferecemos</div>
          <h2 className="section-title">Nossas Modalidades</h2>
          <p className="section-sub">
            Duas práticas poderosas sob o mesmo teto, com instrutores apaixonados
            e metodologias que realmente funcionam.
          </p>
        </div>
        <div className="modality-grid">
          {/* Card Funcional */}
          <div className="modality-card funcional anim-fade-up">
            <div className="modality-icon" style={{ background: 'rgba(217,142,115,.15)', fontSize: '26px' }}>⚡</div>
            <h3 className="modality-title" style={{ color: 'var(--pri)' }}>Funcional</h3>
            <p className="modality-desc">
              Treinamento de alta performance que desenvolve força, equilíbrio e
              condicionamento completo — para todos os níveis.
            </p>
            <div className="schedule-label" style={{ color: 'var(--pri)' }}>Grade de horários</div>
            <div className="schedule-item">Seg / Qua / Sex — 07:00 e 09:00</div>
            <div className="schedule-item">Seg a Sex — 18:30</div>
            <div className="schedule-item">Sábados — 09:00</div>
            <div style={{ marginTop: '28px' }}>
              <button className="btn btn-outline btn-sm" onClick={() => scrollTo('hero-form-anchor')}>
                Quero experimentar
              </button>
            </div>
          </div>

          {/* Card Dança */}
          <div className="modality-card danca anim-fade-up s1">
            <div className="modality-icon" style={{ background: 'rgba(138,154,91,.15)', fontSize: '26px' }}>✦</div>
            <h3 className="modality-title" style={{ color: 'var(--sec-d)' }}>Dança</h3>
            <p className="modality-desc">
              Do samba ao contemporâneo, celebramos o movimento e a expressão
              artística em aulas que energizam corpo e mente.
            </p>
            <div className="schedule-label" style={{ color: 'var(--sec-d)' }}>Grade de horários</div>
            <div className="schedule-item">Terças e Quintas — 19:00 e 20:00</div>
            <div className="schedule-item">Quartas — 20:00</div>
            <div className="schedule-item">Sábados — 10:00</div>
            <div style={{ marginTop: '28px' }}>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--sec)', color: '#fff' }}
                onClick={() => scrollTo('hero-form-anchor')}
              >
                Quero experimentar
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Planos (Supabase, via useQuery) ───────────────────────────── */}
      {(planosLoading || planos.length > 0) && (
        <section id="sec-planos" className="section">
          <div className="section-header">
            <div className="section-tag">Invista em você</div>
            <h2 className="section-title">Nossos Planos</h2>
            <p className="section-sub">
              Escolha o plano que encaixa na sua rotina. Sem taxa de adesão.
            </p>
          </div>

          {planosLoading ? (
            <div className="plans-loading">
              <div className="plans-skeleton"></div>
              <div className="plans-skeleton"></div>
              <div className="plans-skeleton"></div>
            </div>
          ) : (
            <div className="plans-grid">
              {planos.map((plano) => {
                const featured = isFeatured(plano, planos);
                const regras = Array.isArray(plano.regras_acesso) ? plano.regras_acesso : [];
                return (
                  <div key={plano.id} className={`plan-card${featured ? ' featured' : ''}`}>
                    {featured && <div className="plan-popular">Mais escolhido</div>}
                    <div className="plan-name">{plano.nome}</div>
                    <div className="plan-price">
                      <span style={{ fontSize: '18px', color: 'var(--muted)', alignSelf: 'flex-start', paddingTop: '8px' }}>R$</span>
                      <span className="plan-price-num">
                        {Number(plano.preco).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      <span className="plan-price-per">/mês</span>
                    </div>
                    <div className="plan-features">
                      {plano.duracao_meses && (
                        <div className="plan-feat">
                          <span className="feat-check">✓</span>
                          <span>{plano.duracao_meses} {plano.duracao_meses === 1 ? 'mês' : 'meses'} de acesso</span>
                        </div>
                      )}
                      {plano.frequencia_semanal && (
                        <div className="plan-feat">
                          <span className="feat-check">✓</span>
                          <span>{plano.frequencia_semanal}× por semana</span>
                        </div>
                      )}
                      {regras.map((r, i) => (
                        <div key={i} className="plan-feat">
                          <span className="feat-check">✓</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      className={`btn btn-full${featured ? ' btn-primary' : ' btn-outline'}`}
                      onClick={() => scrollTo('hero-form-anchor')}
                    >
                      Começar agora
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── Anchor for "Quero experimentar" scrolls ────────────────── */}
      <div id="hero-form-anchor" style={{ height: 0 }}></div>

      {/* ── Second CTA strip ───────────────────────────────────────── */}
      <section className="cta-strip">
        <div className="cta-strip-inner">
          <div>
            <div className="cta-strip-title">Primeira aula é por nossa conta.</div>
            <div className="cta-strip-sub">Venha conhecer o espaço sem compromisso algum.</div>
          </div>
          <div className="cta-strip-btns">
            <button
              className="btn btn-primary"
              onClick={() => scrollTo('hero-form-anchor')}
              style={{ padding: '14px 36px', fontSize: '15px' }}
            >
              Agendar aula grátis
            </button>
            {WHATSAPP_URL && (
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="btn btn-wa"
                style={{ padding: '14px 28px', fontSize: '15px' }}
              >
                💬 WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer id="sec-footer">
        <div className="footer-grid">
          {/* Brand col */}
          <div>
            <div className="nav-logo" style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="logo-mark">{(nomeEstudio || 'G').charAt(0).toUpperCase()}</div>
              <span className="logo-name">{nomeEstudio.toUpperCase()}</span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.75', maxWidth: '260px' }}>
              Espaço de movimento criado para quem quer resultado real e se sentir bem no processo.
            </p>
          </div>

          {/* Contato col */}
          <div>
            <div className="footer-col-title">Contato</div>
            {WHATSAPP_URL && (
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="footer-link">
                📱 WhatsApp
              </a>
            )}
            {INSTAGRAM_URL && (
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="footer-link">
                📷 Instagram
              </a>
            )}
            {MAPS_URL && (
              <a href={MAPS_URL} target="_blank" rel="noreferrer" className="footer-link">
                📍 Como chegar
              </a>
            )}
          </div>

          {/* Endereço col — só exibe se tiver mapa */}
          {MAPS_URL && (
            <div>
              <div className="footer-col-title">Localização</div>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '14px', display: 'inline-flex' }}
              >
                Abrir no Maps →
              </a>
            </div>
          )}

          {/* Links col */}
          <div>
            <div className="footer-col-title">Navegação</div>
            <button className="footer-link" onClick={() => scrollTo('sec-aulas')}>Modalidades</button>
            <button className="footer-link" onClick={() => scrollTo('sec-planos')}>Planos</button>
            <button className="footer-link" onClick={() => navigate('/login')}>Área do Aluno</button>
          </div>
        </div>

        {/* Google Maps embed — só exibe se a URL passar na validação de domínio */}
        {MAPS_EMBED && (
          <div className="footer-map">
            <iframe
              title={`Localização ${nomeEstudio}`}
              src={MAPS_EMBED}
              width="100%"
              height="200"
              style={{ border: 0, borderRadius: '12px', filter: 'grayscale(20%)' }}
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
        )}

        <div className="footer-bottom">
          <span className="footer-copy">© {new Date().getFullYear()} {nomeEstudio} · Todos os direitos reservados.</span>
          {INSTAGRAM_URL && (
            <span className="footer-copy">
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--pri)', fontWeight: 700, textDecoration: 'none' }}>
                Instagram
              </a>
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}