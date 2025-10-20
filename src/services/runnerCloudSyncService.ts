// Runner Cloud Sync Service
// Fetches a cloud-hosted runner database manifest and synchronizes into localRunnerService

import { localRunnerService, type LocalRunner } from './localRunnerService';

export type RunnerRecord = {
  firstName: string;
  lastName: string;
  club?: string;
  birthYear?: number;
  sex?: 'M' | 'F';
  cardNumber?: number;
  phone?: string;
  email?: string;
  nationality?: string;
};

export type RunnerCloudManifest = {
  version: string; // monotonically increasing or timestamp string
  etag?: string;
  updatedAt?: string;
  items: Array<{
    url: string; // absolute or CDN-relative URL of data object
    format: 'json' | 'jsonl' | 'ndjson';
    count?: number;
  }>;
  patch?: {
    url: string;
    sinceVersion: string;
    format: 'ndjson' | 'jsonl';
  };
};

interface SyncResult {
  updated: boolean;
  imported: number;
  updatedCount: number;
  message: string;
  version?: string;
}

class RunnerCloudSyncService {
  private readonly LS_MANIFEST = 'runner_cloud_manifest';
  private readonly LS_SYNC_VERSION = 'runner_cloud_synced_version';
  private readonly LS_LAST_SYNC = 'runner_cloud_last_sync';
  private readonly DEFAULT_MANIFEST_URL = 'https://dvoa-cdn.example.com/runner-db/manifest.json';

  // Allow overriding the manifest URL for environments/tests
  setManifestUrl(url: string) {
    localStorage.setItem('runner_cloud_manifest_url', url);
  }

  getManifestUrl(): string {
    return localStorage.getItem('runner_cloud_manifest_url') || this.DEFAULT_MANIFEST_URL;
  }

  getLocalState() {
    const version = localStorage.getItem(this.LS_SYNC_VERSION) || '';
    const lastSync = localStorage.getItem(this.LS_LAST_SYNC) || '';
    return { version, lastSync: lastSync ? new Date(lastSync) : undefined };
  }

  private saveSyncedVersion(version: string) {
    localStorage.setItem(this.LS_SYNC_VERSION, version);
    localStorage.setItem(this.LS_LAST_SYNC, new Date().toISOString());
  }

  private saveManifest(manifest: RunnerCloudManifest) {
    localStorage.setItem(this.LS_MANIFEST, JSON.stringify(manifest));
  }

  getCachedManifest(): RunnerCloudManifest | null {
    try {
      const raw = localStorage.getItem(this.LS_MANIFEST);
      return raw ? (JSON.parse(raw) as RunnerCloudManifest) : null;
    } catch {
      return null;
    }
  }

  async fetchManifest(): Promise<RunnerCloudManifest> {
    const url = this.getManifestUrl();
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
    const manifest = (await res.json()) as RunnerCloudManifest;
    this.saveManifest(manifest);
    return manifest;
  }

  private needsUpdate(manifest: RunnerCloudManifest): boolean {
    const current = localStorage.getItem(this.LS_SYNC_VERSION);
    if (!current) return true;
    if (!manifest?.version) return false; // malformed manifest
    return current !== manifest.version;
  }

  async prefetchOrSync(opts: { silent?: boolean } = {}): Promise<SyncResult> {
    try {
      const manifest = await this.fetchManifest().catch(() => this.getCachedManifest() || { version: '', items: [] } as RunnerCloudManifest);
      if (!manifest?.items?.length) {
        return { updated: false, imported: 0, updatedCount: 0, message: 'No manifest items', version: manifest?.version };
      }
      if (!this.needsUpdate(manifest)) {
        return { updated: false, imported: 0, updatedCount: 0, message: 'Already up to date', version: manifest.version };
      }

      // Choose first item by default
      const primary = manifest.items[0];
      const { imported, updatedCount } = await this.downloadAndIngest(primary.url, primary.format);

      this.saveSyncedVersion(manifest.version);
      return { updated: true, imported, updatedCount, message: 'Cloud runner DB synced', version: manifest.version };
    } catch (err) {
      if (!opts.silent) console.warn('[RunnerCloudSync] Prefetch failed:', err);
      return { updated: false, imported: 0, updatedCount: 0, message: 'Prefetch failed' };
    }
  }

  private normalizeRecord(r: any): RunnerRecord | null {
    if (!r) return null;
    // Accept multiple field shapes from JSON/JSONL
    const firstName = r.firstName || r.given || r.first || r.name?.first;
    const lastName = r.lastName || r.family || r.last || r.name?.last;
    if (!firstName || !lastName) return null;

    const club = r.club || r.organisation || '';
    const birthYear = r.birthYear || r.yob || (typeof r.birthDate === 'string' ? parseInt(r.birthDate?.slice(0, 4)) : undefined);
    const sex = (r.sex || r.gender) as 'M' | 'F' | undefined;
    const cardNumber = r.cardNumber || r.si || r.card || r.controlCard;

    return {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      club: club ? String(club).trim() : '',
      birthYear: birthYear ? Number(birthYear) : undefined,
      sex,
      cardNumber: cardNumber ? Number(cardNumber) : undefined,
      phone: r.phone || undefined,
      email: r.email || undefined,
      nationality: r.nationality || r.nat || undefined,
    };
  }

  private async downloadAndIngest(url: string, format: 'json' | 'jsonl' | 'ndjson'): Promise<{ imported: number; updatedCount: number }> {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Data HTTP ${res.status}`);

    let imported = 0;
    let updatedCount = 0;

    if (format === 'json') {
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : data.runners || [];
      // Replace mode for authoritative cloud
      localRunnerService.clearAll();
      for (const raw of list) {
        const rec = this.normalizeRecord(raw);
        if (!rec) continue;
        if (this.addOrUpdateLocal(rec)) {
          updatedCount++;
        } else {
          imported++;
        }
      }
      return { imported, updatedCount };
    }

    // jsonl/ndjson line-delimited
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    // Replace
    localRunnerService.clearAll();
    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        const rec = this.normalizeRecord(raw);
        if (!rec) continue;
        if (this.addOrUpdateLocal(rec)) {
          updatedCount++;
        } else {
          imported++;
        }
      } catch (e) {
        // skip bad lines
        continue;
      }
    }
    return { imported, updatedCount };
  }

  private addOrUpdateLocal(rec: RunnerRecord): boolean {
    // localRunnerService.addRunner will merge if name matches existing
    const before = localRunnerService.searchRunners(`${rec.firstName} ${rec.lastName}`);
    const existed = before.length > 0;
    localRunnerService.addRunner({
      name: { first: rec.firstName, last: rec.lastName },
      club: rec.club || '',
      birthYear: rec.birthYear,
      sex: rec.sex,
      cardNumber: rec.cardNumber,
      phone: rec.phone,
      email: rec.email,
      nationality: rec.nationality || '',
    } as Omit<LocalRunner, 'id' | 'lastUsed' | 'timesUsed'>);
    return existed;
  }

  // Optional: apply small patch streams (NDJSON upsert/delete)
  async applyPatch(patchUrl: string): Promise<{ upserts: number; deletes: number }> {
    const res = await fetch(patchUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Patch HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    let upserts = 0, deletes = 0;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const op = (obj.op || 'upsert').toLowerCase();
        if (op === 'delete') {
          // best-effort delete by exact name match
          const first = obj.firstName || obj.name?.first;
          const last = obj.lastName || obj.name?.last;
          if (first && last) {
            const matches = localRunnerService.getAllRunners().filter(r =>
              r.name.first.toLowerCase() === String(first).toLowerCase() &&
              r.name.last.toLowerCase() === String(last).toLowerCase()
            );
            for (const m of matches) {
              localRunnerService.deleteRunner(m.id);
              deletes++;
            }
          }
        } else {
          const rec = this.normalizeRecord(obj);
          if (rec) {
            this.addOrUpdateLocal(rec);
            upserts++;
          }
        }
      } catch {
        // ignore bad line
      }
    }
    return { upserts, deletes };
  }
}

export const runnerCloudSyncService = new RunnerCloudSyncService();
export default RunnerCloudSyncService;
