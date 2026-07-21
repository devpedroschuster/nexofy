import { Dumbbell, Music, Waves, Heart, Flame, Shield, Sparkles, Users, MapPin } from 'lucide-react';

export const ICONES_ESPACO = {
  Dumbbell, Music, Waves, Heart, Flame, Shield, Sparkles, Users, MapPin,
};

export function IconeEspaco({ nome, size = 16 }) {
  const Icone = ICONES_ESPACO[nome] || MapPin;
  return <Icone size={size} />;
}