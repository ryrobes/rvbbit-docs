-- Clover — hosted semantic operators for RVBBIT, installed from plain psql.
-- Source of truth: https://rvbbit.ai/catalog.json (managed/clover). Generated file.
--
-- Prereqs:
--   * pg_rvbbit installed in this database (the rvbbit-postgres image does
--     this on first boot; otherwise: CREATE EXTENSION pg_rvbbit;)
--   * RVBBIT_CLOVER_KEY set in the Postgres server's environment
--     (free key: https://rvbbit.ai/buy/clover-free)
--
-- Usage:
--   curl -fsSL https://rvbbit.ai/clover-install.sql | psql "$DSN"
--
-- Idempotent: re-run any time the catalog updates.
-- Optional after install:
--   SELECT rvbbit.bind_triples_to_clover();           -- KG triples via Clover
--   SELECT rvbbit.bind_extract_entities_to_clover();  -- Brain NER via Clover

CREATE EXTENSION IF NOT EXISTS pg_rvbbit;

SELECT rvbbit.register_backend('embed',     'http://clover.rvbb.it:8090/b/embed/predict',     'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('sentiment', 'http://clover.rvbb.it:8090/b/sentiment/predict', 'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('rerank',    'http://clover.rvbb.it:8090/b/rerank/predict',    'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('web_scrape', 'http://clover.rvbb.it:8090/b/web_scrape/predict', 'rvbbit', 8, 4, 60000, 'RVBBIT_CLOVER_KEY');

DELETE FROM rvbbit.embedding_cache WHERE specialist = 'embed';

SELECT rvbbit.reload_backends();

SELECT rvbbit.create_operator('clover_sentiment', ARRAY['t'], 'text',
  op_description := 'Clover-ML: sentiment {score,label} for a text (hosted twitter-roberta)',
  op_steps := '[{"name":"s","kind":"specialist","specialist":"sentiment","inputs":{"text":"{{t}}"}}]'::jsonb);

SELECT rvbbit.create_operator('clover_relevance', ARRAY['t','criterion'], 'float8',
  op_description := 'Clover-ML: cross-encoder relevance of t to criterion, 0..1 (hosted bge-reranker-v2-m3)',
  op_steps := '[{"name":"r","kind":"specialist","specialist":"rerank","inputs":{"query":"{{criterion}}","text":"{{t}}"}}]'::jsonb);

SELECT rvbbit.register_backend('nli',      'http://clover.rvbb.it:8090/b/nli/predict',      'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('nli3',     'http://clover.rvbb.it:8090/b/nli3/predict',     'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('classify', 'http://clover.rvbb.it:8090/b/classify/predict', 'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('toxicity', 'http://clover.rvbb.it:8090/b/toxicity/predict', 'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('language', 'http://clover.rvbb.it:8090/b/language/predict', 'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('extract',  'http://clover.rvbb.it:8090/b/extract/predict',  'rvbbit', 32, 25, 30000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.reload_backends();

SELECT rvbbit.create_operator('clover_means', ARRAY['t','criterion'], 'bool',
  op_description := 'Clover-ML: TRUE if t semantically matches criterion (cross-encoder, threshold 0.5)',
  op_steps := '[
    {"name":"r","kind":"specialist","specialist":"rerank","inputs":{"query":"{{criterion}}","text":"{{t}}"}},
    {"name":"g","kind":"code","fn":"number_gte","inputs":{"value":"{{steps.r.output}}","threshold":0.5}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_entails', ARRAY['premise','hypothesis'], 'bool',
  op_description := 'Clover-ML: TRUE if premise entails hypothesis (NLI 2-class)',
  op_steps := '[
    {"name":"n","kind":"specialist","specialist":"nli","inputs":{"premise":"{{premise}}","hypothesis":"{{hypothesis}}"}},
    {"name":"g","kind":"code","fn":"number_gte","inputs":{"value":"{{steps.n.output.scores.entailment}}","threshold":0.5}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_contradicts', ARRAY['a','b'], 'bool',
  op_description := 'Clover-ML: TRUE if a and b contradict (NLI 3-class)',
  op_steps := '[
    {"name":"n","kind":"specialist","specialist":"nli3","inputs":{"premise":"{{a}}","hypothesis":"{{b}}"}},
    {"name":"g","kind":"code","fn":"number_gte","inputs":{"value":"{{steps.n.output.scores.contradiction}}","threshold":0.5}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_sentiment_score', ARRAY['t'], 'float8', op_parser := 'strip',
  op_description := 'Clover-ML: continuous sentiment in [-1,1]',
  op_steps := '[
    {"name":"s","kind":"specialist","specialist":"sentiment","inputs":{"text":"{{t}}"}},
    {"name":"g","kind":"code","fn":"json_get","inputs":{"value":"{{steps.s.output}}","path":"score"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_classify', ARRAY['t','labels'], 'text',
  op_description := 'Clover-ML: zero-shot classification — top label from comma-separated candidates',
  op_steps := '[
    {"name":"c","kind":"specialist","specialist":"classify","inputs":{"text":"{{t}}","labels":"{{labels}}"}},
    {"name":"g","kind":"code","fn":"json_get","inputs":{"value":"{{steps.c.output}}","path":"label"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_toxic', ARRAY['t'], 'bool',
  op_description := 'Clover-ML: TRUE if text is toxic (toxic-bert, threshold 0.5)',
  op_steps := '[
    {"name":"x","kind":"specialist","specialist":"toxicity","inputs":{"text":"{{t}}"}},
    {"name":"g","kind":"code","fn":"json_get","inputs":{"value":"{{steps.x.output}}","path":"toxic"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_language', ARRAY['t'], 'text',
  op_description := 'Clover-ML: ISO language code of text',
  op_steps := '[
    {"name":"l","kind":"specialist","specialist":"language","inputs":{"text":"{{t}}"}},
    {"name":"g","kind":"code","fn":"json_get","inputs":{"value":"{{steps.l.output}}","path":"language"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_extract', ARRAY['t','entity_types'], 'jsonb',
  op_description := 'Clover-ML: GLiNER entity extraction — types is comma-separated',
  op_steps := '[
    {"name":"e","kind":"specialist","specialist":"extract","inputs":{"text":"{{t}}","labels":"{{entity_types}}"}}
  ]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "dessert+", "sql": "SELECT rvbbit.clover_means(''apple pie recipe'',''dessert recipes'')", "expect": {"type": "exact", "value": "true"}, "description": "LarSQL heritage case"}, {"name": "sports-", "sql": "SELECT rvbbit.clover_means(''basketball game results'',''cooking recipes'')", "expect": {"type": "exact", "value": "false"}, "description": ""}, {"name": "delivery+", "sql": "SELECT rvbbit.clover_means(''customer complaint about shipping delay'',''delivery issues'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "energy+", "sql": "SELECT rvbbit.clover_means(''renewable energy investments'',''clean energy'')", "expect": {"type": "exact", "value": "true"}, "description": ""}]'::jsonb WHERE name = 'clover_means';

UPDATE rvbbit.operators SET tests = '[{"name": "close", "sql": "SELECT rvbbit.clover_relevance(''quick sql engine'',''fast database'')", "expect": {"type": "min", "value": "0.8"}, "description": ""}, {"name": "far", "sql": "SELECT rvbbit.clover_relevance(''a nice sandwich'',''fast database'')", "expect": {"type": "max", "value": "0.3"}, "description": ""}]'::jsonb WHERE name = 'clover_relevance';

UPDATE rvbbit.operators SET tests = '[{"name": "paid+", "sql": "SELECT rvbbit.clover_entails(''The invoice was paid on March 3rd'',''The invoice was paid'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "overdue-", "sql": "SELECT rvbbit.clover_entails(''The invoice was paid on March 3rd'',''The invoice is overdue'')", "expect": {"type": "exact", "value": "false"}, "description": ""}, {"name": "subset+", "sql": "SELECT rvbbit.clover_entails(''All employees received a bonus in December'',''Some employees received a bonus'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "unrelated-", "sql": "SELECT rvbbit.clover_entails(''The cat sat on the mat'',''The stock market rose today'')", "expect": {"type": "exact", "value": "false"}, "description": ""}]'::jsonb WHERE name = 'clover_entails';

UPDATE rvbbit.operators SET tests = '[{"name": "cancelled+", "sql": "SELECT rvbbit.clover_contradicts(''The meeting is at 9am'',''The meeting is cancelled'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "morning-", "sql": "SELECT rvbbit.clover_contradicts(''The meeting is at 9am'',''The meeting starts in the morning'')", "expect": {"type": "exact", "value": "false"}, "description": ""}, {"name": "open-closed+", "sql": "SELECT rvbbit.clover_contradicts(''The store is open until 9pm'',''The store closed at noon'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "neutral-", "sql": "SELECT rvbbit.clover_contradicts(''The report covers Q3 revenue'',''The office has new chairs'')", "expect": {"type": "exact", "value": "false"}, "description": ""}]'::jsonb WHERE name = 'clover_contradicts';

UPDATE rvbbit.operators SET tests = '[{"name": "love", "sql": "SELECT rvbbit.clover_sentiment_score(''i absolutely love this'')", "expect": {"type": "min", "value": "0.2"}, "description": ""}, {"name": "best_purchase", "sql": "SELECT rvbbit.clover_sentiment_score(''best purchase I have made all year'')", "expect": {"type": "min", "value": "0.2"}, "description": ""}, {"name": "support_good", "sql": "SELECT rvbbit.clover_sentiment_score(''the support team resolved everything quickly, great experience'')", "expect": {"type": "min", "value": "0.2"}, "description": ""}, {"name": "astonish_fast", "sql": "SELECT rvbbit.clover_sentiment_score(''this warehouse is astonishingly fast'')", "expect": {"type": "min", "value": "0.2"}, "description": ""}, {"name": "as_advertised", "sql": "SELECT rvbbit.clover_sentiment_score(''works exactly as advertised'')", "expect": {"type": "min", "value": "0.2"}, "description": ""}, {"name": "delighted", "sql": "SELECT rvbbit.clover_sentiment_score(''delighted with the upgrade'')", "expect": {"type": "min", "value": "0.2"}, "description": ""}, {"name": "recommend", "sql": "SELECT rvbbit.clover_sentiment_score(''10/10 would recommend'')", "expect": {"type": "min", "value": "0.2"}, "description": ""}, {"name": "disappointing", "sql": "SELECT rvbbit.clover_sentiment_score(''utterly disappointing'')", "expect": {"type": "max", "value": "-0.2"}, "description": ""}, {"name": "crashes", "sql": "SELECT rvbbit.clover_sentiment_score(''the app crashes every time I open it'')", "expect": {"type": "max", "value": "-0.2"}, "description": ""}, {"name": "worst_service", "sql": "SELECT rvbbit.clover_sentiment_score(''worst customer service imaginable'')", "expect": {"type": "max", "value": "-0.2"}, "description": ""}, {"name": "waste", "sql": "SELECT rvbbit.clover_sentiment_score(''total waste of money'')", "expect": {"type": "max", "value": "-0.2"}, "description": ""}, {"name": "crushed_box", "sql": "SELECT rvbbit.clover_sentiment_score(''shipping took forever and the box arrived crushed'')", "expect": {"type": "max", "value": "-0.2"}, "description": ""}, {"name": "regret", "sql": "SELECT rvbbit.clover_sentiment_score(''i regret buying this'')", "expect": {"type": "max", "value": "-0.2"}, "description": ""}, {"name": "slower", "sql": "SELECT rvbbit.clover_sentiment_score(''the update made everything slower'')", "expect": {"type": "max", "value": "-0.2"}, "description": ""}, {"name": "neutral_lo", "sql": "SELECT rvbbit.clover_sentiment_score(''the invoice was sent on tuesday'')", "expect": {"type": "min", "value": "-0.4"}, "description": ""}, {"name": "neutral_hi", "sql": "SELECT rvbbit.clover_sentiment_score(''the invoice was sent on tuesday'')", "expect": {"type": "max", "value": "0.4"}, "description": ""}]'::jsonb WHERE name = 'clover_sentiment_score';

UPDATE rvbbit.operators SET tests = '[{"name": "label+", "sql": "SELECT rvbbit.clover_sentiment(''i love this database'')", "expect": {"type": "contains", "value": "positive"}, "description": ""}, {"name": "label-", "sql": "SELECT rvbbit.clover_sentiment(''terrible experience'')", "expect": {"type": "contains", "value": "negative"}, "description": ""}]'::jsonb WHERE name = 'clover_sentiment';

UPDATE rvbbit.operators SET tests = '[{"name": "returns", "sql": "SELECT rvbbit.clover_classify(''refund request for damaged item'',''billing, shipping, returns, technical support'')", "expect": {"type": "exact", "value": "returns"}, "description": ""}, {"name": "billing", "sql": "SELECT rvbbit.clover_classify(''I was charged twice this month'',''billing, shipping, returns, technical support'')", "expect": {"type": "exact", "value": "billing"}, "description": ""}, {"name": "tech", "sql": "SELECT rvbbit.clover_classify(''the app will not connect to wifi'',''billing, shipping, returns, technical support'')", "expect": {"type": "exact", "value": "technical support"}, "description": ""}]'::jsonb WHERE name = 'clover_classify';

UPDATE rvbbit.operators SET tests = '[{"name": "kind-", "sql": "SELECT rvbbit.clover_toxic(''have a wonderful day'')", "expect": {"type": "exact", "value": "false"}, "description": ""}, {"name": "insult+", "sql": "SELECT rvbbit.clover_toxic(''you are a worthless idiot'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "neutral-", "sql": "SELECT rvbbit.clover_toxic(''the quarterly report is attached'')", "expect": {"type": "exact", "value": "false"}, "description": ""}, {"name": "threat+", "sql": "SELECT rvbbit.clover_toxic(''i will hurt you if you come here'')", "expect": {"type": "exact", "value": "true"}, "description": ""}]'::jsonb WHERE name = 'clover_toxic';

UPDATE rvbbit.operators SET tests = '[{"name": "fr", "sql": "SELECT rvbbit.clover_language(''bonjour mes amis'')", "expect": {"type": "exact", "value": "fr"}, "description": ""}, {"name": "de", "sql": "SELECT rvbbit.clover_language(''guten morgen alle zusammen'')", "expect": {"type": "exact", "value": "de"}, "description": ""}, {"name": "es", "sql": "SELECT rvbbit.clover_language(''buenos dias, como estas hoy'')", "expect": {"type": "exact", "value": "es"}, "description": ""}]'::jsonb WHERE name = 'clover_language';

UPDATE rvbbit.operators SET tests = '[{"name": "entities", "sql": "SELECT rvbbit.clover_extract(''Sarah Chen paid $450 to Acme Corp in Denver on May 5th'',''person, organization, money, location, date'')::text", "expect": {"type": "contains", "value": "Sarah Chen"}, "description": ""}, {"name": "nonempty", "sql": "SELECT rvbbit.clover_extract(''Meeting with Bob at Initech tomorrow'',''person, organization'')::text", "expect": {"type": "not_empty"}, "description": ""}]'::jsonb WHERE name = 'clover_extract';

UPDATE rvbbit.operators SET tests = '[{"name": "email", "sql": "SELECT rvbbit.clover_pii(''Contact Sarah Chen at sarah@acme.com or 555-867-5309'')::text", "expect": {"type": "contains", "value": "sarah@acme.com"}, "description": ""}, {"name": "ssn", "sql": "SELECT rvbbit.clover_pii(''SSN on file: 123-45-6789'')::text", "expect": {"type": "contains", "value": "123-45-6789"}, "description": ""}]'::jsonb WHERE name = 'clover_pii';

UPDATE rvbbit.operators SET tests = '[{"name": "close", "sql": "SELECT rvbbit.clover_similar(''fast database'',''quick sql engine'')", "expect": {"type": "min", "value": "0.45"}, "description": ""}, {"name": "far", "sql": "SELECT rvbbit.clover_similar(''fast database'',''a nice sandwich'')", "expect": {"type": "max", "value": "0.35"}, "description": ""}]'::jsonb WHERE name = 'clover_similar';

UPDATE rvbbit.operators SET tests = '[{"name": "scores", "sql": "SELECT rvbbit.clover_moderate(''you are a worthless idiot'')::text", "expect": {"type": "contains", "value": "insult"}, "description": ""}]'::jsonb WHERE name = 'clover_moderate';

SELECT rvbbit.register_backend('ocr',             'http://clover.rvbb.it:8090/b/ocr/predict',             'rvbbit', 4, 2, 180000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('transcribe',      'http://clover.rvbb.it:8090/b/transcribe/predict',      'rvbbit', 4, 2, 300000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('forecast',        'http://clover.rvbb.it:8090/b/forecast/predict',        'rvbbit', 8, 2, 60000,  'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('image_embed',     'http://clover.rvbb.it:8090/b/image_embed/predict',     'rvbbit', 16, 4, 120000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('tabular_fit',     'http://clover.rvbb.it:8090/b/tabular_fit/predict',     'rvbbit', 1, 1, 300000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('tabular_predict', 'http://clover.rvbb.it:8090/b/tabular_predict/predict', 'rvbbit', 1, 1, 600000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('anomaly_fit',     'http://clover.rvbb.it:8090/b/anomaly_fit/predict',     'rvbbit', 1, 1, 120000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('anomaly_score',   'http://clover.rvbb.it:8090/b/anomaly_score/predict',   'rvbbit', 1, 1, 60000,  'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('relations',       'http://clover.rvbb.it:8090/b/relations/predict',       'rvbbit', 16, 4, 120000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.reload_backends();

SELECT rvbbit.create_operator('clover_pii', ARRAY['t'], 'jsonb',
  op_description := 'Clover-ML: detect PII entities (GLiNER preset: person, email, phone, address, ssn, cc, dob, ip)',
  op_steps := '[{"name":"e","kind":"specialist","specialist":"extract","inputs":{"text":"{{t}}","labels":"person, email, phone number, street address, social security number, credit card number, date of birth, ip address"}}]'::jsonb);

SELECT rvbbit.create_operator('clover_similar', ARRAY['a','b'], 'float8', op_parser := 'strip',
  op_description := 'Clover-ML: embedding cosine similarity of two texts (arctic-embed)',
  op_steps := '[
    {"name":"ea","kind":"specialist","specialist":"embed","inputs":{"text":"{{a}}"}},
    {"name":"eb","kind":"specialist","specialist":"embed","inputs":{"text":"{{b}}"}},
    {"name":"c","kind":"code","fn":"cosine_similarity","inputs":{"left":"{{steps.ea.output}}","right":"{{steps.eb.output}}"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_moderate', ARRAY['t'], 'jsonb',
  op_description := 'Clover-ML: full moderation category scores (toxic/severe/obscene/threat/insult/identity_hate)',
  op_steps := '[
    {"name":"x","kind":"specialist","specialist":"toxicity","inputs":{"text":"{{t}}"}},
    {"name":"g","kind":"code","fn":"json_get","inputs":{"value":"{{steps.x.output}}","path":"scores"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_ocr', ARRAY['doc'], 'text',
  op_description := 'Clover-ML: OCR a document (image or PDF; URL or data URI) to plain text (GOT-OCR2)',
  op_steps := '[
    {"name":"o","kind":"specialist","specialist":"ocr","inputs":{"document":"{{doc}}"}},
    {"name":"g","kind":"code","fn":"json_get","inputs":{"value":"{{steps.o.output}}","path":"text"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_transcribe', ARRAY['audio'], 'text',
  op_description := 'Clover-ML: transcribe audio (URL or data URI) to text (Whisper large-v3-turbo)',
  op_steps := '[
    {"name":"w","kind":"specialist","specialist":"transcribe","inputs":{"audio":"{{audio}}"}},
    {"name":"g","kind":"code","fn":"json_get","inputs":{"value":"{{steps.w.output}}","path":"text"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_forecast', ARRAY['series','horizon'], 'jsonb',
  op_description := 'Clover-ML: forecast a numeric series (JSON array) N steps ahead — {median, quantiles} (Chronos-Bolt)',
  op_steps := '[
    {"name":"f","kind":"specialist","specialist":"forecast","inputs":{"context":"{{series}}","horizon":"{{horizon}}"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_image_similar', ARRAY['a','b'], 'float8', op_parser := 'strip',
  op_description := 'Clover-ML: similarity of two images, or an image and a text description (SigLIP 2 dual-tower; URL/data-URI/text inputs)',
  op_steps := '[
    {"name":"ea","kind":"specialist","specialist":"image_embed","inputs":{"text":"{{a}}"}},
    {"name":"eb","kind":"specialist","specialist":"image_embed","inputs":{"text":"{{b}}"}},
    {"name":"c","kind":"code","fn":"cosine_similarity","inputs":{"left":"{{steps.ea.output}}","right":"{{steps.eb.output}}"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_fit', ARRAY['task','features','labels'], 'jsonb',
  op_description := 'Clover-ML: fit a TabPFN model — task ''classifier''|''regressor'', features = JSON array of rows, labels = JSON array. Returns {blob_b64, blob_sha256, ...}: the fitted model stays YOURS, nothing persists server-side.',
  op_steps := '[
    {"name":"f","kind":"specialist","specialist":"tabular_fit","inputs":{"task":"{{task}}","X":"{{features}}","y":"{{labels}}"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_predict', ARRAY['model_blob_b64','features'], 'jsonb',
  op_description := 'Clover-ML: predict with a clover_fit model blob — features = JSON array of rows. Returns {predictions, probabilities, class_labels}.',
  op_steps := '[
    {"name":"p","kind":"specialist","specialist":"tabular_predict","inputs":{"model_blob_b64":"{{model_blob_b64}}","X":"{{features}}"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_anomaly_fit', ARRAY['features'], 'jsonb',
  op_description := 'Clover-ML: fit an anomaly detector (isolation forest) on JSON rows. Returns {blob_b64, ...} — client-held model, higher score = more anomalous.',
  op_steps := '[
    {"name":"f","kind":"specialist","specialist":"anomaly_fit","inputs":{"X":"{{features}}"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_anomaly_score', ARRAY['model_blob_b64','features'], 'jsonb',
  op_description := 'Clover-ML: score JSON rows against a clover_anomaly_fit model — {scores:[...]}, higher = more anomalous.',
  op_steps := '[
    {"name":"s","kind":"specialist","specialist":"anomaly_score","inputs":{"model_blob_b64":"{{model_blob_b64}}","X":"{{features}}"}}
  ]'::jsonb);

SELECT rvbbit.create_operator('clover_relations', ARRAY['t'], 'jsonb',
  op_description := 'Clover-ML: extract (subject, predicate, object) relation triples from text (REBEL)',
  op_steps := '[
    {"name":"r","kind":"specialist","specialist":"relations","inputs":{"text":"{{t}}"}}
  ]'::jsonb);

UPDATE rvbbit.operators SET tests = '[
  {"name": "invoice", "sql": "SELECT rvbbit.clover_ocr(''https://rvbbit.ai/data/clover-tests/invoice.png'')", "expect": {"type": "contains", "value": "12345"}, "description": "rendered INVOICE 12345 card"}
]'::jsonb WHERE name = 'clover_ocr';

UPDATE rvbbit.operators SET tests = '[
  {"name": "fox", "sql": "SELECT lower(rvbbit.clover_transcribe(''https://rvbbit.ai/data/clover-tests/speech.wav''))", "expect": {"type": "contains", "value": "quick brown fox"}, "description": "espeak-generated speech"}
]'::jsonb WHERE name = 'clover_transcribe';

UPDATE rvbbit.operators SET tests = '[
  {"name": "horizon_len", "sql": "SELECT (jsonb_array_length(rvbbit.clover_forecast(''[1,2,3,4,5,6,7,8,9,10]'',''4'')->''median'') = 4)::text", "expect": {"type": "exact", "value": "true"}, "description": ""},
  {"name": "ramp_next", "sql": "SELECT ((rvbbit.clover_forecast(''[1,2,3,4,5,6,7,8,9,10]'',''4'')->''median''->>0)::float8 BETWEEN 8 AND 14)::text", "expect": {"type": "exact", "value": "true"}, "description": "linear ramp continues near 11"}
]'::jsonb WHERE name = 'clover_forecast';

UPDATE rvbbit.operators SET tests = '[
  {"name": "identical", "sql": "SELECT rvbbit.clover_image_similar(''https://rvbbit.ai/data/clover-tests/red-square.png'',''https://rvbbit.ai/data/clover-tests/red-square.png'')", "expect": {"type": "min", "value": "0.98"}, "description": ""},
  {"name": "different", "sql": "SELECT rvbbit.clover_image_similar(''https://rvbbit.ai/data/clover-tests/red-square.png'',''https://rvbbit.ai/data/clover-tests/noise.png'')", "expect": {"type": "max", "value": "0.9"}, "description": ""}
]'::jsonb WHERE name = 'clover_image_similar';

UPDATE rvbbit.operators SET tests = '[
  {"name": "fit_predict", "sql": "WITH m AS (SELECT rvbbit.clover_fit(''classifier'', ''[[1,1],[2,1],[1,2],[8,9],[9,8],[9,9]]'', ''[\"small\",\"small\",\"small\",\"big\",\"big\",\"big\"]'') AS j) SELECT rvbbit.clover_predict(m.j->>''blob_b64'', ''[[9,9]]'')->''predictions''->>0 FROM m", "expect": {"type": "exact", "value": "big"}, "description": "TabPFN in-context 2-feature split"}
]'::jsonb WHERE name = 'clover_fit';

UPDATE rvbbit.operators SET tests = '[
  {"name": "regression", "sql": "WITH m AS (SELECT rvbbit.clover_fit(''regressor'', ''[[1],[2],[3],[4],[5],[6]]'', ''[2,4,6,8,10,12]'') AS j) SELECT ((rvbbit.clover_predict(m.j->>''blob_b64'', ''[[7]]'')->''predictions''->>0)::float8 BETWEEN 11 AND 17)::text FROM m", "expect": {"type": "exact", "value": "true"}, "description": "y=2x extrapolation"}
]'::jsonb WHERE name = 'clover_predict';

UPDATE rvbbit.operators SET tests = '[
  {"name": "outlier_ranks_higher", "sql": "WITH m AS (SELECT rvbbit.clover_anomaly_fit(''[[1,1],[1.1,0.9],[0.9,1.1],[1.05,1.0],[0.95,0.98],[1.02,1.03],[1.0,0.97]]'') AS j) SELECT ((rvbbit.clover_anomaly_score(m.j->>''blob_b64'', ''[[9,9]]'')->''scores''->>0)::float8 > (rvbbit.clover_anomaly_score(m.j->>''blob_b64'', ''[[1,1]]'')->''scores''->>0)::float8)::text FROM m", "expect": {"type": "exact", "value": "true"}, "description": "far point scores above cluster center"}
]'::jsonb WHERE name = 'clover_anomaly_fit';

UPDATE rvbbit.operators SET tests = '[
  {"name": "curie", "sql": "SELECT rvbbit.clover_relations(''Marie Curie discovered radium in 1898'')::text", "expect": {"type": "contains", "value": "Curie"}, "description": "REBEL triple extraction"}
]'::jsonb WHERE name = 'clover_relations';

SELECT rvbbit.register_backend('clover_llm', 'http://clover.rvbb.it:8090/v1/chat/completions', 'openai_chat', 32, 32, 120000, 'RVBBIT_CLOVER_KEY', '{"model": "gemma4"}'::jsonb);

SELECT rvbbit.create_operator('clover_llm_ask', ARRAY['q'], 'text', op_description := 'Clover-LLM: one-shot ask against the hosted generalist', op_steps := '[{"name":"main","kind":"llm","provider":"clover_llm","model":"gemma4","user":"{{q}}","max_tokens":400}]'::jsonb);

SELECT rvbbit.create_operator('clover_llm_apply', ARRAY['t', 'instruction'], 'text',
  op_description := 'Clover-LLM: apply an instruction or question to a text — answers ONLY from the text, returns NULL when the text lacks the answer',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are a text analysis assistant. Answer the question or follow the instruction using ONLY the given text.\n\nRules:\n- Answer based ONLY on the text provided\n- Return ONLY the answer - no preamble, no explanation\n- Be concise and direct\n- If the text doesn''t contain the answer, return exactly NULL\n\nExamples:\nText: \"The sky is blue\" + Question: \"What color is the sky?\" -> blue\nText: \"Price: $99.99\" + Question: \"How much?\" -> $99.99\nText: \"Meeting at 3pm\" + Question: \"When?\" -> 3pm\n\nTEXT:\n{{t}}\n\nQUESTION/INSTRUCTION:\n{{instruction}}", "max_tokens": 400}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "answer", "sql": "SELECT lower(rvbbit.clover_llm_apply(''The conference was moved to Denver due to weather'', ''What city?''))", "expect": {"type": "contains", "value": "denver"}, "description": ""}, {"name": "null_when_absent", "sql": "SELECT rvbbit.clover_llm_apply(''The sky is blue'', ''What is the CEO''''s name?'')", "expect": {"type": "contains", "value": "NULL"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_apply';

SELECT rvbbit.create_operator('clover_llm_extract', ARRAY['t', 'schema'], 'jsonb',
  op_description := 'Clover-LLM: extract a JSON object from freeform text per a schema you describe (fields, types, enums) — every field present, null when absent',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are a structured-data extractor. Given a text and a target schema, you output a SINGLE valid JSON object matching the schema and nothing else.\n\nRules:\n- The output must be a single JSON object. No markdown fences, no prose.\n- Every field from the schema MUST appear in the output. Use null when the text doesn''t contain that information.\n- Coerce types to the schema: integer -> numeric, decimal -> numeric with decimals, date -> YYYY-MM-DD string, boolean -> true/false, string -> short string.\n- For enum-like fields (e.g. \"urgency: 1-5\"), pick ONE specific value, never ranges or lists.\n- For nested objects, mirror the schema''s nesting.\n\nSCHEMA:\n{{schema}}\n\nTEXT:\n{{t}}\n\nReturn the JSON object.", "max_tokens": 700}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "invoice", "sql": "SELECT (rvbbit.clover_llm_extract(''Invoice #4451 from Acme Corp, due March 5 2024, total $1,250.50'', ''vendor: string, invoice_number: string, total: decimal, due_date: date''))->>''vendor''", "expect": {"type": "contains", "value": "Acme"}, "description": ""}, {"name": "null_field", "sql": "SELECT ((rvbbit.clover_llm_extract(''Order shipped yesterday'', ''tracking_number: string, carrier: string''))->''tracking_number'')::text", "expect": {"type": "contains", "value": "null"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_extract';

SELECT rvbbit.create_operator('clover_llm_translate', ARRAY['t', 'lang'], 'text',
  op_description := 'Clover-LLM: translate text to a target language (name or ISO code) — returns only the translation, preserves formatting and proper nouns',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "Translate the text into the target language.\n\nRules:\n- Return ONLY the translated text - no preamble, no quotes, no notes.\n- Preserve formatting (line breaks, punctuation style).\n- Keep proper nouns unchanged when appropriate.\n- Use natural phrasing in the target language.\n\nTARGET LANGUAGE: {{lang}}\n\nTEXT:\n{{t}}", "max_tokens": 600}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "to_spanish", "sql": "SELECT lower(rvbbit.clover_llm_translate(''hello world'', ''Spanish''))", "expect": {"type": "contains", "value": "hola"}, "description": ""}, {"name": "to_german", "sql": "SELECT lower(rvbbit.clover_llm_translate(''good morning'', ''de''))", "expect": {"type": "contains", "value": "guten"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_translate';

SELECT rvbbit.create_operator('clover_llm_anonymize', ARRAY['t'], 'text',
  op_description := 'Clover-LLM: rewrite text with ALL PII redacted — names to [NAME], emails to [EMAIL], phones to [PHONE], addresses/SSNs/cards likewise. Complements clover_pii (which detects without rewriting)',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are a PII anonymization specialist. Rewrite the text with ALL personally identifiable information replaced by bracket tags.\n\nIMPORTANT: err on the side of OVER-detection. If something could be PII, replace it.\nReplacements:\n- Person names -> [NAME]\n- Email addresses -> [EMAIL]\n- Phone numbers -> [PHONE]\n- Street addresses -> [ADDRESS]\n- SSNs -> [SSN]\n- Credit card numbers -> [CARD]\n- Dates of birth -> [DOB]\n- IP addresses -> [IP]\n\nReturn ONLY the rewritten text - no preamble, no JSON, no notes. Keep everything that is not PII exactly as written.\n\nTEXT:\n{{t}}", "max_tokens": 600}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "email_phone", "sql": "SELECT rvbbit.clover_llm_anonymize(''Contact Sarah Chen at sarah@acme.com or 555-867-5309'')", "expect": {"type": "contains", "value": "[EMAIL]"}, "description": ""}, {"name": "no_leak", "sql": "SELECT position(''sarah@acme.com'' IN rvbbit.clover_llm_anonymize(''Email sarah@acme.com about the invoice''))::text", "expect": {"type": "exact", "value": "0"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_anonymize';

SELECT rvbbit.create_operator('clover_llm_canonical', ARRAY['t'], 'text',
  op_description := 'Clover-LLM: return the canonical/official form of a value — expands abbreviations, standardizes entity names (''NYC'' to ''New York City'', ''MICROSOFT CORP'' to ''Microsoft'')',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "Return the canonical/official form of this value.\n\nSteps:\n1. Detect what type of entity this is (company, city, person name, address, phone, etc.)\n2. Return the standard/canonical form.\n\nExamples:\n- NYC -> New York City\n- SF -> San Francisco\n- DC -> Washington, D.C.\n- MICROSOFT CORP -> Microsoft\n- INTL BUSINESS MACHINES -> IBM\n- j. smith -> J. Smith\n\nRules:\n- Return ONLY the canonical value - no explanation, no quotes.\n- If the value is already canonical, return it unchanged.\n- Never invent information that is not implied by the value.\n\nVALUE: {{t}}", "max_tokens": 100}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "city", "sql": "SELECT rvbbit.clover_llm_canonical(''NYC'')", "expect": {"type": "contains", "value": "New York"}, "description": ""}, {"name": "company", "sql": "SELECT rvbbit.clover_llm_canonical(''INTL BUSINESS MACHINES CORP'')", "expect": {"type": "contains", "value": "IBM"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_canonical';

SELECT rvbbit.create_operator('clover_llm_fix', ARRAY['value', 'hint'], 'text',
  op_description := 'Clover-LLM: repair a malformed value given a type hint — email domain typos, phone formats, mojibake, spacing (''john @ gmial.com'' + ''email'' to ''john@gmail.com'')',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "Fix this value if it has common data-quality issues, using the type hint.\n\nCommon fixes:\n- Email: domain typos (gmial.com -> gmail.com), missing TLD, stray spaces or double dots\n- Phone: standardize to (555) 123-4567 form\n- Numbers: strip currency symbols/commas when hint asks for a number\n- Text: fix obvious encoding damage and doubled spaces\n\nRules:\n- Return ONLY the fixed value - no explanation, no quotes.\n- If nothing is wrong, return the value unchanged.\n- Never invent missing information; only repair what is clearly broken.\n\nVALUE: {{value}}\nTYPE HINT: {{hint}}", "max_tokens": 100}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "email_typo", "sql": "SELECT rvbbit.clover_llm_fix(''john @ gmial.com'', ''email'')", "expect": {"type": "exact", "value": "john@gmail.com"}, "description": ""}, {"name": "already_clean", "sql": "SELECT rvbbit.clover_llm_fix(''bob@yahoo.com'', ''email'')", "expect": {"type": "exact", "value": "bob@yahoo.com"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_fix';

SELECT rvbbit.create_operator('clover_llm_date', ARRAY['t'], 'text',
  op_description := 'Clover-LLM: pull a date out of messy text and return it as ISO 8601 (YYYY-MM-DD), or NULL when no date is present',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "Extract the date from the text and return it in ISO 8601 format.\n\nRules:\n- Return ONLY the date as YYYY-MM-DD - nothing else.\n- If only a month and year are present, use the first of the month.\n- If only a year is present, return YYYY-01-01.\n- If NO date is present, return exactly NULL.\n- Never guess the current date; use only what the text states.\n\nTEXT: {{t}}", "max_tokens": 40}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "written_out", "sql": "SELECT rvbbit.clover_llm_date(''signed on March 5th, 2021 in Boston'')", "expect": {"type": "exact", "value": "2021-03-05"}, "description": ""}, {"name": "none_present", "sql": "SELECT rvbbit.clover_llm_date(''the quick brown fox'')", "expect": {"type": "contains", "value": "NULL"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_date';

SELECT rvbbit.create_operator('clover_llm_score', ARRAY['t', 'criterion'], 'float8',
  op_description := 'Clover-LLM: judge text against any criterion you phrase in English, 0.0-1.0 — an arbitrary-rubric cousin of clover_relevance',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "Rate how well the text satisfies the criterion.\n\nScoring guide:\n- 0.0-0.2: does not satisfy the criterion at all\n- 0.2-0.4: barely / tangentially\n- 0.4-0.6: partially satisfies it\n- 0.6-0.8: satisfies it well\n- 0.8-1.0: exemplary\n\nReturn ONLY a decimal number between 0.0 and 1.0. No explanation, no quotes.\n\nCRITERION: {{criterion}}\n\nTEXT:\n{{t}}", "max_tokens": 8}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "high", "sql": "SELECT rvbbit.clover_llm_score(''Step 1: unplug the router. Step 2: wait 10 seconds. Step 3: plug it back in.'', ''clear actionable instructions'')", "expect": {"type": "min", "value": "0.6"}, "description": ""}, {"name": "low", "sql": "SELECT rvbbit.clover_llm_score(''asdf jkl whatever'', ''clear actionable instructions'')", "expect": {"type": "max", "value": "0.3"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_score';

SELECT rvbbit.create_operator('clover_llm_supports', ARRAY['evidence', 'claim'], 'float8',
  op_description := 'Clover-LLM: how strongly does the evidence support the claim, 0.0-1.0 — contradiction scores near 0, decisive support near 1',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are an evidential support scorer. Rate how strongly the EVIDENCE supports the CLAIM.\n\nScoring guide:\n- 0.0-0.2: no support - irrelevant, or actively contradicts the claim\n- 0.2-0.4: very weak - tangential, requires leaps, anecdote where statistics are needed\n- 0.4-0.6: weak to moderate - relevant but not conclusive, supports only part of the claim\n- 0.6-0.8: moderate to strong - directly relevant, would shift a reasonable person''s view\n- 0.8-1.0: strong to decisive - directly establishes the claim\n\nReturn ONLY a decimal number between 0.0 and 1.0. No explanation.\n\nEVIDENCE:\n{{evidence}}\n\nCLAIM:\n{{claim}}", "max_tokens": 8}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "strong", "sql": "SELECT rvbbit.clover_llm_supports(''In a randomized trial of 12,000 patients, the vaccine reduced infections by 94%'', ''the vaccine is effective'')", "expect": {"type": "min", "value": "0.7"}, "description": ""}, {"name": "contradicts", "sql": "SELECT rvbbit.clover_llm_supports(''Sales fell 40% after the redesign launched'', ''the redesign improved sales'')", "expect": {"type": "max", "value": "0.25"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_supports';

SELECT rvbbit.create_operator('clover_llm_valid', ARRAY['value', 'rule'], 'bool',
  op_description := 'Clover-LLM: TRUE if a value satisfies a rule phrased in English (''contains pricing'', ''is a professional tone'', ''has contact information'')',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are a semantic validator. Decide whether the VALUE satisfies the RULE.\n\nExamples of rules:\n- \"contains pricing\" -> does it mention a price, cost, or dollar amount?\n- \"is professional tone\" -> is the language formal and business-appropriate?\n- \"has contact information\" -> does it include an email, phone, or address?\n- \"contains date\" -> does it reference a date or time?\n\nBe reasonably strict but not pedantic; interpret the rule in its common-sense meaning.\n\nReturn ONLY true or false.\n\nVALUE: {{value}}\nRULE: {{rule}}", "max_tokens": 6}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "pricing_yes", "sql": "SELECT rvbbit.clover_llm_valid(''Our plan starts at $99/month'', ''contains pricing'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "pricing_no", "sql": "SELECT rvbbit.clover_llm_valid(''Have a great weekend!'', ''contains pricing'')", "expect": {"type": "exact", "value": "false"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_valid';

SELECT rvbbit.create_operator('clover_llm_steelman', ARRAY['argument'], 'text',
  op_description := 'Clover-LLM: rewrite an argument in its strongest, most defensible form — the good-faith opposite of a strawman',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are a steelmanning specialist. Present the argument in its most compelling, well-reasoned, defensible form.\n\nGuidelines:\n1. Assume intelligence: what would the smartest, most informed person making this argument say?\n2. Add supporting evidence: facts, data, or examples that strengthen the position.\n3. Address obvious objections preemptively.\n4. Clarify scope: define reasonable boundaries - it probably isn''t meant to be absolute.\n5. Ground it in values reasonable people share.\n6. Drop weak elements.\n\nReturn ONLY the steelmanned argument (2-4 sentences). No preamble.\n\nORIGINAL ARGUMENT:\n{{argument}}", "max_tokens": 700}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "nonempty", "sql": "SELECT length(rvbbit.clover_llm_steelman(''remote work is bad'')) > 80", "expect": {"type": "exact", "value": "true"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_steelman';

SELECT rvbbit.create_operator('clover_llm_fallacies', ARRAY['argument'], 'jsonb',
  op_description := 'Clover-LLM: detect logical fallacies in an argument — JSON array of {fallacy, explanation} with snake_case fallacy names',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are a logical fallacy detection expert. Identify fallacies in the argument.\n\nCheck for (snake_case names): ad_hominem, appeal_to_authority, appeal_to_emotion, appeal_to_popularity, appeal_to_tradition, appeal_to_nature, genetic_fallacy, tu_quoque, red_herring, false_dichotomy, false_cause, slippery_slope, circular_reasoning, hasty_generalization, straw_man, no_true_scotsman, equivocation.\n\nReturn ONLY a JSON array (no markdown fences, no prose): [{\"fallacy\": \"snake_case_name\", \"explanation\": \"one sentence\"}]\nReturn [] when the argument is clean.\n\nARGUMENT:\n{{argument}}", "max_tokens": 500}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "popularity", "sql": "SELECT (rvbbit.clover_llm_fallacies(''Nine out of ten people believe it, so it must be true''))::text", "expect": {"type": "contains", "value": "popularity"}, "description": ""}, {"name": "clean", "sql": "SELECT jsonb_array_length(rvbbit.clover_llm_fallacies(''The measurements were repeated five times and averaged to reduce error''))::text", "expect": {"type": "exact", "value": "0"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_fallacies';

SELECT rvbbit.create_operator('clover_llm_means', ARRAY['t', 'criterion'], 'bool',
  op_description := 'Clover-LLM: TRUE if text semantically matches a criterion — the LLM-judged sibling of clover_means for inputs that need real thought (sarcasm, indirection, multi-clause)',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "You are a semantic matching evaluator. Given a TEXT and a CRITERION, determine if the text semantically matches the criterion.\n\nSTEP 1: What topic/domain is the TEXT about?\nSTEP 2: What topic/domain is the CRITERION about?\nSTEP 3: Are these the SAME or CLOSELY RELATED topics?\n\nA MATCH means the text discusses the SAME or CLOSELY RELATED topic.\nNOT A MATCH means the topics are from completely different domains.\n\nExamples:\n- MATCH: \"stock prices fell\" + \"financial news\" (both finance)\n- MATCH: \"apple pie recipe\" + \"dessert recipes\" (both food)\n- NO MATCH: \"weather forecast\" + \"financial news\" (different domains)\n\nReturn ONLY the word true or false. Nothing else.\n\nTEXT: {{t}}\nCRITERION: {{criterion}}", "max_tokens": 6}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "dessert", "sql": "SELECT rvbbit.clover_llm_means(''apple pie recipe'', ''dessert recipes'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "cross_domain", "sql": "SELECT rvbbit.clover_llm_means(''basketball game results'', ''cooking recipes'')", "expect": {"type": "exact", "value": "false"}, "description": ""}, {"name": "indirection", "sql": "SELECT rvbbit.clover_llm_means(''the package never showed up and support went silent for two weeks'', ''a customer having a bad delivery experience'')", "expect": {"type": "exact", "value": "true"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_means';

SELECT rvbbit.create_operator('clover_llm_implies', ARRAY['premise', 'conclusion'], 'bool',
  op_description := 'Clover-LLM: TRUE if the premise implies the conclusion — logical entailment plus common-sense inference; handles the quantifier cases (all -> some) that fast NLI models miss',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "Determine if a PREMISE semantically implies a CONCLUSION.\n\nReturn true if a reasonable person would consider the conclusion likely true given the premise. This includes:\n- Direct logical entailment (\"bachelor\" -> \"unmarried\")\n- Quantifier logic (\"all employees got a bonus\" -> \"some employees got a bonus\")\n- Strong causal relationships (\"raining\" -> \"the ground is wet\")\n- Common-sense inferences that follow naturally\n\nReturn false only if there is no meaningful connection or the conclusion does not follow from the premise.\n\nReturn ONLY the word true or false. Nothing else.\n\nPREMISE: {{premise}}\nCONCLUSION: {{conclusion}}", "max_tokens": 6}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "subset", "sql": "SELECT rvbbit.clover_llm_implies(''All employees received a bonus in December'', ''Some employees received a bonus'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "causal", "sql": "SELECT rvbbit.clover_llm_implies(''It has been raining for hours'', ''the ground is wet'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "non_sequitur", "sql": "SELECT rvbbit.clover_llm_implies(''The cat sat on the mat'', ''The stock market rose today'')", "expect": {"type": "exact", "value": "false"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_implies';

SELECT rvbbit.create_operator('clover_llm_contradicts', ARRAY['a', 'b'], 'bool',
  op_description := 'Clover-LLM: TRUE if two texts logically contradict — LLM-judged sibling of clover_contradicts; different-subject statements are never contradictions',
  op_steps := '[{"name": "main", "kind": "llm", "provider": "clover_llm", "model": "gemma4", "user": "Do these two texts logically contradict each other?\n\nSTEP 1 - Identify the subject of each statement.\nSTEP 2 - Are they about the SAME subject? If NO, answer false (statements about different topics are NEVER contradictions).\nSTEP 3 - If the same subject: do they make OPPOSING claims about it? If yes, true; otherwise false.\n\nReturn ONLY the word true or false. Nothing else.\n\nTEXT A: {{a}}\nTEXT B: {{b}}", "max_tokens": 6}]'::jsonb);

UPDATE rvbbit.operators SET tests = '[{"name": "opposing", "sql": "SELECT rvbbit.clover_llm_contradicts(''The store is open until 9pm tonight'', ''The store closed at noon today'')", "expect": {"type": "exact", "value": "true"}, "description": ""}, {"name": "different_subjects", "sql": "SELECT rvbbit.clover_llm_contradicts(''The report covers Q3 revenue'', ''The office got new chairs'')", "expect": {"type": "exact", "value": "false"}, "description": ""}, {"name": "compatible", "sql": "SELECT rvbbit.clover_llm_contradicts(''The meeting is at 9am'', ''The meeting is in the morning'')", "expect": {"type": "exact", "value": "false"}, "description": ""}]'::jsonb WHERE name = 'clover_llm_contradicts';;

SELECT rvbbit.reload_backends();

SELECT rvbbit.create_operator(
  'clover_llm_draft_spec', ARRAY['task'], 'text',
  op_description := 'Internal: draft an operator spec (strict JSON) for clover_llm_make_operator',
  op_steps := jsonb_build_array(jsonb_build_object(
    'name', 'main', 'kind', 'llm',
    'provider', 'clover_llm', 'model', 'gemma4',
    'max_tokens', 2500, 'temperature', 0.2,
    'system', 'You author SQL semantic operators for rvbbit. Follow the specification instructions in the user message exactly. Reply with ONE JSON object only - no markdown fences, no commentary.',
    'user', '{{task}}'
  )));

CREATE OR REPLACE FUNCTION rvbbit.clover_llm_make_operator(
  p_description    text,
  p_name           text DEFAULT NULL,
  p_return_type    text DEFAULT NULL,
  p_max_iterations int  DEFAULT 3,
  p_dry_run        boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  briefing   text;
  base_task  text;
  task       text;
  raw        text;
  spec       jsonb;
  violations text[];
  arg_arr    text[];
  rt         text;
  final_name text;
  tmp        text;
  tests_in   jsonb;
  tests_sql  jsonb;
  t          jsonb;
  test_args  text[];
  call_sql   text;
  results    jsonb;
  n_fail     int;
  n_total    int;
  fail_txt   text;
  i          int;
  a          text;
  sig        text;
BEGIN
  IF p_name IS NOT NULL AND p_name !~ '^[a-z][a-z0-9_]{2,40}$' THEN
    RETURN jsonb_build_object('created', false, 'error', 'p_name must match ^[a-z][a-z0-9_]{2,40}$');
  END IF;
  IF p_name IS NOT NULL AND EXISTS (SELECT 1 FROM rvbbit.operators WHERE name = p_name) THEN
    RETURN jsonb_build_object('created', false, 'error', format('operator %s already exists', p_name));
  END IF;

  -- The full authoring briefing lives HERE (an arg value, never template-
  -- rendered) so its literal {{placeholders}} survive to the model.
  briefing := $BRIEF$An operator is one LLM prompt template exposed as a SQL function. Design one as a JSON object with this schema:
{
 "name": "snake_case, 3-40 chars",
 "description": "one sentence",
 "arg_names": ["one to four snake_case names"],
 "return_type": "bool" | "text" | "float8" | "jsonb",
 "prompt": "The LLM instruction template. Reference every argument as {{arg_name}} (double curly braces). End by demanding the bare answer only.",
 "tests": [
   {"name": "short_id", "args": ["one literal value per arg"],
    "expect": {"type": "exact|contains|regex|min|max", "value": "...", "pattern": "..."}}
 ]
}

Rules:
- The prompt MUST contain every argument as a {{arg_name}} placeholder, e.g. an arg named "text" appears as {{text}}.
- bool: prompt demands exactly true or false (lowercase); test expect = {"type":"exact","value":"true"} or "false".
- float8: prompt demands a bare number between 0 and 1; use threshold tests - clear positives {"type":"min","value":"0.7"}, clear negatives {"type":"max","value":"0.3"}. Never exact-match a float.
- text: prompt demands the answer text only; prefer {"type":"contains"} or {"type":"regex"} unless output is fully canonical.
- jsonb: prompt demands raw JSON only (no fences); test with {"type":"contains","value":"\"some_key\""}.
- Write 3 to 5 tests: clear positives, clear negatives, one edge case. Test args are plain literal strings, never SQL.
- The prompt must be self-contained and unambiguous - a small model will execute it.

Example (bool):
{"name":"is_apology","description":"TRUE if the text contains an apology","arg_names":["t"],"return_type":"bool","prompt":"Does this text contain an apology? Text: {{t}}\nAnswer with exactly one word, true or false.","tests":[{"name":"sorry","args":["We are so sorry for the delay"],"expect":{"type":"exact","value":"true"}},{"name":"neutral","args":["Your order shipped Tuesday"],"expect":{"type":"exact","value":"false"}}]}

$BRIEF$;

  base_task := briefing || 'Design an operator for this task: ' || p_description
    || CASE WHEN p_name IS NOT NULL THEN format(' The name must be exactly: %s.', p_name) ELSE '' END
    || CASE WHEN p_return_type IS NOT NULL THEN format(' The return_type must be: %s.', p_return_type) ELSE '' END;
  task := base_task;

  FOR i IN 1..greatest(p_max_iterations, 1) LOOP
    raw := rvbbit.clover_llm_draft_spec(task);
    -- strip accidental markdown fences despite instructions
    raw := regexp_replace(regexp_replace(coalesce(raw,''), '^\s*```(json)?\s*', ''), '\s*```\s*$', '');

    BEGIN
      spec := raw::jsonb;
    EXCEPTION WHEN OTHERS THEN
      task := base_task || chr(10) || 'Your previous reply was not valid JSON ('
              || SQLERRM || '). Reply with ONLY the JSON object.';
      CONTINUE;
    END;

    -- validate the spec
    violations := ARRAY[]::text[];
    final_name := coalesce(p_name, spec->>'name');
    rt := coalesce(p_return_type, spec->>'return_type');
    IF final_name IS NULL OR final_name !~ '^[a-z][a-z0-9_]{2,40}$' THEN
      violations := violations || 'name missing or not snake_case (3-40 chars)';
    END IF;
    IF rt IS NULL OR rt NOT IN ('bool','text','float8','jsonb') THEN
      violations := violations || 'return_type must be bool|text|float8|jsonb';
    END IF;
    BEGIN
      SELECT array_agg(x) INTO arg_arr FROM jsonb_array_elements_text(spec->'arg_names') x;
    EXCEPTION WHEN OTHERS THEN arg_arr := NULL;
    END;
    IF arg_arr IS NULL OR array_length(arg_arr, 1) NOT BETWEEN 1 AND 4 THEN
      violations := violations || 'arg_names must be a list of 1-4 names';
    ELSE
      FOREACH a IN ARRAY arg_arr LOOP
        IF a !~ '^[a-z][a-z0-9_]{0,30}$' THEN
          violations := violations || format('bad arg name: %s', a);
        ELSIF (spec->>'prompt') NOT LIKE '%{{' || a || '}}%' THEN
          violations := violations || format('prompt does not reference {{%s}}', a);
        END IF;
      END LOOP;
    END IF;
    tests_in := spec->'tests';
    IF tests_in IS NULL OR jsonb_typeof(tests_in) <> 'array' OR jsonb_array_length(tests_in) < 2 THEN
      violations := violations || 'tests must be a list of at least 2 cases';
    END IF;

    IF array_length(violations, 1) > 0 THEN
      task := base_task || chr(10) || 'Your previous spec had problems: '
              || array_to_string(violations, '; ')
              || chr(10) || 'Previous spec: ' || raw
              || chr(10) || 'Reply with the full corrected JSON object.';
      CONTINUE;
    END IF;

    -- create under a temp name and test
    tmp := 'mkop_' || substr(md5(clock_timestamp()::text || random()::text), 1, 8);
    tests_sql := '[]'::jsonb;
    FOR t IN SELECT * FROM jsonb_array_elements(tests_in) LOOP
      SELECT array_agg(x) INTO test_args FROM jsonb_array_elements_text(t->'args') x;
      IF test_args IS NULL OR array_length(test_args, 1) <> array_length(arg_arr, 1) THEN
        tests_sql := NULL; EXIT;
      END IF;
      call_sql := format('SELECT rvbbit.%I(%s)', tmp,
                         (SELECT string_agg(quote_literal(x), ', ') FROM unnest(test_args) x));
      tests_sql := tests_sql || jsonb_build_array(jsonb_build_object(
        'name', coalesce(t->>'name', 'case'),
        'sql', call_sql,
        'expect', t->'expect',
        'description', ''));
    END LOOP;
    IF tests_sql IS NULL THEN
      task := base_task || chr(10)
              || 'Your previous spec had tests whose args count did not match arg_names. '
              || 'Previous spec: ' || raw || chr(10) || 'Reply with the full corrected JSON object.';
      CONTINUE;
    END IF;

    PERFORM rvbbit.create_operator(
      op_name := tmp,
      op_arg_names := arg_arr,
      op_return_type := rt,
      op_description := '[maker temp] ' || coalesce(spec->>'description', p_description),
      op_tests := tests_sql,
      op_steps := jsonb_build_array(jsonb_build_object(
        'name', 'main', 'kind', 'llm',
        'provider', 'clover_llm', 'model', 'gemma4',
        'max_tokens', 800, 'temperature', 0.1,
        'user', spec->>'prompt')));

    SELECT jsonb_agg(to_jsonb(r)), count(*) FILTER (WHERE NOT r.passed), count(*)
      INTO results, n_fail, n_total
      FROM rvbbit.run_tests(tmp) r;

    -- always remove the temp operator
    sig := array_to_string(array_fill('text'::text, ARRAY[array_length(arg_arr, 1)]), ', ');
    EXECUTE format('DROP FUNCTION IF EXISTS rvbbit.%I(%s)', tmp, sig);
    DELETE FROM rvbbit.operators WHERE name = tmp;

    IF n_total > 0 AND n_fail = 0 THEN
      IF p_dry_run THEN
        RETURN jsonb_build_object('created', false, 'dry_run', true, 'iterations', i,
                                  'name', final_name, 'spec', spec, 'test_results', results);
      END IF;
      -- promote: same spec, real name, tests pointed at the real name
      PERFORM rvbbit.create_operator(
        op_name := final_name,
        op_arg_names := arg_arr,
        op_return_type := rt,
        op_description := coalesce(spec->>'description', p_description) || ' (built by clover_llm_make_operator)',
        op_tests := (SELECT jsonb_agg(jsonb_set(e, '{sql}',
                       to_jsonb(replace(e->>'sql', 'rvbbit.' || tmp, 'rvbbit.' || final_name))))
                     FROM jsonb_array_elements(tests_sql) e),
        op_steps := jsonb_build_array(jsonb_build_object(
          'name', 'main', 'kind', 'llm',
          'provider', 'clover_llm', 'model', 'gemma4',
          'max_tokens', 800, 'temperature', 0.1,
          'user', spec->>'prompt')));
      RETURN jsonb_build_object('created', true, 'name', final_name, 'iterations', i,
                                'return_type', rt, 'arg_names', to_jsonb(arg_arr),
                                'tests_passed', n_total, 'spec', spec, 'test_results', results);
    END IF;

    SELECT string_agg(format('%s: got %s, expected %s %s',
                             r->>'test_name', coalesce(r->>'actual', 'NULL'),
                             r->>'expected', coalesce(r->>'error', '')), '; ')
      INTO fail_txt
      FROM jsonb_array_elements(coalesce(results, '[]'::jsonb)) r
      WHERE NOT (r->>'passed')::boolean;
    task := base_task || chr(10) || 'Previous spec: ' || raw
            || chr(10) || 'It was created and tested; these tests FAILED: ' || coalesce(fail_txt, '(no tests ran)')
            || chr(10) || 'Decide whether the prompt or the tests were wrong, fix, and reply with the full corrected JSON object.';
  END LOOP;

  RETURN jsonb_build_object('created', false, 'iterations', p_max_iterations,
                            'last_spec', spec, 'last_failures', fail_txt,
                            'last_violations', to_jsonb(violations), 'last_raw', left(raw, 400),
                            'error', 'did not converge; refine the description or raise p_max_iterations');
END $$;

SELECT rvbbit.register_backend('cluster', 'http://clover.rvbb.it:8090/b/cluster/predict', 'rvbbit', 1, 1, 300000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.register_backend('tabular_explain', 'http://clover.rvbb.it:8090/b/tabular_explain/predict', 'rvbbit', 1, 1, 600000, 'RVBBIT_CLOVER_KEY');

SELECT rvbbit.reload_backends();

SELECT rvbbit.create_operator('clover_classify_scores', ARRAY['t','labels'], 'jsonb', op_description := 'Clover-ML: zero-shot classification with every candidate score and the winning label', op_tests := jsonb_build_array(jsonb_build_object('name','returns_scores','sql',$test$SELECT rvbbit.clover_classify_scores('refund request for damaged item','billing, shipping, returns, technical support')::text$test$,'expect',jsonb_build_object('type','contains','value','scores'))), op_steps := jsonb_build_array(jsonb_build_object('name','c','kind','specialist','specialist','classify','inputs',jsonb_build_object('text','{{t}}','labels','{{labels}}'))));

SELECT rvbbit.create_operator('clover_nli', ARRAY['premise','hypothesis'], 'jsonb', op_description := 'Clover-ML: full 3-way natural-language-inference result with entailment, neutral, and contradiction scores', op_tests := jsonb_build_array(jsonb_build_object('name','contradiction_score','sql',$test$SELECT rvbbit.clover_nli('The store is open','The store is closed')::text$test$,'expect',jsonb_build_object('type','contains','value','contradiction'))), op_steps := jsonb_build_array(jsonb_build_object('name','n','kind','specialist','specialist','nli3','inputs',jsonb_build_object('premise','{{premise}}','hypothesis','{{hypothesis}}'))));

SELECT rvbbit.create_operator('clover_language_info', ARRAY['t'], 'jsonb', op_description := 'Clover-ML: language code plus confidence for routing and quality thresholds', op_tests := jsonb_build_array(jsonb_build_object('name','french_confidence','sql',$test$SELECT rvbbit.clover_language_info('bonjour mes amis')::text$test$,'expect',jsonb_build_object('type','contains','value','confidence'))), op_steps := jsonb_build_array(jsonb_build_object('name','l','kind','specialist','specialist','language','inputs',jsonb_build_object('text','{{t}}'))));

SELECT rvbbit.create_operator('clover_embed', ARRAY['t'], 'jsonb', op_description := 'Clover-ML: reusable text embedding vector (arctic-embed-l-v2, 1024-dim) — KNN, similarity & clustering feedstock', op_tests := jsonb_build_array(jsonb_build_object('name','text_vector','sql',$test$SELECT jsonb_array_length(rvbbit.clover_embed('fast analytical database')) > 100$test$,'expect',jsonb_build_object('type','exact','value','true'))), op_steps := jsonb_build_array(jsonb_build_object('name','e','kind','specialist','specialist','embed','inputs',jsonb_build_object('text','{{t}}'))));

SELECT rvbbit.create_operator('clover_image_embed', ARRAY['item'], 'jsonb', op_description := 'Clover-ML: reusable SigLIP2 embedding for an image URL/data URI or text description', op_tests := jsonb_build_array(jsonb_build_object('name','text_vector','sql',$test$SELECT jsonb_array_length(rvbbit.clover_image_embed('a red bicycle')) > 100$test$,'expect',jsonb_build_object('type','exact','value','true'))), op_steps := jsonb_build_array(jsonb_build_object('name','e','kind','specialist','specialist','image_embed','inputs',jsonb_build_object('text','{{item}}'))));

SELECT rvbbit.create_operator('clover_cluster', ARRAY['values','num_clusters'], 'jsonb', op_description := 'Clover-ML: cluster a JSON array of texts with hosted embeddings plus K-means; returns assignments, cluster members, and representatives', op_tests := jsonb_build_array(jsonb_build_object('name','two_groups','sql',$test$SELECT jsonb_array_length(rvbbit.clover_cluster(jsonb_build_array('New York','Boston','Chicago','Paris','Lyon','Marseille')::text,'2')->'assignments')$test$,'expect',jsonb_build_object('type','exact','value','6'))), op_steps := jsonb_build_array(jsonb_build_object('name','c','kind','specialist','specialist','cluster','inputs',jsonb_build_object('values','{{values}}','num_clusters','{{num_clusters}}'))));

SELECT rvbbit.create_operator('clover_explain', ARRAY['model_blob_b64','model_sha256','features','feature_names'], 'jsonb', op_description := 'Clover-ML: SHAP feature attributions for a fitted TabPFN or anomaly model; returns per-row contributions, base values, predictions, and score kind', op_tests := jsonb_build_array(jsonb_build_object('name','tabpfn_regressor','sql',$test$WITH m AS (SELECT rvbbit.clover_fit('regressor',jsonb_build_array(jsonb_build_array(1,0),jsonb_build_array(2,0),jsonb_build_array(3,0),jsonb_build_array(4,0),jsonb_build_array(5,0),jsonb_build_array(6,0))::text,'[2,4,6,8,10,12]') AS j) SELECT jsonb_array_length(rvbbit.clover_explain(j->>'blob_b64',j->>'blob_sha256','[[7,0]]','["signal","noise"]')->'shap_values'->0) FROM m$test$,'expect',jsonb_build_object('type','exact','value','2')),jsonb_build_object('name','anomaly_model','sql',$test$WITH m AS (SELECT rvbbit.clover_anomaly_fit('[[1,1],[1.1,0.9],[0.9,1.2],[10,10]]') AS j) SELECT rvbbit.clover_explain(j->>'blob_b64',j->>'blob_sha256','[[10,10]]','["x","y"]')->>'score_kind' FROM m$test$,'expect',jsonb_build_object('type','contains','value','anomaly_score'))), op_steps := jsonb_build_array(jsonb_build_object('name','x','kind','specialist','specialist','tabular_explain','inputs',jsonb_build_object('model_blob_b64','{{model_blob_b64}}','model_sha256','{{model_sha256}}','X','{{features}}','feature_names','{{feature_names}}'))));

SELECT rvbbit.create_operator('clover_llm_same_entity', ARRAY['left_value','right_value','entity_type'], 'bool', op_description := 'Clover-LLM: TRUE when two values identify the same real-world entity, for fuzzy joins and deduplication', op_tests := jsonb_build_array(jsonb_build_object('name','ibm_alias','sql',$test$SELECT rvbbit.clover_llm_same_entity('IBM','International Business Machines','company')$test$,'expect',jsonb_build_object('type','exact','value','true')),jsonb_build_object('name','different_companies','sql',$test$SELECT rvbbit.clover_llm_same_entity('Toyota','Honda','company')$test$,'expect',jsonb_build_object('type','exact','value','false'))), op_steps := jsonb_build_array(jsonb_build_object('name','main','kind','llm','provider','clover_llm','model','gemma4','user','Do these values identify the exact same real-world entity?

ENTITY TYPE: {{entity_type}}
LEFT: {{left_value}}
RIGHT: {{right_value}}

Aliases, abbreviations, harmless formatting differences, and known official names may match. Sharing an industry, category, surname, or similar meaning is not enough. If identity is materially ambiguous, return false. Return ONLY true or false.','max_tokens',6)));

SELECT rvbbit.create_operator('clover_llm_merge_records', ARRAY['records','strategy'], 'jsonb', op_description := 'Clover-LLM: merge a JSON array of duplicate records into one canonical golden record using an explicit conflict strategy', op_tests := jsonb_build_array(jsonb_build_object('name','complementary_fields','sql',$test$SELECT rvbbit.clover_llm_merge_records(jsonb_build_array(jsonb_build_object('name','JOHN SMITH','email','john@example.com','phone',null),jsonb_build_object('name','John Smith','email',null,'phone','555-1234'))::text,'best_quality')::text$test$,'expect',jsonb_build_object('type','contains','value','555-1234')),jsonb_build_object('name','stats','sql',$test$SELECT rvbbit.clover_llm_merge_records(jsonb_build_array(jsonb_build_object('id',1,'name','Acme'),jsonb_build_object('id',1,'website','acme.com'))::text,'best_quality')::text$test$,'expect',jsonb_build_object('type','contains','value','_merge_stats'))), op_steps := jsonb_build_array(jsonb_build_object('name','main','kind','llm','provider','clover_llm','model','gemma4','system','You merge duplicate business records. Return one valid JSON object only, without markdown.','user','Merge the JSON array of records into one canonical record.

STRATEGY: {{strategy}}
RECORDS: {{records}}

Rules:
- Include every field appearing in any record.
- Prefer populated, valid, well-formatted values.
- Supported strategies: best_quality, prefer_recent, prefer_first, prefer_longest, unanimous_only.
- Use null only when all records lack a value.
- Include _merge_stats with records_merged, conflicting_fields, and strategy.
Return ONLY one valid JSON object.','max_tokens',1200,'temperature',0.1)));

SELECT rvbbit.create_operator('clover_llm_timeline', ARRAY['t','reference_date'], 'jsonb', op_description := 'Clover-LLM: extract a chronological event timeline from text with normalized timestamps, actors, and event types', op_tests := jsonb_build_array(jsonb_build_object('name','clock_normalization','sql',$test$SELECT rvbbit.clover_llm_timeline('The server crashed at 3:15 PM. We deployed a fix at 4:30 PM.','2026-07-16')::text$test$,'expect',jsonb_build_object('type','contains','value','15:15')),jsonb_build_object('name','relative_date','sql',$test$SELECT rvbbit.clover_llm_timeline('Yesterday the contract was signed.','2026-07-16')::text$test$,'expect',jsonb_build_object('type','contains','value','2026-07-15'))), op_steps := jsonb_build_array(jsonb_build_object('name','main','kind','llm','provider','clover_llm','model','gemma4','system','You extract factual timelines. Return a valid JSON array only, without markdown.','user','Extract all events from the text and order them chronologically.

TEXT: {{t}}
REFERENCE DATE: {{reference_date}}

Each event must have timestamp, event, actors (array), type, and sequence. Prefer ISO 8601; convert 12-hour times to 24-hour times; resolve relative dates using the reference date when supplied; do not invent facts. Return ONLY the JSON array.','max_tokens',1400,'temperature',0.1)));

SELECT rvbbit.create_operator('clover_llm_consensus', ARRAY['texts','focus'], 'text', op_description := 'Clover-LLM: synthesize the shared consensus across a JSON array of comments, tickets, reviews, or findings', op_tests := jsonb_build_array(jsonb_build_object('name','service_consensus','sql',$test$SELECT rvbbit.clover_llm_consensus(jsonb_build_array('The staff were helpful','Great customer service','Support solved my issue quickly','Friendly service team')::text,'main shared finding')$test$,'expect',jsonb_build_object('type','contains','value','service'))), op_steps := jsonb_build_array(jsonb_build_object('name','main','kind','llm','provider','clover_llm','model','gemma4','system','You synthesize consensus without inventing agreement. Return concise plain text only.','user','Find the strongest shared consensus across these JSON-array items.

FOCUS: {{focus}}
ITEMS: {{texts}}

State what most items agree on, qualify disagreements or weak evidence, and do not merely list every item. Return ONLY a concise 1-3 sentence consensus.','max_tokens',400,'temperature',0.1)));

UPDATE rvbbit.operators SET tests = jsonb_build_array(jsonb_build_object('name','email','sql',$test$SELECT rvbbit.clover_pii('Contact Sarah Chen at sarah@acme.com or 555-867-5309')::text$test$,'expect',jsonb_build_object('type','contains','value','sarah@acme.com')),jsonb_build_object('name','ssn','sql',$test$SELECT rvbbit.clover_pii('SSN on file: 123-45-6789')::text$test$,'expect',jsonb_build_object('type','contains','value','123-45-6789'))) WHERE name='clover_pii';

UPDATE rvbbit.operators SET tests = jsonb_build_array(jsonb_build_object('name','close','sql',$test$SELECT rvbbit.clover_similar('fast database','quick sql engine')$test$,'expect',jsonb_build_object('type','min','value','0.45')),jsonb_build_object('name','far','sql',$test$SELECT rvbbit.clover_similar('fast database','a nice sandwich')$test$,'expect',jsonb_build_object('type','max','value','0.35'))) WHERE name='clover_similar';

UPDATE rvbbit.operators SET tests = jsonb_build_array(jsonb_build_object('name','scores','sql',$test$SELECT rvbbit.clover_moderate('you are a worthless idiot')::text$test$,'expect',jsonb_build_object('type','contains','value','insult'))) WHERE name='clover_moderate';

UPDATE rvbbit.operators SET tests = jsonb_build_array(jsonb_build_object('name','scores_outlier','sql',$test$WITH m AS (SELECT rvbbit.clover_anomaly_fit('[[1,1],[1.1,0.9],[0.9,1.2],[10,10]]') AS j) SELECT jsonb_array_length(rvbbit.clover_anomaly_score(j->>'blob_b64','[[10,10]]')->'scores') FROM m$test$,'expect',jsonb_build_object('type','exact','value','1'))) WHERE name='clover_anomaly_score';

UPDATE rvbbit.operators SET tests = jsonb_build_array(jsonb_build_object('name','arithmetic','sql',$test$SELECT rvbbit.clover_llm_ask('What is two plus two?')$test$,'expect',jsonb_build_object('type','not_empty'))) WHERE name='clover_llm_ask';

UPDATE rvbbit.backends b SET source_provider='rvbbit.ai', source_model=v.source_model, source_revision=v.source_revision, install_manifest=jsonb_build_object('capability','managed/clover','backend',v.backend_name) FROM (VALUES ('embed','Snowflake/snowflake-arctic-embed-l-v2.0','clover-v1'),('rerank','BAAI/bge-reranker-v2-m3','clover-v1'),('sentiment','cardiffnlp/twitter-xlm-roberta-base-sentiment','clover-v1.0'),('nli','MoritzLaurer/deberta-v3-large-zeroshot-v2.0','clover-v1'),('nli3','MoritzLaurer/deberta-v3-large-mnli-fever-anli-ling-wanli','clover-v1'),('classify','MoritzLaurer/deberta-v3-large-zeroshot-v2.0','clover-v1'),('toxicity','unitary/toxic-bert','clover-v1'),('language','papluca/xlm-roberta-base-language-detection','clover-v1'),('extract','urchade/gliner_large-v2.1','clover-v1'),('ocr','stepfun-ai/GOT-OCR-2.0-hf','clover-v1'),('transcribe','openai/whisper-large-v3-turbo','clover-v1'),('forecast','amazon/chronos-bolt-base','clover-v1'),('image_embed','google/siglip2-so400m-patch16-384','clover-v1'),('tabular_fit','Prior-Labs/TabPFN-v2-clf+reg','clover-v1'),('tabular_predict','Prior-Labs/TabPFN-v2-clf+reg','clover-v1'),('tabular_explain','Prior-Labs/TabPFN-v2-clf+reg + SHAP','clover-v1'),('anomaly_fit','scikit-learn/IsolationForest','clover-v1'),('anomaly_score','scikit-learn/IsolationForest','clover-v1'),('relations','Babelscape/rebel-large','clover-v1'),('cluster','Snowflake/snowflake-arctic-embed-l-v2.0 + KMeans/HDBSCAN','clover-v1'),('clover_llm','nvidia/Gemma-4-31B-IT-NVFP4','clover-llm-v1')) AS v(backend_name,source_model,source_revision) WHERE b.name=v.backend_name;

SELECT rvbbit.create_operator('clover_web_scrape', ARRAY['url'], 'jsonb', op_description := 'Clover-Web: fetch a public HTTP(S) HTML page or supported document and return cleaned Markdown, metadata, provenance, and diagnostics; static content only (no JavaScript, login, cookies, or private-network targets)', op_steps := jsonb_build_array(jsonb_build_object('name','w','kind','specialist','specialist','web_scrape','inputs',jsonb_build_object('url','{{url}}'))));

SELECT rvbbit.create_operator('clover_web_markdown', ARRAY['url'], 'text', op_description := 'Clover-Web: fetch a public HTTP(S) HTML page or supported document and return cleaned Markdown; static content only (no JavaScript, login, cookies, or private-network targets)', op_steps := jsonb_build_array(jsonb_build_object('name','w','kind','specialist','specialist','web_scrape','inputs',jsonb_build_object('url','{{url}}')),jsonb_build_object('name','m','kind','code','fn','json_get','inputs',jsonb_build_object('value','{{steps.w.output}}','path','markdown'))));

UPDATE rvbbit.backends SET source_provider='rvbbit.ai', source_model='firecrawl/html-extractor + firecrawl/anydoc', source_revision='clover-web-v0.1', install_manifest=jsonb_build_object('capability','managed/clover','backend','web_scrape') WHERE name='web_scrape';

SELECT rvbbit.set_cost_policy('backend','clover_llm','model_rate', input_per_mtok => 0.10, output_per_mtok => 0.20, model => 'gemma4', notes => 'Clover included value: would-be a-la-carte cost of hosted gemma4; covered by subscription, never billed');

SELECT rvbbit.create_operator('clover_triples', ARRAY['text','focus'], 'jsonb',
  op_description := 'Clover-LLM: extract knowledge-graph triples from text as strict JSON — same contract as the built-in rvbbit.triples (subject_kind/subject/predicate/object_kind/object/confidence/evidence/properties), hosted gemma4',
  op_steps := jsonb_build_array(jsonb_build_object(
    'name','main','kind','llm','provider','clover_llm','model','gemma4',
    'system','You are a strict knowledge graph extraction engine. Extract concise, useful facts as JSON triples. Return ONLY a valid JSON array. Each item MUST use exactly these keys unless optional values are needed: subject_kind, subject, predicate, object_kind, object, confidence, evidence, properties. subject and object are entity/value labels. subject_kind and object_kind are short lowercase types such as person, organization, customer, product, issue, event, metric, document, place, date, value, or concept. predicate is a snake_case relationship such as works_at, reported, affects, requested, approved, located_in, uses, owns, depends_on, caused_by, deadline_is, has_status. confidence is 0.0 to 1.0. evidence is a short quote or sentence from the input. properties is an optional object. Extract explicit facts first. Include only high-signal facts. Empty input or no facts returns []. No markdown, no commentary, no code fence.',
    'user', E'FOCUS: {{focus}}\n\nTEXT:\n{{text}}\n\nReturn JSON array only.',
    'max_tokens', 1600, 'temperature', 0.1)),
  op_tests := jsonb_build_array(
    jsonb_build_object('name','extracts_facts',
      'sql','SELECT (rvbbit.clover_triples(''Sarah Chen works at Acme Corp and reported the Q3 pipeline outage on March 3'', ''all''))::text',
      'expect', jsonb_build_object('type','contains','value','works_at')),
    jsonb_build_object('name','valid_contract',
      'sql','SELECT rvbbit.triples_valid((rvbbit.clover_triples(''Maria Lopez owns Bluebird Bakery in Portland'', ''all''))::text)::text',
      'expect', jsonb_build_object('type','contains','value','true')),
    jsonb_build_object('name','empty_input',
      'sql','SELECT (rvbbit.clover_triples('''', ''all''))::text',
      'expect', jsonb_build_object('type','exact','value','[]'))
  ));

CREATE OR REPLACE FUNCTION rvbbit.bind_triples_to_clover()
RETURNS text
LANGUAGE plpgsql
AS $btc$
BEGIN
    -- Route the built-in triples operator through Clover's hosted gemma4.
    -- Every KG system (data_crawl, Document Brain, Scry data layer) calls
    -- the operator NAME, so this one change makes them all work on installs
    -- with no local LLM provider configured. Reversible: unbind_triples_clover().
    UPDATE rvbbit.operators
    SET steps = (SELECT steps FROM rvbbit.operators WHERE name = 'clover_triples'),
        updated_at = clock_timestamp()
    WHERE name = 'triples';
    IF NOT FOUND THEN
        RETURN 'triples operator not found — is pg_rvbbit installed?';
    END IF;
    IF (SELECT steps FROM rvbbit.operators WHERE name = 'triples') IS NULL THEN
        RETURN 'clover_triples is not installed — install the Clover capability first';
    END IF;
    RETURN 'rvbbit.triples now runs on Clover (gemma4). Revert: SELECT rvbbit.unbind_triples_clover();';
END
$btc$;

CREATE OR REPLACE FUNCTION rvbbit.unbind_triples_clover()
RETURNS text
LANGUAGE plpgsql
AS $utc$
BEGIN
    -- Restore the triples operator to its own prompt/model body.
    UPDATE rvbbit.operators
    SET steps = NULL, updated_at = clock_timestamp()
    WHERE name = 'triples';
    RETURN 'rvbbit.triples restored to its configured model (' ||
           coalesce((SELECT model FROM rvbbit.operators WHERE name = 'triples'), '?') || ')';
END
$utc$;

CREATE OR REPLACE FUNCTION rvbbit.bind_extract_entities_to_clover()
RETURNS text
LANGUAGE plpgsql
AS $bee$
BEGIN
    -- Create (or rebind) the extract_entities operator the Brain's NER
    -- enrichment hardcodes, routed through Clover's hosted GLiNER-large
    -- ('extract' backend). Covers installs where the local GLiNER pack is
    -- absent or broken. Same contract as the pack op: (text, labels) ->
    -- jsonb array of {text, label, ...}. Revert: unbind_extract_entities_clover().
    IF NOT EXISTS (SELECT 1 FROM rvbbit.backends WHERE name = 'extract') THEN
        RETURN 'Clover ''extract'' backend is not registered — install the Clover capability first';
    END IF;
    PERFORM rvbbit.create_operator('extract_entities', ARRAY['text','labels'], 'jsonb',
      op_description := 'Extract entities from text with comma-separated labels (bound to Clover hosted GLiNER-large)',
      op_steps := jsonb_build_array(jsonb_build_object(
        'name','e','kind','specialist','specialist','extract',
        'inputs', jsonb_build_object('text','{{text}}','labels','{{labels}}'))));
    RETURN 'rvbbit.extract_entities now runs on Clover (GLiNER-large). Brain NER enrichment is live. Revert: SELECT rvbbit.unbind_extract_entities_clover();';
END
$bee$;

CREATE OR REPLACE FUNCTION rvbbit.unbind_extract_entities_clover()
RETURNS text
LANGUAGE plpgsql
AS $uee$
BEGIN
    -- Restore extract_entities to the local GLiNER pack backend
    -- (extract_gliner). Errors helpfully if that pack isn't installed.
    IF NOT EXISTS (SELECT 1 FROM rvbbit.backends WHERE name = 'extract_gliner') THEN
        RETURN 'local GLiNER pack backend (extract_gliner) is not registered — leaving the Clover binding in place';
    END IF;
    PERFORM rvbbit.create_operator('extract_entities', ARRAY['text','labels'], 'jsonb',
      op_description := 'Extract entities from text using GLiNER with comma-separated labels.',
      op_steps := jsonb_build_array(jsonb_build_object(
        'name','e','kind','specialist','specialist','extract_gliner',
        'inputs', jsonb_build_object('text','{{text}}','labels','{{labels}}'))));
    RETURN 'rvbbit.extract_entities restored to the local GLiNER pack (extract_gliner)';
END
$uee$;

DO $clover_default$
DECLARE cur text; ok boolean;
BEGIN
    -- Adopt clover_llm as the default LLM provider ONLY when the
    -- current default can't authenticate (virgin boxes ship
    -- default_provider=openrouter with no key, which strands every
    -- core LLM operator on a model this key can't reach). Boxes
    -- with a working provider are left exactly as they are.
    SELECT trim(both '"' from value::text) INTO cur
      FROM rvbbit.settings WHERE key = 'default_provider';
    SELECT (b.auth_header_env IS NULL
            OR rvbbit.env_present(b.auth_header_env)
            OR coalesce(rvbbit.get_secret(b.auth_header_env), '') <> '')
      INTO ok FROM rvbbit.backends b WHERE b.name = cur;
    IF cur IS DISTINCT FROM 'clover_llm' AND NOT coalesce(ok, false) THEN
        PERFORM rvbbit.set_default_provider('clover_llm');
        UPDATE rvbbit.operators SET model = ''
         WHERE model LIKE 'openai/%';
    END IF;
END $clover_default$;
