import { PrismaClient, BankVerificationStatus } from '@prisma/client';
import { FieldTrustService, CriticalFdrField } from './trust.js';
import { FdrLifecycleService } from './fdr-lifecycle.js';
import { Clock } from './clock.js';

export interface BankVerificationResult {
  status: BankVerificationStatus;
  confirmedFields?: Partial<Record<CriticalFdrField, string>>;
  bankRemarks?: string;
}

export interface BankVerifier {
  name: string;
  isMock: boolean;
  requestVerification(fdrId: string, officerId: string): Promise<string>;
  confirmVerification(requestId: string, result: BankVerificationResult, officerId: string): Promise<void>;
}

/**
 * Generates the formal bank verification inquiry letter text/template
 */
export function generateBankInquiryLetter(fdr: {
  fdrNo: string;
  bank: string;
  branch: string;
  ifsc: string;
  amount: number | string;
  issueDate: Date;
  maturityDate: Date;
  institutionName: string;
  aicteId: string;
}): string {
  return `
================================================================================
ALL INDIA COUNCIL FOR TECHNICAL EDUCATION (AICTE)
Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070
REGULATION BUREAU - SECURITY DEPOSIT VERIFICATION SECTION
================================================================================

Date: ${Clock.now().toISOString().slice(0, 10)}
Ref No: AICTE/REG/FDR-VERIFY/${fdr.fdrNo}

To,
The Branch Manager,
${fdr.bank}, ${fdr.branch} Branch
IFSC: ${fdr.ifsc}

SUBJECT: Verification and Confirmation of Fixed Deposit Receipt (FDR) / Lien Marking

Sir/Madam,

The following Fixed Deposit Receipt has been pledged to the Member Secretary, AICTE, New Delhi,
by ${fdr.institutionName} (AICTE Permanent Institute ID: ${fdr.aicteId}) towards the mandatory
security deposit as per AICTE regulations:

  1. FDR Number         : ${fdr.fdrNo}
  2. Principal Amount   : INR ${Number(fdr.amount).toLocaleString('en-IN')}
  3. Date of Issue      : ${new Date(fdr.issueDate).toISOString().slice(0, 10)}
  4. Date of Maturity   : ${new Date(fdr.maturityDate).toISOString().slice(0, 10)}
  5. Joint Lien Status  : Lien Marked in favour of Member Secretary, AICTE

Kindly verify the particulars against your bank records and confirm:
  (a) Genuine issuance of the instrument and current valid balance.
  (b) That safe lien is marked in favour of AICTE in bank books without premature encashment.
  (c) Auto-renewal status upon maturity if instructed.

Please provide your written signed confirmation on your bank letterhead.

Yours faithfully,

Authorized Scrutiny Officer
Regulation Bureau, AICTE
================================================================================
`.trim();
}

/**
 * Manual confirmation verifier: Officer scrutinizes the physical or scanned bank response
 * letter, records it, and promotes fields to BANK_CONFIRMED.
 */
export class ManualConfirmationVerifier implements BankVerifier {
  name = 'Manual Bank Response Verification';
  isMock = false;

  constructor(
    private prisma: PrismaClient,
    private trustService: FieldTrustService,
    private lifecycleService: FdrLifecycleService
  ) {}

  async requestVerification(fdrId: string, officerId: string): Promise<string> {
    const req = await this.prisma.bankVerificationRequest.create({
      data: {
        fdrId,
        status: 'PENDING',
        sentAt: Clock.now(),
        meta: { requestedBy: officerId, mode: 'MANUAL_LETTER' },
      },
    });
    return req.id;
  }

  async confirmVerification(
    requestId: string,
    result: BankVerificationResult,
    officerId: string
  ): Promise<void> {
    const now = Clock.now();
    const req = await this.prisma.bankVerificationRequest.findUnique({
      where: { id: requestId },
      include: { fdr: true },
    });

    if (!req) throw new Error('Bank verification request not found');

    await this.prisma.bankVerificationRequest.update({
      where: { id: requestId },
      data: {
        status: result.status,
        respondedAt: now,
        meta: {
          ...((req.meta as object) || {}),
          confirmedBy: officerId,
          bankRemarks: result.bankRemarks,
        },
      },
    });

    if (result.status === 'CONFIRMED' && result.confirmedFields) {
      // Flip trust rows to BANK_CONFIRMED
      for (const [field, val] of Object.entries(result.confirmedFields)) {
        await this.trustService.confirmField(
          req.fdrId,
          field as CriticalFdrField,
          String(val),
          'BANK_CONFIRMED',
          officerId,
          now
        );
      }

      // Check if FDR can transition from UNDER_SCRUTINY -> VERIFIED
      if (req.fdr.status === 'UNDER_SCRUTINY') {
        try {
          await this.lifecycleService.transition({
            fdrId: req.fdrId,
            toStatus: 'VERIFIED',
            actor: { id: officerId, role: 'OFFICER' },
            remarks: 'Bank confirmation verified and recorded successfully.',
          });
        } catch (e: any) {
          console.warn('Transition to VERIFIED guard check:', e.message);
        }
      }
    }
  }
}

/**
 * Mock Bank Verifier for evaluation and demo purposes (labeled MOCK).
 */
export class MockBankVerifier implements BankVerifier {
  name = 'Demonstration Mock Bank Verifier [DEMO ONLY]';
  isMock = true;

  constructor(
    private prisma: PrismaClient,
    private trustService: FieldTrustService,
    private lifecycleService: FdrLifecycleService
  ) {}

  async requestVerification(fdrId: string, officerId: string): Promise<string> {
    const req = await this.prisma.bankVerificationRequest.create({
      data: {
        fdrId,
        status: 'PENDING',
        sentAt: Clock.now(),
        meta: { requestedBy: officerId, mode: 'MOCK_AUTOMATED' },
      },
    });
    return req.id;
  }

  async confirmVerification(
    requestId: string,
    result: BankVerificationResult,
    officerId: string
  ): Promise<void> {
    const manual = new ManualConfirmationVerifier(
      this.prisma,
      this.trustService,
      this.lifecycleService
    );
    await manual.confirmVerification(requestId, result, officerId);
  }
}

/**
 * Real Bank API placeholder adapter (documented slot)
 */
export class RealBankApiVerifier implements BankVerifier {
  name = 'Real Bank API Adapter (Open Banking / SFMS)';
  isMock = false;

  async requestVerification(): Promise<string> {
    throw new Error('TODO: Real bank API integration not yet available in current AICTE ecosystem.');
  }

  async confirmVerification(): Promise<void> {
    throw new Error('TODO: Real bank API integration not yet available in current AICTE ecosystem.');
  }
}
