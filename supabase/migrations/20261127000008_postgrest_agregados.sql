-- La app usa sumas y conteos en PostgREST (count(), sum()); están desactivados por defecto
alter role authenticator set pgrst.db_aggregates_enabled = 'true';
notify pgrst, 'reload config';
