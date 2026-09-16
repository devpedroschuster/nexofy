export interface Estudio {
  id: string;
  nome: string;
  logo_url: string | null;
  cor_primaria: string;
  cor_secundaria: string | null;
  modulos_ativos: string[];
}

export interface Professor {
  id: number;
  auth_id: string;
  nome: string;
}
