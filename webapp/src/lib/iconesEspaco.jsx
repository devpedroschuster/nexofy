import { Dumbbell, Music, Waves, Heart, Flame, Shield, Sparkles, Users, MapPin } from 'lucide-react';

export const ICONES_ESPACO = {
  Dumbbell, Music, Waves, Heart, Flame, Shield, Sparkles, Users, MapPin,
};

export function IconeEspaco({ nome, size = 16 }) {
  const chave = typeof nome === 'string' ? nome.trim() : nome;
  const Icone = ICONES_ESPACO[chave];

  if (!Icone) {
    if (import.meta.env.DEV && nome) {
      // Ajuda a pegar espaços com `icone` mal configurado no banco,
      // já que hoje isso falha 100% silenciosamente em produção.
      console.warn(`[IconeEspaco] Ícone "${nome}" não encontrado em ICONES_ESPACO — usando MapPin.`);
    }
    return <MapPin size={size} />;
  }

  return <Icone size={size} />;
}