-- Reverte 20260831130000_create_bucket_logos.sql: remove as 4 policies e o
-- bucket `logos`. CUIDADO: DELETE FROM storage.buckets falha se já existir
-- algum object dentro do bucket (FK storage.objects.bucket_id) — num
-- incidente real, esvaziar o bucket antes (ou aceitar deixar a linha do
-- bucket e reverter só as policies). Efeito: uploadLogo() em
-- webapp/src/services/estudioService.js volta a falhar com "Bucket not
-- found".
DROP POLICY IF EXISTS "logos: leitura publica" ON storage.objects;
DROP POLICY IF EXISTS "logos: upload proprio estudio" ON storage.objects;
DROP POLICY IF EXISTS "logos: update proprio estudio" ON storage.objects;
DROP POLICY IF EXISTS "logos: delete proprio estudio" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'logos';
