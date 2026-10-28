export interface OcrResult {
  fields: {
    fdrNo?: string;
    bank?: string;
    branch?: string;
    ifsc?: string;
    amount?: number;
    issueDate?: string;
    maturityDate?: string;
    lienMarked?: boolean;
  };
  confidences: Record<string, number>;
  minConfidence: number;
  needsHumanReview: boolean;
  flaggedFields: string[];
  boundingBoxPlaceholders?: Record<string, { x: number; y: number; w: number; h: number; page: number }>;
  isOfflineFallback?: boolean;
  notice?: string;
}

export interface HandbookRagResult {
  found: boolean;
  clause_id?: string | null;
  title?: string | null;
  category?: string | null;
  text?: string | null;
  answer: string;
  similarity: number;
  isOfflineFallback?: boolean;
}

export interface SlaRiskResult {
  slaRiskScore: number;
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  breachProbability: number;
  topRiskFactors: string[];
  disclaimer: string;
  isOfflineFallback?: boolean;
}

export class AiClient {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl: string = process.env.AI_SERVICE_URL || 'http://localhost:8000', timeoutMs: number = 3000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async extractOcr(textContent: string, filename: string = ''): Promise<OcrResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/ocr/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textContent, filename }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!resp.ok) {
        throw new Error(`AI service returned ${resp.status}`);
      }
      const data = await resp.json();
      return {
        ...data,
        isOfflineFallback: false,
      };
    } catch (err: any) {
      // Graceful offline fallback: core FDR lifecycle NEVER blocks on AI
      return {
        fields: {},
        confidences: {},
        minConfidence: 0.0,
        needsHumanReview: true,
        flaggedFields: ['all'],
        isOfflineFallback: true,
        notice: 'AI assistance unavailable; manual scrutiny required',
      };
    }
  }

  async queryHandbook(query: string): Promise<HandbookRagResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!resp.ok) {
        throw new Error(`AI service returned ${resp.status}`);
      }
      const data = await resp.json();
      return {
        ...data,
        isOfflineFallback: false,
      };
    } catch {
      // Graceful offline fallback
      return {
        found: false,
        clause_id: null,
        title: null,
        category: null,
        text: null,
        answer: 'AI assistance unavailable; consult physical Approval Process Handbook. Manual verification required.',
        similarity: 0.0,
        isOfflineFallback: true,
      };
    }
  }

  async predictSlaRisk(input: {
    daysRemaining?: number;
    revertCount?: number;
    discrepancyCount?: number;
    daysInScrutiny?: number;
    amount?: number;
  }): Promise<SlaRiskResult> {
    try {
      const resp = await fetch(`${this.baseUrl}/risk/sla-predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daysRemaining: input.daysRemaining ?? 30,
          revertCount: input.revertCount ?? 0,
          discrepancyCount: input.discrepancyCount ?? 0,
          daysInScrutiny: input.daysInScrutiny ?? 5,
          amount: input.amount ?? 1500000,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!resp.ok) {
        throw new Error(`AI service returned ${resp.status}`);
      }
      const data = await resp.json();
      return {
        ...data,
        isOfflineFallback: false,
      };
    } catch {
      // Graceful offline fallback
      return {
        slaRiskScore: 0.0,
        riskCategory: 'UNKNOWN',
        breachProbability: 0.0,
        topRiskFactors: ['AI risk model offline; monitoring using standard deadline timers'],
        disclaimer: 'Synthetic training data, demo only (Offline Fallback)',
        isOfflineFallback: true,
      };
    }
  }
}

export const aiClient = new AiClient();
