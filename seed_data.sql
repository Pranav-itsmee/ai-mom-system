-- ============================================================
-- AI MOM SYSTEM — FULL SEED DATA
-- 10 Meetings: 6 English + 4 Japanese (bilingual)
-- ============================================================
-- All users' password: Admin@123
-- Hash used: $2b$10$VQ9fXFEhvlaQOEe9nrLho.kOgnMX8wgxijh8bRsygBWaLRRbB7V8W
--
-- HOW TO RUN:
--   mysql -u root -p ai_mom_db < seed_data.sql
--
-- HOW TO RE-SEED (wipe + reload):
--   Same command — the file truncates all tables first.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ── TRUNCATE ALL (preserves table structure) ─────────────────
TRUNCATE TABLE notifications;
TRUNCATE TABLE tasks;
TRUNCATE TABLE mom_key_points;
TRUNCATE TABLE mom_versions;
TRUNCATE TABLE moms;
TRUNCATE TABLE meeting_attendees;
TRUNCATE TABLE meetings;
TRUNCATE TABLE users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- STEP 1: USERS
-- ============================================================
INSERT INTO users (id, name, email, password, role, created_at) VALUES
(1, 'Pranav',          'pranav@mosaique.link',          '$2b$10$VQ9fXFEhvlaQOEe9nrLho.kOgnMX8wgxijh8bRsygBWaLRRbB7V8W', 'admin',  NOW()),
(2, 'Ram Kumar',       'ram.kumar@mosaique.link',        '$2b$10$VQ9fXFEhvlaQOEe9nrLho.kOgnMX8wgxijh8bRsygBWaLRRbB7V8W', 'member', NOW()),
(3, 'Aiko Tanaka',     'aiko.tanaka@mosaique.link',      '$2b$10$VQ9fXFEhvlaQOEe9nrLho.kOgnMX8wgxijh8bRsygBWaLRRbB7V8W', 'member', NOW()),
(4, 'Sarah Chen',      'sarah.chen@mosaique.link',       '$2b$10$VQ9fXFEhvlaQOEe9nrLho.kOgnMX8wgxijh8bRsygBWaLRRbB7V8W', 'member', NOW()),
(5, 'Kenji Watanabe',  'kenji.watanabe@mosaique.link',   '$2b$10$VQ9fXFEhvlaQOEe9nrLho.kOgnMX8wgxijh8bRsygBWaLRRbB7V8W', 'member', NOW()),
(6, 'Dev Team Lead',   'devlead@mosaique.link',          '$2b$10$VQ9fXFEhvlaQOEe9nrLho.kOgnMX8wgxijh8bRsygBWaLRRbB7V8W', 'member', NOW());

-- ============================================================
-- STEP 2: MEETINGS
-- 7 completed (4 EN + 3 JA) · 1 scheduled · 1 recording · 1 processing
-- ============================================================
INSERT INTO meetings
  (id, title, meet_link, scheduled_at, started_at, ended_at, duration_seconds,
   organizer_id, created_by, location, status, created_at)
VALUES
-- ── Completed (English) ──────────────────────────────────────
(1,  'Q1 2025 Product Strategy Review',
     'https://meet.google.com/eng-str-001',
     '2025-04-01 10:00:00','2025-04-01 10:02:00','2025-04-01 11:30:00', 5280,
     1, 1, 'Conference Room A / Google Meet', 'completed', NOW()),

(2,  'Engineering Weekly Standup — Week 14',
     'https://meet.google.com/eng-std-014',
     '2025-04-07 09:00:00','2025-04-07 09:01:00','2025-04-07 09:31:00', 1800,
     2, 2, 'Google Meet (Online)', 'completed', NOW()),

(3,  'Customer Feedback Analysis — Q1 NPS Deep Dive',
     'https://meet.google.com/eng-nps-001',
     '2025-04-09 14:00:00','2025-04-09 14:03:00','2025-04-09 15:03:00', 3600,
     1, 1, 'Meeting Room B / Google Meet', 'completed', NOW()),

(4,  'Security Audit & Compliance Review — SOC 2 Prep',
     'https://meet.google.com/eng-sec-001',
     '2025-04-14 13:00:00','2025-04-14 13:02:00','2025-04-14 14:45:00', 6180,
     1, 1, 'Board Room', 'completed', NOW()),

-- ── Completed (Japanese — bilingual) ─────────────────────────
(5,  '製品ロードマップ Q2 2025 レビュー会議',
     'https://meet.google.com/jpn-rdmp-001',
     '2025-04-03 10:00:00','2025-04-03 10:01:00','2025-04-03 11:20:00', 4740,
     1, 1, '東京本社 第1会議室 / Google Meet 併用', 'completed', NOW()),

(6,  '第3回 スプリント計画会議 — AIプロジェクト Q2',
     'https://meet.google.com/jpn-spr-003',
     '2025-04-10 09:30:00','2025-04-10 09:31:00','2025-04-10 11:00:00', 5340,
     1, 1, '東京本社 第2会議室 / Google Meet 併用', 'completed', NOW()),

(7,  '四半期業績レビュー — 2025年Q1',
     'https://meet.google.com/jpn-qtr-001',
     '2025-04-12 15:00:00','2025-04-12 15:02:00','2025-04-12 16:30:00', 5280,
     1, 1, '東京本社 役員会議室', 'completed', NOW()),

-- ── Non-completed (for dashboard status variety) ─────────────
(8,  'Q2 Performance Review — Engineering Team',
     'https://meet.google.com/eng-perf-002',
     '2025-04-25 10:00:00', NULL, NULL, NULL,
     1, 1, 'Conference Room A', 'scheduled', NOW()),

(9,  'Daily Standup — Engineering',
     'https://meet.google.com/eng-daily-017',
     '2025-04-17 09:00:00','2025-04-17 09:01:00', NULL, NULL,
     2, 2, 'Google Meet (Online)', 'recording', NOW()),

(10, 'UX Research Findings — MOM Interface Study',
     'https://meet.google.com/eng-ux-002',
     '2025-04-16 14:00:00','2025-04-16 14:01:00','2025-04-16 15:15:00', 4440,
     4, 4, 'Google Meet (Online)', 'processing', NOW());

-- ============================================================
-- STEP 3: MEETING ATTENDEES
-- ============================================================
INSERT INTO meeting_attendees (meeting_id, user_id, created_at, updated_at) VALUES
-- Meeting 1 (EN)
(1,1,NOW(),NOW()),(1,2,NOW(),NOW()),(1,3,NOW(),NOW()),(1,4,NOW(),NOW()),(1,5,NOW(),NOW()),
-- Meeting 2 (EN)
(2,1,NOW(),NOW()),(2,2,NOW(),NOW()),(2,6,NOW(),NOW()),(2,5,NOW(),NOW()),
-- Meeting 3 (EN)
(3,1,NOW(),NOW()),(3,2,NOW(),NOW()),(3,4,NOW(),NOW()),(3,3,NOW(),NOW()),
-- Meeting 4 (EN)
(4,1,NOW(),NOW()),(4,2,NOW(),NOW()),(4,6,NOW(),NOW()),
-- Meeting 5 (JA)
(5,1,NOW(),NOW()),(5,2,NOW(),NOW()),(5,3,NOW(),NOW()),(5,5,NOW(),NOW()),(5,6,NOW(),NOW()),
-- Meeting 6 (JA)
(6,1,NOW(),NOW()),(6,2,NOW(),NOW()),(6,3,NOW(),NOW()),(6,5,NOW(),NOW()),
-- Meeting 7 (JA)
(7,1,NOW(),NOW()),(7,3,NOW(),NOW()),(7,4,NOW(),NOW()),(7,5,NOW(),NOW()),
-- Meeting 8 (scheduled)
(8,1,NOW(),NOW()),(8,2,NOW(),NOW()),(8,6,NOW(),NOW()),
-- Meeting 9 (recording)
(9,1,NOW(),NOW()),(9,2,NOW(),NOW()),(9,3,NOW(),NOW()),
-- Meeting 10 (processing)
(10,1,NOW(),NOW()),(10,4,NOW(),NOW()),(10,3,NOW(),NOW());

-- ============================================================
-- STEP 4: MOMs  (7 completed meetings → 7 MOMs)
-- ============================================================
INSERT INTO moms
  (id, meeting_id, summary, raw_transcript, is_edited, is_archived, archived_at, created_at, updated_at)
VALUES

-- ── MOM 1 (EN) — Q1 Product Strategy Review ──────────────────
(1, 1,
'The Q1 2025 product strategy review aligned the team on three core priorities for the remainder of the year: accelerating AI feature adoption, improving platform reliability to 99.9% uptime, and expanding the enterprise customer segment. Q1 metrics showed 34% growth in active users and NPS improved from 46 to 52. The team agreed to hire 2 senior engineers to support the accelerated roadmap.',
'Sarah (PM): Welcome everyone. Q1 metrics are in — 34% user growth, NPS moved from 46 to 52.
Marcus (Eng): Reliability improved. We went from 99.2% to 99.6% uptime. Still short of the 99.9% target.
Lisa (Design): Three enterprise clients specifically requested advanced analytics dashboards as a renewal blocker.
Sarah: We need 2 more engineers to hit Q2 targets. Can we onboard by May 1st if we start hiring this week?
Marcus: Yes. I can run interviews starting Monday.',
0, 0, NULL, NOW(), NOW()),

-- ── MOM 2 (EN) — Engineering Standup Week 14 ─────────────────
(2, 2,
'Week 14 standup resolved three active blockers. The auth token refresh bug was isolated to the Redis TTL configuration and the fix is ready to merge. The MOM PDF export feature is 80% complete and blocked on PDFKit license approval from legal. The Sequelize query optimization is deployed to staging with a confirmed 62% load time reduction and is ready for production.',
'Marcus: Auth bug update — it is the Redis TTL. Setting it to 7 days fixes it. PR is ready for review.
Dev Lead: Good. Merge after standup. PDF export status?
Alice: 80% complete. Blocked on PDFKit license — legal needs to approve. ETA Thursday.
Marcus: Staging deploy is live. Sequelize optimization confirmed — 62% load time drop.',
0, 0, NULL, NOW(), NOW()),

-- ── MOM 3 (EN) — NPS Deep Dive ───────────────────────────────
(3, 3,
'NPS deep dive revealed two primary detractor themes: slow page load times (41% of detractors) and missing bulk export functionality (28% of detractors). Promoters highlighted AI-generated MOM quality and the clean interface. A dedicated performance sprint was approved to address load times first, as it has the highest NPS recovery impact.',
'Sarah: 41% of detractors cited slow loads. Our Lighthouse score is 58 — well below the 90 target.
Lisa: Bulk export is the second pain point — 28%. Mainly power users on enterprise plans.
Marcus: Performance fixes are already underway. We can close that in about 2 weeks.
Sarah: Promoters love the AI MOM quality. That is our biggest differentiator — we protect that.',
0, 0, NULL, NOW(), NOW()),

-- ── MOM 4 (EN) — Security Audit ──────────────────────────────
(4, 4,
'The security audit review identified 4 critical findings ahead of the SOC 2 Type II audit: JWT tokens lack rotation policy, audit logs are not tamper-evident, password reset emails lack rate limiting, and 3 API endpoints expose internal error details in production. A 2-week remediation sprint was scoped with all 4 issues targeted for resolution before May 15.',
'Security Lead: We have 4 critical findings from the pre-audit scan.
Dev Lead: JWT rotation — we have not implemented refresh token rotation. Straightforward fix, 1 day.
Marcus: Audit log immutability — we need append-only storage. AWS CloudWatch Logs with KMS works.
Dev Lead: Rate limiting on password reset — 10 requests per hour per email is the standard.
Security Lead: API error exposure is a misconfigured Express error handler. Quick fix.',
0, 0, NULL, NOW(), NOW()),

-- ── MOM 5 (JA) — 製品ロードマップ Q2 2025 ───────────────────
(5, 5,
'Q2 2025製品ロードマップのレビューを行い、AI精度向上・UIの全面改善・バックエンドパフォーマンス最適化を最優先事項として合意しました。Whisperモデルのファインチューニングによる専門用語認識率向上を4月末までに完了し、新しいMOM表示テンプレートをステージング環境に4月末までに展開する予定です。次回レビューは5月15日に予定されています。

---
[English Translation]

Reviewed the Q2 2025 product roadmap and agreed on AI accuracy improvement, full UI redesign, and backend performance optimization as top priorities. Whisper fine-tuning for technical terminology recognition is targeted by end of April, with the new MOM display template to be deployed to staging by April 30. Next review is scheduled for May 15.',
'渡辺（プロジェクトマネージャー）: 皆さん、Q2のロードマップについて確認しましょう。
山本（AIエンジニア）: Whisperの誤認識率を改善したいです。現在8%ですが、カスタム辞書で3%以下にできます。
田中（フロントエンド）: UIのリニューアルも急務です。ユーザーテストでMOMページが複雑すぎると指摘されました。
鈴木（バックエンド）: クエリ最適化はすでに着手中です。separate:trueの適用で大幅改善見込みです。
渡辺: 全て重要ですね。Q2最優先3項目として確定しましょう。',
0, 0, NULL, NOW(), NOW()),

-- ── MOM 6 (JA) — 第3回スプリント計画会議 ────────────────────
(6, 6,
'第3回スプリント計画会議では、AIプロジェクトQ2の開発優先事項を確定しました。Whisper音声認識の精度改善（目標：誤認識率3%以下）、MOМ表示UIの全面刷新、データベースクエリのパフォーマンス最適化が今スプリントの最重要タスクとして承認されました。各担当者とデッドラインを確定し、5月1日のスプリントレビューに向けて進捗管理を行うことが決定されました。

---
[English Translation]

The 3rd Sprint Planning Meeting confirmed Q2 AI project development priorities. Whisper accuracy improvement (target: under 3% error rate), MOM UI redesign, and DB query optimization were approved as highest-priority tasks. Owners and deadlines were confirmed for all items, with progress tracking toward the May 1st sprint review agreed upon.',
'渡辺（スクラムマスター）: 皆さん、おはようございます。第3回スプリント計画を始めましょう。
山本（AIエンジニア）: Whisperの現在の誤認識率は8.2%です。カスタム語彙辞書で3%以下にできます。工数は3日です。
田中（フロントエンド）: MOМページのロード時間が2.1秒かかっています。N+1クエリ修正で0.8秒以下にできます。
鈴木（バックエンド）: separate:trueを全クエリに適用します。ステージングで計測後、本番反映します。
渡辺: 全タスクをP0として今スプリントに組み込みましょう。次回レビューは5月1日です。',
0, 0, NULL, NOW(), NOW()),

-- ── MOM 7 (JA) — 四半期業績レビュー Q1 ──────────────────────
(7, 7,
'2025年Q1業績レビューでは、売上目標の108%達成と新規顧客獲得数が前四半期比23%増という好結果が報告されました。一方、解約率が2.1%から2.8%に上昇しており、エンタープライズ顧客のオンボーディング体験改善が急務と確認されました。Q2に向けてカスタマーサクセスチームの増強と専任オンボーディングプログラムの策定が決定されました。

---
[English Translation]

The Q1 2025 business review reported 108% of sales targets and 23% quarter-over-quarter new customer growth. However, churn rate rose from 2.1% to 2.8%, making enterprise onboarding improvement an urgent priority. For Q2, strengthening the customer success team and launching a dedicated onboarding program were decided.',
'渡辺（事業部長）: Q1の売上は目標の108%を達成しました。新規顧客も前四半期比23%増です。
田中（CS責任者）: ただし解約率が2.1%から2.8%に上昇しています。エンタープライズ顧客のオンボーディングが主な問題です。
山本（セールス）: 「導入初期のサポートが不十分」という声が多いです。専任担当者が必要です。
渡辺: Q2はカスタマーサクセスを強化しましょう。専任オンボーディングプログラムを策定します。',
0, 0, NULL, NOW(), NOW());

-- ============================================================
-- STEP 5: MOM KEY POINTS
-- ============================================================
INSERT INTO mom_key_points (mom_id, point_text, order_index, created_at, updated_at) VALUES

-- ── MOM 1 (EN) ───────────────────────────────────────────────
(1,'[Agenda] Q1 2025 metrics review — user growth, NPS, uptime',0,NOW(),NOW()),
(1,'[Agenda] Q2 and Q3 roadmap priority alignment',1,NOW(),NOW()),
(1,'[Agenda] Engineering headcount planning for Q2',2,NOW(),NOW()),
(1,'[Discussion] Q1 results: 34% user growth, NPS improved 46→52, uptime reached 99.6% (target 99.9% not yet met)',3,NOW(),NOW()),
(1,'[Discussion] Three enterprise accounts citing missing analytics dashboards as a contract renewal blocker',4,NOW(),NOW()),
(1,'[Discussion] 2 additional senior engineers required to meet Q2 delivery milestones',5,NOW(),NOW()),
(1,'[Decision] Q2 top 3 priorities confirmed: AI feature adoption, 99.9% uptime, enterprise segment expansion',6,NOW(),NOW()),
(1,'[Decision] Hire 2 senior engineers — target onboarding May 1st, hiring process starts this week',7,NOW(),NOW()),

-- ── MOM 2 (EN) ───────────────────────────────────────────────
(2,'[Agenda] Sprint blocker review and resolution status',0,NOW(),NOW()),
(2,'[Agenda] Staging deployment validation — Sequelize optimization',1,NOW(),NOW()),
(2,'[Discussion] Auth token refresh bug traced to Redis TTL misconfiguration — 1-line fix, PR ready for review',2,NOW(),NOW()),
(2,'[Discussion] PDF export 80% complete; blocked on PDFKit license approval from legal team (expected Thursday)',3,NOW(),NOW()),
(2,'[Discussion] Sequelize separate:true optimization deployed to staging — 62% page load reduction confirmed via k6',4,NOW(),NOW()),
(2,'[Decision] Merge Redis TTL fix immediately after standup — no additional review needed',5,NOW(),NOW()),
(2,'[Decision] Follow up with legal on PDFKit license by EOD Wednesday to unblock PDF export',6,NOW(),NOW()),
(2,'[Decision] Promote Sequelize optimization to production after 48-hour staging validation window',7,NOW(),NOW()),

-- ── MOM 3 (EN) ───────────────────────────────────────────────
(3,'[Agenda] Q1 NPS score analysis and detractor theme mapping',0,NOW(),NOW()),
(3,'[Agenda] Promoter feedback — product strengths to protect and scale',1,NOW(),NOW()),
(3,'[Discussion] Top detractor theme: slow page loads (41% of detractors); Lighthouse score currently 58/100',2,NOW(),NOW()),
(3,'[Discussion] Second detractor theme: missing bulk export (28%); mainly enterprise plan power users',3,NOW(),NOW()),
(3,'[Discussion] Promoters cite AI MOM quality and clean interface as primary reasons for high NPS scores',4,NOW(),NOW()),
(3,'[Decision] Performance sprint approved — address load times before any new features this quarter',5,NOW(),NOW()),
(3,'[Decision] Bulk export added to Q2 backlog as P1 item after performance work completes',6,NOW(),NOW()),

-- ── MOM 4 (EN) ───────────────────────────────────────────────
(4,'[Agenda] Pre-SOC 2 Type II security scan findings review',0,NOW(),NOW()),
(4,'[Agenda] Remediation priority ranking and 2-week sprint scope',1,NOW(),NOW()),
(4,'[Discussion] Finding 1: JWT refresh token rotation not implemented — straightforward fix, estimated 1 day',2,NOW(),NOW()),
(4,'[Discussion] Finding 2: Audit logs not tamper-evident — solution: AWS CloudWatch Logs with KMS encryption',3,NOW(),NOW()),
(4,'[Discussion] Finding 3: No rate limiting on password reset endpoint — proposal: 10 req/hour per email address',4,NOW(),NOW()),
(4,'[Discussion] Finding 4: 3 production API endpoints returning full stack traces in error responses',5,NOW(),NOW()),
(4,'[Decision] All 4 critical findings must be resolved by May 15 before SOC 2 audit window opens',6,NOW(),NOW()),
(4,'[Decision] 2-week remediation sprint begins April 15; security lead must verify each fix before merge',7,NOW(),NOW()),

-- ── MOM 5 (JA) ───────────────────────────────────────────────
(5,'[議題] Q2 2025製品ロードマップの確認と優先順位の決定',0,NOW(),NOW()),
(5,'[議題] AI MOM生成機能の精度向上計画',1,NOW(),NOW()),
(5,'[議題] フロントエンドUIリニューアル計画の承認',2,NOW(),NOW()),
(5,'[議論] Whisper誤認識率は現在8%。ITカスタム辞書（2,000語）の追加で3%以下を目指す。工数3日と試算',3,NOW(),NOW()),
(5,'[議論] ユーザーテスト結果：67%がMOMページを「複雑すぎる」と回答。ITテンプレート形式への移行で改善見込み',4,NOW(),NOW()),
(5,'[議論] N+1クエリ問題：Sequelize separate:trueの適用で応答時間を最大60%改善できると試算',5,NOW(),NOW()),
(5,'[決定] Q2最優先3項目：Whisper精度向上・UIリニューアル・DB最適化を並行実施',6,NOW(),NOW()),
(5,'[決定] 新MOМテンプレートは4月30日までにステージング環境へ展開し、5月10日に全ユーザーへ公開する',7,NOW(),NOW()),
(5,'[EN Agenda] Review and finalize Q2 2025 product roadmap priorities',8,NOW(),NOW()),
(5,'[EN Discussion] Whisper error rate 8% → under 3% target; custom vocabulary (2,000 IT terms), 3-day effort',9,NOW(),NOW()),
(5,'[EN Discussion] 67% of users found MOM page too complex; IT template format migration proposed and discussed',10,NOW(),NOW()),
(5,'[EN Decision] Q2 top 3: Whisper accuracy, UI redesign, DB optimization — all parallel tracks this sprint',11,NOW(),NOW()),
(5,'[EN Decision] New MOM template deployed to staging by April 30; public rollout May 10',12,NOW(),NOW()),

-- ── MOM 6 (JA) ───────────────────────────────────────────────
(6,'[議題] Q2スプリント3バックログの優先順位確定',0,NOW(),NOW()),
(6,'[議題] Whisper精度改善の詳細計画レビュー',1,NOW(),NOW()),
(6,'[議題] フロントエンドパフォーマンス改善の進捗確認',2,NOW(),NOW()),
(6,'[議論] Whisper誤認識率8.2%→3%以下目標。カスタム語彙辞書（IT用語2,000語）実装工数3日と試算',3,NOW(),NOW()),
(6,'[議論] MOМページロード時間2.1秒。N+1クエリ修正により0.8秒以下に改善可能と確認',4,NOW(),NOW()),
(6,'[議論] UIリニューアル：ITテンプレート形式（テーブルレイアウト）の採用を全員で合意',5,NOW(),NOW()),
(6,'[議論] 次回スプリントレビューは2025年5月1日（木）14:00〜15:30に実施予定',6,NOW(),NOW()),
(6,'[決定] Whisper精度改善をP0タスクとして今スプリントに組み込む。担当：山本、期限：4月25日',7,NOW(),NOW()),
(6,'[決定] N+1クエリ修正は4月18日完了、ステージングでk6ベンチマーク測定を必ず実施すること',8,NOW(),NOW()),
(6,'[決定] 次回スプリントレビュー：2025年5月1日（木）14:00〜 東京本社 第2会議室',9,NOW(),NOW()),
(6,'[EN Agenda] Finalize Q2 Sprint 3 backlog priorities',10,NOW(),NOW()),
(6,'[EN Discussion] Whisper 8.2% → under 3%: custom vocabulary (2,000 terms), 3-day development effort',11,NOW(),NOW()),
(6,'[EN Discussion] MOM page load 2.1s — N+1 fix confirmed to bring it under 0.8s',12,NOW(),NOW()),
(6,'[EN Decision] Whisper accuracy is P0 this sprint. Owner: Yamamoto, deadline: April 25',13,NOW(),NOW()),
(6,'[EN Decision] N+1 fix by April 18 with staging k6 benchmarks required before production deploy',14,NOW(),NOW()),

-- ── MOM 7 (JA) ───────────────────────────────────────────────
(7,'[議題] 2025年Q1売上・KPI実績レビュー',0,NOW(),NOW()),
(7,'[議題] 解約率上昇の原因分析と対策検討',1,NOW(),NOW()),
(7,'[議題] Q2カスタマーサクセス強化計画の策定',2,NOW(),NOW()),
(7,'[議論] Q1実績：売上目標108%達成・新規顧客獲得数前四半期比23%増・月次経常収益（MRR）¥28.4M',3,NOW(),NOW()),
(7,'[議論] 解約率が2.1%→2.8%に上昇。主因：エンタープライズ顧客の導入後90日以内の解約が全解約の74%を占める',4,NOW(),NOW()),
(7,'[議論] エンタープライズ顧客の主な不満：導入初期サポートの不足・管理画面の複雑さ・日本語対応の不完全さ',5,NOW(),NOW()),
(7,'[議論] カスタマーサクセス担当者を現在の2名から4名に増強する予算が取締役会で承認済み',6,NOW(),NOW()),
(7,'[決定] Q2最優先：エンタープライズ向け専任オンボーディングプログラムを5月末までに策定・実施開始',7,NOW(),NOW()),
(7,'[決定] CSマネージャー2名を4月30日までに採用。5月中旬からオンボーディング対応を開始する',8,NOW(),NOW()),
(7,'[EN Agenda] Q1 2025 business performance and KPI review',9,NOW(),NOW()),
(7,'[EN Discussion] Q1 results: 108% of sales target, 23% QoQ new customer growth, MRR ¥28.4M',10,NOW(),NOW()),
(7,'[EN Discussion] Churn rose 2.1%→2.8%; 74% of enterprise churns occurred within 90 days of onboarding',11,NOW(),NOW()),
(7,'[EN Decision] Q2 top priority: design and launch dedicated enterprise onboarding program by end of May',12,NOW(),NOW()),
(7,'[EN Decision] Hire 2 CS managers by April 30; onboarding support begins mid-May',13,NOW(),NOW());

-- ============================================================
-- STEP 6: TASKS
-- ============================================================
INSERT INTO tasks
  (mom_id, title, description, assigned_to, assignee_id, deadline, priority, status, created_at, updated_at)
VALUES

-- ── MOM 1 tasks ───────────────────────────────────────────────
(1,'Post senior engineer job descriptions',
   'Create and post 2 senior engineer JDs. Target: interviews by Apr 21, offers by Apr 28.',
   'Pranav', 1, '2025-04-10','high','completed',NOW(),NOW()),
(1,'Build enterprise analytics dashboard MVP',
   'Deliver the 5 key metrics requested by enterprise clients using Chart.js.',
   'Ram Kumar', 2, '2025-04-30','high','in_progress',NOW(),NOW()),
(1,'Fix top-3 uptime reliability root causes',
   'Identify and resolve the 3 root causes of Q1 downtime incidents. Document fixes in runbook.',
   'Dev Team Lead', 6, '2025-04-25','high','in_progress',NOW(),NOW()),

-- ── MOM 2 tasks ───────────────────────────────────────────────
(2,'Merge Redis TTL auth token fix',
   'Review and merge the 1-line Redis TTL fix PR. Update auth config documentation.',
   'Dev Team Lead', 6, '2025-04-07','high','completed',NOW(),NOW()),
(2,'Resolve PDFKit license with legal team',
   'Email legal team requesting PDFKit MIT license approval. Unblock PDF export feature.',
   'Ram Kumar', 2, '2025-04-10','medium','completed',NOW(),NOW()),
(2,'Deploy Sequelize optimization to production',
   'After 48h staging validation, promote the separate:true optimization to prod. Monitor error rate.',
   'Dev Team Lead', 6, '2025-04-12','high','completed',NOW(),NOW()),

-- ── MOM 3 tasks ───────────────────────────────────────────────
(3,'Improve Lighthouse performance score to 80+',
   'Identify top bottlenecks and fix them. Target: Lighthouse performance score 80+ on MOM detail page.',
   'Ram Kumar', 2, '2025-04-21','high','in_progress',NOW(),NOW()),
(3,'Design bulk export UX flow',
   'Create wireframes for bulk MOM export (PDF/DOCX). Validate with 3 enterprise users before build.',
   'Aiko Tanaka', 3, '2025-04-28','medium','pending',NOW(),NOW()),

-- ── MOM 4 tasks ───────────────────────────────────────────────
(4,'Implement JWT refresh token rotation',
   'Add refresh token rotation to auth service. Invalidate old tokens on each use.',
   'Dev Team Lead', 6, '2025-04-22','high','completed',NOW(),NOW()),
(4,'Set up tamper-evident audit logging',
   'Configure AWS CloudWatch Logs with KMS for append-only, tamper-evident audit trail.',
   'Ram Kumar', 2, '2025-04-25','high','in_progress',NOW(),NOW()),
(4,'Add rate limiting to password reset endpoint',
   'Implement 10 req/hour/email rate limit on /auth/reset-password using express-rate-limit.',
   'Dev Team Lead', 6, '2025-04-19','high','completed',NOW(),NOW()),
(4,'Fix production API error response exposure',
   'Update Express error handler to return generic messages in production. Audit all 3 affected routes.',
   'Ram Kumar', 2, '2025-04-19','high','completed',NOW(),NOW()),

-- ── MOM 5 tasks (JA) ─────────────────────────────────────────
(5,'Whisperカスタム辞書実装',
   'IT・ビジネス用語2,000語のカスタム辞書を作成しWhisperに組み込む。目標誤認識率3%以下。',
   'Kenji Watanabe', 5, '2025-04-30','high','in_progress',NOW(),NOW()),
(5,'MOМページITテンプレート形式の実装',
   'テーブル形式の議題・決定事項・アクション項目セクションを含む新MOМ詳細ページを実装する。',
   'Pranav', 1, '2025-04-28','high','in_progress',NOW(),NOW()),
(5,'N+1クエリ最適化とステージングベンチマーク',
   'Sequelize separate:trueを全has-manyクエリに適用し、k6でP95 < 200msを確認する。',
   'Dev Team Lead', 6, '2025-04-18','high','completed',NOW(),NOW()),

-- ── MOM 6 tasks (JA) ─────────────────────────────────────────
(6,'Whisper専門用語カスタム語彙辞書実装',
   'IT・ビジネス専門用語2,000語のカスタム辞書を作成しWhisperに組み込む。誤認識率3%以下が目標。',
   'Kenji Watanabe', 5, '2025-04-25','high','in_progress',NOW(),NOW()),
(6,'N+1クエリ修正とステージングk6ベンチマーク',
   'separate:true適用後、k6で計測。P95 < 200msを目標。結果をSlackに共有する。',
   'Dev Team Lead', 6, '2025-04-18','high','completed',NOW(),NOW()),
(6,'スプリントレビュー用アジェンダ作成',
   '5月1日のスプリントレビュー向けアジェンダと評価基準ドキュメントを4月28日までに作成する。',
   'Aiko Tanaka', 3, '2025-04-28','low','pending',NOW(),NOW()),

-- ── MOM 7 tasks (JA) ─────────────────────────────────────────
(7,'エンタープライズオンボーディングプログラム策定',
   '導入後30日・60日・90日のチェックポイントを含む専任プログラムを5月末までに設計・実施開始する。',
   'Sarah Chen', 4, '2025-05-30','high','pending',NOW(),NOW()),
(7,'CSマネージャー2名採用',
   '求人票を今週作成・掲載。4月30日までに採用完了。面接は今週開始。',
   'Pranav', 1, '2025-04-30','high','in_progress',NOW(),NOW()),
(7,'管理画面の日本語対応強化',
   '未対応の管理画面ページを日本語化。i18n対応漏れ箇所を全て修正し5月15日までに完了する。',
   'Aiko Tanaka', 3, '2025-05-15','medium','pending',NOW(),NOW());

-- ============================================================
-- STEP 7: NOTIFICATIONS
-- ============================================================
INSERT INTO notifications (user_id, type, title, message, is_read, created_at) VALUES
(2,'task_assigned',    'New task assigned',          'You have been assigned: Build enterprise analytics dashboard MVP',           0, NOW()),
(5,'task_assigned',    'New task assigned',          'You have been assigned: Whisperカスタム辞書実装',                              0, NOW()),
(3,'task_assigned',    'New task assigned',          'You have been assigned: スプリントレビュー用アジェンダ作成',                   0, NOW()),
(4,'task_assigned',    'New task assigned',          'You have been assigned: エンタープライズオンボーディングプログラム策定',        0, NOW()),
(6,'task_assigned',    'New task assigned',          'You have been assigned: Set up real-time notification infrastructure',        0, NOW()),
(2,'task_deadline',    'Task due soon',              'Task due in 2 days: Improve Lighthouse performance score to 80+',             0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(5,'task_deadline',    'Task deadline approaching',  'Kenji — Whisper辞書タスクの期限が近づいています (2025-04-25)',                 1, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(1,'meeting_starting', 'Meeting starting soon',      'Q2 Performance Review — Engineering Team starts in 15 minutes',              1, DATE_SUB(NOW(), INTERVAL 3 HOUR));

-- ============================================================
-- VERIFICATION (uncomment to run after seeding)
-- ============================================================
SELECT 'users'              AS tbl, COUNT(*) AS cnt FROM users
UNION ALL SELECT 'meetings',          COUNT(*) FROM meetings
UNION ALL SELECT 'meeting_attendees', COUNT(*) FROM meeting_attendees
UNION ALL SELECT 'moms',              COUNT(*) FROM moms
UNION ALL SELECT 'mom_key_points',    COUNT(*) FROM mom_key_points
UNION ALL SELECT 'tasks',             COUNT(*) FROM tasks
UNION ALL SELECT 'notifications',     COUNT(*) FROM notifications;

-- ============================================================
-- EXPECTED COUNTS:
--   users              = 6
--   meetings           = 10
--   meeting_attendees  = 30
--   moms               = 7
--   mom_key_points     = 72
--   tasks              = 22
--   notifications      = 8
-- ============================================================
