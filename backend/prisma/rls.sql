-- 0. Ensure non-superuser app_user role exists so PostgreSQL RLS cannot be bypassed
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'app_password';
  END IF;
  GRANT USAGE ON SCHEMA public TO app_user;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
END
$$;

-- 1. Enable & Force Row Level Security on Core Tables
ALTER TABLE "Fdr" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fdr" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" FORCE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS fdr_isolation_policy ON "Fdr";
DROP POLICY IF EXISTS document_isolation_policy ON "Document";
DROP POLICY IF EXISTS alert_isolation_policy ON "Alert";

-- 2. FDR Isolation Policy
CREATE POLICY fdr_isolation_policy ON "Fdr"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    -- Admin, Bureau Head, and Statutory Committees have nationwide oversight
    current_setting('app.current_role', true) IN ('ADMIN', 'AUTHORITY', 'BUREAU', 'COMMITTEE')
    OR
    -- Regional Officers can only access FDRs belonging to institutions in their assigned region
    (
      current_setting('app.current_role', true) IN ('OFFICER', 'REGIONAL_OFFICER')
      AND EXISTS (
        SELECT 1 FROM "Institution" i
        WHERE i.id = "Fdr"."institutionId"
          AND i.region = current_setting('app.current_region', true)
      )
    )
    OR
    -- Institutions can only access FDRs belonging strictly to their own institutionId
    (
      current_setting('app.current_role', true) = 'INSTITUTION'
      AND "Fdr"."institutionId" = current_setting('app.current_institution_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('ADMIN', 'AUTHORITY', 'BUREAU', 'COMMITTEE')
    OR
    (
      current_setting('app.current_role', true) IN ('OFFICER', 'REGIONAL_OFFICER')
      AND EXISTS (
        SELECT 1 FROM "Institution" i
        WHERE i.id = "Fdr"."institutionId"
          AND i.region = current_setting('app.current_region', true)
      )
    )
    OR
    (
      current_setting('app.current_role', true) = 'INSTITUTION'
      AND "Fdr"."institutionId" = current_setting('app.current_institution_id', true)
    )
  );

-- 3. Document Isolation Policy
CREATE POLICY document_isolation_policy ON "Document"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    current_setting('app.current_role', true) IN ('ADMIN', 'AUTHORITY', 'BUREAU', 'COMMITTEE')
    OR
    (
      current_setting('app.current_role', true) IN ('OFFICER', 'REGIONAL_OFFICER')
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        JOIN "Institution" i ON f."institutionId" = i.id
        WHERE f.id = "Document"."fdrId"
          AND i.region = current_setting('app.current_region', true)
      )
    )
    OR
    (
      current_setting('app.current_role', true) = 'INSTITUTION'
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        WHERE f.id = "Document"."fdrId"
          AND f."institutionId" = current_setting('app.current_institution_id', true)
      )
    )
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('ADMIN', 'AUTHORITY', 'BUREAU', 'COMMITTEE')
    OR
    (
      current_setting('app.current_role', true) IN ('OFFICER', 'REGIONAL_OFFICER')
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        JOIN "Institution" i ON f."institutionId" = i.id
        WHERE f.id = "Document"."fdrId"
          AND i.region = current_setting('app.current_region', true)
      )
    )
    OR
    (
      current_setting('app.current_role', true) = 'INSTITUTION'
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        WHERE f.id = "Document"."fdrId"
          AND f."institutionId" = current_setting('app.current_institution_id', true)
      )
    )
  );

-- 4. Alert Isolation Policy
CREATE POLICY alert_isolation_policy ON "Alert"
  AS PERMISSIVE
  FOR ALL
  TO PUBLIC
  USING (
    current_setting('app.current_role', true) IN ('ADMIN', 'AUTHORITY', 'BUREAU', 'COMMITTEE')
    OR
    (
      current_setting('app.current_role', true) IN ('OFFICER', 'REGIONAL_OFFICER')
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        JOIN "Institution" i ON f."institutionId" = i.id
        WHERE f.id = "Alert"."fdrId"
          AND i.region = current_setting('app.current_region', true)
      )
    )
    OR
    (
      current_setting('app.current_role', true) = 'INSTITUTION'
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        WHERE f.id = "Alert"."fdrId"
          AND f."institutionId" = current_setting('app.current_institution_id', true)
      )
    )
  )
  WITH CHECK (
    current_setting('app.current_role', true) IN ('ADMIN', 'AUTHORITY', 'BUREAU', 'COMMITTEE')
    OR
    (
      current_setting('app.current_role', true) IN ('OFFICER', 'REGIONAL_OFFICER')
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        JOIN "Institution" i ON f."institutionId" = i.id
        WHERE f.id = "Alert"."fdrId"
          AND i.region = current_setting('app.current_region', true)
      )
    )
    OR
    (
      current_setting('app.current_role', true) = 'INSTITUTION'
      AND EXISTS (
        SELECT 1 FROM "Fdr" f
        WHERE f.id = "Alert"."fdrId"
          AND f."institutionId" = current_setting('app.current_institution_id', true)
      )
    )
  );
