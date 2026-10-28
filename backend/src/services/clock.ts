/**
 * Injectable Clock service with demo time-travel offset.
 * No business code should call new Date() directly; use Clock.now() instead.
 */
export class ClockService {
  private static instance: ClockService;
  private offsetMs: number = 0;

  private constructor() {}

  public static getInstance(): ClockService {
    if (!ClockService.instance) {
      ClockService.instance = new ClockService();
    }
    return ClockService.instance;
  }

  public now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  public getOffsetMs(): number {
    return this.offsetMs;
  }

  public setOffsetMs(offsetMs: number): void {
    this.offsetMs = offsetMs;
  }

  public setSimulatedDate(targetDate: Date): void {
    this.offsetMs = targetDate.getTime() - Date.now();
  }

  public reset(): void {
    this.offsetMs = 0;
  }

  public isSimulated(): boolean {
    return this.offsetMs !== 0;
  }
}

export const Clock = ClockService.getInstance();
