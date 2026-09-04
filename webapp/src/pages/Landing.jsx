import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './landing.css';
import { useEstudioPublico } from '../hooks/useEstudioPublico';
import { usePlanosPublicos } from '../hooks/usePlanosPublicos';
import { useModalidadesPublicas } from '../hooks/useModalidadesPublicas';
import { resolverLandingCopy, resolverConteudoLanding } from '../lib/landingCopy';
import { montarCssVarsMarca } from '../lib/corMarca';
import { leadsService } from '../services/leadsService';
import { LINKS } from '../lib/constants';
import LandingNexofy from './LandingNexofy';

function setMetaTag(attr, key, content) {
  if (!content) return;
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

// Domínio raiz que realmente bateu com o hostname atual, só pra exibir
// na mensagem de erro abaixo. Cai pro primeiro configurado (ou o default
// 'gestao.app') se por algum motivo não achar — não deveria acontecer,
// já que se chegamos aqui é porque um slug foi resolvido.
function resolverDominioExibicao() {
  const dominios = (import.meta.env.VITE_ROOT_DOMAINS || 'gestao.app')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return dominios.find((d) => hostname === d || hostname.endsWith(`.${d}`)) ?? dominios[0];
}
const DOMINIO_EXIBICAO = resolverDominioExibicao();

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

function normalizarInstagramUrl(valor) {
  if (!valor) return null;
  const limpo = valor.trim();
  if (/^https?:\/\//i.test(limpo)) return limpo;
  const handle = limpo.replace(/^@/, '');
  return handle ? `https://instagram.com/${handle}` : null;
}

function normalizarWhatsappDigits(valor) {
  if (!valor) return null;
  const digits = String(valor).replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

export default function Landing() {
  const navigate = useNavigate();

  // Dados públicos do estúdio (resolvido pelo subdomínio)
  const {
    data: estudio,
    isLoading: estudioLoading,
    isError: estudioError,
    slug,
  } = useEstudioPublico();

  const nomeEstudio = estudioLoading ? '' : (estudio?.nome ?? 'Gestão App');

  //  Planos
  const { planos, loading: planosLoading } = usePlanosPublicos(estudio?.id);

  //  Modalidades reais do estúdio, agrupadas por área
  const { grupos: modalidadeGrupos, loading: modalidadesLoading } = useModalidadesPublicas(estudio?.id);

  //  Copy do hero/seções — varia por segmento (danca_fitness, escolinha_esportiva, ...),
  //  com override por campo quando o estúdio customizou via mini page-builder (PED-9/10/11).
  //  Capa customizada (imagem_capa_url) ainda não é consumida aqui de propósito.
  const copy = resolverConteudoLanding(estudio?.landing_config, resolverLandingCopy(estudio?.segmento));

  //  Nível 2: cor de marca customizável. `null` quando o estúdio não
  //  definiu cor nenhuma — nesse caso não aplicamos `style` no root e os
  //  defaults fixos do landing.css valem (mesmo comportamento de antes).
  const cssVarsMarca = useMemo(
    () => montarCssVarsMarca(estudio?.cor_primaria, estudio?.cor_secundaria),
    [estudio?.cor_primaria, estudio?.cor_secundaria]
  );

  useEffect(() => {
    if (!estudio) return;
    const titulo = `${nomeEstudio} | ${copy.heroTag}`;
    document.title = titulo;
    setMetaTag('name', 'description', copy.heroSub);
    setMetaTag('property', 'og:title', titulo);
    setMetaTag('property', 'og:description', copy.heroSub);
  }, [estudio, nomeEstudio, copy.heroTag, copy.heroSub]);

  // Lead form state
  const [leadNome, setLeadNome] = useState('');
  const [leadTel, setLeadTel] = useState('');
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadStatus, setLeadStatus] = useState(null); // 'ok' | 'err' | null
  const [leadErro, setLeadErro] = useState('');
  // Honeypot simples anti-bot: campo invisível que um usuário humano nunca preenche
  const [honeypot, setHoneypot] = useState('');

  // Hooks precisam rodar sempre, na mesma ordem, em todo render — por isso
  // os returns condicionais (inclusive o de domínio sem tenant resolvido)
  // ficam todos depois deles, nunca entre eles.
  if (!slug) {
    return <LandingNexofy />;
  }

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

  // Tela de erro: slug no hostname mas estúdio não existe no banco
  if (!estudioLoading && !estudioError && slug && !estudio) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</p>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#1f2937', marginBottom: '8px' }}>
            Estúdio não encontrado
          </h1>
          <p style={{ color: '#6b7280' }}>
            Nenhum estúdio cadastrado para <strong>{slug}</strong>.{DOMINIO_EXIBICAO}
          </p>
        </div>
      </div>
    );
  }

  // Helpers
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
  if (!estudio?.id) return;
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
    await leadsService.criarLeadPublico({
      nomeVisitante: leadNome.trim(),
      telefoneVisitante: telefoneDigits,
      estudioId: estudio.id,
    });
 
    setLeadStatus('ok');
    setLeadNome('');
    setLeadTel('');
  } catch (err) {
    console.error('[Landing] Falha ao registrar lead:', {
      code: err?.code,
      message: err?.message,
      estudioId: estudio.id,
    });
    setLeadStatus('err');
    setLeadErro('Não conseguimos registrar agora. Tente novamente ou fale pelo WhatsApp.');
  } finally {
    setLeadLoading(false);
  }
}

  // Plan helpers
  const isFeatured = (plano, todos) => {
    if (todos.length === 0) return false;
    const mid = Math.floor(todos.length / 2);
    return todos.indexOf(plano) === mid;
  };

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
    <div id="page-landing" style={cssVarsMarca ?? undefined}>

      {/* ── Navbar ─────────────────────────────────────────────────── */}
      <nav className="navbar">
        <a className="nav-logo" href="/">
          <div className="logo-mark">{(nomeEstudio || 'G').charAt(0).toUpperCase()}</div>
          <span className="logo-name">{nomeEstudio.toUpperCase()}</span>
        </a>
        <div className="nav-links">
          <button className="nav-link" onClick={() => scrollTo('sec-aulas')}>Modalidades</button>
          <button className="nav-link" onClick={() => scrollTo('sec-sobre')}>Sobre</button>
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
            {copy.heroTag}
          </div>

          <h1 className="anim-fade-up s1">
            {copy.heroCustomizado ? (
              copy.heroTitlePre
            ) : (
              <>{copy.heroTitlePre}<br /><em>{copy.heroTitleEm}</em></>
            )}
          </h1>

          <p className="hero-sub anim-fade-up s2">
            {copy.heroSub}
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
                <p className="hero-form-hint">
                  Ao enviar, você concorda que {nomeEstudio} entre em contato pelo WhatsApp. Veja como tratamos seus dados na{' '}
                  <Link to={LINKS.PRIVACIDADE} className="hero-form-link">Política de Privacidade</Link>.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── Modalidades (dados reais do estúdio, via RPC modalidades_publicas) ── */}
      {(modalidadesLoading || modalidadeGrupos.length > 0) && (
        <section id="sec-aulas" className="section section-alt">
          <div className="section-header">
            <div className="section-tag">{copy.modalidadesTag}</div>
            <h2 className="section-title">{copy.modalidadesTitle}</h2>
            <p className="section-sub">{copy.modalidadesSub}</p>
          </div>

          {modalidadesLoading ? (
            <div className="modality-loading">
              <div className="modality-skeleton"></div>
              <div className="modality-skeleton"></div>
            </div>
          ) : (
            <div className="modality-grid">
              {modalidadeGrupos.map((grupo, i) => {
                // Alterna cor primária/secundária por índice — não depende
                // mais de nome de modalidade específico (Funcional/Dança).
                const isPri = i % 2 === 0;
                const accentClass = isPri ? 'accent-pri' : 'accent-sec';
                const accentColor = isPri ? 'var(--pri)' : 'var(--sec-d)';
                const accentBg = isPri ? 'rgba(217,142,115,.15)' : 'rgba(138,154,91,.15)';

                return (
                  <div
                    key={grupo.area}
                    className={`modality-card ${accentClass} anim-fade-up${i > 0 ? ` s${Math.min(i, 3)}` : ''}`}
                  >
                    <div className="modality-icon" style={{ background: accentBg, fontSize: '26px' }}>
                      {isPri ? '⚡' : '✦'}
                    </div>
                    <h3 className="modality-title" style={{ color: accentColor }}>{grupo.area}</h3>
                    <p className="modality-desc">
                      {grupo.modalidades.length === 1
                        ? grupo.modalidades[0].nome
                        : `${grupo.modalidades.length} opções: ${grupo.modalidades.map(m => m.nome).join(', ')}`}
                    </p>
                    <div style={{ marginTop: '8px' }}>
                      <button
                        className={isPri ? 'btn btn-outline btn-sm' : 'btn btn-sm'}
                        style={isPri ? undefined : { background: 'var(--sec)', color: '#fff' }}
                        onClick={() => scrollTo('hero-form-anchor')}
                      >
                        Quero experimentar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

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
                // regras_acesso vem como jsonb: [{ limite, modalidade }, ...].
                // limite >= 999 é a convenção usada pro "plano livre" (acesso
                // ilimitado àquela modalidade).
                const regrasTexto = regras
                  .map((r) => {
                    if (typeof r === 'string') return r; // fallback pra dado legado, se existir
                    if (!r || typeof r !== 'object' || !r.modalidade) return null;
                    return r.limite >= 999
                      ? `${r.modalidade}: ilimitado`
                      : `${r.modalidade}: até ${r.limite}x/mês`;
                  })
                  .filter(Boolean);
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
                      {regrasTexto.map((texto, i) => (
                        <div key={i} className="plan-feat">
                          <span className="feat-check">✓</span>
                          <span>{texto}</span>
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

            {/* ── Sobre (copy custom ou default do segmento, PED-11) ──────── */}
      <section id="sec-sobre" className="section section-alt">
        <div className="section-header">
          <div className="section-tag">Sobre nós</div>
          <h2 className="section-title">Quem somos</h2>
          <p className="section-sub">{copy.sobreTexto}</p>
        </div>
      </section>

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
            <button className="footer-link" onClick={() => scrollTo('sec-sobre')}>Sobre</button>
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