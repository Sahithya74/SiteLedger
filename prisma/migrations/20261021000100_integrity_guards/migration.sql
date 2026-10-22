-- SITECORE integrity guards.
--
-- These rules live in the database so they hold even if application code has
-- a bug: financial history cannot be deleted or silently edited, and a few
-- shape rules (one payee per payment, one person per attendance row…) are
-- enforced with CHECK constraints.

-- ─────────────────────────────────────────────────────────────────────────────
-- Forgiving search (trigram similarity / fast ILIKE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Project_name_trgm_idx"  ON "Project"  USING gin ("name" gin_trgm_ops);
CREATE INDEX "Client_name_trgm_idx"   ON "Client"   USING gin ("name" gin_trgm_ops);
CREATE INDEX "Engineer_name_trgm_idx" ON "Engineer" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Labour_name_trgm_idx"   ON "Labour"   USING gin ("name" gin_trgm_ops);
CREATE INDEX "Supplier_name_trgm_idx" ON "Supplier" USING gin ("name" gin_trgm_ops);
CREATE INDEX "Material_name_trgm_idx" ON "Material" USING gin ("name" gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- Shape rules
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_one_person_chk"
  CHECK (num_nonnulls("labourId", "engineerId") = 1);

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_overtime_chk" CHECK ("overtimeHours" >= 0 AND "overtimeHours" <= 24);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_payee_chk" CHECK (
    ("payeeType" = 'SUPPLIER'   AND "supplierId"   IS NOT NULL AND num_nonnulls("labourId", "engineerId", "contractorId") = 0) OR
    ("payeeType" = 'LABOUR'     AND "labourId"     IS NOT NULL AND num_nonnulls("supplierId", "engineerId", "contractorId") = 0) OR
    ("payeeType" = 'ENGINEER'   AND "engineerId"   IS NOT NULL AND num_nonnulls("supplierId", "labourId", "contractorId") = 0) OR
    ("payeeType" = 'CONTRACTOR' AND "contractorId" IS NOT NULL AND num_nonnulls("supplierId", "labourId", "engineerId") = 0) OR
    ("payeeType" = 'OTHER'      AND "payeeName"    IS NOT NULL AND num_nonnulls("supplierId", "labourId", "engineerId", "contractorId") = 0)
  );

-- Normal rows are positive; reversal rows are negative and point at the original.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_sign_chk" CHECK (
    ("reversalOfId" IS NULL AND "amountPaise" > 0) OR ("reversalOfId" IS NOT NULL AND "amountPaise" < 0)
  );
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_sign_chk" CHECK (
    ("reversalOfId" IS NULL AND "amountPaise" > 0) OR ("reversalOfId" IS NOT NULL AND "amountPaise" < 0)
  );
ALTER TABLE "OtherIncome"
  ADD CONSTRAINT "OtherIncome_sign_chk" CHECK (
    ("reversalOfId" IS NULL AND "amountPaise" > 0) OR ("reversalOfId" IS NOT NULL AND "amountPaise" < 0)
  );
ALTER TABLE "AccountTransfer"
  ADD CONSTRAINT "AccountTransfer_sign_chk" CHECK (
    ("reversalOfId" IS NULL AND "amountPaise" > 0) OR ("reversalOfId" IS NOT NULL AND "amountPaise" < 0)
  );
ALTER TABLE "AccountTransfer"
  ADD CONSTRAINT "AccountTransfer_accounts_chk" CHECK ("fromAccountId" <> "toAccountId");
-- A client payment may be settled partly (or wholly) by TDS deducted by the client.
ALTER TABLE "ClientPayment"
  ADD CONSTRAINT "ClientPayment_sign_chk" CHECK (
    ("reversalOfId" IS NULL AND "amountPaise" >= 0 AND "tdsDeductedPaise" >= 0 AND "amountPaise" + "tdsDeductedPaise" > 0) OR
    ("reversalOfId" IS NOT NULL AND "amountPaise" <= 0 AND "tdsDeductedPaise" <= 0 AND "amountPaise" + "tdsDeductedPaise" < 0)
  );

ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_nonzero_chk" CHECK ("amountPaise" <> 0);
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_one_source_chk" CHECK (
    num_nonnulls("clientPaymentId", "paymentId", "expenseId", "otherIncomeId", "transferId") = 1
  );

ALTER TABLE "Project"  ADD CONSTRAINT "Project_amounts_chk" CHECK ("quotedPaise" >= 0 AND "contractPaise" >= 0);
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_percent_chk" CHECK ("percentComplete" BETWEEN 0 AND 100);
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_costs_chk" CHECK ("estimatedCostPaise" >= 0 AND "actualCostPaise" >= 0);
ALTER TABLE "Labour"   ADD CONSTRAINT "Labour_wage_chk" CHECK ("dailyWagePaise" >= 0 AND "overtimeRatePaise" >= 0);
ALTER TABLE "Engineer" ADD CONSTRAINT "Engineer_pay_chk" CHECK ("salaryPaise" >= 0 AND "dailyWagePaise" >= 0);
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_rating_chk" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_amounts_chk" CHECK ("subtotalPaise" >= 0 AND "totalPaise" >= 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- Financial history protection
-- ─────────────────────────────────────────────────────────────────────────────

-- Deleting a financial record is never allowed. Corrections use reversals.
CREATE OR REPLACE FUNCTION sitecore_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SITECORE: % records cannot be deleted. Record a reversal instead.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- Updating a financial record is refused unless only the columns listed in
-- the trigger arguments changed (e.g. notes, reconciliation fields).
CREATE OR REPLACE FUNCTION sitecore_block_update() RETURNS trigger AS $$
DECLARE
  allowed text[] := '{}';
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    allowed := allowed || TG_ARGV[i];
  END LOOP;
  IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
    RAISE EXCEPTION 'SITECORE: % records cannot be changed after they are saved. Record a reversal instead.', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Payment_no_delete"         BEFORE DELETE ON "Payment"         FOR EACH ROW EXECUTE FUNCTION sitecore_block_delete();
CREATE TRIGGER "ClientPayment_no_delete"   BEFORE DELETE ON "ClientPayment"   FOR EACH ROW EXECUTE FUNCTION sitecore_block_delete();
CREATE TRIGGER "Expense_no_delete"         BEFORE DELETE ON "Expense"         FOR EACH ROW EXECUTE FUNCTION sitecore_block_delete();
CREATE TRIGGER "OtherIncome_no_delete"     BEFORE DELETE ON "OtherIncome"     FOR EACH ROW EXECUTE FUNCTION sitecore_block_delete();
CREATE TRIGGER "AccountTransfer_no_delete" BEFORE DELETE ON "AccountTransfer" FOR EACH ROW EXECUTE FUNCTION sitecore_block_delete();
CREATE TRIGGER "BankTransaction_no_delete" BEFORE DELETE ON "BankTransaction" FOR EACH ROW EXECUTE FUNCTION sitecore_block_delete();
CREATE TRIGGER "AuditLog_no_delete"        BEFORE DELETE ON "AuditLog"        FOR EACH ROW EXECUTE FUNCTION sitecore_block_delete();

CREATE TRIGGER "Payment_no_update"         BEFORE UPDATE ON "Payment"         FOR EACH ROW EXECUTE FUNCTION sitecore_block_update('notes');
CREATE TRIGGER "ClientPayment_no_update"   BEFORE UPDATE ON "ClientPayment"   FOR EACH ROW EXECUTE FUNCTION sitecore_block_update('notes');
CREATE TRIGGER "Expense_no_update"         BEFORE UPDATE ON "Expense"         FOR EACH ROW EXECUTE FUNCTION sitecore_block_update('notes');
CREATE TRIGGER "OtherIncome_no_update"     BEFORE UPDATE ON "OtherIncome"     FOR EACH ROW EXECUTE FUNCTION sitecore_block_update('notes');
CREATE TRIGGER "AccountTransfer_no_update" BEFORE UPDATE ON "AccountTransfer" FOR EACH ROW EXECUTE FUNCTION sitecore_block_update('notes');
CREATE TRIGGER "BankTransaction_no_update" BEFORE UPDATE ON "BankTransaction" FOR EACH ROW EXECUTE FUNCTION sitecore_block_update('reconciledAt', 'reconciledById', 'statementRef');
CREATE TRIGGER "AuditLog_no_update"        BEFORE UPDATE ON "AuditLog"        FOR EACH ROW EXECUTE FUNCTION sitecore_block_update();
