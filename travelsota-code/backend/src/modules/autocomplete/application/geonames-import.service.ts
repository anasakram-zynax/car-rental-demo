import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { downloadFile } from '../../../shared/helpers/download-file.helper';
import {
  createWriteStream,
  unlinkSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmdirSync,
  createReadStream,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as readline from 'readline';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yauzl = require('yauzl') as {
  open: (
    path: string,
    opts: { lazyEntries: boolean },
    cb: (err: Error | null, zipfile: any) => void,
  ) => void;
};

const GEONAMES_CITIES_URL =
  'https://download.geonames.org/export/dump/cities5000.zip';
const GEONAMES_COUNTRY_URL =
  'https://download.geonames.org/export/dump/countryInfo.txt';

export interface GeonamesImportResult {
  totalParsed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ geonameId: string; error: string }>;
}

@Injectable()
export class GeonamesImportService {
  private readonly logger = new Logger(GeonamesImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Import GeoNames cities5000 data into Destinations.
   *
   * Flow:
   *   1. Download cities5000.zip + countryInfo.txt
   *   2. Extract zip → parse TSV
   *   3. Upsert each city into Destinations with code="gn-{geonameid}"
   *   4. Skip entries that already exist (idempotent)
   */
  async import(): Promise<GeonamesImportResult> {
    const tmpDir = join(tmpdir(), 'geonames-import');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

    const zipPath = join(tmpDir, 'cities5000.zip');
    const txtPath = join(tmpDir, 'cities5000.txt');
    const countryPath = join(tmpDir, 'countryInfo.txt');

    this.logger.log('Downloading GeoNames data...');

    await Promise.all([
      downloadFile({
        url: GEONAMES_CITIES_URL,
        destPath: zipPath,
        timeoutMs: 120_000,
      }),
      downloadFile({
        url: GEONAMES_COUNTRY_URL,
        destPath: countryPath,
        timeoutMs: 60_000,
      }),
    ]);

    this.logger.log('Extracting zip...');
    await this.extractZip(zipPath, txtPath);

    this.logger.log('Loading country names...');
    const countryNames = await this.parseCountryInfo(countryPath);

    this.logger.log('Importing cities into Destinations...');
    const result = await this.importCities(txtPath, countryNames);

    // Cleanup temp files
    this.cleanup(tmpDir);

    return result;
  }

  /**
   * Extract a zip file containing a single TSV entry.
   */
  private async extractZip(zipPath: string, destPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      yauzl.open(
        zipPath,
        { lazyEntries: true },
        (err: Error | null, zipfile: any) => {
          if (err) {
            reject(err);
            return;
          }

          zipfile.readEntry();
          zipfile.on('entry', (entry: any) => {
            if (entry.fileName.endsWith('.txt')) {
              zipfile.openReadStream(
                entry,
                (err2: Error | null, readStream: any) => {
                  if (err2) {
                    reject(err2);
                    return;
                  }
                  const writeStream = createWriteStream(destPath);
                  readStream.pipe(writeStream);
                  writeStream.on('finish', () => resolve());
                  writeStream.on('error', reject);
                },
              );
            } else {
              zipfile.readEntry();
            }
          });

          zipfile.on('error', reject);
        },
      );
    });
  }

  /**
   * Parse countryInfo.txt to map country code → country name.
   * Format: tab-separated, lines starting with # are comments.
   */
  private async parseCountryInfo(
    filePath: string,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const fileStream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length >= 5) {
        const code = parts[0]?.trim();
        const name = parts[4]?.trim(); // Column 4 = Country name
        if (code && name) map.set(code, name);
      }
    }

    return map;
  }

  /**
   * Parse cities5000.txt and upsert into Destinations.
   *
   * GeoNames TSV format (19 columns):
   *   0: geonameid, 1: name, 2: asciiname, 3: alternatenames,
   *   4: latitude, 5: longitude, 6: feature class, 7: feature code,
   *   8: country code, 9: cc2, 10: admin1, 11: admin2, 12: admin3, 13: admin4,
   *   14: population, 15: elevation, 16: dem, 17: timezone, 18: modification date
   */
  private async importCities(
    filePath: string,
    countryNames: Map<string, string>,
  ): Promise<GeonamesImportResult> {
    const result: GeonamesImportResult = {
      totalParsed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const BATCH_SIZE = 500;
    let batch: Array<{
      code: string;
      name: string;
      normalizedName: string;
      countryCode: string | null;
      countryName: string | null;
      latitude: number;
      longitude: number;
      searchAliases: string[];
      displayOrder: number;
    }> = [];

    const fileStream = createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line) continue;

      result.totalParsed++;
      let geonameId = 'unknown';

      try {
        const parts = line.split('\t');
        if (parts.length < 19) {
          result.skipped++;
          continue;
        }

        geonameId = parts[0]?.trim() ?? 'unknown';
        const name = parts[1]?.trim();
        const asciiName = parts[2]?.trim();
        const altNamesRaw = parts[3]?.trim();
        const latitude = parseFloat(parts[4]);
        const longitude = parseFloat(parts[5]);
        const countryCode = parts[8]?.trim() || null;
        const population = parseInt(parts[14], 10) || 0;

        if (!geonameId || !name || isNaN(latitude) || isNaN(longitude)) {
          result.skipped++;
          continue;
        }

        // Parse alternate names (comma-separated)
        const altNames: string[] = altNamesRaw
          ? altNamesRaw
              .split(',')
              .map((n) => n.trim())
              .filter(Boolean)
          : [];

        // Build search aliases: unique non-empty names excluding the primary name
        const normalizedName = asciiName?.toLowerCase() ?? name.toLowerCase();
        const searchAliases = [
          ...new Set(
            [name, asciiName, ...altNames]
              .map((n) => n?.toLowerCase().trim())
              .filter((n) => n && n !== normalizedName),
          ),
        ];

        // Population-based display order (higher population = lower number = higher priority)
        const displayOrder =
          population > 1_000_000
            ? 1
            : population > 100_000
              ? 2
              : population > 10_000
                ? 3
                : 4;

        batch.push({
          code: `gn-${geonameId}`,
          name,
          normalizedName,
          countryCode,
          countryName: countryCode
            ? (countryNames.get(countryCode) ?? null)
            : null,
          latitude,
          longitude,
          searchAliases,
          displayOrder,
        });

        if (batch.length >= BATCH_SIZE) {
          const batchResult = await this.flushBatch(batch);
          result.inserted += batchResult.inserted;
          result.updated += batchResult.updated;
          result.errors.push(...batchResult.errors);
          batch = [];
        }
      } catch (error) {
        result.errors.push({
          geonameId,
          error: error instanceof Error ? error.message : String(error),
        });
        result.skipped++;
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      const batchResult = await this.flushBatch(batch);
      result.inserted += batchResult.inserted;
      result.updated += batchResult.updated;
      result.errors.push(...batchResult.errors);
    }

    return result;
  }

  /**
   * Upsert a batch of cities using raw SQL for performance.
   * INSERT ... ON CONFLICT (code) DO UPDATE avoids transaction timeout.
   */
  private async flushBatch(
    batch: Array<{
      code: string;
      name: string;
      normalizedName: string;
      countryCode: string | null;
      countryName: string | null;
      latitude: number;
      longitude: number;
      searchAliases: string[];
      displayOrder: number;
    }>,
  ): Promise<{
    inserted: number;
    updated: number;
    errors: Array<{ geonameId: string; error: string }>;
  }> {
    const errors: Array<{ geonameId: string; error: string }> = [];
    let count = 0;

    // Build VALUES placeholders for bulk INSERT
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (const city of batch) {
      values.push(
        `(gen_random_uuid(), $${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, false, $${paramIdx + 7}, $${paramIdx + 8}::jsonb, 'missing', NOW(), NOW())`,
      );
      params.push(
        city.code,
        city.name,
        city.normalizedName,
        city.countryCode,
        city.countryName,
        city.latitude,
        city.longitude,
        city.displayOrder,
        JSON.stringify(city.searchAliases),
      );
      paramIdx += 9;
    }

    const sql = `
      INSERT INTO "hotel_content"."Destinations" (
        "id", "code", "name", "normalizedName", "countryCode", "countryName",
        "latitude", "longitude", "enabled", "displayOrder",
        "searchAliases", "contentStatus", "createdAt", "updatedAt"
      )
      VALUES ${values.join(', ')}
      ON CONFLICT ("code") DO UPDATE SET
        "name" = EXCLUDED."name",
        "normalizedName" = EXCLUDED."normalizedName",
        "countryCode" = EXCLUDED."countryCode",
        "countryName" = EXCLUDED."countryName",
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "displayOrder" = EXCLUDED."displayOrder",
        "searchAliases" = EXCLUDED."searchAliases",
        "updatedAt" = NOW()
    `;

    try {
      await this.prisma.$executeRawUnsafe(sql, ...params);
      count = batch.length;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logger.warn(`Batch SQL upsert failed: ${errorMsg}`);
      // Fall back to individual Prisma upserts
      for (const city of batch) {
        try {
          await this.prisma.destinations.upsert({
            where: { code: city.code },
            create: {
              code: city.code,
              name: city.name,
              normalizedName: city.normalizedName,
              countryCode: city.countryCode,
              countryName: city.countryName,
              latitude: city.latitude,
              longitude: city.longitude,
              enabled: false,
              displayOrder: city.displayOrder,
              searchAliases: city.searchAliases,
              contentStatus: 'missing',
            },
            update: {
              name: city.name,
              normalizedName: city.normalizedName,
              countryCode: city.countryCode,
              countryName: city.countryName,
              latitude: city.latitude,
              longitude: city.longitude,
              displayOrder: city.displayOrder,
              searchAliases: city.searchAliases,
            },
          });
          count++;
        } catch (innerError) {
          errors.push({
            geonameId: city.code,
            error:
              innerError instanceof Error
                ? innerError.message
                : String(innerError),
          });
        }
      }
    }

    return { inserted: count, updated: 0, errors };
  }

  private cleanup(tmpDir: string): void {
    try {
      for (const f of readdirSync(tmpDir)) {
        try {
          unlinkSync(join(tmpDir, f));
        } catch {
          /* ignore */
        }
      }
      rmdirSync(tmpDir);
    } catch {
      /* ignore cleanup errors */
    }
  }
}
