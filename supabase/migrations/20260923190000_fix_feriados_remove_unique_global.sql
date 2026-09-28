-- PED-272: feriados tem uma constraint global remanescente
-- feriados_data_unique (UNIQUE(data)) ALÉM da correta
-- feriados_data_estudio_unique (UNIQUE(data, estudio_id)). Assim que
-- qualquer estúdio importa feriados nacionais de um ano, todo outro
-- estúdio que tentar importar o mesmo ano bate na constraint global (que o
-- ON CONFLICT 'data,estudio_id' do client não captura), falhando com
-- mensagem genérica. Mesma classe de bug já corrigida em PED-123
-- (modalidades.nome).
--
-- Fix: remover a constraint global, mantendo só a composta por estúdio.

alter table public.feriados drop constraint feriados_data_unique;
