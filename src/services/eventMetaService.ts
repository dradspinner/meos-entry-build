export interface EventMeta {
  name: string;
  date: string; // YYYY-MM-DD
}

class EventMetaService {
  private readonly KEY = 'meos_event_meta';

  get(): EventMeta | null {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const meta = JSON.parse(raw);
      if (!meta || typeof meta.name !== 'string') return null;
      return meta as EventMeta;
    } catch {
      return null;
    }
  }

  set(meta: EventMeta): void {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(meta));
    } catch {}
  }

  clear(): void {
    localStorage.removeItem(this.KEY);
  }
}

export const eventMetaService = new EventMetaService();
export default eventMetaService;
