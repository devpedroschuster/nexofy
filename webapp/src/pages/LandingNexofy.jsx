// Landing de MARKETING do Nexofy (acesso sem slug)

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, X, ArrowRight, Calendar, Users, Wallet, CheckCircle2, Star,
  ChevronRight, BarChart3, Clock, Bell, ShieldCheck, Sparkles,
  ArrowUpRight, Instagram, Linkedin, Twitter, TrendingUp,
} from 'lucide-react';

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('nx-in');
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

const NAV_LINKS = [
  { label: 'Funcionalidades', href: '#funcionalidades' },
  { label: 'Como funciona', href: '#como-funciona' },
  { label: 'Depoimentos', href: '#depoimentos' },
  { label: 'Preços', href: '#precos' },
];

const FEATURES = [
  {
    icon: Calendar,
    title: 'Agenda e presenças',
    desc: 'Turmas com limite de vagas, check-in em segundos, lista de espera automática e lembretes que reduzem faltas antes que elas aconteçam.',
  },
  {
    icon: BarChart3,
    title: 'Visão financeira (DRE) e inadimplência',
    desc: 'Receita, despesa e margem numa única tela. Veja quem está atrasado antes que vire prejuízo, sem abrir planilha nenhuma.',
  },
  {
    icon: Wallet,
    title: 'Repasses e comissões',
    desc: 'Cálculo automático do que cada professor recebe — plano livre ou por turma — sem contas manuais no fim do mês.',
  },
  {
    icon: Users,
    title: 'Área do aluno',
    desc: 'O aluno matricula-se, confirma presença e acompanha o seu plano sozinho. Menos mensagens no WhatsApp, mais tempo para ensinar.',
  },
];

const STEPS = [
  { n: '01', title: 'Importe o seu estúdio', desc: 'Alunos, planos e turmas migram para o Nexofy em poucos passos — sem digitar tudo de novo.' },
  { n: '02', title: 'Organize agenda e repasses', desc: 'Defina espaços, horários e regras de comissão uma vez. O sistema aplica isso automaticamente todo mês.' },
  { n: '03', title: 'Acompanhe o crescimento', desc: 'Abra o painel e veja receita, inadimplência e ocupação em tempo real, de qualquer lugar.' },
];

const TESTIMONIALS = [
  {
    name: 'Marina Costa',
    role: 'Studio Movimento — Dança',
    quote: 'Parei de fechar o caixa no domingo à noite. O Nexofy mostra a margem real do estúdio em um clique, e os repasses saem certos todo mês.',
    metric: '+32% de margem em 4 meses',
  },
  {
    name: 'Rafael Nogueira',
    role: 'Box Ferro — Funcional',
    quote: 'A inadimplência era o nosso maior problema silencioso. Hoje sei exatamente quem está atrasado no dia 5, não no dia 25.',
    metric: '-18% de inadimplência',
  },
  {
    name: 'Camila Duarte',
    role: 'Espaço Aquarela — Personal',
    quote: 'Os alunos confirmam presença sozinhos pelo próprio app. A minha agenda parou de depender de mensagem de WhatsApp às 7h da manhã.',
    metric: '9h/semana economizadas',
  },
];

const PLANS = [
  {
    name: 'Essencial',
    price: 'R$ 129',
    period: '/mês',
    desc: 'Para estúdios começando a sair da planilha.',
    features: ['Até 80 alunos ativos', 'Agenda e presenças', 'Financeiro básico', 'Suporte por e-mail'],
    highlight: false,
  },
  {
    name: 'Profissional',
    price: 'R$ 249',
    period: '/mês',
    desc: 'O mais escolhido por estúdios em crescimento.',
    features: [
      'Alunos ilimitados',
      'DRE completo e inadimplência',
      'Repasses e comissões automáticos',
      'Área do aluno inclusa',
      'Suporte prioritário',
    ],
    highlight: true,
  },
  {
    name: 'Rede',
    price: 'Sob consulta',
    period: '',
    desc: 'Para redes com múltiplas unidades.',
    features: ['Múltiplos estúdios', 'Painel consolidado', 'Onboarding assistido', 'Gerente de conta dedicado'],
    highlight: false,
  },
];

function Badge({ children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card/80 backdrop-blur border border-border px-3 py-1 text-xs font-semibold text-primary shadow-card">
      {children}
    </span>
  );
}

function AgendaToRevenueMockup() {
  const days = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const occ = [40, 65, 55, 80, 70, 90, 30];
  const rev = [3, 5, 4, 7, 6, 9, 2];

  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-3xl bg-gradient-hero blur-2xl" />
      <div className="relative rotate-[-2deg] rounded-3xl border border-border bg-card shadow-elegant p-6 w-full max-w-md mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Painel · esta semana</p>
            <p className="font-display text-lg font-bold text-foreground">Ocupação → Receita</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-success/soft text-success text-xs font-bold px-2.5 py-1">
            <TrendingUp size={13} /> +14%
          </span>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-4">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="w-full h-20 rounded-lg bg-muted relative overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-lg bg-gradient-primary transition-all"
                  style={{ height: `${occ[i]}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground">{d}</span>
            </div>
          ))}
        </div>

        <div className="h-px bg-border my-4" />

        <div className="flex items-end justify-between gap-1.5 h-16">
          {rev.map((r, i) => (
            <div key={i} className="flex-1 rounded-t-md bg-success" style={{ height: `${r * 10}%`, opacity: 0.55 + r * 0.05 }} />
          ))}
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-xs text-muted-foreground">Receita projetada</p>
          <p className="font-display font-bold text-foreground">R$ 38.400</p>
        </div>
      </div>

      <div className="absolute -right-4 -bottom-4 rotate-[4deg] bg-card rounded-2xl shadow-elegant border border-border px-4 py-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-success/soft flex items-center justify-center">
          <CheckCircle2 size={16} className="text-success" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">Repasse calculado</p>
          <p className="text-sm font-bold text-foreground">Automático hoje</p>
        </div>
      </div>
    </div>
  );
}

export default function LandingNexofy() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  useScrollReveal();

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <style>{`
        [data-reveal] { opacity: 0; transform: translateY(18px); transition: opacity .6s ease, transform .6s ease; }
        [data-reveal].nx-in { opacity: 1; transform: translateY(0); }
        @media (prefers-reduced-motion: reduce) {
          [data-reveal] { opacity: 1; transform: none; transition: none; }
        }
        .nx-underline { background-image: linear-gradient(hsl(var(--primary)), hsl(var(--primary))); background-repeat: no-repeat; background-position: 0 92%; background-size: 100% 10px; }
      `}</style>

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Sparkles size={17} className="text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">Nexofy</span>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
              Entrar
            </button>
            <button
              onClick={() => navigate('/cadastro')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 shadow-brand hover-lift"
            >
              Começar agora <ArrowRight size={15} />
            </button>
          </div>

          <button className="md:hidden p-2 -mr-2" onClick={() => setMenuOpen((v) => !v)} aria-label="Abrir menu" aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-border bg-background px-6 py-4 flex flex-col gap-4">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-foreground/80" onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <button onClick={() => navigate('/login')} className="text-center text-sm font-semibold py-2.5 rounded-xl border border-border">
                Entrar
              </button>
              <button onClick={() => navigate('/cadastro')} className="text-center text-sm font-semibold py-2.5 rounded-xl bg-primary text-primary-foreground">
                Começar agora
              </button>
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-hero" />
        <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-16 pb-24 lg:pt-24 lg:pb-32 grid lg:grid-cols-2 gap-16 items-center">
          <div data-reveal>
            <Badge><Sparkles size={13} /> Feito para estúdios e personal trainers</Badge>
            <h1 className="font-display mt-5 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold leading-[1.08] tracking-tight">
              A gestão do seu estúdio nunca foi tão <span className="nx-underline">simples</span>, inteligente e rentável.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-lg leading-relaxed">
              O Nexofy junta alunos, agenda e finanças numa só plataforma — para você parar de
              apagar incêndio e começar a ver, de verdade, o quanto o seu estúdio está lucrando.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/cadastro')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-6 py-3.5 shadow-brand hover-lift"
              >
                Testar gratuitamente <ArrowRight size={17} />
              </button>
              <a
                href="#como-funciona"
                onClick={(e) => { e.preventDefault(); scrollTo('como-funciona'); }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border font-semibold px-6 py-3.5 hover:bg-muted transition-all"
              >
                Agendar demonstração
              </a>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck size={16} className="text-success" /> Sem cartão para testar</span>
              <span className="flex items-center gap-1.5"><Clock size={16} className="text-success" /> Onboarding em 1 dia</span>
            </div>
          </div>

          <div data-reveal className="lg:justify-self-end">
            <AgendaToRevenueMockup />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="funcionalidades" className="py-24 lg:py-28 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div data-reveal className="max-w-2xl mb-14">
            <Badge>Funcionalidades</Badge>
            <h2 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              Tudo que o seu estúdio precisa, sem depender de cinco ferramentas diferentes.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {FEATURES.map((f, i) => (
              <div key={f.title} data-reveal style={{ transitionDelay: `${i * 80}ms` }} className="group rounded-3xl border border-border bg-card p-8 hover-lift">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/soft text-primary">
                  <f.icon size={22} />
                </div>
                <h3 className="font-display font-bold text-lg mt-5">{f.title}</h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="py-24 lg:py-28 bg-muted/40 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div data-reveal className="max-w-2xl mb-16">
            <Badge>Como funciona</Badge>
            <h2 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              Três passos entre a planilha e o controlo total.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-10 relative">
            <div className="hidden md:block absolute top-6 left-[16.5%] right-[16.5%] h-px bg-border" />
            {STEPS.map((s, i) => (
              <div key={s.n} data-reveal style={{ transitionDelay: `${i * 100}ms` }} className="relative">
                <div className="w-12 h-12 rounded-2xl bg-foreground text-background flex items-center justify-center font-display font-bold relative z-10">
                  {s.n}
                </div>
                <h3 className="font-display font-bold text-lg mt-5">{s.title}</h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section id="depoimentos" className="py-24 lg:py-28 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div data-reveal className="max-w-2xl mb-14">
            <Badge>Depoimentos</Badge>
            <h2 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              Estúdios que trocaram planilha por clareza.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <div key={t.name} data-reveal style={{ transitionDelay: `${i * 80}ms` }} className="rounded-3xl border border-border bg-card p-8 flex flex-col shadow-card">
                <div className="flex gap-0.5 text-warning">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star key={idx} size={15} fill="currentColor" strokeWidth={0} />
                  ))}
                </div>
                <p className="mt-4 text-foreground/80 leading-relaxed flex-1">“{t.quote}”</p>
                <div className="mt-6 pt-6 border-t border-border">
                  <p className="font-display font-bold">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.role}</p>
                  <span className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-success bg-success/soft rounded-full px-2.5 py-1">
                    <ArrowUpRight size={12} /> {t.metric}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PREÇOS */}
      <section id="precos" className="py-24 lg:py-28 bg-muted/40 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div data-reveal className="max-w-2xl mb-14 mx-auto text-center">
            <Badge>Preços</Badge>
            <h2 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
              Um plano para cada fase do seu estúdio.
            </h2>
            <p className="mt-3 text-muted-foreground">Cancele quando quiser. Sem taxa de setup.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {PLANS.map((p, i) => (
              <div
                key={p.name}
                data-reveal
                style={{ transitionDelay: `${i * 80}ms` }}
                className={`rounded-3xl p-8 flex flex-col ${
                  p.highlight ? 'bg-foreground text-background shadow-elegant md:-translate-y-3' : 'bg-card border border-border'
                }`}
              >
                {p.highlight && (
                  <span className="self-start mb-4 text-xs font-bold text-foreground bg-success rounded-full px-3 py-1">
                    Recomendado
                  </span>
                )}
                <h3 className="font-display font-bold text-xl">{p.name}</h3>
                <p className={`text-sm mt-1 ${p.highlight ? 'text-background/60' : 'text-muted-foreground'}`}>{p.desc}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-bold">{p.price}</span>
                  <span className={p.highlight ? 'text-background/50' : 'text-muted-foreground'}>{p.period}</span>
                </div>

                <ul className="mt-7 space-y-3 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 size={17} className={p.highlight ? 'text-success mt-0.5' : 'text-primary mt-0.5'} />
                      <span className={p.highlight ? 'text-background/85' : 'text-foreground/75'}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => navigate('/cadastro')}
                  className={`mt-8 inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold px-5 py-3 hover-lift ${
                    p.highlight ? 'bg-background text-foreground' : 'bg-primary text-primary-foreground shadow-brand'
                  }`}
                >
                  Escolher {p.name} <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-24 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-10">
          <div data-reveal className="relative overflow-hidden rounded-3xl bg-foreground px-8 py-16 sm:px-16 sm:py-20 text-center">
            <div className="absolute inset-0 bg-gradient-primary opacity-20" />
            <div className="relative">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-background tracking-tight max-w-2xl mx-auto">
                Pronto para ver o seu estúdio com clareza total?
              </h2>
              <p className="mt-4 text-background/60 max-w-lg mx-auto">
                Comece hoje, sem cartão de crédito, e traga os seus alunos e turmas em poucos minutos.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => navigate('/cadastro')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-background text-foreground font-semibold px-6 py-3.5 hover-lift"
                >
                  Testar gratuitamente <ArrowRight size={17} />
                </button>
                <a href="#" className="inline-flex items-center justify-center gap-2 rounded-xl border border-background/20 text-background font-semibold px-6 py-3.5 hover:bg-background/10 transition-all">
                  Falar com um especialista
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border pt-16 pb-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-10">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-primary flex items-center justify-center">
                  <Sparkles size={17} className="text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-lg">Nexofy</span>
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs">
                Gestão completa para estúdios, boxes e personal trainers — agenda, alunos e financeiro num só lugar.
              </p>
              <div className="flex items-center gap-3 mt-6">
                {[Instagram, Linkedin, Twitter].map((Icon, i) => (
                  <a key={i} href="#" className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors">
                    <Icon size={16} />
                  </a>
                ))}
              </div>
            </div>

            <div>
              <p className="font-display font-bold text-sm">Produto</p>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><a href="#funcionalidades" className="hover:text-foreground">Funcionalidades</a></li>
                <li><a href="#precos" className="hover:text-foreground">Preços</a></li>
                <li><a href="#como-funciona" className="hover:text-foreground">Como funciona</a></li>
              </ul>
            </div>

            <div>
              <p className="font-display font-bold text-sm">Empresa</p>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Sobre</a></li>
                <li><a href="#" className="hover:text-foreground">Contato</a></li>
                <li><a href="#" className="hover:text-foreground">Central de ajuda</a></li>
              </ul>
            </div>

            <div>
              <p className="font-display font-bold text-sm">Legal</p>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">Termos de uso</a></li>
                <li><a href="#" className="hover:text-foreground">Privacidade</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Nexofy. Todos os direitos reservados.</p>
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Bell size={13} /> Feito para quem vive de estúdio, não de planilha.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}