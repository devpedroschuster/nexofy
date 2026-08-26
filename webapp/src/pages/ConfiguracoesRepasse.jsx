import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Save, RefreshCw, Calculator, Percent, DollarSign, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Surface from '../components/ui/Surface';

import {
  useConfiguracoesRepasse,
  useSalvarConfiguracoesRepasse,
} from '../hooks/useConfiguracoesRepasse';

const DEFAULTS_REPASSE = {
  valor_1_modalidade: 0,
  valor_multi_modalidade: 0,
  plano_livre_pct_casa: 50,
  plano_livre_pct_prof: 50,
  aula_experimental_valor: 0,
  aula_experimental_pct_prof: 0,
  aula_avulsa_valor: 0,
  aula_avulsa_pct_casa: 50,
  aula_avulsa_pct_prof: 50,
};

const toNumber = (v) => Number(v) || 0;

// FIX: testes de soma agora escrevem em paths próprios (soma-livre / soma-avulsa)
// e usam tolerância de arredondamento em vez de === 100.
const schema = yup.object().shape({
  valor_1_modalidade: yup.number().min(0).required('Campo obrigatório'),
  valor_multi_modalidade: yup.number().min(0).required('Campo obrigatório'),
  plano_livre_pct_casa: yup.number().min(0).max(100).required('Campo obrigatório'),
  plano_livre_pct_prof: yup.number().min(0).max(100).required('Campo obrigatório'),
  aula_experimental_valor: yup.number().min(0).required('Campo obrigatório'),
  aula_experimental_pct_prof: yup.number().min(0).max(100).required('Campo obrigatório'),
  aula_avulsa_valor: yup.number().min(0).required('Campo obrigatório'),
  aula_avulsa_pct_casa: yup.number().min(0).max(100).required('Campo obrigatório'),
  aula_avulsa_pct_prof: yup.number().min(0).max(100).required('Campo obrigatório'),
})
  .test('soma-livre', 'soma-livre', function (values) {
    const soma = toNumber(values.plano_livre_pct_casa) + toNumber(values.plano_livre_pct_prof);
    if (Math.abs(soma - 100) < 0.01) return true;
    return this.createError({ path: 'soma-livre', message: 'A soma do Plano Livre (% Casa + % Prof.) deve ser 100%' });
  })
  .test('soma-avulsa', 'soma-avulsa', function (values) {
    const soma = toNumber(values.aula_avulsa_pct_casa) + toNumber(values.aula_avulsa_pct_prof);
    if (Math.abs(soma - 100) < 0.01) return true;
    return this.createError({ path: 'soma-avulsa', message: 'A soma da Aula Avulsa (% Casa + % Prof.) deve ser 100%' });
  });

function Tooltip({ text }) {
  return (
    <span className="group relative inline-flex items-center cursor-help">
      <Info size={13} className="text-muted-foreground/50 hover:text-primary transition-colors" />
      <span className="
        pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
        w-56 rounded-xl bg-foreground/90 text-background text-[11px] font-medium leading-snug
        px-3 py-2 shadow-lg
        opacity-0 group-hover:opacity-100 transition-opacity duration-150
      ">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground/90" />
      </span>
    </span>
  );
}

function DivisaoSimulada({ valor, pctProf, pctCasa }) {
  if (!valor || valor <= 0) return null;
  const prof = ((pctProf / 100) * valor).toFixed(2);
  const casa = pctCasa != null ? ((pctCasa / 100) * valor).toFixed(2) : null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] font-semibold text-muted-foreground bg-muted/40 rounded-xl px-3 py-2 mt-1">
      <Calculator size={12} className="text-primary shrink-0" />
      <span>Exemplo com <span className="text-foreground">R$ {Number(valor).toFixed(2)}</span>:</span>
      <span className="text-emerald-600">Prof. → R$ {prof}</span>
      {casa != null && <span className="text-amber-600">Casa → R$ {casa}</span>}
    </div>
  );
}

// FIX: Field vive fora do componente pai -> identidade estável, sem remount
// a cada mudança de `errors` (que ocorre a cada tecla após o 1º submit inválido).
function Field({ label, name, suffix, icon: Icon, tooltip, register, error }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-black text-muted-foreground uppercase flex items-center gap-1.5">
        {Icon && <Icon size={12} />}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className="relative">
        <Input
          type="number"
          step="0.01"
          error={!!error}
          {...register(name, { valueAsNumber: true })}
          className={suffix ? 'pr-10' : ''}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground/60 select-none">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p className="text-[10px] font-bold text-destructive animate-in fade-in slide-in-from-top-1">
          {error.message}
        </p>
      )}
    </div>
  );
}

export default function ConfiguracoesRepasse() {
  const { data: configs, isLoading, error: erroCarregamento } = useConfiguracoesRepasse();
  const mutation = useSalvarConfiguracoesRepasse();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: DEFAULTS_REPASSE,
  });

  const navigate = useNavigate();
  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // eslint-disable-next-line no-unused-vars
  const navegarComConfirmacao = useCallback((destino) => {
    if (isDirtyRef.current) {
      const confirmar = window.confirm('Você tem alterações não salvas. Deseja sair sem salvar?');
      if (!confirmar) return;
    }
    navigate(destino);
  }, [navigate]);

  // FIX: só reseta o form quando não há edição em andamento, evitando
  // sobrescrever silenciosamente digitação do usuário após um refetch.
  // FIX: estúdio novo (configs === null) recebe defaults em vez de tela em branco/travada.
  useEffect(() => {
    if (isDirty) return;
    if (configs) reset(configs);
    else if (configs === null) reset(DEFAULTS_REPASSE);
  }, [configs, reset, isDirty]);

  const onSubmit = (data) => mutation.mutate(data);

  const watched = useWatch({ control });

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center p-20">
        <RefreshCw className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (erroCarregamento) {
    return (
      <div className="h-full w-full flex items-center justify-center p-20">
        <Surface variant="subtle" className="max-w-md text-center p-6 space-y-3 border border-destructive/20 rounded-2xl">
          <AlertTriangle className="mx-auto text-destructive" size={32} />
          <p className="font-black text-foreground">Não foi possível carregar as configurações de repasse.</p>
          <p className="text-sm text-muted-foreground">Tente recarregar a página. Se o problema persistir, contate o suporte.</p>
        </Surface>
      </div>
    );
  }

  const avisoExperimental = Number(watched.aula_experimental_valor) === 0;
  const avisoAvulsa = Number(watched.aula_avulsa_valor) === 0;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Configurações de Repasse</h1>
          <p className="text-muted-foreground">Defina as regras financeiras e valores padrão do espaço.</p>
        </div>

        <Button
          onClick={handleSubmit(onSubmit)}
          variant="brand"
          size="lg"
          disabled={!isDirty || mutation.isPending}
          className="shadow-lg shadow-primary/20 min-w-[200px]"
        >
          {mutation.isPending ? (
            <RefreshCw className="animate-spin" size={20} />
          ) : (
            <><Save size={20} /> Salvar Alterações</>
          )}
        </Button>
      </header>

      <form className="grid grid-cols-1 md:grid-cols-2 gap-6">

        <Surface variant="card" padding="lg" className="space-y-6">
          <h2 className="font-black text-foreground flex items-center gap-2 border-b border-border pb-4">
            <Calculator className="text-primary" size={20} /> Valores de Mensalidade
          </h2>
          <div className="grid grid-cols-1 gap-6">
            <Field
              label="Valor 1 Modalidade" name="valor_1_modalidade" suffix="R$" icon={DollarSign}
              tooltip="Mensalidade padrão para alunos matriculados em uma única modalidade."
              register={register} error={errors.valor_1_modalidade}
            />
            <Field
              label="Valor Multi-Modalidade (Livre)" name="valor_multi_modalidade" suffix="R$" icon={DollarSign}
              tooltip="Mensalidade para alunos no Plano Livre, que frequentam múltiplas modalidades sem restrição de turma."
              register={register} error={errors.valor_multi_modalidade}
            />
          </div>
        </Surface>

        <Surface variant="card" padding="lg" className="space-y-6">
          <h2 className="font-black text-foreground flex items-center gap-2 border-b border-border pb-4">
            <Percent className="text-warning" size={20} /> Divisão Plano Livre
            <Tooltip text="No Plano Livre, a mensalidade é dividida proporcionalmente entre a casa e os professores com base nas aulas frequentadas. A soma deve ser 100%." />
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="% Casa" name="plano_livre_pct_casa" suffix="%" register={register} error={errors.plano_livre_pct_casa} />
            <Field label="% Professores" name="plano_livre_pct_prof" suffix="%" register={register} error={errors.plano_livre_pct_prof} />
          </div>
          <DivisaoSimulada
            valor={watched.valor_multi_modalidade}
            pctProf={watched.plano_livre_pct_prof}
            pctCasa={watched.plano_livre_pct_casa}
          />
          <p className="text-[10px] text-muted-foreground font-medium italic">
            * A soma das porcentagens do plano livre deve totalizar 100%.
          </p>
        </Surface>

        <Surface variant="card" padding="lg" className="space-y-6 md:col-span-2">
          <h2 className="font-black text-foreground flex items-center gap-2 border-b border-border pb-4">
             Experimental &amp; Avulsa
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            <div className="space-y-4">
              <p className="text-xs font-black text-muted-foreground uppercase flex items-center gap-1.5">
                Aula Experimental
                <Tooltip text="Aula única para novos alunos conhecerem a turma. O valor e o percentual configurados aqui são aplicados diretamente no cálculo do repasse ao professor." />
              </p>

              <div className="flex items-start gap-2 p-3 rounded-xl bg-success-soft border border-success/20">
                <CheckCircle2 size={13} className="text-success shrink-0 mt-0.5" />
                <p className="text-[11px] text-success font-medium leading-snug">
                  Aulas experimentais <strong>geram repasse ao professor</strong>. O valor e o percentual abaixo são usados pela engine no momento do pagamento.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Valor" name="aula_experimental_valor" suffix="R$" icon={DollarSign} register={register} error={errors.aula_experimental_valor} />
                <Field label="% Prof." name="aula_experimental_pct_prof" suffix="%" register={register} error={errors.aula_experimental_pct_prof} />
              </div>
              {avisoExperimental && (
                <p className="text-[11px] text-warning font-semibold flex items-center gap-1.5">
                  <Info size={12} /> Valor R$ 0,00 — os repasses desta aula serão zerados.
                </p>
              )}
              <DivisaoSimulada
                valor={watched.aula_experimental_valor}
                pctProf={watched.aula_experimental_pct_prof}
              />
            </div>

            <div className="space-y-4">
              <p className="text-xs font-black text-muted-foreground uppercase flex items-center gap-1.5">
                Aula Avulsa
                <Tooltip text="Aula paga de forma avulsa, sem vínculo com plano. O valor total é dividido entre casa e professor. A soma % Casa + % Prof. deve ser 100%." />
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Valor" name="aula_avulsa_valor" suffix="R$" register={register} error={errors.aula_avulsa_valor} />
                <Field label="% Casa" name="aula_avulsa_pct_casa" suffix="%" register={register} error={errors.aula_avulsa_pct_casa} />
                <Field label="% Prof." name="aula_avulsa_pct_prof" suffix="%" register={register} error={errors.aula_avulsa_pct_prof} />
              </div>
              {avisoAvulsa && (
                <p className="text-[11px] text-warning font-semibold flex items-center gap-1.5">
                  <Info size={12} /> Valor R$ 0,00 — os repasses desta aula serão zerados.
                </p>
              )}
              <DivisaoSimulada
                valor={watched.aula_avulsa_valor}
                pctProf={watched.aula_avulsa_pct_prof}
                pctCasa={watched.aula_avulsa_pct_casa}
              />
            </div>
          </div>
        </Surface>

        {/* FIX: agora os paths batem com os testes do schema (soma-livre / soma-avulsa) */}
        {(errors['soma-livre'] || errors['soma-avulsa']) && (
          <Surface variant="subtle" className="md:col-span-2 border border-destructive/20 p-4 rounded-2xl">
            {errors['soma-livre'] && (
              <p className="text-sm text-destructive font-black text-center">{errors['soma-livre'].message}</p>
            )}
            {errors['soma-avulsa'] && (
              <p className="text-sm text-destructive font-black text-center">{errors['soma-avulsa'].message}</p>
            )}
          </Surface>
        )}
      </form>
    </div>
  );
}