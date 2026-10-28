import { PrismaClient } from '@prisma/client';

export class HolidayCalendarService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Seed standard AICTE / National Gazetted holidays if calendar table is empty.
   */
  async ensureSeededHolidays(year: number = 2026): Promise<void> {
    const count = await this.prisma.holidayCalendar.count();
    if (count > 0) return;

    const holidays = [
      { date: new Date(`${year}-01-26`), name: 'Republic Day' },
      { date: new Date(`${year}-03-25`), name: 'Holi' },
      { date: new Date(`${year}-08-15`), name: 'Independence Day' },
      { date: new Date(`${year}-10-02`), name: 'Mahatma Gandhi Jayanti' },
      { date: new Date(`${year}-10-20`), name: 'Dussehra' },
      { date: new Date(`${year}-11-08`), name: 'Diwali' },
      { date: new Date(`${year}-12-25`), name: 'Christmas' },
    ];

    for (const h of holidays) {
      await this.prisma.holidayCalendar.upsert({
        where: { date: h.date },
        update: {},
        create: { date: h.date, name: h.name, isGazetted: true },
      });
    }
  }

  /**
   * Returns true if date is not a Saturday, Sunday, or Gazetted Holiday.
   */
  async isBusinessDay(date: Date): Promise<boolean> {
    const day = date.getUTCDay();
    // 0 = Sunday, 6 = Saturday
    if (day === 0 || day === 6) return false;

    const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const holiday = await this.prisma.holidayCalendar.findUnique({
      where: { date: normalized },
    });

    return !holiday;
  }

  /**
   * Subtracts N business days from target date, stepping over weekends and holidays.
   */
  async subtractBusinessDays(targetDate: Date, businessDays: number): Promise<Date> {
    const current = new Date(targetDate);
    let remaining = businessDays;

    while (remaining > 0) {
      current.setUTCDate(current.getUTCDate() - 1);
      const isBusiness = await this.isBusinessDay(current);
      if (isBusiness) {
        remaining--;
      }
    }

    return current;
  }
}
